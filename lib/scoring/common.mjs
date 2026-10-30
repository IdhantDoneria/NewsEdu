/**
 * Pieces shared by both pipelines: the receipt ledger, the single recency
 * term, clickbait/hype detection, the topic gate and the soft-news penalty.
 */

import { classifySoftNews, financeTopicHit, geoTopicHit } from './vocab.mjs';
import { isRegulatorHost } from './outlets.mjs';

/** Run `fn`; a throw or a non-finite `points` degrades to `{ points: 0, note: null }`. */
export function safeObj(fn) {
  try {
    const v = fn();
    return v && Number.isFinite(v.points) ? v : { points: 0, note: null };
  } catch {
    return { points: 0, note: null };
  }
}

/* -------------------------------- Receipt ------------------------------- */

/**
 * Collects signed layer contributions (rounded to 0.01). `rank()` is the same
 * left-to-right sum a consumer gets from `layers.reduce((a, l) => a + l.delta, 0)`,
 * so the receipt reconciles with the sort key bit for bit.
 */
export function createLedger() {
  const layers = [];
  return {
    layers,
    add(key, label, delta, note) {
      const d = Math.round(delta * 100) / 100 || 0; // 0.01 resolution keeps near-ties apart; normalises -0
      layers.push(note ? { key, label, delta: d, note } : { key, label, delta: d });
    },
    rank() {
      let sum = 0;
      for (const l of layers) sum += l.delta;
      return sum;
    },
  };
}

/* -------------------------------- Recency ------------------------------- */

export const HALF_LIFE_HOURS = Object.freeze({ geopolitics: 18, finance: 8 });
export const RECENCY_MAX = 30;

/**
 * Age in hours at fetch time `now`. Missing or unparsable dates fall back to the
 * article's own `ageHours` (when scored upstream) and otherwise to 0; future
 * dates clamp to 0. Both mean "treated as published at fetch time".
 */
export function ageHoursAt(article, now = Date.now()) {
  const ts = article?.publishedAt;
  if (Number.isFinite(ts) && ts > 0) return Math.max(0, (now - ts) / 3_600_000);
  const a = article?.ageHours;
  return Number.isFinite(a) ? Math.max(0, a) : 0;
}

/** One half-life decay term for both editions: no cliff, a soft exponential tail. */
export function recencyPoints(ageHours, edition) {
  const half = HALF_LIFE_HOURS[edition === 'finance' ? 'finance' : 'geopolitics'];
  return RECENCY_MAX * Math.pow(0.5, Math.max(0, ageHours) / half);
}

/* ------------------------------- Clickbait ------------------------------ */

const HARD_PHRASES = [
  "you won't believe", 'you wont believe', 'will shock you', 'what happened next', 'jaw-dropping',
  'jaw dropping', 'mind-blowing', 'mind blowing', 'goes viral', 'the real reason', 'one weird trick',
  'doctors hate', 'number one reason', 'this one trick', 'must see', 'perfect response', 'sponsored content',
  'advertorial',
];
// Explainer-style openers: weaker evidence of clickbait.
const SOFT_PHRASES = ["here's why", 'heres why', "here's what", 'this is why', 'you need to know', 'best of', 'ranked:', 'quiz:', 'sponsored'];

const KNOWN_ACRONYMS = new Set([
  'NATO', 'UNESCO', 'UNICEF', 'UNHCR', 'UNRWA', 'OPEC', 'ASEAN', 'BRICS', 'OSCE', 'IAEA', 'OECD', 'ECOWAS', 'AUKUS',
  'NASA', 'FIFA', 'NASDAQ', 'NYSE', 'FOMC', 'USDA', 'DARPA', 'SEBI', 'NIFTY', 'SENSEX', 'HAMAS', 'ISIS', 'ISIL',
  'COVID', 'SWIFT', 'MIFID', 'FINRA', 'ESMA', 'FDIC', 'CFTC', 'EBITDA', 'FAANG', 'GAAP', 'SPAC', 'REIT', 'DOGE',
  'USAID', 'TASS', 'AFRICOM', 'SOFR', 'LIBOR', 'GDPR', 'IRGC', 'ICBM', 'NORAD', 'MERCOSUR', 'IPOS', 'ETFS',
]);

