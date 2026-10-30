/**
 * GDELT volume cross-check (SIGNAL_GDELT=1).
 *
 * Asks GDELT's public DOC 2.0 API how much global news volume a story's top
 * entities have drawn in the last day compared with the day before. It is a
 * cross-check on our own outlet set, not a ranking driver: the bonus is small.
 *
 * GDELT asks for at most one request per 5 s, so at most one uncached request
 * is made per call and calls closer than MIN_INTERVAL_MS to the previous one
 * are skipped; results are cached for 1 h. Over a few builds the cache fills
 * for the stories that stay on top. 2 s timeout, never throws.
 */

export const GDELT = {
  TIMEOUT_MS: 2000,
  TTL_MS: 3600e3,
  MIN_INTERVAL_MS: 5200,
  MAX_BONUS: 2,
  CACHE_MAX: 200,
};

export function gdeltUrl(terms) {
  const q = terms
    .slice(0, 2)
    .map((t) => `"${String(t).replace(/["()]/g, '')}"`)
    .join(' ');
  return (
    'https://api.gdeltproject.org/api/v2/doc/doc?mode=timelinevolraw&format=json&timespan=2d&query=' +
    encodeURIComponent(q)
  );
}

/** Sum article counts in the last 24 h vs the 24 h before. */
export function volumeRatio(data) {
  const series = data?.timeline?.[0]?.data;
  if (!Array.isArray(series) || series.length < 8) return null;
  const vals = series.map((p) => Number(p.value) || 0);
  const half = vals.length >> 1;
  const prev = vals.slice(0, half).reduce((a, b) => a + b, 0);
  const cur = vals.slice(half).reduce((a, b) => a + b, 0);
  if (prev < 20) return null; // too little coverage to compare
  return cur / prev;
}

/** 0 below 1.5x, saturating at GDELT.MAX_BONUS (3x+). */
export function volumeBonus(ratio) {
  if (!Number.isFinite(ratio) || ratio < 1.5) return 0;
  return Math.min(GDELT.MAX_BONUS, Math.round((ratio - 1.5) * 1.33 * 10) / 10);
}

const cache = new Map(); // key -> { at, ratio }
const state = { last: 0 };

/**
 * @returns {Promise<{ratio:number|null, points:number, fetched:boolean}>}
 */
export async function gdeltSignal(terms, { fetchImpl = fetch, now = Date.now(), cacheMap = cache, clock = state } = {}) {
  const list = (terms || []).filter(Boolean);
  const none = { ratio: null, points: 0, fetched: false };
  if (!list.length) return none;
  try {
    const key = list.slice(0, 2).join('|').toLowerCase();
    const hit = cacheMap.get(key);
    if (hit && now - hit.at < GDELT.TTL_MS) {
      return { ratio: hit.ratio, points: volumeBonus(hit.ratio), fetched: false };
    }
    if (now - clock.last < GDELT.MIN_INTERVAL_MS) return none; // respect the rate limit
    clock.last = now;
    let ratio = null;
    try {
      const res = await fetchImpl(gdeltUrl(list), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(GDELT.TIMEOUT_MS),
      });
      if (res.ok) ratio = volumeRatio(await res.json());
    } catch {
      /* cache the miss */
    }
    if (cacheMap.size >= GDELT.CACHE_MAX) cacheMap.delete(cacheMap.keys().next().value);
    cacheMap.set(key, { at: now, ratio });
    return { ratio, points: volumeBonus(ratio), fetched: true };
  } catch {
    return none;
  }
}

export function _resetGdelt() {
  cache.clear();
  state.last = 0;
}
