/**
 * Finance scoring pipeline. Same contract as geopolitics.mjs: pure, returns
 * the unclamped `rank` (sort key), a receipt that sums to it exactly, and
 * the 0-100 display `score`.
 *
 * Layers (all additive points):
 *   sourceAuthority  reviewed-outlet baseline, bounded band (lib/scoring/outlets.mjs)
 *   recency          30 x 0.5^(age / 8 h), no cliff
 *   tickers          distinct tickers, indices, FX pairs, commodities, Indian instruments (capped)
 *   density          distinct hard figures per word ($6.14 counts once)
 *   sentiment        volatility language (distinct); "!" is charged once, in `speculation`
 *   regulatory       filing-form phrase or regulator host +8; keyword only +3
 *   macro            distinct macro terms
 *   institutional    flow / positioning language
 *   fundamentals     distinct valuation terms
 *   speculation      pump-and-dump, hype and clickbait tells
 *   topicGate        no topical term in the headline
 *   softNews         how-to, personal finance, sport, index wraps
 */

import { wordCount, safeText, safeLayer } from './utils.mjs';
import { outletBaseline, isRegulatorHost } from './outlets.mjs';
import {
  createLedger, safeObj, ageHoursAt, recencyPoints, clickbaitSignals, topicGate, softNewsPenalty,
} from './common.mjs';
import { displayScore } from './scale.mjs';
import { distinctSpans } from './spans.mjs';
import {
  findInstruments, distinctMatches, FIN_FIGURES, VOLATILITY_LANG, MACRO, INSTITUTIONAL, FUNDAMENTAL,
  SPECULATION, FILING_FORMS, REGULATOR_WORDS,
} from './vocab.mjs';

/* ------------------------ Layer implementations (pure) ---------------------- */

// L2: distinct instruments x 1.5, capped at 6.
function instrumentPoints(text) {
  return Math.min(6, findInstruments(text).size * 1.5);
}

// L3: distinct hard figures as a percentage of words; 0.5 points per percent, capped at 12.
function densityPoints(text) {
  const words = wordCount(text);
  if (words < 5) return 0;
  const figures = distinctSpans(text, FIN_FIGURES).length;
  return Math.min(12, Math.min(100, (figures / words) * 100) * 0.5);
}

// L4: volatility verbs, distinct. No "!" here.
function volatilityPenalty(text) {
  return Math.min(12, distinctMatches(text, VOLATILITY_LANG).size * 1.5);
}

// L5: strong evidence (a filing-form phrase or a regulator's own host) +8; keyword only +3.
function regulatoryBonus(articleData, text) {
  if (isRegulatorHost(articleData?.link)) return 8;
  if (distinctMatches(text, FILING_FORMS).size > 0) return 8;
  return distinctMatches(text, REGULATOR_WORDS).size > 0 ? 3 : 0;
}

// L6: distinct macro terms.
function macroPoints(text) {
  return Math.min(8, distinctMatches(text, MACRO).size * 2);
}

// L7: flat when institutional-flow language is present.
function institutionalPoints(text) {
  return distinctMatches(text, INSTITUTIONAL).size > 0 ? 3 : 0;
}

// L8: distinct valuation terms.
function fundamentalsPoints(text) {
  return Math.min(10, distinctMatches(text, FUNDAMENTAL).size * 2);
}

// L9: hype vocabulary (distinct) plus the shared clickbait tells.
function speculationPenalty(articleData) {
  const text = safeText(articleData);
  const hype = distinctMatches(text, SPECULATION).size * 8;
  return Math.min(50, hype + clickbaitSignals(articleData).points);
}

/* --------------------------------- Pipeline --------------------------------- */

function runLayers(articleData, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const text = safeText(articleData);
  const ledger = createLedger();
  const add = ledger.add;

  add('sourceAuthority', 'Outlet baseline', safeLayer(() => outletBaseline(articleData), 45));
  add('recency', 'Recency', safeLayer(() => recencyPoints(ageHoursAt(articleData, now), 'finance')));
  add('tickers', 'Tickers & instruments', safeLayer(() => instrumentPoints(text)));
  add('density', 'Quantitative data density', safeLayer(() => densityPoints(text)));
  add('sentiment', 'Volatility language', -safeLayer(() => volatilityPenalty(text)));
  add('regulatory', 'Regulatory filing', safeLayer(() => regulatoryBonus(articleData, text)));
  add('macro', 'Macroeconomic relevance', safeLayer(() => macroPoints(text)));
  add('institutional', 'Institutional flow signals', safeLayer(() => institutionalPoints(text)));
  add('fundamentals', 'Fundamental valuation depth', safeLayer(() => fundamentalsPoints(text)));
  add('speculation', 'Speculation & clickbait', -safeLayer(() => speculationPenalty(articleData)));
  const gate = safeObj(() => topicGate(articleData, 'finance'));
  add('topicGate', 'Off-topic', -gate.points, gate.note || undefined);
  const soft = safeObj(() => softNewsPenalty(articleData, 'finance'));
  add('softNews', 'Soft news', -soft.points, soft.note || undefined);

  const rank = ledger.rank();
  return { score: displayScore(rank, 'finance'), rank, layers: ledger.layers };
}

/** Integer 0-100 display score. */
export function calculateFinancialScore(articleData, opts) {
  if (!articleData || typeof articleData !== 'object') return 0;
  return runLayers(articleData, opts).score;
}

/** `{ score (0-100), rank (unclamped sort key), layers }`; layers sum exactly to `rank`. */
export function calculateFinancialScoreDetailed(articleData, opts) {
  if (!articleData || typeof articleData !== 'object') return { score: 0, rank: 0, layers: [] };
  return runLayers(articleData, opts);
}

/* -------------- Internals exported for unit tests only ---------------------- */
export const __test__ = {
  instrumentPoints,
  densityPoints,
  volatilityPenalty,
  regulatoryBonus,
  macroPoints,
  institutionalPoints,
  fundamentalsPoints,
  speculationPenalty,
};
