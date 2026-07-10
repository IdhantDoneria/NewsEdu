'use client';

/**
 * Local-first user state.
 *
 * The Meridian Brief promises "No tracking" — so every piece of personal
 * state (interests, followed stories/topics, visit snapshots, reading
 * history, recall performance) lives in this browser's localStorage and is
 * sent to the server only transiently, inside the request that needs it
 * (briefing composition, delta detection, recall generation). Nothing is
 * persisted server-side.
 */

const KEY = 'meridian.profile.v1';
const HISTORY_LIMIT = 60;
const ATTEMPT_LIMIT = 120;

function emptyProfile() {
  return {
    v: 1,
    interests: [], // topic ids from lib/intelligence/topics.js
    follows: {}, // clusterId -> { clusterId, title, edition, followedAt, snapshot: { articleIds, lastSeenAt } }
    topicFollows: [], // topic ids
    history: [], // { clusterId, title, edition, kind: 'read'|'asked'|'briefed'|'followed', at }
    recall: {
      attempts: [], // { at, question, concept, verdict, clusterId }
      askedQuestions: [], // question strings, to avoid repeats
      concepts: {}, // concept -> { attempts, correct, lastAt }
      lastSessionAt: 0,
    },
  };
}

export function loadProfile() {
  if (typeof window === 'undefined') return emptyProfile();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyProfile();
    const p = JSON.parse(raw);
    if (!p || p.v !== 1) return emptyProfile();
    return { ...emptyProfile(), ...p, recall: { ...emptyProfile().recall, ...(p.recall || {}) } };
  } catch {
    return emptyProfile();
  }
}

function save(profile) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent('meridian:profile'));
  } catch {
    // Storage full or blocked — state simply doesn't persist this session.
  }
}

export function update(fn) {
  const p = loadProfile();
  fn(p);
  save(p);
  return p;
}

/* --------------------------------- follows -------------------------------- */

export function isFollowing(clusterId) {
  return Boolean(loadProfile().follows[clusterId]);
}

export function followStory({ clusterId, title, edition, articleIds }) {
  return update((p) => {
    p.follows[clusterId] = {
      clusterId,
      title,
      edition,
      followedAt: Date.now(),
      snapshot: { articleIds: articleIds || [], lastSeenAt: Date.now() },
    };
    pushHistory(p, { clusterId, title, edition, kind: 'followed' });
  });
}

export function unfollowStory(clusterId) {
  return update((p) => {
    delete p.follows[clusterId];
  });
}

/** Record a story visit: baseline for future "What Changed" deltas. */
export function markVisit(clusterId, articleIds) {
  return update((p) => {
    const f = p.follows[clusterId];
    if (f) f.snapshot = { articleIds: articleIds || [], lastSeenAt: Date.now() };
  });
}

export function getFollows() {
  return Object.values(loadProfile().follows).sort((a, b) => b.followedAt - a.followedAt);
}

/* ----------------------------- interests / topics -------------------------- */

export function toggleInterest(topicId) {
  return update((p) => {
    const i = p.interests.indexOf(topicId);
    if (i >= 0) p.interests.splice(i, 1);
    else p.interests.push(topicId);
  });
}

export function toggleTopicFollow(topicId) {
  return update((p) => {
    const i = p.topicFollows.indexOf(topicId);
    if (i >= 0) p.topicFollows.splice(i, 1);
    else p.topicFollows.push(topicId);
  });
}

/* --------------------------------- history --------------------------------- */

function pushHistory(p, { clusterId, title, edition, kind }) {
  // Dedupe: same story + kind within 6 hours counts once.
  const recent = p.history.find(
    (h) => h.clusterId === clusterId && h.kind === kind && Date.now() - h.at < 6 * 36e5
  );
  if (recent) {
    recent.at = Date.now();
    return;
  }
  p.history.unshift({ clusterId, title, edition, kind, at: Date.now() });
  p.history = p.history.slice(0, HISTORY_LIMIT);
}

export function recordHistory(entry) {
  return update((p) => pushHistory(p, entry));
}

/** History from the last N days, most recent first, deduped by cluster. */
export function recentHistory(days = 7) {
  const cutoff = Date.now() - days * 24 * 36e5;
  const seen = new Set();
  const out = [];
  for (const h of loadProfile().history) {
    if (h.at < cutoff) continue;
    if (seen.has(h.clusterId)) continue;
    seen.add(h.clusterId);
    out.push(h);
  }
  return out;
}

/* ---------------------------------- recall --------------------------------- */

export function recordRecallAttempt({ question, concept, verdict, clusterId }) {
  return update((p) => {
    p.recall.attempts.unshift({ at: Date.now(), question, concept, verdict, clusterId });
    p.recall.attempts = p.recall.attempts.slice(0, ATTEMPT_LIMIT);
    p.recall.askedQuestions.unshift(question);
    p.recall.askedQuestions = p.recall.askedQuestions.slice(0, 40);
    const c = p.recall.concepts[concept] || { attempts: 0, correct: 0, lastAt: 0 };
    c.attempts += 1;
    if (verdict === 'correct') c.correct += 1;
    c.lastAt = Date.now();
    p.recall.concepts[concept] = c;
    p.recall.lastSessionAt = Date.now();
  });
}

/* --------------------------------- payloads -------------------------------- */

/** Profile payload for POST /api/briefing. */
export function briefingPayload() {
  const p = loadProfile();
  return {
    interests: [...new Set([...p.interests, ...p.topicFollows])],
    follows: Object.values(p.follows).map((f) => ({
      clusterId: f.clusterId,
      snapshot: f.snapshot,
    })),
  };
}

/** Snapshot payload for POST /api/changes. */
export function changesPayload() {
  const p = loadProfile();
  return {
    snapshots: Object.values(p.follows).map((f) => ({
      clusterId: f.clusterId,
      articleIds: f.snapshot?.articleIds || [],
      lastSeenAt: f.snapshot?.lastSeenAt || f.followedAt,
    })),
  };
}

/** History payload for POST /api/recall. */
export function recallPayload() {
  const p = loadProfile();
  return {
    history: recentHistory(7).map((h) => ({
      clusterId: h.clusterId,
      title: h.title,
      kind: h.kind,
    })),
    askedQuestions: p.recall.askedQuestions,
  };
}
