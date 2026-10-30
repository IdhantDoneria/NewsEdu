/**
 * Shared key-value storage abstraction.
 *
 * Uses Upstash/Vercel KV over REST when UPSTASH_REDIS_REST_URL/TOKEN (or
 * KV_REST_API_URL/TOKEN) are set; otherwise an in-process Map, so every caller
 * works (per instance) with no configuration. Functions never throw: failures
 * resolve to null/false/0 so storage can never take a request down.
 *
 * The driver is chosen at call time (env is read on every call). A REST call
 * that fails, times out (1.5 s) or returns an error falls through to the
 * in-memory map for that one operation. A successful REST reply is
 * authoritative, including "missing" (null).
 *
 * Values are JSON-serialisable. TTLs are in seconds.
 */

const g = globalThis;
if (!g.__meridianKv) g.__meridianKv = { map: new Map() };
const mem = g.__meridianKv.map; // key -> { v, exp }

const REST_TIMEOUT_MS = 1500;
const MEM_SWEEP_AT = 5000; // sweep expired entries once the map grows past this

/** { url, token } from the Upstash or Vercel-KV env pair, else null. */
function restConfig() {
  const e = process.env;
  const pair = e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN
    ? [e.UPSTASH_REDIS_REST_URL, e.UPSTASH_REDIS_REST_TOKEN]
    : e.KV_REST_API_URL && e.KV_REST_API_TOKEN
      ? [e.KV_REST_API_URL, e.KV_REST_API_TOKEN]
      : null;
  return pair ? { url: pair[0].replace(/\/+$/, ''), token: pair[1] } : null;
}

export function kvAvailable() {
  return restConfig() !== null;
}

/**
 * Run Redis commands through the REST pipeline endpoint. Resolves to an array
 * of results (one per command), or null when REST is not configured or any
 * part of the call failed.
 */
async function rest(commands) {
  const cfg = restConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      cache: 'no-store',
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length !== commands.length) return null;
    if (data.some((d) => !d || d.error)) return null;
    return data.map((d) => d.result);
  } catch {
    return null;
  }
}

function parse(s) {
  if (s == null) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ---- in-memory driver -------------------------------------------------------

function live(key) {
  const e = mem.get(key);
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) {
    mem.delete(key);
    return null;
  }
  return e;
}

function sweep() {
  if (mem.size <= MEM_SWEEP_AT) return;
  const now = Date.now();
  for (const [k, e] of mem) if (e.exp && e.exp < now) mem.delete(k);
}

function memSet(key, value, ttlSec) {
  sweep();
  mem.set(key, { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  return true;
}

function memIncr(key, ttlSec) {
  const e = live(key);
  const n = (typeof e?.v === 'number' ? e.v : 0) + 1;
  sweep();
  mem.set(key, { v: n, exp: e?.exp || (ttlSec ? Date.now() + ttlSec * 1000 : 0) });
  return n;
}

function memPush(key, value, max, ttlSec) {
  const e = live(key);
  const list = Array.isArray(e?.v) ? e.v : [];
  list.unshift(value);
  if (list.length > max) list.length = max;
  sweep();
  mem.set(key, { v: list, exp: ttlSec ? Date.now() + ttlSec * 1000 : e?.exp || 0 });
  return list.length;
}

function memRange(key, start, stop) {
  const list = live(key)?.v;
  if (!Array.isArray(list)) return [];
  return list.slice(start, stop === -1 ? undefined : stop + 1);
}

// ---- public API -------------------------------------------------------------

export async function kvGet(key) {
  try {
    const r = await rest([['GET', key]]);
    if (r) return parse(r[0]);
    return live(key)?.v ?? null;
  } catch {
    return null;
  }
}

export async function kvSet(key, value, { ttlSec } = {}) {
  try {
    const cmd = ['SET', key, JSON.stringify(value)];
    if (ttlSec) cmd.push('EX', Math.ceil(ttlSec));
    const r = await rest([cmd]);
    if (r) return r[0] === 'OK';
    return memSet(key, value, ttlSec);
  } catch {
    return false;
  }
}

export async function kvDel(key) {
  try {
    const r = await rest([['DEL', key]]);
    if (r) return Number(r[0]) > 0;
    return mem.delete(key);
  } catch {
    return false;
  }
}

/** Atomic-ish counter; the TTL is set when the key is created. Returns the new count. */
export async function kvIncr(key, { ttlSec } = {}) {
  try {
    const cmds = [['INCR', key]];
    if (ttlSec) cmds.push(['EXPIRE', key, Math.ceil(ttlSec), 'NX']);
    const r = await rest(cmds);
    if (r) return Number(r[0]);
    return memIncr(key, ttlSec);
  } catch {
    return 0;
  }
}

/** Prepend to a capped list (newest first). Returns the resulting length. */
export async function kvPush(key, value, { max = 500, ttlSec } = {}) {
  try {
    const cmds = [
      ['LPUSH', key, JSON.stringify(value)],
      ['LTRIM', key, 0, Math.max(1, max) - 1],
    ];
    if (ttlSec) cmds.push(['EXPIRE', key, Math.ceil(ttlSec)]);
    const r = await rest(cmds);
    if (r) return Math.min(Number(r[0]), max);
    return memPush(key, value, max, ttlSec);
  } catch {
    return 0;
  }
}

/** Inclusive range like Redis LRANGE; stop = -1 means to the end. */
export async function kvRange(key, start = 0, stop = -1) {
  try {
    const r = await rest([['LRANGE', key, start, stop]]);
    if (r) return (Array.isArray(r[0]) ? r[0] : []).map(parse).filter((v) => v !== null);
    return memRange(key, start, stop);
  } catch {
    return [];
  }
}
