'use client';

/** localStorage persistence for ranking weights, the watchlist and saved searches. */

import { DEFAULT_WEIGHTS, MAX_TERMS, normalizeTerm, sanitizeWeights } from '@/lib/personal/ranking.mjs';

const RANK_KEY = 'meridian.rank.v1';
const WATCH_KEY = 'meridian.watchlist.v1';
const SEARCH_KEY = 'meridian.searches.v1';
const MAX_SEARCHES = 12;
const MAX_SEEN = 200;

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the setting just won't persist */
  }
}

export function loadWeights() {
  return sanitizeWeights(read(RANK_KEY, DEFAULT_WEIGHTS));
}
export function saveWeights(weights) {
  write(RANK_KEY, sanitizeWeights(weights));
}

export function loadWatchlist() {
  const w = read(WATCH_KEY, {});
  const terms = (Array.isArray(w.terms) ? w.terms : [])
    .map(normalizeTerm)
    .filter(Boolean)
    .slice(0, MAX_TERMS);
  return { terms: [...new Set(terms)], only: w.only === true };
}
export function saveWatchlist({ terms, only }) {
  write(WATCH_KEY, { terms, only: Boolean(only) });
}

/** Saved search: { id, label, filters, seenIds, createdAt } */
export function loadSearches() {
  const list = read(SEARCH_KEY, []);
  return Array.isArray(list) ? list.filter((s) => s && s.id && s.filters).slice(0, MAX_SEARCHES) : [];
}
export function saveSearches(list) {
  write(
    SEARCH_KEY,
    list.slice(0, MAX_SEARCHES).map((s) => ({ ...s, seenIds: (s.seenIds || []).slice(0, MAX_SEEN) }))
  );
}
