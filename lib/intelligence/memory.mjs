/**
 * Chat memory: pure functions, shared by the server (validating what the model
 * proposes) and the browser (storing it). No I/O here.
 *
 * The chat "learns" only durable facts about the reader: topics they follow,
 * their level, how they like answers. Never news facts (they go stale) and
 * never personal identifiers. Memory lives in the reader's own localStorage and
 * is sent with each request; nothing is stored server-side.
 *
 * Self-pruning, in three layers:
 *   1. the model rates each candidate 1-5 and omits (or names for removal)
 *      what is useless; anything rated below MIN_IMPORTANCE is discarded;
 *   2. every note decays with idle time (half-life HALF_LIFE_DAYS) and is
 *      dropped when its effective score falls under DROP_BELOW;
 *   3. a hard cap evicts the weakest notes.
 * Re-confirmation (the same idea proposed again) reinforces a note and resets
 * its decay clock, so what keeps coming up is what survives.
 */

export const MEMORY_KINDS = ['interest', 'preference', 'context'];

export const MIN_IMPORTANCE = 3;
export const MAX_STORE = 30;
export const MAX_SEND = 10;
export const MAX_ADD = 2;
export const MAX_DROP = 5;
const MAX_TEXT = 140;
const MIN_TEXT = 8;
const SCORE_CAP = 10;
const HALF_LIFE_DAYS = 30;
const DROP_BELOW = 1;
const MAX_IDLE_DAYS = 90;
const DAY_MS = 864e5;
const SIMILAR = 0.6;

// Identifiers, credentials and sensitive categories are never stored.
const SENSITIVE = new RegExp(
  [
    '@\\S+\\.\\S+', // email
    'https?://',
    'www\\.',
    '\\d{6,}', // long numbers: phones, ids, card numbers
    '\\b(password|passcode|api[ _-]?key|token|secret|ssn|passport|credit card|iban|address|phone)\\b',
    '\\b(diagnos\\w*|medical|illness|disease|religio\\w*|sexual\\w*|pregnan\\w*|salary|income|net worth|debt)\\b',
  ].join('|'),
  'i'
);

export function normalizeText(value) {
  return String(value ?? '')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

function words(text) {
  return new Set(
    (String(text).toLowerCase().match(/[a-z][a-z-]{2,}/g) || []).map((w) => w.replace(/s$/, ''))
  );
}

function similarity(a, b) {
  const A = words(a);
  const B = words(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / (A.size + B.size - shared);
}

function validId(id) {
  return typeof id === 'string' && /^[\w-]{1,24}$/.test(id);
}

/** Memory the client sends with a request. Bounded and re-validated. */
export function cleanIncomingMemory(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const m of list) {
    if (out.length >= MAX_SEND) break;
    const text = normalizeText(m?.text);
    if (!validId(m?.id) || text.length < MIN_TEXT || SENSITIVE.test(text)) continue;
    out.push({ id: m.id, text, kind: MEMORY_KINDS.includes(m?.kind) ? m.kind : 'interest' });
  }
  return out;
}

/**
 * Validate what the model proposes. `knownIds` are the ids it was shown, so it
 * can only drop notes that exist. Low-importance candidates are discarded here:
 * this is the "flags itself what is useless" step.
 */
export function sanitizeUpdates(raw, knownIds = []) {
  const known = new Set(knownIds);
  const add = [];
  const seen = [];
  for (const c of Array.isArray(raw?.add) ? raw.add : []) {
    if (add.length >= MAX_ADD) break;
    const text = normalizeText(c?.text);
    const importance = Math.round(Number(c?.importance));
    if (text.length < MIN_TEXT || SENSITIVE.test(text)) continue;
    if (!(importance >= MIN_IMPORTANCE)) continue; // useless / unrated: discard
    if (seen.some((t) => similarity(t, text) >= SIMILAR)) continue;
    seen.push(text);
    add.push({
      text,
      kind: MEMORY_KINDS.includes(c?.kind) ? c.kind : 'interest',
      importance: Math.min(5, importance),
    });
  }
  const drop = [...new Set(Array.isArray(raw?.drop) ? raw.drop : [])]
    .filter((id) => known.has(id))
    .slice(0, MAX_DROP);
  return { add, drop };
}

export function effectiveScore(note, now) {
  const idleDays = Math.max(0, (now - (note.lastUsedAt || note.createdAt || now)) / DAY_MS);
  return (note.score || 0) * Math.pow(0.5, idleDays / HALF_LIFE_DAYS);
}

/** Drop decayed and over-cap notes. Returns a new array. */
export function pruneMemory(list, now = Date.now()) {
  const kept = (Array.isArray(list) ? list : [])
    .filter((n) => n && validId(n.id) && normalizeText(n.text).length >= MIN_TEXT)
    .filter((n) => {
      const idle = (now - (n.lastUsedAt || n.createdAt || now)) / DAY_MS;
      return idle <= MAX_IDLE_DAYS && effectiveScore(n, now) >= DROP_BELOW;
    });
  kept.sort((a, b) => effectiveScore(b, now) - effectiveScore(a, now));
  return kept.slice(0, MAX_STORE);
}

let seq = 0;
function newId(now) {
  seq = (seq + 1) % 1296;
  return `m${now.toString(36)}${seq.toString(36)}`;
}

/**
 * Apply sanitized updates to the stored list.
 * Returns { memory, added: [text], reinforced: [text], dropped: [text] }.
 */
export function mergeMemory(list, updates, now = Date.now()) {
  let memory = pruneMemory(list, now).map((n) => ({ ...n }));
  const added = [];
  const reinforced = [];
  const dropped = [];

  for (const id of updates?.drop || []) {
    const hit = memory.find((n) => n.id === id);
    if (hit) {
      dropped.push(hit.text);
      memory = memory.filter((n) => n.id !== id);
    }
  }

  for (const c of updates?.add || []) {
    const match = memory.find((n) => similarity(n.text, c.text) >= SIMILAR);
    if (match) {
      match.score = Math.min(SCORE_CAP, match.score + 1.5);
      match.uses = (match.uses || 1) + 1;
      match.lastUsedAt = now;
      match.text = c.text;
      reinforced.push(c.text);
    } else {
      memory.push({
        id: newId(now),
        text: c.text,
        kind: c.kind,
        score: Math.min(SCORE_CAP, c.importance * 1.5),
        uses: 1,
        createdAt: now,
        lastUsedAt: now,
      });
      added.push(c.text);
    }
  }

  return { memory: pruneMemory(memory, now), added, reinforced, dropped };
}

/** The strongest notes, in the shape the API accepts. */
export function selectForRequest(list, now = Date.now(), n = MAX_SEND) {
  return pruneMemory(list, now)
    .slice(0, n)
    .map(({ id, text, kind }) => ({ id, text, kind }));
}
