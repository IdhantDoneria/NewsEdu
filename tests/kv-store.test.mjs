import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { kvAvailable, kvGet, kvSet, kvDel, kvIncr, kvPush, kvRange } from '../lib/store/kv.mjs';

const ENV_KEYS = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'];
const realFetch = globalThis.fetch;
const realNow = Date.now;
let saved;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  globalThis.__meridianKv.map.clear();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  globalThis.fetch = realFetch;
  Date.now = realNow;
});

/** Mock the REST pipeline: replies[i] is the array of results (or a Response-ish) for call i. */
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    return handler(body, calls.length - 1);
  };
  return calls;
}
const ok = (results) => ({ ok: true, json: async () => results.map((result) => ({ result })) });

// ---- memory fallback ------------------------------------------------------------

test('kvAvailable reads the env at call time and needs both halves of a pair', () => {
  assert.equal(kvAvailable(), false);
  process.env.UPSTASH_REDIS_REST_URL = 'https://x.upstash.io';
  assert.equal(kvAvailable(), false);
  process.env.UPSTASH_REDIS_REST_TOKEN = 't';
  assert.equal(kvAvailable(), true);
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.KV_REST_API_URL = 'https://y.kv.vercel-storage.com';
  process.env.KV_REST_API_TOKEN = 't';
  assert.equal(kvAvailable(), true);
});

test('memory: get/set/del round trip and missing keys are null', async () => {
  assert.equal(await kvGet('a'), null);
  assert.equal(await kvSet('a', { n: 1 }), true);
  assert.deepEqual(await kvGet('a'), { n: 1 });
  assert.equal(await kvDel('a'), true);
  assert.equal(await kvGet('a'), null);
  assert.equal(await kvDel('a'), false);
});

test('memory: TTL expiry for set, incr and push', async () => {
  let t = 1_000_000;
  Date.now = () => t;
  await kvSet('s', 'v', { ttlSec: 10 });
  await kvIncr('c', { ttlSec: 10 });
  await kvPush('l', 'x', { ttlSec: 10 });
  t += 9_000;
  assert.equal(await kvGet('s'), 'v');
  assert.equal(await kvIncr('c', { ttlSec: 10 }), 2); // ttl is set at creation, not extended
  assert.deepEqual(await kvRange('l'), ['x']);
  t += 2_000;
  assert.equal(await kvGet('s'), null);
  assert.equal(await kvIncr('c', { ttlSec: 10 }), 1); // expired, restarted
  assert.deepEqual(await kvRange('l'), []);
});

test('memory: push is newest-first and capped; range is inclusive', async () => {
  for (const v of [1, 2, 3, 4]) await kvPush('l', v, { max: 3 });
  assert.deepEqual(await kvRange('l'), [4, 3, 2]);
  assert.deepEqual(await kvRange('l', 0, 1), [4, 3]);
  assert.deepEqual(await kvRange('l', 1, -1), [3, 2]);
  assert.deepEqual(await kvRange('missing'), []);
});

// ---- REST driver ----------------------------------------------------------------

function useRest() {
  process.env.UPSTASH_REDIS_REST_URL = 'https://x.upstash.io/';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
}

test('rest: GET parses JSON, sends bearer auth to the pipeline endpoint', async () => {
  useRest();
  const calls = mockFetch(() => ok([JSON.stringify({ a: 1 })]));
  assert.deepEqual(await kvGet('k'), { a: 1 });
  assert.equal(calls[0].url, 'https://x.upstash.io/pipeline');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(calls[0].body, [['GET', 'k']]);
  assert.ok(calls[0].init.signal, 'request carries a timeout signal');
});

test('rest: Vercel KV env names work too', async () => {
  process.env.KV_REST_API_URL = 'https://y.kv.vercel-storage.com';
  process.env.KV_REST_API_TOKEN = 'kvtok';
  const calls = mockFetch(() => ok([null]));
  assert.equal(await kvGet('k'), null);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer kvtok');
});

