'use client';

/**
 * 👍/👎 ratings on chat answers, kept in localStorage and keyed by the
 * normalised question. A question whose answers were net-disliked is dropped
 * from the suggestion chips, so the chips drift toward what worked.
 */

const KEY = 'meridian.chat.ratings.v1';
const MAX = 100;

export function normalize(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loadRatings() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** rating: 'up' | 'down' | null (clears). Returns the updated map. */
export function setRating(question, rating) {
  const ratings = loadRatings();
  const k = normalize(question);
  if (!k) return ratings;
  if (rating) ratings[k] = { rating, at: Date.now() };
  else delete ratings[k];
  const trimmed = Object.entries(ratings)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX);
  const next = Object.fromEntries(trimmed);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: ratings just don't persist */
  }
  return next;
}

/** Drop suggestions the reader has marked unhelpful. */
export function filterChips(chips, ratings) {
  return chips.filter((c) => ratings[normalize(c)]?.rating !== 'down');
}
