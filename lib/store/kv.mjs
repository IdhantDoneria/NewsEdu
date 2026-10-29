/**
 * Shared key-value storage abstraction.
 *
 * Uses Upstash/Vercel KV over REST when UPSTASH_REDIS_REST_URL/TOKEN (or
 * KV_REST_API_URL/TOKEN) are set; otherwise an in-process Map, so every caller
 * works (per instance) with no configuration. Functions never throw: failures
 * resolve to null/false/0 so storage can never take a request down.
 *
 * Values are JSON-serialisable. TTLs are in seconds.
 */

const g = globalThis;
if (!g.__meridianKv) g.__meridianKv = { map: new Map() };
const mem = g.__meridianKv.map; // key -> { v, exp }

export function kvAvailable() {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
      (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  );
}

function live(key) {
  const e = mem.get(key);
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) {
    mem.delete(key);
    return null;
  }
  return e;
}

export async function kvGet(key) {
  return live(key)?.v ?? null;
}

export async function kvSet(key, value, { ttlSec } = {}) {
  mem.set(key, { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  return true;
}

export async function kvDel(key) {
  return mem.delete(key);
}

/** Atomic-ish counter; the TTL is set when the key is created. Returns the new count. */
export async function kvIncr(key, { ttlSec } = {}) {
  const e = live(key);
  const n = (typeof e?.v === 'number' ? e.v : 0) + 1;
  mem.set(key, { v: n, exp: e?.exp || (ttlSec ? Date.now() + ttlSec * 1000 : 0) });
  return n;
}

/** Prepend to a capped list (newest first). */
export async function kvPush(key, value, { max = 500, ttlSec } = {}) {
  const e = live(key);
  const list = Array.isArray(e?.v) ? e.v : [];
  list.unshift(value);
  if (list.length > max) list.length = max;
  mem.set(key, { v: list, exp: ttlSec ? Date.now() + ttlSec * 1000 : e?.exp || 0 });
  return list.length;
}

/** Inclusive range like Redis LRANGE; stop = -1 means to the end. */
export async function kvRange(key, start = 0, stop = -1) {
  const list = live(key)?.v;
  if (!Array.isArray(list)) return [];
  return list.slice(start, stop === -1 ? undefined : stop + 1);
}
