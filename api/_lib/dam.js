// Server-side "water dam": a token-bucket rate limiter that protects the backend
// when traffic overflows. Each caller (keyed by IP + route) gets a reservoir of
// tokens that refills at a fixed rate; when it's empty the request spills (429).
//
// When a KV store is configured the bucket lives in Redis, so the dam is
// DISTRIBUTED and holds across every serverless instance — a real flood is
// throttled no matter which instance serves it. Without KV it degrades to a
// best-effort per-instance in-memory bucket.
const { command } = require('./store');

const mem = (globalThis.__zenithDam = globalThis.__zenithDam || new Map());

// Atomic token-bucket in Redis via Lua (Upstash EVAL over REST).
const BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local d = redis.call('HMGET', key, 't', 's')
local tokens = tonumber(d[1])
local ts = tonumber(d[2])
if tokens == nil then tokens = capacity; ts = now end
local elapsed = math.max(0, now - ts) / 1000
tokens = math.min(capacity, tokens + elapsed * refill)
local allowed = 0
if tokens >= 1 then tokens = tokens - 1; allowed = 1 end
redis.call('HMSET', key, 't', tokens, 's', now)
redis.call('PEXPIRE', key, 120000)
return allowed`;

function memTake(key, capacity, refillPerSec) {
  const now = Date.now();
  let b = mem.get(key);
  if (!b) { b = { tokens: capacity, last: now }; mem.set(key, b); }
  b.tokens = Math.min(capacity, b.tokens + ((now - b.last) / 1000) * refillPerSec);
  b.last = now;
  if (b.tokens >= 1) { b.tokens -= 1; return true; }
  return false;
}

/** Async token-bucket check; uses Redis when available, else in-memory. */
async function take(key, { capacity = 10, refillPerSec = 0.5 } = {}) {
  const full = `dam:${key}`;
  try {
    const result = await command(['EVAL', BUCKET_LUA, '1', full, String(capacity), String(refillPerSec), String(Date.now())]);
    if (result !== null && result !== undefined) {
      const ok = Number(result) === 1;
      return { ok, retryAfter: ok ? 0 : Math.ceil(1 / refillPerSec), distributed: true };
    }
  } catch { /* fall through to memory */ }
  const ok = memTake(full, capacity, refillPerSec);
  return { ok, retryAfter: ok ? 0 : Math.ceil(1 / refillPerSec), distributed: false };
}

/**
 * Guard a request. Returns true if it may proceed; otherwise it has already
 * written a 429 and the caller should `return`.
 */
async function guard(req, res, key, opts) {
  const r = await take(key, opts);
  if (r.ok) return true;
  res.setHeader('Retry-After', String(r.retryAfter));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = 429;
  res.end(JSON.stringify({
    error: 'overflow',
    message: `Too many requests — the backend dam is throttling to stay healthy. Try again in ${r.retryAfter}s.`,
    retryAfter: r.retryAfter,
  }));
  return false;
}

module.exports = { take, guard };
