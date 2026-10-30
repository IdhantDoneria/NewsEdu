import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreArticleAsync,
  scoreArticlesAsync,
  displayScore,
  receiptTotal,
  calculateGeopoliticalScoreDetailed,
  calculateFinancialScoreDetailed,
} from '../lib/scoring/index.mjs';
import { recencyPoints, ageHoursAt, HALF_LIFE_HOURS } from '../lib/scoring/common.mjs';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const HOUR = 3_600_000;

const geoWire = {
  title: 'Russia and Ukraine agree ceasefire terms; NATO summit to weigh sanctions relief',
  summary: 'Kremlin negotiators and Zelensky signed the 30-day ceasefire in Geneva; the EU said it would ease $12bn in energy sanctions.',
  link: 'https://www.reuters.com/world/europe/x',
  source: { name: 'Reuters', trust: 19 },
};
const finWire = {
  title: 'CPI print at 3.2% keeps FOMC on hold as USD strengthens vs. EUR',
  summary: 'Yields on the 10-year Treasury climbed 12 bps to 4.35%; the dollar rose 0.6% against the euro.',
  link: 'https://www.marketwatch.com/story/x',
  source: { name: 'MarketWatch', trust: 17 },
};
const at = (a, h) => ({ ...a, publishedAt: NOW - h * HOUR });

/* ------------------------------- Display map ------------------------------ */

test('displayScore is monotonic, bounded to 0-100 and the identity below the knee', () => {
  let prev = -1;
  for (let r = -20; r <= 400; r += 0.5) {
    const d = displayScore(r, 'geopolitics');
    assert.ok(Number.isInteger(d) && d >= 0 && d <= 100, `bad display ${d} for rank ${r}`);
    assert.ok(d >= prev, `not monotonic at rank ${r}: ${d} < ${prev}`);
    prev = d;
  }
  for (const r of [0, 1, 17, 42, 60, 89]) assert.equal(displayScore(r), r);
  assert.equal(displayScore(-5), 0);
  assert.equal(displayScore(NaN), 0);
  assert.equal(displayScore(1e9), 100);
});

test('displayScore does not pile stories up at 100: ranks 90..105 stay distinguishable', () => {
  const vals = [90, 95, 100, 105].map((r) => displayScore(r));
  assert.equal(new Set(vals).size, vals.length, `ties among ${vals}`);
  assert.ok(vals.every((v) => v < 100));
  assert.ok(displayScore(115) < 100, 'even a rank of 115 does not hit the ceiling');
});

test('displayScore is the same edition-independent map', () => {
  for (const r of [10, 50, 95, 130]) assert.equal(displayScore(r, 'finance'), displayScore(r, 'geopolitics'));
});

/* --------------------------------- Receipt -------------------------------- */

const corpus = [];
for (const base of [geoWire, finWire]) {
  for (const h of [0, 0.5, 3, 12, 30, 80]) corpus.push(at(base, h));
}
corpus.push(
  { title: "You won't believe this! Here's why…", summary: 'jaw-dropping', link: 'https://buzzfeed.com/x', publishedAt: NOW - HOUR },
  { title: 'How to plan a trip around a running race', summary: '', link: 'https://nytimes.com/x', publishedAt: NOW - HOUR },
  { title: '$AAPL EPS of $6.14, 10-K filed', summary: 'Fed FOMC CPI', link: 'https://www.sec.gov/x', publishedAt: NOW },
  { title: 'x' },
  {}
);

test('scoreBreakdown deltas sum EXACTLY to rankScore, in both editions, for every article', async () => {
  for (const edition of ['geopolitics', 'finance']) {
    for (const a of corpus) {
      const s = await scoreArticleAsync(a, edition, { now: NOW });
      const naive = s.scoreBreakdown.reduce((acc, l) => acc + l.delta, 0);
      assert.equal(naive, s.rankScore, `${edition}: receipt ${naive} != rank ${s.rankScore} for "${a.title}"`);
      assert.equal(receiptTotal(s.scoreBreakdown), s.rankScore);
      assert.equal(s.finalCurationScore, displayScore(s.rankScore, edition));
    }
  }
});

test('rankScore is unclamped: it can exceed 100 and fall below 0 while display stays in 0-100', async () => {
  const hot = {
    title: 'Trump, Putin, Xi and Modi sanction Russia, China, India, Iran, Israel at NATO UN summit: $50bn, 12%, 2026 tariffs on oil',
    summary: 'Ceasefire treaty invasion coup missile airstrike embassy unrest protest alliance negotiation troops blockade militia referendum nuclear regime resolution dispute',
    link: 'https://www.reuters.com/x',
    publishedAt: NOW,
    source: { name: 'Reuters' },
  };
  const s = await scoreArticleAsync(hot, 'geopolitics', { now: NOW });
  assert.ok(s.rankScore > 100, `expected >100, got ${s.rankScore}`);
  assert.ok(s.finalCurationScore <= 100 && s.finalCurationScore < Math.round(s.rankScore));

  const junk = {
    title: "HOW TO RETIRE: YOU WON'T BELIEVE THIS SECRET!!! Here's why?",
    summary: 'shocking stunning incredible unbelievable staggering devastating alarming!!!',
    link: 'https://reddit.com/x',
    publishedAt: NOW - 400 * HOUR,
    source: { name: 'Reddit', trust: 2 },
  };
  const f = await scoreArticleAsync(junk, 'finance', { now: NOW });
  assert.ok(f.rankScore < 40, `junk rank should be very low, got ${f.rankScore}`);
  assert.ok(f.finalCurationScore >= 0);
});

