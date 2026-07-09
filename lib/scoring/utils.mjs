/**
 * Shared primitives used by both scoring pipelines.
 *
 * These are deliberately dependency-free and side-effect-free so they can be
 * unit-tested in isolation and safely called inside the per-layer try/catch
 * wrappers in geopolitics.js / finance.js without leaking exceptions into the
 * running total.
 */

/** Clamp `n` to [min,max] and return a rounded integer. */
export function clampInt(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Clamp `n` to [min,max] as a float. */
export function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Parse a URL and return its bare hostname (lowercased, `www.` stripped). */
export function hostname(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Whitespace-delimited word count. Fast enough for per-article scoring
 * (O(n) single pass, no regex allocation per call because /\s+/ is compiled
 * once at parse time).
 */
export function wordCount(str) {
  if (!str || typeof str !== 'string') return 0;
  const trimmed = str.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Concatenate the parts of an article that are safe to run linguistic
 * analysis over. Missing fields degrade to empty strings — the caller never
 * has to null-check.
 */
export function safeText(articleData) {
  if (!articleData || typeof articleData !== 'object') return '';
  const parts = [];
  if (typeof articleData.title === 'string') parts.push(articleData.title);
  if (typeof articleData.summary === 'string') parts.push(articleData.summary);
  return parts.join(' ');
}

/** Total match count for `regex` inside `text` (0 when either is falsy). */
export function countMatches(text, regex) {
  if (!text || !regex) return 0;
  const m = text.match(regex);
  return m ? m.length : 0;
}

/**
 * Count case-insensitive unique matches — used for ticker/entity extraction
 * where "Fed" and "FED" should collapse into one occurrence.
 */
export function countUniqueMatches(text, regex) {
  if (!text || !regex) return 0;
  const m = text.match(regex);
  if (!m) return 0;
  const set = new Set();
  for (const tok of m) set.add(tok.toUpperCase());
  return set.size;
}

/**
 * Execute `fn` and return its numeric result. If it throws, returns `fallback`.
 * Used as the per-layer try/catch wrapper so a bug in one layer cannot crash
 * the whole pipeline — the running total keeps moving forward.
 */
export function safeLayer(fn, fallback = 0) {
  try {
    const v = fn();
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
