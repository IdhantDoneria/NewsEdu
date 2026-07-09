/**
 * Finance 10-layer scoring pipeline.
 *
 * `calculateFinancialScore(articleData)` returns an integer strictly in
 * [0,100]. Same purity and input-shape contract as geopolitics.js.
 *
 * Layer index → responsibility (matches spec exactly):
 *   L1  Source Authority Baseline              — sets initial 0-100 running
 *   L2  Asset Class & Entity Extraction        — +uniqueTickers × 1.5
 *   L3  Quantitative Data Density              — +density% × 0.5
 *   L4  Market Sentiment & Volatility          — −sentimentDeviation
 *   L5  Regulatory & Compliance Verification   — +15 flat when matched
 *   L6  Macroeconomic Impact Significance      — +macroRelevance × 0.1
 *   L7  Institutional Flow Signals             — +5 flat when matched
 *   L8  Fundamental Valuation Alignment        — +fundamentalDepth × 0.15
 *   L9  Speculation & Clickbait Filter         — −clickbaitScore
 *   L10 Final Multi-Factor Normalization       — clampInt(running, 0, 100)
 */

import {
  clampInt,
  hostname,
  wordCount,
  safeText,
  countMatches,
  countUniqueMatches,
  safeLayer,
} from './utils.mjs';
import { FINANCE_TRUSTED_DOMAINS } from './domains.mjs';

/* ----------------------------- Regex vocabulary ----------------------------- */

// Explicit ticker syntax — the two forms are extremely unambiguous:
//   $AAPL          — Twitter/x-style cashtag
//   (NASDAQ:AAPL)  — exchange-prefixed ticker
const CASHTAG = /\$[A-Z]{1,5}\b/g;
const EXCHANGE_TICKER = /\((?:NYSE|NASDAQ|LSE|TSX|HKEX|SSE|SZSE|BSE|NSE|JPX|ASX):\s?[A-Z.]{1,6}\)/g;

// Commodities & central banks — one lump because both name concrete instruments
const COMMODITIES = /\b(WTI|Brent|crude\s+oil|natural\s+gas|gold|silver|copper|platinum|palladium|corn|soybean|wheat|cocoa|coffee)\b/gi;
const CURRENCIES = /\b(USD|EUR|JPY|GBP|CNY|AUD|CHF|CAD|NZD|HKD|SGD|INR|MXN|BRL|ZAR|KRW|TWD|SEK|NOK|DKK|PLN)\b/g;
const CURRENCY_PAIRS = /\b(?:USD|EUR|JPY|GBP|CNY|AUD|CHF|CAD)\/(?:USD|EUR|JPY|GBP|CNY|AUD|CHF|CAD)\b/g;
const CENTRAL_BANKS = /\b(Fed|FOMC|Federal\s+Reserve|ECB|BoJ|BOJ|BoE|BOE|PBoC|PBOC|SNB|RBA|RBI|BoC|BOC)\b/g;

// Hard financial metrics — the density layer measures these per word
const CURRENCY_FIGURE = /\$\d[\d,]*(?:\.\d+)?(?:\s?(?:bn|billion|mn|million|k|thousand|trillion|tn))?\b/gi;
const PERCENT_FIGURE = /\b\d+(?:\.\d+)?%/g;
const BASIS_POINTS = /\b\d+(?:\.\d+)?\s*(?:bps|basis\s+points?)\b/gi;
const LARGE_MAGNITUDE = /\b\d+(?:\.\d+)?\s*(?:million|billion|trillion)\b/gi;
const DECIMAL_NUMBER = /\b\d+\.\d+\b/g;

// Directional / volatile language (finance-specific — different vocabulary from
// the geopolitics list because "plunges" is normal in market copy).
const VOLATILITY_LANG = /\b(plunge(?:s|d)?|crash(?:es|ed)?|soar(?:s|ed|ing)?|skyrocket(?:s|ed|ing)?|collaps(?:e|es|ed|ing)|panic|meltdown|bubble|rout|capitulat(?:e|ed|ion)|blowout|carnage|freefall|nosedive)\b/gi;

// Regulatory / compliance vocabulary — flat +15 if any hit
const REGULATORY = /\b(SEC|10-K|10-Q|8-K|S-1|prospectus|filing|disclosure|CFTC|FINRA|MiFID|ESMA|FCA|OCC|FDIC|Basel\s+III?|Dodd.Frank|Sarbanes.Oxley)\b/g;

