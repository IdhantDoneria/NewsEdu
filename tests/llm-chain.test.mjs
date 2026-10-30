/** Model chain: shared deadline, per-call timeouts, abort, validation, JSON repair. */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { callModel, setTestModels, resetLlmState, llmProfile, PROFILES } from '../lib/intelligence/llm.mjs';
import { parseModelJson, repairJson } from '../lib/intelligence/ai.mjs';
import { openRouterJson } from '../lib/intelligence/openrouter.mjs';

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.OPENROUTER_API_KEY;

const quiet = console.error;
console.error = () => {};
afterEach(() => {
  setTestModels(null);
  resetLlmState();
});
process.on('exit', () => {
  console.error = quiet;
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hang = (name, log) => ({
  provider: 'gemini',
  model: name,
  // honours the signal like fetch does
  call: (_p, { signal }) =>
    new Promise((_, reject) => {
      log?.push({ name, signal });
      signal.addEventListener('abort', () => reject(new Error('This operation was aborted')), { once: true });
    }),
});
const ok = (name, value = { ok: true }) => ({ provider: 'openrouter', model: name, call: async () => value });

test('profiles: chat 25 s / intel 40 s shared deadline, 12 s per call for chat', () => {
  assert.equal(PROFILES.chat.deadlineMs, 25_000);
  assert.equal(PROFILES.chat.callMs, 12_000);
  assert.equal(PROFILES.intel.deadlineMs, 40_000);
  assert.ok(PROFILES.intel.maxTokens >= 4000, 'story analysis needs a large output budget');
  assert.equal(llmProfile('nope'), PROFILES.default);
});

test('a hung model is aborted at its own timeout and the next model answers', async () => {
  const log = [];
  setTestModels([hang('slow', log), ok('fast')]);
  const t0 = Date.now();
  const r = await callModel('p', { label: 'chat', callMs: 60, deadlineMs: 5000 });
  assert.equal(r.model, 'fast');
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(log[0].signal.aborted, true, 'the request itself was cancelled, not just abandoned');
});

test('the deadline is shared: three slow models cannot add up to three timeouts', async () => {
  setTestModels([hang('a'), hang('b'), hang('c'), ok('d')]);
  const t0 = Date.now();
  await assert.rejects(
    callModel('p', { callMs: 400, deadlineMs: 2500 }),
    (err) => /timed out/.test(err.message) && /deadline/.test(err.message)
  );
  const took = Date.now() - t0;
  // a: 400, b: 400, c: 400, then only <2 s remain -> no fourth attempt, and certainly not 3 x 12 s
  assert.ok(took < 2500, `took ${took}ms`);
});

test('every attempt is clamped to the time left on the shared deadline', async () => {
  const seen = [];
  setTestModels([
    { provider: 'gemini', model: 'a', call: async (_p, { signal }) => { seen.push(signal); await sleep(1500); throw new Error('503 overloaded'); } },
    hang('b'),
  ]);
  const t0 = Date.now();
  await assert.rejects(callModel('p', { callMs: 10_000, deadlineMs: 3000 }));
  assert.ok(Date.now() - t0 < 3300);
});

test('a reply that fails validation moves on to the next model', async () => {
  setTestModels([ok('bad', { nonsense: true }), ok('good', { whatHappened: 'x' })]);
  const r = await callModel('p', { validate: (raw) => (raw.whatHappened ? { v: raw.whatHappened } : null) });
  assert.equal(r.model, 'good');
  assert.deepEqual(r.value, { v: 'x' });
});

test('a model that keeps returning malformed JSON is skipped for that kind of call only', async () => {
  let badCalls = 0;
  const bad = {
    provider: 'gemini',
    model: 'lite',
    call: async () => {
      badCalls++;
      return parseModelJson('{"a": nope nope');
    },
  };
  setTestModels([bad, ok('flash')]);
  for (let i = 0; i < 4; i++) assert.equal((await callModel('p', { label: 'intel' })).model, 'flash');
  assert.equal(badCalls, 2, 'skipped for intel after two malformed replies');
  // chat is unaffected by intel's streak
  await callModel('p', { label: 'chat' });
  assert.equal(badCalls, 3);
});

test('quota and overload errors put a model on cooldown', async () => {
  let calls = 0;
  setTestModels([{ provider: 'gemini', model: 'q', call: async () => { calls++; throw new Error('429 RESOURCE_EXHAUSTED'); } }, ok('b')]);
  await callModel('p');
  await callModel('p');
  assert.equal(calls, 1);
});

test('the chain error names every attempt', async () => {
  setTestModels([{ provider: 'gemini', model: 'a', call: async () => { throw new Error('boom a'); } }, { provider: 'openrouter', model: 'b', call: async () => { throw new Error('boom b'); } }]);
  await assert.rejects(callModel('p'), /boom a \| boom b/);
});

test('parseModelJson repairs the slips small models make', () => {
  assert.deepEqual(parseModelJson('{"a": 1, "b": [1,2,],}'), { a: 1, b: [1, 2] });
  assert.deepEqual(parseModelJson('{"a": "x" "b": "y"}'), { a: 'x', b: 'y' });
  assert.deepEqual(parseModelJson('```json\n{"a":"line1\nline2"}\n```'), { a: 'line1\nline2' });
  assert.deepEqual(parseModelJson('{"a":"He said "hi", then left","b":2}'), { a: 'He said "hi", then left', b: 2 });
  assert.deepEqual(parseModelJson('Sure! {"a":[{"x":1}]} hope that helps'), { a: [{ x: 1 }] });
  assert.deepEqual(parseModelJson('{"a":{"b":[1,2}}'), { a: { b: [1, 2] } });
  assert.throws(() => parseModelJson('not json at all'));
});

test('a truncated story analysis is salvaged down to its complete part', () => {
  const cut = '{"whatHappened":{"text":"The EU approved a package for Ukraine.","classification":"FACT","citations":["a1"]},"whyItMatters":[{"text":"Money flows","classification":"ANALYSIS"},{"text":"Half a sen';
  const v = parseModelJson(cut);
  assert.equal(v.whatHappened.classification, 'FACT');
  assert.equal(v.whyItMatters.length, 2);
  assert.equal(repairJson('{"a":1,"b"'), '{"a":1}');
});

test('OpenRouter gets a story-sized max_tokens and the chain signal', async () => {
  process.env.OPENROUTER_API_KEY = 'k';
  const real = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { body: JSON.parse(init.body), signal: init.signal };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) };
  };
  try {
    const ctrl = new AbortController();
    await openRouterJson('p', 'm', { signal: ctrl.signal, maxTokens: PROFILES.intel.maxTokens });
    assert.equal(sent.body.max_tokens, PROFILES.intel.maxTokens);
    ctrl.abort();
    assert.equal(sent.signal.aborted, true, 'the caller signal is wired into the request');
    await openRouterJson('p', 'm');
    assert.ok(sent.body.max_tokens >= 1500);
  } finally {
    globalThis.fetch = real;
    delete process.env.OPENROUTER_API_KEY;
  }
});
