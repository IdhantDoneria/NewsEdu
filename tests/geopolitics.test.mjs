import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGeopoliticalScore,
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

test('L1 uses domain database when hostname is known', () => {
  const reuters = __test__.sourceCredibilityBaseline({
    link: 'https://www.reuters.com/x',
    source: { trust: 0, authority: 0 },
  });
  const unknown = __test__.sourceCredibilityBaseline({
    link: 'https://unknown-blog.example/x',
    source: { trust: 0, authority: 0 },
  });
  assert.ok(
    reuters > unknown,
    `reuters (${reuters}) should outrank unknown (${unknown})`
  );
  assert.ok(reuters >= 70, `reuters baseline should be strong: got ${reuters}`);
});

test('L1 falls back to source trust/authority when domain unknown', () => {
  const fallback = __test__.sourceCredibilityBaseline({
    link: 'https://unknown-site.example/x',
    source: { trust: 15, authority: 7 },
  });
  // trust*3 + authority*4 = 45+28 = 73
  assert.equal(fallback, 73);
});

test('L1 returns neutral 45 when neither domain nor source is present', () => {
  assert.equal(__test__.sourceCredibilityBaseline({}), 45);
});

test('L2 fact match rate saturates at 100', () => {
  // Twenty+ entity/stat hits (5 pts each) — should saturate the 100 cap.
  const highDensity =
    'Russia China India Ukraine Israel Iran Egypt Turkey Poland Germany France Japan Korea NATO EU UN IMF WHO WTO OPEC Kremlin Pentagon Putin Xi Trump Modi Zelensky Netanyahu $50bn 12% 2024 1500';
  const rate = __test__.factMatchRate(highDensity);
  assert.equal(rate, 100);
});

test('L3 temporal decay is exactly 0.5 per hour', () => {
  const twoHoursAgo = { publishedAt: Date.now() - 2 * HOUR };
  const penalty = __test__.temporalDecayPenalty(twoHoursAgo);
  assert.ok(penalty > 0.99 && penalty < 1.01, `expected ~1, got ${penalty}`);
});

test('L3 returns 0 for missing / non-numeric publishedAt', () => {
  assert.equal(__test__.temporalDecayPenalty({}), 0);
  assert.equal(__test__.temporalDecayPenalty({ publishedAt: null }), 0);
  assert.equal(__test__.temporalDecayPenalty({ publishedAt: 'not-a-date' }), 0);
});

test('L4 subjectivity penalty caps at 30', () => {
  const emotional =
    'shocking stunning incredible unbelievable staggering devastating alarming terrifying heartbreaking astonishing outrageous horrific catastrophic explosive extraordinary!!!!!!';
  const p = __test__.subjectivityPenalty(emotional);
  assert.equal(p, 30);
});

test('L5 density bonus caps at 15', () => {
  const dense = 'Russia China Putin Xi UN NATO $50bn 12% 2024 sanctions';
  const bonus = __test__.informationDensityBonus(dense);
  assert.ok(bonus >= 0 && bonus <= 15);
});

test('L5 returns 0 for empty / too-short text', () => {
  assert.equal(__test__.informationDensityBonus(''), 0);
  assert.equal(__test__.informationDensityBonus('a b c'), 0);
});

test('L6 citation bonus caps at 15', () => {
  const max = __test__.citationBonus({ source: { authority: 10 } });
  assert.equal(max, 15);
  assert.equal(__test__.citationBonus({}), 0);
});

test('L7 geopolitical relevance grows with event vocabulary', () => {
  const low = __test__.geopoliticsRelevance('the weather was nice');
  const high = __test__.geopoliticsRelevance(
    'sanctions ceasefire treaty invasion coup summit'
  );
  assert.ok(high > low);
  assert.ok(high <= 100);
});

test('L8 cross-market adjustment is 0 when no macro terms present', () => {
  assert.equal(__test__.crossMarketAdjustment('nothing here'), 0);
  assert.ok(__test__.crossMarketAdjustment('oil dollar tariff supply chain') > 0);
});

test('L9 clickbait penalty triggers on classic tells', () => {
  const p = __test__.clickbaitPenalty({
    title: "You won't believe what happened!!! Here's why?",
    summary: '',
  });
  assert.ok(p > 15, `expected substantial penalty, got ${p}`);
});

test('L9 clickbait penalty is 0 for a clean headline', () => {
  const p = __test__.clickbaitPenalty({
    title: 'Ukraine and Russia sign ceasefire',
    summary: 'The two governments agreed a 30-day pause in fighting.',
  });
  assert.equal(p, 0);
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