// Macroeconomic vocabulary — used for L6 relevance score
const MACRO = /\b(Fed|FOMC|inflation|CPI|PPI|GDP|unemployment|rate\s+hike|rate\s+cut|interest\s+rates?|yield\s+curve|treasury(?:\s+yields?)?|bond\s+yields?|monetary\s+policy|fiscal\s+policy|quantitative\s+easing|QE\d?|tapering|recession|stagflation)\b/gi;

// Institutional flow — flat +5 if any hit
const INSTITUTIONAL = /\b(block\s+trades?|open\s+interest|hedge\s+funds?|mutual\s+funds?|ETF\s+flows?|13F|insider\s+(?:buying|selling)|dark\s+pools?|whale(?:s)?|institutional\s+ownership|prime\s+broker(?:age)?)\b/gi;

// Fundamental valuation vocabulary — the deeper the analysis, the more it earns
const FUNDAMENTAL = /\b(DCF|discounted\s+cash\s+flow|WACC|weighted\s+average\s+cost\s+of\s+capital|EBITDA|EPS|P\/E|P\/B|book\s+value|free\s+cash\s+flow|terminal\s+value|ROE|ROIC|ROA|net\s+margin|operating\s+margin|revenue\s+growth|gross\s+margin|dividend\s+yield|debt\s+to\s+equity|current\s+ratio)\b/gi;

// Speculative / pump-and-dump vocabulary
const SPECULATION = /\b(to\s+the\s+moon|will\s+explode|guaranteed\s+profit|hot\s+stock|next\s+Tesla|penny\s+stock|to\s+the\s+moon|rocket(?:ing)?|moonshot|YOLO|meme\s+stock|pump\s+and\s+dump|pumping|10x|100x|1000x|going\s+parabolic)\b/gi;

const CLICKBAIT_PHRASES = [
  "you won't believe",
  'you wont believe',
  "here's why",
  "here's what",
  'this is why',
  'what happened next',
  'will shock you',
  'jaw-dropping',
  'mind-blowing',
  'goes viral',
  'the real reason',
  'you need to know',
  'one weird trick',
  'ranked:',
  'quiz:',
  'guaranteed',
  'next big thing',
];

/* ------------------------ Layer implementations (pure) ---------------------- */

// L1
function sourceAuthorityBaseline(articleData) {
  const host = hostname(articleData?.link);
  if (host && FINANCE_TRUSTED_DOMAINS[host] != null) {
    return FINANCE_TRUSTED_DOMAINS[host];
  }
  const s = articleData?.source;
  if (s && Number.isFinite(s.trust) && Number.isFinite(s.authority)) {
    return Math.max(0, Math.min(100, s.trust * 3 + s.authority * 4));
  }
  return 40; // conservative default — finance is less forgiving of unknowns
}

// L2 — Ticker Count is unique-case-insensitive; caller multiplies by 1.5.
function uniqueTickerCount(text) {
  if (!text) return 0;
  const cashtags = new Set();
  const exchange = new Set();
  const macroTickers = new Set();

  const cashMatches = text.match(CASHTAG) || [];
  for (const t of cashMatches) cashtags.add(t.toUpperCase());

  const exMatches = text.match(EXCHANGE_TICKER) || [];
  for (const t of exMatches) exchange.add(t.toUpperCase());

  // Currency pairs count as tickers for the purposes of this layer
  const pairMatches = text.match(CURRENCY_PAIRS) || [];
  for (const t of pairMatches) macroTickers.add(t.toUpperCase());

  const commodityHits = countUniqueMatches(text, COMMODITIES);

  return cashtags.size + exchange.size + macroTickers.size + commodityHits;
}

// L3 — Quantitative Data Density in percent (0-100).
function quantitativeDataDensity(text) {
  const words = wordCount(text);
  if (words < 5) return 0;
  const metrics =
    countMatches(text, CURRENCY_FIGURE) +
    countMatches(text, PERCENT_FIGURE) +
    countMatches(text, BASIS_POINTS) +
    countMatches(text, LARGE_MAGNITUDE) +
    countMatches(text, DECIMAL_NUMBER);
  // Density as a percentage of words that are hard financial metrics.
  return Math.min(100, (metrics / words) * 100);
}

