import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { sendFeedback } = await import('../lib/client/telemetry.js');

const realFetch = globalThis.fetch;
const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

afterEach(() => {
  globalThis.fetch = realFetch;
  if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc);
  else delete globalThis.navigator;
});

function setNavigator(nav) {
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
}

async function blobText(b) {
  return JSON.parse(await b.text());
}

test('uses sendBeacon and sends only the allowed fields', async () => {
  const sent = [];
  setNavigator({ sendBeacon: (url, blob) => (sent.push({ url, blob }), true) });
  globalThis.fetch = () => assert.fail('fetch must not be used when the beacon is accepted');
  assert.equal(sendFeedback({ rating: 'down', provider: 'gemini', question: 'q'.repeat(500), extra: 'pii' }), true);
  assert.equal(sent[0].url, '/api/telemetry');
  const body = await blobText(sent[0].blob);
  assert.deepEqual(Object.keys(body).sort(), ['provider', 'question', 'rating', 'type']);
  assert.equal(body.type, 'feedback');
  assert.equal(body.question.length, 200);
});

test('thumbs-up never carries the question text', async () => {
  const sent = [];
  setNavigator({ sendBeacon: (url, blob) => (sent.push(blob), true) });
  sendFeedback({ rating: 'up', provider: 'openrouter', question: 'secret question' });
  assert.deepEqual(await blobText(sent[0]), { type: 'feedback', rating: 'up', provider: 'openrouter' });
});

test('falls back to fetch when sendBeacon is missing, refuses, or throws', async () => {
  const calls = [];
  globalThis.fetch = (url, init) => (calls.push({ url, init }), Promise.resolve({ ok: true }));
  for (const nav of [{}, { sendBeacon: () => false }, { sendBeacon: () => { throw new Error('boom'); } }]) {
    setNavigator(nav);
    assert.equal(sendFeedback({ rating: 'up' }), true);
  }
  assert.equal(calls.length, 3);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.keepalive, true);
  assert.deepEqual(JSON.parse(calls[0].init.body), { type: 'feedback', rating: 'up' });
});

test('never throws: bad input, rejected fetch, synchronous fetch error', () => {
  setNavigator({});
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  assert.equal(sendFeedback(null), false);
  assert.equal(sendFeedback({ rating: 'maybe' }), false);
  assert.doesNotThrow(() => sendFeedback({ rating: 'down', question: 'x' }));
  globalThis.fetch = () => { throw new Error('sync'); };
  assert.doesNotThrow(() => sendFeedback({ rating: 'down', question: 'x' }));
});
