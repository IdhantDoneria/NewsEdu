/**
 * Short-lived answer cache for the chat.
 *
 * Suggestion chips and trending questions are asked again and again, and every
 * model call spends quota. Identical single-turn questions (same edition,
 * story focus, reader memory and underlying brief) are answered once per TTL;
 * concurrent identical requests share one model call. In-memory, per server
 * instance: a miss just costs one model call.
 */

import { createHash } from 'node:crypto';

const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 200;

const store = new Map(); // key -> { at, value }
const inflight = new Map(); // key -> Promise

export function normalizeQuestion(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cacheKey({ edition, question, focusClusterId, memory, learn, briefVersion }) {
  const mem = (memory || []).map((m) => `${m.id}:${m.text}`).sort().join('|');
  return createHash('sha1')
    .update(
      JSON.stringify([edition, normalizeQuestion(question), focusClusterId || '', mem, Boolean(learn), briefVersion || 0])
    )
    .digest('hex');
}

function evict(now) {
  for (const [k, v] of store) if (now - v.at > TTL_MS) store.delete(k);
  while (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value);
}

/**
 * Returns { value, cached }. `fresh` skips the lookup (and replaces the entry);
 * `cacheable(value)` decides whether a produced value may be stored (so
 * fallback answers produced during an outage never stick).
 */
export async function withCache(key, produce, { fresh = false, cacheable = () => true } = {}) {
  const now = Date.now();
  if (!fresh) {
    const hit = store.get(key);
    if (hit && now - hit.at <= TTL_MS) return { value: hit.value, cached: true };
    if (inflight.has(key)) return { value: await inflight.get(key), cached: true };
  }

  const p = produce();
  if (!fresh) inflight.set(key, p);
  try {
    const value = await p;
    if (cacheable(value)) {
      evict(now);
      store.set(key, { at: now, value });
    }
    return { value, cached: false };
  } finally {
    if (inflight.get(key) === p) inflight.delete(key);
  }
}

/** Test helper. */
export function clearCache() {
  store.clear();
  inflight.clear();
}
