/**
 * Graded, time-decayed interest vector.
 *
 * Replaces binary "interested / not interested" with a weight in [0, 1) per
 * topic. Two sources feed it:
 *  - explicit picks (the interest chips, topic follows): a standing floor
 *    (EXPLICIT_WEIGHT) that does not decay, because the reader said so;
 *  - implicit signals (opening or following a story, toggling a topic): each
 *    adds a gain that decays with a 14-day half-life, so what the reader
 *    stopped reading stops steering the briefing.
 * Signals combine as 1 - (1 - a)(1 - b): saturating, never above 0.95.
 *
 * Pure functions, no I/O: used by the browser (lib/client/userState.js) and
 * the server (briefing route/composer). Stored profiles from before this
 * existed are migrated on load by migrateInterestVector.
 */

import { topicsForText } from '../intelligence/topics.mjs';

export const HALF_LIFE_DAYS = 14;
export const EXPLICIT_WEIGHT = 0.5;
export const MAX_WEIGHT = 0.95;
const DAY_MS = 24 * 36e5;

// How much one signal of each kind adds (before saturation).
export const SIGNAL_GAIN = {
  toggle: 0.3, // switched a topic on
  topicFollow: 0.3,
  follow: 0.35, // followed a story on that topic
  read: 0.12, // opened a story
  asked: 0.08, // asked a question about it
  briefed: 0, // passively shown: not a signal
};

const clamp01 = (n) => Math.min(MAX_WEIGHT, Math.max(0, n));

/** Value of a stored { v, t } entry at time `now`. */
export function decayed(entry, now) {
  if (!entry || !Number.isFinite(entry.v) || !Number.isFinite(entry.t)) return 0;
  const age = Math.max(0, now - entry.t);
  return entry.v * Math.pow(0.5, age / (HALF_LIFE_DAYS * DAY_MS));
}

/** Add a signal for each topic. Mutates and returns `vec`. */
export function bumpSignal(vec, topics, kind, now) {
  const gain = SIGNAL_GAIN[kind] ?? 0;
  if (!gain) return vec;
  for (const topic of topics || []) {
    const cur = decayed(vec[topic], now);
    vec[topic] = { v: clamp01(1 - (1 - cur) * (1 - gain)), t: now };
  }
  return vec;
}

/** Forget the implicit history of a topic (toggled off). */
export function clearSignal(vec, topic) {
  delete vec[topic];
  return vec;
}

/**
 * Current weights { topicId: 0..0.95 } for a profile at `now`.
 * profile: { interests, topicFollows, vec }.
 */
export function interestWeights(profile, now = Date.now()) {
  const out = {};
  const explicit = new Set([...(profile?.interests || []), ...(profile?.topicFollows || [])]);
  for (const t of explicit) out[t] = EXPLICIT_WEIGHT;
  for (const [t, entry] of Object.entries(profile?.vec || {})) {
    const d = decayed(entry, now);
    if (d <= 0.005) continue;
    out[t] = clamp01(1 - (1 - (out[t] || 0)) * (1 - d));
  }
  return out;
}

/** Round to the nearest 0.01 and drop negligible weights, for payloads. */
export function compactWeights(weights) {
  const out = {};
  for (const [t, w] of Object.entries(weights || {})) {
    const r = Math.round(w * 100) / 100;
    if (r >= 0.02) out[t] = r;
  }
  return out;
}

/**
 * Bring an old stored profile up to the graded model. Idempotent: replays
 * reading history and follows into the vector once (keyed by vecV), using the
 * entries' own timestamps so old activity is already decayed.
 */
export function migrateInterestVector(profile, now = Date.now()) {
  if (!profile || profile.vecV === 1) return profile;
  const vec = {};
  const seen = new Set();
  for (const h of profile.history || []) {
    const gain = SIGNAL_GAIN[h.kind === 'followed' ? 'follow' : h.kind] ?? 0;
    if (!gain || !Number.isFinite(h.at)) continue;
    const topics = h.topics || topicsForText(h.title);
    bumpSignal(vec, topics, h.kind === 'followed' ? 'follow' : h.kind, h.at);
    if (h.kind === 'followed') seen.add(h.clusterId);
  }
  for (const f of Object.values(profile.follows || {})) {
    if (seen.has(f.clusterId)) continue;
    bumpSignal(vec, topicsForText(f.title), 'follow', Number(f.followedAt) || now);
  }
  profile.vec = vec;
  profile.vecV = 1;
  if (!Array.isArray(profile.shown)) profile.shown = [];
  return profile;
}

/** Stable short hash of a weights map, quantised so tiny decay does not change it. */
export function weightsHash(weights) {
  const parts = Object.entries(weights || {})
    .map(([t, w]) => [t, Math.round(w * 5)]) // 0.2 steps
    .filter(([, q]) => q > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([t, q]) => `${t}:${q}`)
    .join('|');
  return fnv1a(parts);
}

/** 32-bit string hash (FNV-1a with a murmur3 finaliser). */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // murmur3 finaliser: FNV alone mixes the last characters poorly into the high bits
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
