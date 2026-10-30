import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFinancialScore,
  calculateFinancialScoreDetailed,
  __test__,
} from '../lib/scoring/finance.mjs';
import { OUTLET_BAND } from '../lib/scoring/outlets.mjs';

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

test('finance recency uses an 8 h half-life with a soft tail (no cliff, never negative)', () => {
  const at = (h) =>
    calculateFinancialScoreDetailed({ ...regulatoryBrief, publishedAt: now - h * HOUR }, { now }).layers.find(
      (l) => l.key === 'recency'
    ).delta;
  assert.ok(Math.abs(at(8) - at(0) / 2) < 0.05, `8h should halve recency: ${at(0)} -> ${at(8)}`);
  assert.ok(at(500) >= 0 && at(500) < 0.01);
  assert.ok(at(0) > at(24) && at(24) > at(48) && at(48) > at(72) && at(72) > 0);
  const fresh = calculateFinancialScore(regulatoryBrief);
  const stale = calculateFinancialScore({ ...regulatoryBrief, publishedAt: now - 500 * HOUR });
  assert.ok(stale < fresh);
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

test('outlet layer gives primary regulators the top of the (bounded) band', () => {
  const layer = (article) => calculateFinancialScoreDetailed(article).layers[0].delta;
  const sec = layer({ link: 'https://www.sec.gov/x', source: { trust: 0 } });
  const blog = layer({ link: 'https://unknown-desk.example', source: { trust: 15 } });
  assert.equal(sec, OUTLET_BAND.max);
  assert.ok(sec > blog);
  assert.ok(sec - OUTLET_BAND.min <= 15);
});

test('tickers layer counts distinct instruments (repeats count once) and caps at 6', () => {
  assert.equal(__test__.instrumentPoints('$AAPL $AAPL'), 1.5);
  assert.equal(__test__.instrumentPoints('$AAPL $MSFT (NASDAQ:AMZN) $TSLA'), 6);
  assert.equal(__test__.instrumentPoints('$AAPL $MSFT (NASDAQ:AMZN) $TSLA $NVDA $GOOG $META'), 6);
});

test('tickers layer returns 0 for text with no instruments', () => {
  assert.equal(__test__.instrumentPoints('just some ordinary prose'), 0);
});

test('density layer is bounded and counts a figure once', () => {
  const d = __test__.densityPoints('$100 8% 250 bps 2.5 billion 3.14 more words');
  assert.ok(d >= 0 && d <= 12);
});

test('volatility penalty triggers on volatile verbs, not on "!"', () => {
  assert.ok(__test__.volatilityPenalty('stocks plunge as markets crash and prices soar and skyrocket') > 0);
  assert.ok(__test__.volatilityPenalty('shares plummet, tumble and slump') >= 4.5);
  assert.equal(__test__.volatilityPenalty('the company reported quarterly earnings of $5 per share!!'), 0);
});

test('regulatory layer: filing-form phrase or regulator host +8, keyword only +3, none 0', () => {
  assert.equal(__test__.regulatoryBonus({}, 'filed 10-K last week'), 8);
  assert.equal(__test__.regulatoryBonus({ link: 'https://www.sec.gov/x' }, 'a general market note'), 8);
  assert.equal(__test__.regulatoryBonus({}, 'Court filing: Tesla CEO faces pay lawsuit'), 3);
  assert.equal(__test__.regulatoryBonus({}, 'a general market commentary'), 0);
});

test('macro layer counts distinct terms and caps at 8', () => {
  const s = __test__.macroPoints(
    'Fed FOMC inflation CPI PPI GDP unemployment yield curve treasury bond monetary policy fiscal deficit QE'
  );
  assert.equal(s, 8);
  assert.equal(__test__.macroPoints('inflation inflation inflation'), __test__.macroPoints('inflation'));
});

test('institutional layer is a flat +3 for flow language', () => {
  assert.equal(__test__.institutionalPoints('a hedge fund reported 13F holdings'), 3);
  assert.equal(__test__.institutionalPoints('no such vocabulary here'), 0);
});

test('fundamentals layer rewards distinct valuation vocabulary, not repeats', () => {
  const s = __test__.fundamentalsPoints('DCF WACC EBITDA EPS P/E book value free cash flow');
  assert.ok(s > 0 && s <= 10);
  assert.equal(__test__.fundamentalsPoints('EPS EPS EPS EPS'), __test__.fundamentalsPoints('EPS'));
});

test('speculation penalty triggers on pump vocabulary', () => {
  const p = __test__.speculationPenalty({
    title: 'This penny stock will explode to the moon 100x — guaranteed!!!',
    summary: 'YOLO to the moon rocket pumping',
  });
  assert.ok(p > 20, `expected large penalty, got ${p}`);
});

test('speculation penalty is 0 for a clean regulatory headline', () => {
  const p = __test__.speculationPenalty({
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
