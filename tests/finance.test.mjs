import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFinancialScore,
  __test__,
} from '../lib/scoring/finance.mjs';

const HOUR = 3_600_000;
const now = Date.now();

/* ---------------------------- Fixtures ---------------------------------- */

const regulatoryBrief = {
  title:
    '$AAPL files 10-K disclosing $394bn revenue, 25.3% operating margin, and DCF-implied 15% upside',
  summary:
    'Apple ($AAPL) filed its SEC 10-K yesterday, reporting EPS of $6.14, ROIC of 42.1%, and free cash flow of $99.6 billion. Analysts using DCF with a WACC of 8.2% see terminal value 15% above the current price. The Fed FOMC rate decision on Wednesday will be a catalyst.',
  link: 'https://www.sec.gov/edgar/apple-10k-2024',
  publishedAt: now - 15 * 60 * 1000,
  source: { name: 'SEC', trust: 20, authority: 10 },
};

const marketWireBrief = {
  title: 'CPI print at 3.2% keeps FOMC on hold as USD strengthens vs. EUR',
  summary:
    'US inflation ran at 3.2% in November, higher than the 3.1% expected. Yields on the 10-year Treasury climbed 12 bps to 4.35%. The dollar rose 0.6% against the euro; futures now price a 68% chance the Fed holds rates in December.',
  link: 'https://www.marketwatch.com/story/cpi-print-fomc-hold',
  publishedAt: now - 45 * 60 * 1000,
  source: { name: 'MarketWatch', trust: 17, authority: 10 },
};

const pumpPost = {
  title: 'This penny stock will explode 100x — guaranteed next Tesla to the moon!!!',
  summary:
    'Meme stock pumping goes parabolic. YOLO. To the moon. Rocket. Guaranteed profit.',
  link: 'https://reddit.com/wallstreetbets/xyz',
  publishedAt: now - HOUR,
  source: { name: 'Reddit', trust: 4, authority: 3 },
};

// Finance spec Layer 3 is Quantitative Data Density, not temporal decay —
// there is no age-based penalty layer in the finance pipeline. See L10 tests.

/* ------------------------------ Public API ------------------------------ */

test('returns an integer strictly in [0,100] for a regulatory brief', () => {
  const s = calculateFinancialScore(regulatoryBrief);
  assert.equal(Number.isInteger(s), true);
  assert.ok(s >= 0 && s <= 100, `score out of range: ${s}`);
});

test('regulatory filing with fundamentals scores near the top of the scale', () => {
  const s = calculateFinancialScore(regulatoryBrief);
  assert.ok(s >= 85, `expected >=85 for SEC filing with DCF/WACC, got ${s}`);
});

test('macro wire copy with quantitative data scores well above the noise floor', () => {
  const s = calculateFinancialScore(marketWireBrief);
  assert.ok(s >= 65, `expected >=65 for a macro wire, got ${s}`);
});

test('pump-and-dump post drops far below legitimate copy', () => {
  const good = calculateFinancialScore(regulatoryBrief);
  const bad = calculateFinancialScore(pumpPost);
  assert.ok(
    bad < good - 40,
    `pump-post ${bad} should trail SEC filing ${good} by more than 40 pts`
  );
});

test('finance pipeline is age-invariant by design (no L3 temporal decay)', () => {
  // The finance spec's Layer 3 is Quantitative Data Density, not temporal
  // decay — market fundamentals do not lose relevance minute-by-minute the
  // way conflict news does. Same content at any age must score identically.
  const fresh = calculateFinancialScore(regulatoryBrief);
  const stale = calculateFinancialScore({
    ...regulatoryBrief,
    publishedAt: now - 500 * HOUR,
  });
  assert.equal(fresh, stale);
});

test('returns 0 (never throws) for null / undefined / non-object input', () => {
  assert.equal(calculateFinancialScore(null), 0);
  assert.equal(calculateFinancialScore(undefined), 0);
  assert.equal(calculateFinancialScore('a string'), 0);
  assert.equal(calculateFinancialScore(42), 0);
});

test('handles missing title/summary/link/publishedAt safely', () => {
  const s1 = calculateFinancialScore({});
  const s2 = calculateFinancialScore({ title: 'Just a headline' });
  const s3 = calculateFinancialScore({
    source: { trust: 15, authority: 8 },
  });
  for (const s of [s1, s2, s3]) {
    assert.ok(Number.isInteger(s) && s >= 0 && s <= 100);
  }
});

