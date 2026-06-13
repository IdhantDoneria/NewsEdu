// Server-side "water dam": a token-bucket rate limiter that protects the backend
// when traffic overflows. Each caller (keyed by IP + route) gets a reservoir of
// tokens that refills at a fixed rate; when it's empty the request spills (429).
// Mirrors the client-side dam so overflow is controlled end-to-end.

const buckets = (globalThis.__zenithDam = globalThis.__zenithDam || new Map());

/**
 * @returns {{ ok: boolean, retryAfter: number, remaining: number }}
 */
function take(key, { capacity = 10, refillPerSec = 0.5 } = {}) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) { b = { tokens: capacity, last: now }; buckets.set(key, b); }
  // refill
  const elapsed = (now - b.last) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
  b.last = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, retryAfter: 0, remaining: Math.floor(b.tokens) };
  }
  const retryAfter = Math.ceil((1 - b.tokens) / refillPerSec);
  return { ok: false, retryAfter, remaining: 0 };
}

// opportunistic cleanup so the map can't grow unbounded
function sweep() {
  if (buckets.size < 5000) return;
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.last > 3_600_000) buckets.delete(k);
}

/**
 * Express-style guard. Returns true if the request may proceed; otherwise it has
 * already written a 429 response and the caller should stop.
 */
function guard(req, res, key, opts) {
  sweep();
  const r = take(key, opts);
  res.setHeader('X-RateLimit-Remaining', String(r.remaining));
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