// L4 — Sentiment Deviation (raw points to subtract)
function sentimentDeviationPenalty(text) {
  const hits = countMatches(text, VOLATILITY_LANG);
  const exclaim = countMatches(text, /!/g);
  // Volatile verbs are stronger tells than exclamations in market copy.
  return Math.min(20, hits * 1.5 + exclaim * 2);
}

// L5 — Flat +15 when a regulatory/compliance anchor is present.
function regulatoryVerificationBonus(text) {
  return countMatches(text, REGULATORY) > 0 ? 15 : 0;
}

// L6 — Macro relevance 0-100; caller multiplies by 0.1.
function macroRelevance(text) {
  const hits = countMatches(text, MACRO);
  return Math.min(100, hits * 12);
}

// L7 — Flat +5 when institutional-flow language is present.
function institutionalFlowBonus(text) {
  return countMatches(text, INSTITUTIONAL) > 0 ? 5 : 0;
}

// L8 — Fundamental Metrics Depth 0-100; caller multiplies by 0.15.
function fundamentalMetricsDepth(text) {
  const hits = countMatches(text, FUNDAMENTAL);
  // Rigorous valuation prose usually names 3-5 metrics; 7 hits saturates.
  return Math.min(100, hits * 14);
}

// L9 — Speculation & clickbait penalty (raw points to subtract).
function speculationClickbaitPenalty(articleData) {
  const title = typeof articleData?.title === 'string' ? articleData.title : '';
  const body = typeof articleData?.summary === 'string' ? articleData.summary : '';
  const text = `${title} ${body}`;

  let penalty = 0;
  // Speculative language across the whole article
  penalty += countMatches(text, SPECULATION) * 6;

  if (!title) return Math.min(50, penalty);
  const tLower = title.toLowerCase();
  for (const p of CLICKBAIT_PHRASES) if (tLower.includes(p)) penalty += 6;
  if (title.trimEnd().endsWith('?')) penalty += 4;
  penalty += 2 * countMatches(title, /!/g);
  if (/\.\.\.$|…$/.test(title.trimEnd())) penalty += 3;
  const shouting = countMatches(title, /\b[A-Z]{5,}\b/g);
  if (shouting >= 2) penalty += 5;

  return Math.min(50, penalty);
}

/* --------------------------------- Pipeline --------------------------------- */

/**
 * Public entry point. Runs the 10-layer pipeline and returns a clean integer.
 * Every layer is wrapped in `safeLayer` — a bad regex or a corrupt input
 * cannot crash the pipeline; the running total keeps moving forward.
 */
export function calculateFinancialScore(articleData) {
  if (!articleData || typeof articleData !== 'object') return 0;
  const text = safeText(articleData);

  // L1 — initialise running total from the source authority baseline.
  let running = safeLayer(() => sourceAuthorityBaseline(articleData), 40);

  // L2 — Unique tickers × 1.5 (bonus)
  running += safeLayer(() => uniqueTickerCount(text) * 1.5);

  // L3 — Quantitative Data Density (%) × 0.5 (bonus, capped at 25)
  running += safeLayer(() => Math.min(25, quantitativeDataDensity(text) * 0.5));

  // L4 — Sentiment Deviation (penalty)
  running -= safeLayer(() => sentimentDeviationPenalty(text));

  // L5 — Regulatory Verification (+15 flat when matched)
  running += safeLayer(() => regulatoryVerificationBonus(text));

  // L6 — Macro Relevance × 0.1 (bonus)
  running += safeLayer(() => macroRelevance(text) * 0.1);

  // L7 — Institutional Flow Signals (+5 flat when matched)
  running += safeLayer(() => institutionalFlowBonus(text));

  // L8 — Fundamental Metrics Depth × 0.15 (bonus)
  running += safeLayer(() => fundamentalMetricsDepth(text) * 0.15);

  // L9 — Speculation & Clickbait (penalty)
  running -= safeLayer(() => speculationClickbaitPenalty(articleData));

  // L10 — Final Multi-Factor Normalisation
  return clampInt(running, 0, 100);
}

/* -------------- Internals exported for unit tests only ---------------------- */
export const __test__ = {
  sourceAuthorityBaseline,
  uniqueTickerCount,
  quantitativeDataDensity,
  sentimentDeviationPenalty,
  regulatoryVerificationBonus,
  macroRelevance,
  institutionalFlowBonus,
  fundamentalMetricsDepth,
  speculationClickbaitPenalty,
};
