/**
 * Client profile state: interest vector updates, migration of old stored
 * profiles, and shown-state pruning, against a fake localStorage.
 */
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  dispatchEvent: () => true,
};
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };

const us = await import('../lib/client/userState.js');
const KEY = 'meridian.profile.v1';
const DAY = 864e5;
const H = 36e5;

beforeEach(() => store.clear());

test('toggling an interest adds a graded signal; toggling off forgets it', () => {
  us.toggleInterest('energy');
  let p = us.loadProfile();
  assert.deepEqual(p.interests, ['energy']);
  assert.ok(p.vec.energy.v > 0);
  const payload = us.briefingPayload();
  assert.ok(payload.interestWeights.energy >= 0.5);
  assert.deepEqual(payload.interests, ['energy']);
  us.toggleInterest('energy');
  p = us.loadProfile();
  assert.equal(p.vec.energy, undefined);
  assert.equal(us.briefingPayload().interestWeights.energy, undefined);
});

test('opening and following stories nudge topics from the title', () => {
  us.recordHistory({ clusterId: 'c1', title: 'Fed holds rates as inflation cools', edition: 'finance', kind: 'read' });
  us.followStory({ clusterId: 'c2', title: 'Ethiopia war escalates in Tigray', edition: 'geopolitics', articleIds: ['a'] });
  const w = us.briefingPayload().interestWeights;
  assert.ok(w['markets-macro'] > 0.05);
  assert.ok(w.africa > 0.2);
  // The same story re-read inside 6 h counts once.
  us.recordHistory({ clusterId: 'c1', title: 'Fed holds rates as inflation cools', edition: 'finance', kind: 'read' });
  assert.equal(us.loadProfile().history.filter((h) => h.kind === 'read').length, 1);
});

test('a v1 profile saved before the graded model loads and migrates without losing data', () => {
  const old = {
    v: 1,
    interests: ['crypto'],
    follows: {},
    topicFollows: ['health'],
    history: [{ clusterId: 'x', title: 'Fed holds rates', edition: 'finance', kind: 'read', at: Date.now() - DAY }],
    recall: { attempts: [], askedQuestions: ['q?'], concepts: {}, lastSessionAt: 0 },
  };
  store.set(KEY, JSON.stringify(old));
  const p = us.loadProfile();
  assert.deepEqual(p.interests, ['crypto']);
  assert.deepEqual(p.topicFollows, ['health']);
  assert.equal(p.vecV, 1);
  assert.ok(p.vec['markets-macro'].v > 0);
  assert.deepEqual(p.shown, []);
  assert.deepEqual(p.recall.askedQuestions, ['q?']);
  const payload = us.briefingPayload();
  assert.deepEqual(new Set(payload.interests), new Set(['crypto', 'health']));
  assert.ok(payload.interestWeights.crypto >= 0.5 && payload.interestWeights.health >= 0.5);
});

test('shown ids are pruned to 48 h and the page on screen is not reported as shown', () => {
  const now = Date.now();
  us.recordShown([{ clusterId: 'old' }], now - 50 * H);
  us.recordShown([{ clusterId: 'day-old' }], now - 24 * H);
  us.recordShown([{ clusterId: 'just-now' }], now - 5 * 60e3);
  const ids = us.loadProfile().shown.map((s) => s.id);
  assert.ok(!ids.includes('old'), 'older than 48 h is dropped on write');
  assert.ok(ids.includes('day-old') && ids.includes('just-now'));
  const sent = us.shownPayload(now).map((s) => s.id);
  assert.deepEqual(sent, ['day-old'], 'a reload must not swap out the briefing on screen');
  // Re-showing a story refreshes its timestamp instead of duplicating it.
  us.recordShown([{ clusterId: 'day-old' }], now);
  assert.equal(us.loadProfile().shown.filter((s) => s.id === 'day-old').length, 1);
});

test('shown list is bounded', () => {
  const now = Date.now();
  us.recordShown(Array.from({ length: 200 }, (_, i) => ({ clusterId: `c${i}` })), now - 3 * H);
  assert.ok(us.loadProfile().shown.length <= 80);
});