const norm = (s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'");
const count = (s, re) => (s.match(re) || []).length;

/**
 * Shared clickbait/hype tells. Returns raw penalty points and notes. A single "!"
 * rule lives here (the sentiment layers no longer double-charge it).
 */
export function clickbaitSignals(article) {
  const title = typeof article?.title === 'string' ? article.title : '';
  const body = typeof article?.summary === 'string' ? article.summary : '';
  if (!title) return { points: 0, notes: [] };
  const t = norm(title);
  const b = norm(body);
  const notes = [];
  let points = 0;

  const hardT = HARD_PHRASES.filter((p) => t.includes(p));
  const softT = SOFT_PHRASES.filter((p) => t.includes(p) && !hardT.some((h) => h.includes(p)));
  points += hardT.length * 8 + softT.length * 3;
  if (hardT.length || softT.length) notes.push('headline phrasing');

  if (title.trimEnd().endsWith('?')) { points += 5; notes.push('question headline'); }
  if (/\.\.\.$|…$/.test(title.trimEnd())) { points += 4; notes.push('trailing ellipsis'); }

  const bangs = Math.min(9, 3 * count(title, /!/g) + Math.min(3, count(body, /!/g)));
  if (bangs) { points += bangs; notes.push('exclamation'); }

  const shouted = (title.match(/\b[A-Z]{4,}\b/g) || []).filter((w) => !KNOWN_ACRONYMS.has(w));
  if (shouted.length >= 2) { points += 6; notes.push('all-caps'); }

  const hardB = HARD_PHRASES.filter((p) => b.includes(p)).length;
  if (hardB > hardT.length + 1) points += 4;

  return { points, notes };
}

/* ------------------------------- Topic gate ----------------------------- */

/**
 * A headline with no topical term for the edition is almost never what the
 * edition is for (Apple chargers on a wire feed). Penalise instead of dropping
 * so the receipt shows why; a topical lead softens it.
 */
export function topicGate(article, edition) {
  const title = typeof article?.title === 'string' ? article.title : '';
  const summary = typeof article?.summary === 'string' ? article.summary : '';
  if (!title) return { points: 0, note: null };
  // A regulator's own release is on-topic for finance by definition.
  if (edition === 'finance' && isRegulatorHost(article?.link)) return { points: 0, note: null };
  const hit = edition === 'finance' ? financeTopicHit : geoTopicHit;
  if (hit(title)) return { points: 0, note: null };
  if (summary && hit(summary)) return { points: 8, note: 'no topical term in headline' };
  return { points: 22, note: 'off-topic for this edition' };
}

/* ------------------------------- Soft news ------------------------------ */

const SOFT_WEIGHTS = {
  geopolitics: { howto: 6, personal: 0, sports: 20, entertainment: 15, indexWrap: 0 },
  finance: { howto: 6, personal: 14, sports: 8, entertainment: 12, indexWrap: 8 },
};
const SOFT_LABEL = {
  howto: 'how-to / listicle', personal: 'personal finance', sports: 'sport',
  entertainment: 'entertainment / lifestyle', indexWrap: 'index wrap',
};

/** Service journalism and soft news: how-to, listicle, personal finance, sport, index wraps. */
export function softNewsPenalty(article, edition) {
  const cls = classifySoftNews(article?.title, article?.summary);
  const w = SOFT_WEIGHTS[edition === 'finance' ? 'finance' : 'geopolitics'];
  let points = 0;
  const notes = [];
  for (const k of Object.keys(w)) {
    if (cls[k] && w[k]) {
      points += w[k];
      notes.push(SOFT_LABEL[k]);
    }
  }
  return { points: Math.min(24, points), note: notes.length ? notes.join(', ') : null };
}
