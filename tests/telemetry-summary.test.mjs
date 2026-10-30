import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  recordEvent,
  summarizeEvents,
  percentile,
  validateFeedback,
  tokenMatches,
  isRateLimited,
  scrub,
  sanitizeData,
  TELEMETRY_KEY,
} from '../lib/telemetry.mjs';
import { kvRange } from '../lib/store/kv.mjs';

beforeEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  globalThis.__meridianKv.map.clear();
});

const chat = (over) => ({ type: 'chat', t: 1, provider: 'gemini', ms: 1000, cached: false, citations: 2, dropped: 0, ...over });

test('percentile uses nearest rank and ignores non-numbers', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5], 95), 5);
  assert.equal(percentile([10, 20, 30, 40], 50), 20);
  assert.equal(percentile([10, 20, 30, 40], 95), 40);
  assert.equal(percentile([30, NaN, 10, undefined, 20], 50), 20);
});

test('summarizeEvents on nothing is all zeros / nulls', () => {
  const s = summarizeEvents([]);
  assert.equal(s.total, 0);
  assert.equal(s.chat.count, 0);
  assert.equal(s.chat.cacheHitRate, null);
  assert.equal(s.latencyMs.p50, null);
  assert.deepEqual(summarizeEvents(null).byType, {});
});

test('summarizeEvents: chat count, cache hits, provider mix, fallback and grounding', () => {
  const events = [
    chat({ ms: 800 }),
    chat({ ms: 1200, provider: 'openrouter', citations: 0 }),
    chat({ ms: 5, cached: true }),
    chat({ ms: 20, provider: 'fallback', citations: 0 }),
    chat({ ms: 900, citations: 3, dropped: 1 }),
    { type: 'intel', t: 2, provider: 'gemini', ms: 3000, fallback: false },
    { type: 'intel', t: 3, provider: 'fallback', ms: 10, fallback: true },
  ];
  const s = summarizeEvents(events);
  assert.equal(s.total, 7);
  assert.deepEqual(s.byType, { chat: 5, intel: 2 });
  assert.equal(s.chat.count, 5);
  assert.equal(s.chat.cacheHitRate, 0.2);
  assert.deepEqual(s.chat.providerMix, { gemini: 3, openrouter: 1, fallback: 1 });
  assert.equal(s.chat.fallbackShare, 0.2);
  // answered (non-fallback) = 4; with citations = 3 (one openrouter answer had none)
  assert.equal(s.chat.groundingRate, 0.75);
  assert.equal(s.chat.citationDropRate, 0.125); // 1 dropped of 8 citations seen
  assert.equal(s.intel.count, 2);
  assert.equal(s.intel.fallbackShare, 0.5);
  // latency over chat + intel: 5,10,20,800,900,1200,3000
  assert.equal(s.latencyMs.n, 7);
  assert.equal(s.latencyMs.p50, 800);
  assert.equal(s.latencyMs.p95, 3000);
  // model latency excludes cached and fallback answers
  assert.equal(s.latencyMs.model.n, 4);
  assert.equal(s.latencyMs.byProvider.gemini.n, 2);
});

test('summarizeEvents: thumbs by provider', () => {
  const s = summarizeEvents([
    { type: 'feedback', rating: 'up', provider: 'gemini' },
    { type: 'feedback', rating: 'down', provider: 'gemini' },
    { type: 'feedback', rating: 'down', provider: 'openrouter' },
    { type: 'feedback', rating: 'down' },
    { type: 'feedback', rating: 'sideways', provider: 'gemini' }, // ignored
  ]);
  assert.equal(s.feedback.up, 1);
  assert.equal(s.feedback.down, 3);
  assert.equal(s.feedback.downRate, 0.75);
  assert.deepEqual(s.feedback.byProvider, {
    gemini: { up: 1, down: 1 },
    openrouter: { up: 0, down: 1 },
    unknown: { up: 0, down: 1 },
  });
});

test('recordEvent stores sanitized events newest-first and never throws', async () => {
  await recordEvent('chat', {
    provider: 'gemini',
    ms: 12,
    notice: 'x'.repeat(500),
    sources: [1, 2, 3],
    nested: { secret: 1 },
    bad: Infinity,
    t: 'spoof',
    type: 'spoof',
  });
  await recordEvent('intel', { ms: 1 });
  const [latest, first] = await kvRange(TELEMETRY_KEY);
  assert.equal(latest.type, 'intel');
  assert.equal(first.type, 'chat');
  assert.equal(first.notice.length, 200);
  assert.equal(first.sources, 3);
  assert.ok(!('nested' in first) && !('bad' in first));
  assert.equal(typeof first.t, 'number');
  assert.doesNotThrow(() => recordEvent(Symbol('x'), null));
  assert.deepEqual(sanitizeData('nope'), {});
});

test('validateFeedback: strict allow-lists', () => {
  assert.deepEqual(validateFeedback({ type: 'feedback', rating: 'up', provider: 'gemini' }), {
    type: 'feedback',
    data: { rating: 'up', provider: 'gemini' },
  });
  assert.equal(validateFeedback({ type: 'chat', rating: 'up' }).error, 'invalid-type');
  assert.equal(validateFeedback({ type: 'feedback', rating: 'meh' }).error, 'invalid-rating');
  assert.equal(validateFeedback({ type: 'feedback', rating: 'up', provider: 'evil' }).error, 'invalid-provider');
  assert.equal(validateFeedback({ type: 'feedback', rating: 'up', provider: { a: 1 } }).error, 'invalid-provider');
  assert.equal(validateFeedback(null).error, 'invalid-type');
  assert.equal(validateFeedback('x').error, 'invalid-type');
});

test('validateFeedback: question only on thumbs-down, scrubbed and truncated', () => {
  const up = validateFeedback({ type: 'feedback', rating: 'up', question: 'what is x?' });
  assert.ok(!('question' in up.data));
  const down = validateFeedback({
    type: 'feedback',
    rating: 'down',
    question: `Email me at jane.doe@example.com or call +1 (555) 123-4567 about https://example.com/a?b=1 ${'y'.repeat(400)}`,
  });
  const q = down.data.question;
  assert.ok(q.length <= 200);
  assert.ok(!/jane|example\.com|555/.test(q), q);
  assert.match(q, /\[email\]/);
  assert.equal(scrub('  a   b  '), 'a b');
});

test('tokenMatches compares in constant time and rejects empty values', () => {
  assert.equal(tokenMatches('secret', 'secret'), true);
  assert.equal(tokenMatches('secret', 'secreT'), false);
  assert.equal(tokenMatches('', 'secret'), false);
  assert.equal(tokenMatches('secret', ''), false);
  assert.equal(tokenMatches(undefined, 'secret'), false);
  assert.equal(tokenMatches('a'.repeat(1000), 'secret'), false);
});

test('isRateLimited allows the limit per minute per IP and resets next minute', async () => {
  const now = Date.UTC(2026, 9, 29, 12, 0, 5);
  for (let i = 0; i < 3; i++) assert.equal(await isRateLimited('1.2.3.4', { limit: 3, now }), false);
  assert.equal(await isRateLimited('1.2.3.4', { limit: 3, now }), true);
  assert.equal(await isRateLimited('5.6.7.8', { limit: 3, now }), false); // other IP unaffected
  assert.equal(await isRateLimited('1.2.3.4', { limit: 3, now: now + 60_000 }), false); // next window
  // the raw address is never part of a stored key
  for (const k of globalThis.__meridianKv.map.keys()) assert.ok(!k.includes('1.2.3.4'), k);
});
