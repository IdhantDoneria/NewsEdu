/**
 * Geopolitics scoring pipeline.
 *
 * Pure and synchronous. Returns the unclamped `rank` (the sort key), the
 * per-layer receipt that sums to it exactly, and `score`, the 0-100 display
 * value (`displayScore(rank)`).
 *
 * Expected `articleData` (every field optional; missing ones degrade to
 * neutral defaults instead of throwing):
 *   { title, summary, link, publishedAt (unix ms), source: { name, trust } }
 *
 * Layers (all additive points):
 *   outlet        reviewed-outlet baseline, bounded band (lib/scoring/outlets.mjs)
 *   recency       30 x 0.5^(age / 18 h), no cliff
 *   entities      distinct places / actors / figures
 *   density       distinct hard tokens per word
 *   events        distinct event vocabulary
 *   crossMarket   distinct trade / energy / currency terms
 *   subjectivity  emotive adjectives (distinct)
 *   clickbait     phrasing tells, one "!" rule
 *   topicGate     no topical term in the headline
 *   softNews      how-to, listicle, sport, entertainment
 */

import { hostname, wordCount, safeText, safeLayer } from './utils.mjs';
import { outletBaseline } from './outlets.mjs';
import {
  createLedger, safeObj, ageHoursAt, recencyPoints, clickbaitSignals, topicGate, softNewsPenalty,
} from './common.mjs';
import { displayScore } from './scale.mjs';
import {
  findPlaces, findActors, findStats, distinctMatches, GEO_EVENTS, CROSS_MARKET, SUBJECTIVE_ADJ,
} from './vocab.mjs';

/* ------------------------ Layer implementations (pure) ---------------------- */

// Distinct entities (canonical keys) and distinct statistics in the text.
function entityProfile(text) {
  const places = findPlaces(text);
  const actors = findActors(text);
  const stats = findStats(text);
  return { entities: places.size + actors.size, stats: stats.length };
}

// L2: entities count most; figures add a little and saturate quickly.
function entityPoints(text) {
  const { entities, stats } = entityProfile(text);
  return Math.min(14, entities * 2.5 + Math.min(stats, 6) * 0.5);
}

// L5: distinct hard tokens per word.
function densityPoints(text) {
  const words = wordCount(text);
  if (words < 5) return 0;
  const { entities, stats } = entityProfile(text);
  return Math.min(8, ((entities + Math.min(stats, 6)) / words) * 60);
}

// L7: each distinct event term is worth 1.5 up to 9.
function eventPoints(text) {
  return Math.min(9, distinctMatches(text, GEO_EVENTS).size * 1.5);
}

// L8: trade / energy / currency vocabulary, distinct terms.
function crossMarketPoints(text) {
  const n = distinctMatches(text, CROSS_MARKET).size;
  return n === 0 ? 0 : Math.min(5, 1.5 + n * 0.75);
}

// L4: emotive adjectives, distinct, no "!" (the clickbait layer owns that).
function subjectivityPenalty(text) {
  return Math.min(18, distinctMatches(text, SUBJECTIVE_ADJ).size * 3);
}

/* --------------------------------- Pipeline --------------------------------- */

function runLayers(articleData, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const text = safeText(articleData);
  const ledger = createLedger();
  const add = ledger.add;

  add('sourceCredibility', 'Outlet baseline', safeLayer(() => outletBaseline(articleData), 45));
  add('recency', 'Recency', safeLayer(() => recencyPoints(ageHoursAt(articleData, now), 'geopolitics')));
  add('factMatch', 'Entities & figures', safeLayer(() => entityPoints(text)));
  add('density', 'Information density', safeLayer(() => densityPoints(text)));
  add('eventRelevance', 'Geopolitical relevance', safeLayer(() => eventPoints(text)));
  add('crossMarket', 'Cross-border impact', safeLayer(() => crossMarketPoints(text)));
  add('subjectivity', 'Subjective language', -safeLayer(() => subjectivityPenalty(text)));
  const cb = safeLayer(() => clickbaitSignals(articleData).points);
  add('clickbait', 'Clickbait & sensationalism', -Math.min(45, cb));
  const gate = safeObj(() => topicGate(articleData, 'geopolitics'));
  add('topicGate', 'Off-topic', -gate.points, gate.note || undefined);
  const soft = safeObj(() => softNewsPenalty(articleData, 'geopolitics'));
  add('softNews', 'Soft news', -soft.points, soft.note || undefined);

  const rank = ledger.rank();
  return { score: displayScore(rank, 'geopolitics'), rank, layers: ledger.layers };
}

/** Integer 0-100 display score. */
export function calculateGeopoliticalScore(articleData, opts) {
  if (!articleData || typeof articleData !== 'object') return 0;
  return runLayers(articleData, opts).score;
}

/** `{ score (0-100), rank (unclamped sort key), layers }`; layers sum exactly to `rank`. */
export function calculateGeopoliticalScoreDetailed(articleData, opts) {
  if (!articleData || typeof articleData !== 'object') return { score: 0, rank: 0, layers: [] };
  return runLayers(articleData, opts);
}

/* -------------- Internals exported for unit tests only ---------------------- */
export const __test__ = {
  entityProfile,
  entityPoints,
  densityPoints,
  eventPoints,
  crossMarketPoints,
  subjectivityPenalty,
  hostname,
};
