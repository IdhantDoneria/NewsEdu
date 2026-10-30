/**
 * The Meridian Score — a transparent, point-based news ranking algorithm.
 *
 * Every article is scored out of 100 across four metrics:
 *
 *   1. HEADLINE INTEGRITY (0–40)
 *      Starts from a base and is adjusted by signals of substance
 *      (attribution verbs, concrete figures, sane length) and penalised
 *      for clickbait patterns (curiosity-gap phrasing, listicles,
 *      question-mark headlines, shouting caps, exclamation marks).
 *
 *   2. SOURCE TRUST (0–30)
 *      The outlet's baseline reliability (0–20) plus its topical
 *      authority for the current edition (0–10). A markets desk is a
 *      better witness on stocks than a general wire, and vice versa.
 *
 *   3. FRESHNESS (0–30)
 *      Exponential half-life decay from publication time. Finance news
 *      goes stale faster (8h half-life) than geopolitics (18h).
 *
 *   4. CORROBORATION (−12…+8)
 *      If a second, independent outlet reports the same event the first
 *      occurrence earns a bonus; the near-duplicates that follow are
 *      docked so one event can't flood the page.
 *
 * Articles scoring below the noise floor (32) are dropped entirely —
 * that is the clickbait cut.
 */

const CLICKBAIT_PHRASES = [
  "you won't believe",
  'you wont believe',
  "here's why",
  'heres why',
  "here's what",
  'this is why',
  'what happened next',
  'will shock you',
  'jaw-dropping',
  'mind-blowing',
  'goes viral',
  'the real reason',
  'you need to know',
  'must see',
  'epic',
  'insane',
  'destroys',
  'slams',
  'rips',
  'perfect response',
  'one weird trick',
  'doctors hate',
  'number one reason',
  'best of',
  'ranked:',
  'quiz:',
  'opinion:',
  'sponsored',
];

const ATTRIBUTION_VERBS =
  /\b(says|said|announces?|announced|reports?|reported|confirms?|confirmed|files?|filed|raises?|raised|acquires?|acquired|launches?|launched|signs?|signed|warns?|warned|sanctions?|sanctioned|votes?|voted|rules?|ruled|approves?|approved|bans?|banned|surges?|surged|plunges?|plunged|cuts?|merges?|merged|invests?|invested|secures?|secured|closes?|closed)\b/i;

const CONCRETE_FIGURES = /(\$|€|£|¥|%|\b\d+(\.\d+)?\s?(billion|million|trillion|bn|mn|m|b|k)\b|\b\d{2,}\b)/i;

const HEDGING = /\b(could|might|may|reportedly|rumored|rumour|allegedly|possibly)\b/i;

const LISTICLE = /^\s*(top\s+)?\d+\s+(things|ways|reasons|stocks|startups|tips|charts|lessons)/i;

/** Metric 1 — Headline Integrity, 0–40 points. */
export function headlineIntegrity(title) {
  const t = (title || '').trim();
  const lower = t.toLowerCase();
  let pts = 24;
  const notes = [];

  for (const phrase of CLICKBAIT_PHRASES) {
    if (lower.includes(phrase)) {
      pts -= 8;
      notes.push(`clickbait phrase “${phrase}”`);
    }
  }

  if (LISTICLE.test(t)) {
    pts -= 8;
    notes.push('listicle pattern');
  }
  if (t.endsWith('?')) {
    pts -= 5; // Betteridge's law of headlines
    notes.push('question-mark headline');
  }
  const bangs = (t.match(/!/g) || []).length;
  if (bangs > 0) {
    pts -= 3 * bangs;
    notes.push('exclamation marks');
  }
  if (/\.\.\.$|…$/.test(t)) {
    pts -= 4;
    notes.push('curiosity-gap ellipsis');
  }
  // Shouting: 2+ fully-capitalised words of 4+ letters (tickers get a pass at 1)
  const shouting = (t.match(/\b[A-Z]{4,}\b/g) || []).length;
  if (shouting >= 2) {
    pts -= 6;
    notes.push('all-caps shouting');
  }
  if (HEDGING.test(t)) {
    pts -= 2;
    notes.push('hedged claim');
  }

  if (ATTRIBUTION_VERBS.test(t)) {
    pts += 6;
    notes.push('+ attributed action');
  }
  if (CONCRETE_FIGURES.test(t)) {
    pts += 5;
    notes.push('+ concrete figures');
  }
  if (t.length >= 40 && t.length <= 120) {
    pts += 5;
    notes.push('+ substantive length');
  } else if (t.length < 25) {
    pts -= 5;
    notes.push('headline too thin');
  }

  return { points: clamp(pts, 0, 40), notes };
}

/** Metric 2 — Source Trust, 0–30 points (trust 0–20 + topical authority 0–10). */
export function sourceTrust(source) {
  const trust = clamp(source.trust ?? 10, 0, 20);
  const authority = clamp(source.authority ?? 5, 0, 10);
  return { points: trust + authority, trust, authority };
}

