/**
 * Wikipedia pageview spike for a story's top entity (SIGNAL_WIKIPEDIA=1).
 *
 * A sudden jump in daily views of the page for a country, leader or company is
 * a free, public "something happened" indicator. We compare the latest full
 * day against the median of the preceding two weeks.
 *
 * Best effort by design: the pageviews API does not follow redirects, so an
 * entity whose title we guess wrong simply yields no signal. 2 s timeout,
 * cached for 1 h (misses included), never throws.
 */

export const WIKI = {
  TIMEOUT_MS: 2000,
  TTL_MS: 3600e3,
  BASELINE_DAYS: 14,
  MAX_BONUS: 4,
  CACHE_MAX: 500,
};

const SMALL_WORDS = new Set(['of', 'the', 'and', 'for', 'in', 'on', 'de', 'la']);

/** "united states" -> "United_States"; "bank of england" -> "Bank_of_England". */
export function wikiTitle(entity) {
  const words = String(entity || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '';
  return words
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
    .join('_');
}

function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
}

export function pageviewsUrl(title, now = Date.now()) {
  const end = now - 24 * 3600e3; // last full UTC day
  const start = end - WIKI.BASELINE_DAYS * 24 * 3600e3;
  return (
    'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/' +
    `${encodeURIComponent(title)}/daily/${ymd(start)}/${ymd(end)}`
  );
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Ratio of the latest day to the baseline median; null when data is thin. */
export function spikeRatio(views) {
  if (!Array.isArray(views) || views.length < 7) return null;
  const latest = views[views.length - 1];
  const base = median(views.slice(0, -1));
  if (!(base >= 50)) return null; // too obscure to be a meaningful signal
  return latest / base;
}

/** Bounded bonus: 0 below 2x the baseline, saturating at WIKI.MAX_BONUS (8x+). */
export function spikeBonus(ratio) {
  if (!Number.isFinite(ratio) || ratio < 2) return 0;
  return Math.min(WIKI.MAX_BONUS, Math.round((1 + 1.5 * Math.log2(ratio / 2)) * 10) / 10);
}

const cache = new Map(); // title -> { at, ratio }

/**
 * @returns {Promise<{ratio:number|null, points:number, title:string}>}
 */
export async function wikipediaSignal(entity, { fetchImpl = fetch, now = Date.now(), cacheMap = cache } = {}) {
  const title = wikiTitle(entity);
  const none = { ratio: null, points: 0, title };
  if (!title) return none;
  try {
    const hit = cacheMap.get(title);
    if (hit && now - hit.at < WIKI.TTL_MS) {
      return { ratio: hit.ratio, points: spikeBonus(hit.ratio), title };
    }
    let ratio = null;
    try {
      const res = await fetchImpl(pageviewsUrl(title, now), {
        headers: { Accept: 'application/json', 'User-Agent': 'MeridianBrief/1.0 (news ranking; pageview signal)' },
        signal: AbortSignal.timeout(WIKI.TIMEOUT_MS),
      });
      if (res.ok) {
        const data = await res.json();
        ratio = spikeRatio((data?.items || []).map((i) => Number(i.views) || 0));
      }
    } catch {
      /* network/timeout: cache the miss below so we do not hammer the API */
    }
    if (cacheMap.size >= WIKI.CACHE_MAX) cacheMap.delete(cacheMap.keys().next().value);
    cacheMap.set(title, { at: now, ratio });
    return { ratio, points: spikeBonus(ratio), title };
  } catch {
    return none;
  }
}

export function _clearWikipediaCache() {
  cache.clear();
}