test('rest: a successful miss is authoritative (memory is not consulted)', async () => {
  await kvSet('k', 'in-memory'); // written before KV was configured
  useRest();
  mockFetch(() => ok([null]));
  assert.equal(await kvGet('k'), null);
});

test('rest: SET with EX, and without', async () => {
  useRest();
  const calls = mockFetch(() => ok(['OK']));
  assert.equal(await kvSet('k', { v: 1 }, { ttlSec: 60 }), true);
  assert.deepEqual(calls[0].body, [['SET', 'k', '{"v":1}', 'EX', 60]]);
  assert.equal(await kvSet('k2', 'x'), true);
  assert.deepEqual(calls[1].body, [['SET', 'k2', '"x"']]);
});

test('rest: INCR + EXPIRE NX in one pipeline', async () => {
  useRest();
  const calls = mockFetch(() => ok([3, 1]));
  assert.equal(await kvIncr('c', { ttlSec: 60 }), 3);
  assert.deepEqual(calls[0].body, [['INCR', 'c'], ['EXPIRE', 'c', 60, 'NX']]);
  mockFetch(() => ok([4]));
  assert.equal(await kvIncr('c'), 4);
});

test('rest: LPUSH + LTRIM (+ EXPIRE) and LRANGE', async () => {
  useRest();
  let calls = mockFetch(() => ok([7, 'OK', 1]));
  assert.equal(await kvPush('l', { a: 1 }, { max: 5, ttlSec: 30 }), 5); // length capped at max
  assert.deepEqual(calls[0].body, [['LPUSH', 'l', '{"a":1}'], ['LTRIM', 'l', 0, 4], ['EXPIRE', 'l', 30]]);

  calls = mockFetch(() => ok([2, 'OK']));
  assert.equal(await kvPush('l', 'x', { max: 5 }), 2);
  assert.equal(calls[0].body.length, 2);

  calls = mockFetch(() => ok([['{"a":1}', 'not json', '"b"']]));
  assert.deepEqual(await kvRange('l', 0, 9), [{ a: 1 }, 'b']); // unparseable entries dropped
  assert.deepEqual(calls[0].body, [['LRANGE', 'l', 0, 9]]);
});

test('rest: DEL', async () => {
  useRest();
  const calls = mockFetch(() => ok([1]));
  assert.equal(await kvDel('k'), true);
  assert.deepEqual(calls[0].body, [['DEL', 'k']]);
  mockFetch(() => ok([0]));
  assert.equal(await kvDel('k'), false);
});

test('rest failures fall through to memory and never throw', async () => {
  useRest();
  const failures = [
    () => { throw new Error('network down'); },
    () => ({ ok: false, status: 500, json: async () => ({}) }),
    () => ({ ok: true, json: async () => [{ error: 'ERR boom' }] }),
    () => ({ ok: true, json: async () => ({ not: 'an array' }) }),
    () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }),
  ];
  for (const f of failures) {
    mockFetch(f);
    globalThis.__meridianKv.map.clear();
    assert.equal(await kvSet('k', 'v', { ttlSec: 60 }), true);
    assert.equal(await kvGet('k'), 'v');
    assert.equal(await kvIncr('c'), 1);
    assert.equal(await kvIncr('c'), 2);
    await kvPush('l', 1);
    await kvPush('l', 2);
    assert.deepEqual(await kvRange('l'), [2, 1]);
    assert.equal(await kvDel('k'), true);
  }
});

test('rest: a hung request is aborted by the timeout and falls through', async () => {
  useRest();
  globalThis.fetch = (url, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
  const keepAlive = setTimeout(() => {}, 5000); // AbortSignal.timeout timers are unref'd
  const t0 = realNow();
  assert.equal(await kvSet('k', 'v'), true);
  const took = realNow() - t0;
  assert.ok(took >= 1400 && took < 3000, `took ${took}ms`);
  assert.equal(await kvGet('k'), 'v'); // served from memory after the failed write
  clearTimeout(keepAlive);
});