/** Metric 3 — Freshness, 0–30 points with exponential half-life decay. */
export function freshness(publishedAt, edition, now = Date.now()) {
  const halfLifeHours = edition === 'finance' ? 8 : 18;
  const ageHours = Math.max(0, (now - publishedAt) / 36e5);
  const points = 30 * Math.pow(0.5, ageHours / halfLifeHours);
  return { points: Math.round(points * 10) / 10, ageHours: Math.round(ageHours * 10) / 10 };
}

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'amid', 'among', 'because', 'before',
  'being', 'between', 'china', 'could', 'every', 'first', 'from', 'global',
  'government', 'group', 'have', 'here', 'into', 'major', 'market', 'markets',
  'more', 'news', 'over', 'report', 'says', 'said', 'state', 'states', 'stock',
  'stocks', 'their', 'there', 'these', 'this', 'time', 'today', 'under',
  'update', 'week', 'what', 'when', 'where', 'which', 'while', 'will', 'with',
  'world', 'year', 'years',
]);

function significantTokens(title) {
  return new Set(
    (title.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).filter(
      (w) => !STOPWORDS.has(w)
    )
  );
}

/**
 * Metric 4 — Corroboration. Mutates `articles` in place, adding a
 * `corroboration` adjustment: +8 to the best-scored telling of an event
 * confirmed by a second independent outlet, −12 to each near-duplicate.
 */
export function applyCorroboration(articles) {
  const seen = []; // { tokens, source, article }
  for (const article of articles) {
    const tokens = significantTokens(article.title);
    let matched = null;
    for (const prior of seen) {
      let shared = 0;
      for (const tok of tokens) if (prior.tokens.has(tok)) shared++;
      if (shared >= 3) {
        matched = prior;
        break;
      }
    }
    if (matched) {
      article.corroboration = -12;
      article.scoreNotes.push('near-duplicate of an earlier item');
      if (matched.source !== article.sourceName && matched.article.corroboration === 0) {
        matched.article.corroboration = 8;
        matched.article.scoreNotes.push('+ corroborated by a second outlet');
      }
    } else {
      article.corroboration = 0;
      seen.push({ tokens, source: article.sourceName, article });
    }
  }
}

/**
 * Noise floor on the 0-100 display scale (`finalCurationScore`). Below the
 * display knee (90) the display map is the identity, so the same number is
 * also the floor on the unclamped `rankScore`.
 *
 * Re-tuned for the 2026-10-29 scale (bounded outlet band + 30-point
 * half-life recency + topic gate): fresh on-topic copy from any reviewed
 * outlet lands in the 60s-90s; a headline with no topical term, soft-news
 * and clickbait penalties, or a story several half-lives old falls into the
 * 20s-40s. Replaying the snapshots in tests/fixtures/snapshots/2026-10-29
 * (post-cap top 60 per edition) at 42 cuts about 5% of geopolitics and 12%
 * of finance, all of it how-to, lifestyle, off-topic or stale material.
 */
export const NOISE_FLOOR = 42;

const NON_GEOPOLITICS_KEYWORDS = [
  'football', 'soccer', 'cricket', 'olympics', 'nba', 'nfl', 'nhl', 'mlb', 'tennis', 'golf', 'rugby',
  'celebrity', 'hollywood', 'movie', 'film', 'actor', 'actress', 'music', 'album', 'song', 'kardashian',
  'sports', 'champions league', 'premier league', 'tournament', 'championship', 'world cup',
  'grand slam', 'wimbledon', 'super bowl', 'oscar', 'grammy', 'emmy'
];
// Whole-word match (so "factor" no longer trips "actor"); compiled once.
const NON_GEOPOLITICS_RE = new RegExp(`\\b(?:${NON_GEOPOLITICS_KEYWORDS.join('|')})\\b`, 'i');

/**
 * Score a raw article. Returns null if it fails basic sanity checks.
 * Call applyCorroboration() on the full list afterwards, then finalise
 * with totalScore().
 */
export function scoreArticle(raw, source, edition, now = Date.now()) {
  if (!raw.title || !raw.link) return null;

  // Missing or future dates are treated as published at fetch time; they never score as "older" or "newer" than that.
  const hasDate = Number.isFinite(raw.publishedAt) && raw.publishedAt > 0;
  const publishedAt = hasDate ? Math.min(raw.publishedAt, now) : now;
  const dateClamped = !hasDate || raw.publishedAt > now;

  if (edition === 'geopolitics' && NON_GEOPOLITICS_RE.test(raw.title)) {
    return null; // Drop non-geopolitics junk entirely
  }

  const integrity = headlineIntegrity(raw.title);
  const trust = sourceTrust(source);
  const fresh = freshness(publishedAt, edition, now);

  return {
    id: hashId(raw.link),
    title: raw.title,
    link: raw.link,
    summary: raw.summary || '',
    image: raw.image || null,
    publishedAt,
    ...(dateClamped ? { dateClamped: true } : {}),
    sourceName: source.name,
    // The full source is attached (not only its name) so the scoring pipelines
    // in lib/scoring/ can resolve the outlet (domain, name, then trust prior).
    source: { name: source.name, trust: source.trust, authority: source.authority },
    edition,
    metrics: {
      headlineIntegrity: integrity.points,
      sourceTrust: trust.points,
      freshness: fresh.points,
    },
    ageHours: fresh.ageHours,
    corroboration: 0,
    scoreNotes: integrity.notes,
  };
}

export function totalScore(article) {
  const { headlineIntegrity: h, sourceTrust: s, freshness: f } = article.metrics;
  return clamp(Math.round(h + s + f + article.corroboration), 0, 100);
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function hashId(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
