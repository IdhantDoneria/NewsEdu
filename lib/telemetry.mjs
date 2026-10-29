/**
 * Server-side telemetry: fire-and-forget events into a capped KV list, plus
 * the aggregation the admin endpoint serves. Never throws, never blocks a
 * request, and stores no personal data (no IPs, no chat text unless the reader
 * thumbs-downed it, and then only a scrubbed 200-char excerpt).
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { kvPush, kvIncr } from './store/kv.mjs';
import { keepAlive } from './keepalive.mjs';

export const TELEMETRY_KEY = 'telemetry:events';
export const MAX_EVENTS = 1000;
export const MAX_STRING = 200;
const EVENT_TTL_SEC = 30 * 24 * 3600;
const MAX_FIELDS = 24;

/** Keep only small JSON-safe primitives; arrays collapse to their length. */
export function sanitizeData(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const [k, v] of Object.entries(data).slice(0, MAX_FIELDS)) {
    if (k === 't' || k === 'type' || k.length > 40) continue;
    if (typeof v === 'string') out[k] = v.slice(0, MAX_STRING);
    else if (typeof v === 'number') {
      if (Number.isFinite(v)) out[k] = v;
    } else if (typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.length;
  }
  return out;
}

/**
 * @param {string} type  e.g. 'chat', 'feedback', 'intel', 'ingest'
 * @param {object} data  small JSON-safe payload
 * @returns {Promise<void>} resolves when stored; callers may ignore it
 */
export function recordEvent(type, data = {}) {
  try {
    const p = kvPush(
      TELEMETRY_KEY,
      { ...sanitizeData(data), t: Date.now(), type: String(type).slice(0, 32) },
      { max: MAX_EVENTS, ttlSec: EVENT_TTL_SEC }
    )
      .then(() => {})
      .catch(() => {});
    keepAlive(p);
    return p;
  } catch {
    return Promise.resolve();
  }
}

// ---- aggregation ------------------------------------------------------------

const FALLBACK_PROVIDERS = new Set(['fallback', 'none']);

function isFallback(e) {
  return e.fallback === true || FALLBACK_PROVIDERS.has(e.provider);
}

/** Nearest-rank percentile of an array of numbers (null when empty). */
export function percentile(values, p) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * v.length));
  return v[Math.min(v.length, rank) - 1];
}

const rate = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 1000 : null);

function tally(items, key) {
  const m = {};
  for (const it of items) {
    const k = it[key] || 'unknown';
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

/**
 * Aggregate raw events into the numbers the admin view shows.
 * Rates are 0-1 (or null when there is nothing to divide by).
 */
export function summarizeEvents(events) {
  const list = (Array.isArray(events) ? events : []).filter((e) => e && typeof e === 'object');
  const chats = list.filter((e) => e.type === 'chat');
  const intels = list.filter((e) => e.type === 'intel');
  const feedback = list.filter((e) => e.type === 'feedback' && (e.rating === 'up' || e.rating === 'down'));
  const times = list.map((e) => e.t).filter(Number.isFinite);

  // Answers actually produced by a model (not served from cache or a fallback)
  const modelled = chats.filter((e) => !e.cached && !isFallback(e));
  const providerMix = tally(chats.filter((e) => e.provider), 'provider');
  const answered = chats.filter((e) => !isFallback(e));
  const grounded = answered.filter((e) => Number(e.citations) > 0);
  const citations = chats.reduce((s, e) => s + (Number(e.citations) || 0), 0);
  const dropped = chats.reduce((s, e) => s + (Number(e.dropped) || 0), 0);

  const thumbsByProvider = {};
  for (const f of feedback) {
    const k = f.provider || 'unknown';
    const row = (thumbsByProvider[k] ||= { up: 0, down: 0 });
    row[f.rating]++;
  }
  const up = feedback.filter((f) => f.rating === 'up').length;

  const latencyOf = (arr) => arr.map((e) => Number(e.ms)).filter((n) => Number.isFinite(n) && n >= 0);
  const modelLatency = latencyOf([...modelled, ...intels.filter((e) => !isFallback(e))]);
  const allLatency = latencyOf([...chats, ...intels]);
  const withProviderLatency = {};
  for (const [prov] of Object.entries(providerMix)) {
    const l = latencyOf(chats.filter((e) => e.provider === prov && !e.cached));
    withProviderLatency[prov] = { n: l.length, p50: percentile(l, 50), p95: percentile(l, 95) };
  }

  return {
    total: list.length,
    byType: tally(list, 'type'),
    from: times.length ? Math.min(...times) : null,
    to: times.length ? Math.max(...times) : null,
    chat: {
      count: chats.length,
      cacheHitRate: rate(chats.filter((e) => e.cached === true).length, chats.length),
      providerMix,
      fallbackShare: rate(chats.filter(isFallback).length, chats.length),
      groundingRate: rate(grounded.length, answered.length),
      citationDropRate: rate(dropped, citations + dropped),
    },
    intel: {
      count: intels.length,
      fallbackShare: rate(intels.filter(isFallback).length, intels.length),
    },
    feedback: {
      up,
      down: feedback.length - up,
      downRate: rate(feedback.length - up, feedback.length),
      byProvider: thumbsByProvider,
    },
    latencyMs: {
      n: allLatency.length,
      p50: percentile(allLatency, 50),
      p95: percentile(allLatency, 95),
      model: { n: modelLatency.length, p50: percentile(modelLatency, 50), p95: percentile(modelLatency, 95) },
      byProvider: withProviderLatency,
    },
  };
}

// ---- request validation (used by POST/GET /api/telemetry) --------------------

const FEEDBACK_TYPES = new Set(['feedback']);
const RATINGS = new Set(['up', 'down']);
export const PROVIDERS = new Set(['gemini', 'openrouter', 'cache', 'fallback', 'none']);
export const RATE_LIMIT_PER_MIN = 20;

const digest = (s) => createHash('sha256').update(String(s)).digest();

/** Constant-time string comparison (compares fixed-length digests). */
export function tokenMatches(supplied, expected) {
  if (!supplied || !expected) return false;
  return timingSafeEqual(digest(supplied), digest(expected));
}

/** Strip anything that looks like contact details or a link from free text. */
export function scrub(text) {
  return String(text)
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[link]')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_STRING);
}

/**
 * Strict allow-list validation of a feedback POST body.
 * @returns {{ type, data } | { error: string }}
 */
export function validateFeedback(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!FEEDBACK_TYPES.has(b.type)) return { error: 'invalid-type' };
  if (!RATINGS.has(b.rating)) return { error: 'invalid-rating' };
  const data = { rating: b.rating };
  if (b.provider != null) {
    if (typeof b.provider !== 'string' || !PROVIDERS.has(b.provider)) return { error: 'invalid-provider' };
    data.provider = b.provider;
  }
  // The question is kept only when the reader thumbed the answer down, so a bad
  // answer can be investigated; thumbs-up carries no text at all.
  if (b.rating === 'down' && typeof b.question === 'string' && b.question.trim()) {
    data.question = scrub(b.question);
  }
  return { type: b.type, data };
}

/**
 * Per-IP fixed-window limiter. Only a hash of the address is used as the
 * counter key, and the counter expires after a minute.
 */
export async function isRateLimited(ip, { limit = RATE_LIMIT_PER_MIN, now = Date.now() } = {}) {
  const id = digest(ip || 'local').toString('hex').slice(0, 16);
  const n = await kvIncr(`rl:telemetry:${id}:${Math.floor(now / 60000)}`, { ttlSec: 70 });
  return n > limit;
}