test('the batch sort key (rankScore) breaks display ties: display ties are not rank ties', async () => {
  const arts = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((h) => at(geoWire, h));
  const res = await scoreArticlesAsync(arts, 'geopolitics', { now: NOW });
  const ranks = res.map((r) => r.rankScore);
  assert.equal(new Set(ranks).size, ranks.length, 'fresher article must outrank by rank even when display rounds equal');
  for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i] < ranks[i - 1]);
});

/* -------------------------------- Recency --------------------------------- */

test('recency is one half-life term in both editions: 18 h geopolitics, 8 h finance', () => {
  assert.deepEqual({ ...HALF_LIFE_HOURS }, { geopolitics: 18, finance: 8 });
  assert.ok(Math.abs(recencyPoints(18, 'geopolitics') - recencyPoints(0, 'geopolitics') / 2) < 1e-9);
  assert.ok(Math.abs(recencyPoints(8, 'finance') - recencyPoints(0, 'finance') / 2) < 1e-9);
  // Soft tail: strictly decreasing, positive, no cliff at the old 72 h boundary.
  const t = [0, 12, 48, 71.9, 72.1, 200].map((h) => recencyPoints(h, 'geopolitics'));
  for (let i = 1; i < t.length; i++) assert.ok(t[i] < t[i - 1] && t[i] > 0);
  assert.ok(t[3] - t[4] < 0.02, 'no step at 72 h');
});

test('finance now decays with age (it previously ignored it); a 3 h item outranks the same text at 70 h', () => {
  const fresh = calculateFinancialScoreDetailed(at(finWire, 3), { now: NOW }).rank;
  const old = calculateFinancialScoreDetailed(at(finWire, 70), { now: NOW }).rank;
  assert.ok(fresh - old > 20, `fresh ${fresh} vs old ${old}`);
});

test('geopolitics decay is bounded: 120 h old loses at most the recency maximum, never a runaway penalty', () => {
  const fresh = calculateGeopoliticalScoreDetailed(at(geoWire, 0), { now: NOW }).rank;
  const ancient = calculateGeopoliticalScoreDetailed(at(geoWire, 5000), { now: NOW }).rank;
  assert.ok(fresh - ancient <= 30.01, `loss ${fresh - ancient}`);
  assert.ok(ancient > 40, 'rank must not run to -infinity');
});

test('future and missing dates are clamped to fetch time, never treated as fresher than now', () => {
  const nowRank = calculateGeopoliticalScoreDetailed(at(geoWire, 0), { now: NOW }).rank;
  const future = calculateGeopoliticalScoreDetailed({ ...geoWire, publishedAt: NOW + 48 * HOUR }, { now: NOW }).rank;
  const missing = calculateGeopoliticalScoreDetailed({ ...geoWire, publishedAt: undefined }, { now: NOW }).rank;
  const junk = calculateGeopoliticalScoreDetailed({ ...geoWire, publishedAt: 'soon' }, { now: NOW }).rank;
  assert.equal(future, nowRank);
  assert.equal(missing, nowRank);
  assert.equal(junk, nowRank);
  assert.equal(ageHoursAt({ publishedAt: NOW + HOUR }, NOW), 0);
  assert.equal(ageHoursAt({ ageHours: 5 }, NOW), 5);
});

/* --------------------------- Determinism / purity -------------------------- */

test('scoring is idempotent and independent of batch order and neighbours', async () => {
  const arts = corpus.filter((a) => a.title);
  const first = await scoreArticlesAsync(arts, 'finance', { now: NOW });
  const again = await scoreArticlesAsync(arts, 'finance', { now: NOW });
  assert.deepEqual(first, again);

  const rev = await scoreArticlesAsync([...arts].reverse(), 'finance', { now: NOW });
  rev.reverse();
  assert.deepEqual(first, rev);

  // Scoring one article alone gives the same answer as inside a batch.
  const solo = await scoreArticleAsync(arts[3], 'finance', { now: NOW });
  assert.deepEqual(solo, first[3]);

  // Inputs are not mutated.
  const snapshot = JSON.stringify(arts);
  await scoreArticlesAsync(arts, 'geopolitics', { now: NOW });
  assert.equal(JSON.stringify(arts), snapshot);
});

test('both pipelines are scored for each article regardless of edition', async () => {
  const g = await scoreArticleAsync(geoWire, 'geopolitics', { now: NOW });
  const f = await scoreArticleAsync(geoWire, 'finance', { now: NOW });
  assert.equal(g.geopoliticalScore, f.geopoliticalScore);
  assert.equal(g.financialScore, f.financialScore);
  assert.equal(g.finalCurationScore, g.geopoliticalScore);
  assert.equal(f.finalCurationScore, f.financialScore);
});