test('score is deterministic for the same input', () => {
  const a = calculateFinancialScore(marketWireBrief);
  const b = calculateFinancialScore(marketWireBrief);
  assert.equal(a, b);
});

/* ------------------- Per-layer internal checks -------------------------- */

test('L1 gives regulators (sec.gov) the maximum baseline', () => {
  const s = __test__.sourceAuthorityBaseline({
    link: 'https://www.sec.gov/x',
    source: { trust: 0, authority: 0 },
  });
  assert.equal(s, 100);
});

test('L1 falls back to source trust*3 + authority*4 for unknown domains', () => {
  const s = __test__.sourceAuthorityBaseline({
    link: 'https://unknown-desk.example',
    source: { trust: 15, authority: 7 },
  });
  assert.equal(s, 15 * 3 + 7 * 4);
});

test('L2 counts unique tickers case-insensitively', () => {
  const c = __test__.uniqueTickerCount('$AAPL $aapl $MSFT (NASDAQ:AMZN) $TSLA');
  // AAPL (case-insensitive) + MSFT + (NASDAQ:AMZN) + TSLA = 4 unique
  assert.equal(c, 4);
});

test('L2 returns 0 for text with no tickers', () => {
  assert.equal(__test__.uniqueTickerCount('just some ordinary prose'), 0);
});

test('L3 quantitative density is a percentage 0-100', () => {
  const d = __test__.quantitativeDataDensity(
    '$100 8% 250 bps 2.5 billion 3.14'
  );
  assert.ok(d >= 0 && d <= 100);
});

test('L4 sentiment penalty triggers on volatile verbs', () => {
  const p = __test__.sentimentDeviationPenalty(
    'stocks plunge as markets crash and prices soar and skyrocket'
  );
  assert.ok(p > 0);
});

test('L4 no penalty for neutral copy', () => {
  assert.equal(
    __test__.sentimentDeviationPenalty(
      'the company reported quarterly earnings of $5 per share'
    ),
    0
  );
});

test('L5 flat +15 when a regulatory term is present, 0 otherwise', () => {
  assert.equal(__test__.regulatoryVerificationBonus('filed 10-K last week'), 15);
  assert.equal(
    __test__.regulatoryVerificationBonus('a general market commentary'),
    0
  );
});

test('L6 macro relevance grows with macro vocabulary and caps at 100', () => {
  const s = __test__.macroRelevance(
    'Fed FOMC inflation CPI PPI GDP unemployment yield curve treasury bond monetary policy fiscal QE'
  );
  assert.equal(s, 100);
});

test('L7 flat +5 for institutional flow language', () => {
  assert.equal(
    __test__.institutionalFlowBonus('a hedge fund reported 13F holdings'),
    5
  );
  assert.equal(__test__.institutionalFlowBonus('no such vocabulary here'), 0);
});

test('L8 fundamental depth rewards valuation vocabulary', () => {
  const s = __test__.fundamentalMetricsDepth(
    'DCF WACC EBITDA EPS P/E book value free cash flow'
  );
  assert.ok(s > 0);
});

test('L9 speculation penalty triggers on pump vocabulary', () => {
  const p = __test__.speculationClickbaitPenalty({
    title: 'This penny stock will explode to the moon 100x — guaranteed!!!',
    summary: 'YOLO to the moon rocket pumping',
  });
  assert.ok(p > 20, `expected large penalty, got ${p}`);
});

test('L9 speculation penalty is 0 for a clean regulatory headline', () => {
  const p = __test__.speculationClickbaitPenalty({
    title: 'Apple files annual 10-K with the SEC',
    summary: 'Revenue rose 8% year over year.',
  });
  assert.equal(p, 0);
});

/* ---------------- Layer-robustness / error handling --------------------- */

test('individual layer failures never bubble up to the pipeline', () => {
  const evil = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'title' || prop === 'summary') return '$AAPL 10-K DCF';
        if (prop === 'link') return 'https://sec.gov/x';
        if (prop === 'publishedAt') throw new Error('boom');
        if (prop === 'source') throw new Error('boom');
        return undefined;
      },
    }
  );
  const s = calculateFinancialScore(evil);
  assert.ok(Number.isInteger(s));
  assert.ok(s >= 0 && s <= 100);
});
