/**
 * Per-client rate limiting for routes that cost a model call.
 *
 * The key is an address the client cannot choose: Vercel's own
 * `x-vercel-forwarded-for`, then `x-real-ip`, then the RIGHTMOST entry of
 * `x-forwarded-for` (proxies append, so the leftmost is whatever the client
 * sent). Counters live in the shared store via kvIncr, so the limit holds
 * across serverless instances when KV is configured and per instance
 * otherwise. Fixed windows: simple, atomic, and a burst can at worst double.
 */

import { kvIncr } from '../store/kv.mjs';

const get = (headers, name) => {
  const v = headers?.get?.(name);
  return typeof v === 'string' ? v : '';
};

/** Strip a port and brackets; accept only IP-looking text. */
function cleanIp(raw) {
  let ip = String(raw || '').trim();
  if (!ip) return '';
  const bracketed = /^\[([0-9a-f:.]+)\](?::\d+)?$/i.exec(ip);
  if (bracketed) ip = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, '');
  return /^[0-9a-f:.]{2,45}$/i.test(ip) ? ip.toLowerCase() : '';
}

/** The caller's address from headers the client cannot forge, or 'unknown'. */
export function clientId(headers) {
  const vercel = cleanIp(get(headers, 'x-vercel-forwarded-for').split(',')[0]);
  if (vercel) return vercel;
  const real = cleanIp(get(headers, 'x-real-ip'));
  if (real) return real;
  const parts = get(headers, 'x-forwarded-for')
    .split(',')
    .map(cleanIp)
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'unknown';
}

// Fallback if the shared store reports failure (kvIncr resolves 0 then).
const local = new Map(); // key -> { n, exp }

function localIncr(key, ttlSec, now) {
  if (local.size > 5000) for (const [k, v] of local) if (v.exp < now) local.delete(k);
  const e = local.get(key);
  if (!e || e.exp < now) {
    local.set(key, { n: 1, exp: now + ttlSec * 1000 });
    return 1;
  }
  return ++e.n;
}

/**
 * @param {Headers} headers
 * @param {{scope?:string, limit?:number, windowSec?:number, now?:number}} [opts]
 * @returns {Promise<{limited:boolean, count:number, limit:number, retryAfterSec:number, id:string}>}
 */
export async function rateLimit(headers, { scope = 'api', limit = 20, windowSec = 60, now = Date.now() } = {}) {
  const id = clientId(headers);
  const bucket = Math.floor(now / (windowSec * 1000));
  const key = `rl:${scope}:${id}:${bucket}`;
  let count = 0;
  try {
    count = Number(await kvIncr(key, { ttlSec: windowSec * 2 })) || 0;
  } catch {
    count = 0;
  }
  if (!count) count = localIncr(key, windowSec * 2, now);
  const retryAfterSec = Math.max(1, Math.ceil(((bucket + 1) * windowSec * 1000 - now) / 1000));
  return { limited: count > limit, count, limit, retryAfterSec, id };
}
