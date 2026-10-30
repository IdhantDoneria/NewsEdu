import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGeopoliticalScore,
  calculateGeopoliticalScoreDetailed,
  __test__,
} from '../lib/scoring/geopolitics.mjs';

const HOUR = 3_600_000;
const now = Date.now();

/* ---------------------------- Fixtures ---------------------------------- */

const wireBrief = {
  title:
    'Russia and Ukraine agree ceasefire terms; NATO summit to weigh sanctions relief',
  summary:
    'Kremlin negotiators and Zelensky signed the 30-day ceasefire in Geneva; the EU said it would ease $12bn in energy sanctions within 48 hours pending IAEA inspections.',
  link: 'https://www.reuters.com/world/europe/russia-ukraine-ceasefire-42x',
  publishedAt: now - 30 * 60 * 1000, // 30 minutes ago
  source: { name: 'Reuters', trust: 19, authority: 9 },
};

const clickbaitStory = {
  title: "You won't believe what happened at the summit! Here's why…",
  summary: 'A jaw-dropping series of jaw-dropping events shocked the world.',
  link: 'https://buzzfeed.com/what-happened-next',
  publishedAt: now - HOUR,
  source: { name: 'Buzzfeed', trust: 6, authority: 3 },
};

const staleWire = {
  ...wireBrief,
  publishedAt: now - 200 * HOUR, // very old
};

/* ------------------------------ Public API ------------------------------ */

test('returns an integer strictly in [0,100] for a normal wire brief', () => {
  const score = calculateGeopoliticalScore(wireBrief);
  assert.equal(Number.isInteger(score), true);
  assert.ok(score >= 0 && score <= 100, `score out of range: ${score}`);
});

test('high-signal wire copy scores well above the noise floor', () => {
  const score = calculateGeopoliticalScore(wireBrief);
  assert.ok(score >= 60, `expected >=60, got ${score}`);
});

test('clickbait scores meaningfully lower than a legitimate brief', () => {
  const good = calculateGeopoliticalScore(wireBrief);
  const bad = calculateGeopoliticalScore(clickbaitStory);
  assert.ok(bad < good - 30, `clickbait ${bad} vs wire ${good}: gap too small`);
});

test('temporal decay drops a stale article below its fresh counterpart', () => {
  const fresh = calculateGeopoliticalScore(wireBrief);
  const stale = calculateGeopoliticalScore(staleWire);
  assert.ok(stale < fresh, `stale ${stale} vs fresh ${fresh}: no decay applied`);
});

test('returns 0 (never throws) for null / undefined / non-object input', () => {
  assert.equal(calculateGeopoliticalScore(null), 0);
  assert.equal(calculateGeopoliticalScore(undefined), 0);
  assert.equal(calculateGeopoliticalScore('a string'), 0);
  assert.equal(calculateGeopoliticalScore(42), 0);
});

test('handles missing title/summary/link/publishedAt safely', () => {
  const s1 = calculateGeopoliticalScore({});
  const s2 = calculateGeopoliticalScore({ title: 'Just a headline' });
  const s3 = calculateGeopoliticalScore({
    source: { trust: 15, authority: 7 },
  });
  for (const s of [s1, s2, s3]) {
    assert.ok(Number.isInteger(s) && s >= 0 && s <= 100);
  }
});

test('output is deterministic for the same input (ignoring temporal decay)', () => {
  const fixture = {
    ...wireBrief,
    publishedAt: now, // pin to "now" to eliminate temporal jitter
  };
  const a = calculateGeopoliticalScore(fixture);
  const b = calculateGeopoliticalScore(fixture);
  assert.equal(a, b);
});

/* ------------------- Per-layer internal checks -------------------------- */

test('outlet layer uses the reviewed table: Reuters outranks an unknown blog', () => {
  const reuters = calculateGeopoliticalScoreDetailed({ ...wireBrief, source: { trust: 0 } }).layers[0].delta;
  const unknown = calculateGeopoliticalScoreDetailed({
    ...wireBrief,
    link: 'https://unknown-blog.example/x',
    source: { name: 'Unknown', trust: 0 },
  }).layers[0].delta;
  assert.ok(reuters > unknown, `reuters (${reuters}) should outrank unknown (${unknown})`);
});

test('entities layer counts distinct entities once and saturates at 14', () => {
  const dense =
    'Russia China India Ukraine Israel Iran Egypt Turkey Poland Germany France Japan Korea NATO EU UN IMF WHO WTO OPEC Kremlin Pentagon Putin Xi Jinping Trump Modi Zelensky Netanyahu $50bn 12% 2024 1500';
  assert.equal(__test__.entityPoints(dense), 14);
  // Repetition adds nothing: "Russia Russian Russians" is one entity.
  assert.equal(
    __test__.entityPoints('Russia Russian Russians Russia'),
    __test__.entityPoints('Russia')
  );
});

test('density layer is capped and 0 for empty / too-short text', () => {
  const dense = 'Russia China Putin Xi Jinping UN NATO $50bn 12% 2024 sanctions';
  const bonus = __test__.densityPoints(dense);
  assert.ok(bonus >= 0 && bonus <= 8);
  assert.equal(__test__.densityPoints(''), 0);
  assert.equal(__test__.densityPoints('a b c'), 0);
});

test('events layer counts distinct event terms, not repeats', () => {
  const low = __test__.eventPoints('the weather was nice');
  const high = __test__.eventPoints('sanctions ceasefire treaty invasion coup summit');
  assert.ok(high > low);
  assert.ok(high <= 9);
  assert.equal(__test__.eventPoints('strike strike strike strike'), __test__.eventPoints('strike'));
});

test('cross-market layer is 0 when no trade/energy terms are present', () => {
  assert.equal(__test__.crossMarketPoints('nothing here'), 0);
  assert.ok(__test__.crossMarketPoints('oil dollar tariff supply chain') > 0);
});

test('subjectivity penalty caps at 18 and ignores "!" (the clickbait layer owns it)', () => {
  const emotional =
    'shocking stunning incredible unbelievable staggering devastating alarming terrifying heartbreaking astonishing outrageous horrific catastrophic explosive extraordinary';
  assert.equal(__test__.subjectivityPenalty(emotional), 18);
  assert.equal(__test__.subjectivityPenalty('quiet day!!!!'), 0);
});

test('clickbait layer triggers on classic tells and is 0 for a clean headline', () => {
  const layerOf = (article) =>
    calculateGeopoliticalScoreDetailed({ ...wireBrief, ...article }).layers.find((l) => l.key === 'clickbait').delta;
  assert.ok(layerOf({ title: "You won't believe what happened!!! Here's why?", summary: '' }) < -15);
  assert.equal(layerOf({ title: 'Ukraine and Russia sign ceasefire', summary: 'A 30-day pause in fighting.' }), 0);
});

/* ---------------- Layer-robustness / error handling --------------------- */

test('individual layer failures never bubble up to the pipeline', () => {
  // Passing an object whose properties throw when read — a stress test for
  // the per-layer try/catch. Should still return a valid integer in [0,100].
  const evil = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'title' || prop === 'summary') return 'harmless';
      if (prop === 'link') return 'https://reuters.com/x';
      if (prop === 'publishedAt') throw new Error('boom');
      if (prop === 'source') throw new Error('boom');
      return undefined;
    },
  });
  const score = calculateGeopoliticalScore(evil);
  assert.ok(Number.isInteger(score));
  assert.ok(score >= 0 && score <= 100);
});
