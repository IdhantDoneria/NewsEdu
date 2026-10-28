/**
 * Personal ranking and watchlist matching. Pure functions: the dashboard calls
 * them to re-order the stories the server already scored and cut. The
 * Meridian Score itself is never altered, only the order it is shown in.
 *
 * Each article is described by five features on a 0-100 scale; the reader's
 * weights blend them. The default weights (all on `score`) reproduce the
 * server's order exactly.
 */

export const WEIGHT_KEYS = ['score', 'freshness', 'trust', 'breadth', 'watchlist'];

export const WEIGHT_LABELS = {
  score: 'Meridian Score',
  freshness: 'Freshness',
  trust: 'Source trust',
  breadth: 'Wide coverage',
  watchlist: 'Watchlist match',
};

export const DEFAULT_WEIGHTS = { score: 100, freshness: 0, trust: 0, breadth: 0, watchlist: 0 };

export const PRESETS = [
  { id: 'default', label: 'Meridian default', weights: DEFAULT_WEIGHTS },
  { id: 'breaking', label: 'Breaking first', weights: { score: 35, freshness: 100, trust: 20, breadth: 0, watchlist: 0 } },
  { id: 'trusted', label: 'Most trusted', weights: { score: 40, freshness: 0, trust: 100, breadth: 20, watchlist: 0 } },
  { id: 'widely', label: 'Widely covered', weights: { score: 40, freshness: 10, trust: 0, breadth: 100, watchlist: 0 } },
  { id: 'mine', label: 'My watchlist first', weights: { score: 40, freshness: 10, trust: 0, breadth: 0, watchlist: 100 } },
];

const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const MAX_AGE_HOURS = 72;
const MAX_TRUST_POINTS = 20;

export function sanitizeWeights(raw) {
  const out = {};
  let sum = 0;
  for (const k of WEIGHT_KEYS) {
    const v = Math.round(Number(raw?.[k]));
    out[k] = Number.isFinite(v) ? clamp(v) : DEFAULT_WEIGHTS[k];
    sum += out[k];
  }
  // All-zero weights would rank everything equally: treat as the default.
  return sum === 0 ? { ...DEFAULT_WEIGHTS } : out;
}

export function isDefaultWeights(weights) {
  const w = sanitizeWeights(weights);
  return WEIGHT_KEYS.every((k) => w[k] === DEFAULT_WEIGHTS[k]) ||
    // Same ordering when only `score` carries weight, whatever its magnitude.
    (w.score > 0 && WEIGHT_KEYS.every((k) => k === 'score' || w[k] === 0));
}

/* -------------------------------- watchlist -------------------------------- */

export const MAX_TERMS = 20;
const MAX_TERM_LEN = 40;

/** "$AAPL " -> "aapl". Returns '' for unusable input. */
export function normalizeTerm(t) {
  return String(t ?? '')
    .trim()
    .replace(/^\$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, MAX_TERM_LEN);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const reCache = new Map();
function termRegex(term) {
  let re = reCache.get(term);
  if (!re) {
    // Whole-word, with an optional leading $ so "$AAPL" and "AAPL" both match.
    re = new RegExp(`(?<![\\w$])\\$?${escapeRe(term)}(?![\\w])`, 'i');
    if (reCache.size > 200) reCache.clear();
    reCache.set(term, re);
  }
  return re;
}

/** The watchlist terms an article mentions (title + summary). */
export function matchWatchlist(article, terms) {
  if (!terms?.length) return [];
  const text = `${article?.title || ''} ${article?.summary || ''}`;
  return terms.filter((t) => termRegex(t).test(text));
}

/** Add a term, deduped and capped. Returns the new list. */
export function addTerm(terms, raw) {
  const t = normalizeTerm(raw);
  if (!t || terms.includes(t) || terms.length >= MAX_TERMS) return terms;
  return [...terms, t];
}

/* --------------------------------- ranking --------------------------------- */

/** clusterId -> number of articles in that story, across the whole pool. */
export function breadthCounts(articles) {
  const counts = new Map();
  for (const a of articles) {
    if (a.clusterId) counts.set(a.clusterId, (counts.get(a.clusterId) || 0) + 1);
  }
  return counts;
}

export function features(article, { counts, terms }) {
  const n = article.clusterId ? counts.get(article.clusterId) || 1 : 1;
  return {
    score: clamp(Number(article.score) || 0),
    freshness: clamp(100 * (1 - (Number(article.ageHours) || 0) / MAX_AGE_HOURS)),
    trust: clamp(((Number(article.metrics?.sourceTrust) || 0) / MAX_TRUST_POINTS) * 100),
    breadth: n <= 1 ? 0 : clamp((n - 1) * 40),
    watchlist: matchWatchlist(article, terms).length > 0 ? 100 : 0,
  };
}

export function personalScore(article, weights, ctx) {
  const w = sanitizeWeights(weights);
  const f = features(article, ctx);
  let total = 0;
  let weightSum = 0;
  for (const k of WEIGHT_KEYS) {
    total += w[k] * f[k];
    weightSum += w[k];
  }
  return total / weightSum;
}

/**
 * Re-order articles by the reader's weights. Stable: ties keep the server
 * order. With default weights the input order is returned unchanged.
 */
export function rankArticles(articles, weights, { terms = [] } = {}) {
  if (!Array.isArray(articles)) return [];
  if (isDefaultWeights(weights)) return articles.slice();
  const ctx = { counts: breadthCounts(articles), terms };
  return articles
    .map((a, i) => ({ a, i, s: personalScore(a, weights, ctx) }))
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map((x) => x.a);
}
