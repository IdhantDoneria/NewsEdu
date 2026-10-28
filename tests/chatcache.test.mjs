import test from 'node:test';
import assert from 'node:assert/strict';

import { cacheKey, clearCache, normalizeQuestion, withCache } from '../lib/intelligence/chatcache.mjs';

const base = { edition: 'finance', question: 'What is moving markets today?', focusClusterId: '', memory: [], learn: false, briefVersion: 1 };

test('question normalisation ignores case, punctuation and spacing', () => {
  assert.equal(normalizeQuestion('  What is   moving MARKETS today?! '), 'what is moving markets today');
  assert.equal(cacheKey(base), cacheKey({ ...base, question: 'what is moving markets today' }));
});

test('cache key separates edition, focus, memory, learn flag and brief version', () => {
  const k = cacheKey(base);
  for (const change of [
    { edition: 'geopolitics' },
    { focusClusterId: 'c1' },
    { memory: [{ id: 'm1', text: 'Follows central banks' }] },
    { learn: true },
    { briefVersion: 2 },
  ]) assert.notEqual(cacheKey({ ...base, ...change }), k);
});

test('second identical request is served from cache; fresh bypasses and replaces it', async () => {
  clearCache();
  let calls = 0;
  const produce = async () => ({ answer: `v${++calls}`, provider: 'gemini' });
  const a = await withCache('k1', produce);
  const b = await withCache('k1', produce);
  assert.equal(a.cached, false);
  assert.equal(b.cached, true);
  assert.equal(b.value.answer, 'v1');
  const c = await withCache('k1', produce, { fresh: true });
  assert.equal(c.cached, false);
  assert.equal(c.value.answer, 'v2');
  assert.equal((await withCache('k1', produce)).value.answer, 'v2');
});

test('concurrent identical requests share one model call', async () => {
  clearCache();
  let calls = 0;
  const produce = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return { answer: 'shared', provider: 'gemini' };
  };
  const results = await Promise.all([withCache('k2', produce), withCache('k2', produce), withCache('k2', produce)]);
  assert.equal(calls, 1);
  assert.equal(results.filter((r) => r.cached).length, 2);
});

test('values that are not cacheable (fallbacks) are not stored', async () => {
  clearCache();
  let calls = 0;
  const produce = async () => ({ answer: `f${++calls}`, provider: 'fallback' });
  const opts = { cacheable: (v) => v.provider !== 'fallback' };
  await withCache('k3', produce, opts);
  const second = await withCache('k3', produce, opts);
  assert.equal(second.cached, false);
  assert.equal(calls, 2);
});

test('a failing producer is not cached and releases the in-flight slot', async () => {
  clearCache();
  await assert.rejects(withCache('k4', async () => { throw new Error('boom'); }));
  const ok = await withCache('k4', async () => ({ answer: 'fine', provider: 'gemini' }));
  assert.equal(ok.value.answer, 'fine');
});
