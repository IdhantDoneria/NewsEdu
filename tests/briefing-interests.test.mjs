import test from 'node:test';
import assert from 'node:assert/strict';

import { composeBriefing, EXPLORATION_LABEL } from '../lib/intelligence/briefing.mjs';
import {
  HALF_LIFE_DAYS, EXPLICIT_WEIGHT, bumpSignal, clearSignal, decayed, interestWeights, migrateInterestVector, weightsHash, compactWeights,
} from '../lib/personal/interests.mjs';
import { mkCluster, mkPool, NOW } from './helpers/briefing-fixtures.mjs';

const DAY = 864e5;

test('implicit interest halves every 14 days', () => {
  assert.equal(HALF_LIFE_DAYS, 14);
  const vec = {};
  bumpSignal(vec, ['energy'], 'follow', NOW);
  const v0 = decayed(vec.energy, NOW);
  assert.ok(Math.abs(decayed(vec.energy, NOW + 14 * DAY) - v0 / 2) < 1e-9);
  assert.ok(Math.abs(decayed(vec.energy, NOW + 28 * DAY) - v0 / 4) < 1e-9);
});

test('signals saturate instead of stacking linearly, and explicit picks are a floor', () => {
  const vec = {};
  for (let i = 0; i < 40; i++) bumpSignal(vec, ['crypto'], 'read', NOW);
  assert.ok(vec.crypto.v < 0.96 && vec.crypto.v > 0.9);
  bumpSignal(vec, ['health'], 'briefed', NOW);
  assert.equal(vec.health, undefined, 'passive display is not a signal');

  const w = interestWeights({ interests: ['energy'], vec: {} }, NOW + 365 * DAY);
  assert.equal(w.energy, EXPLICIT_WEIGHT, 'a picked interest does not decay away');
  const merged = interestWeights({ interests: ['energy'], vec: { energy: { v: 0.4, t: NOW } } }, NOW);
  assert.ok(merged.energy > EXPLICIT_WEIGHT && merged.energy < 0.95);

  clearSignal(vec, 'crypto');
  assert.equal(vec.crypto, undefined);
  assert.deepEqual(compactWeights({ a: 0.5, b: 0.004, c: 0.123 }), { a: 0.5, c: 0.12 });
});

test('stored profiles from before the graded model are migrated once, with their own timestamps', () => {
  const profile = {
    v: 1,
    interests: ['markets-macro'],
    topicFollows: [],
    follows: { c1: { clusterId: 'c1', title: 'Ethiopia war escalates in Tigray', followedAt: NOW - 3 * DAY } },
    history: [
      { clusterId: 'h1', title: 'Fed holds rates as inflation cools', kind: 'read', at: NOW - 1 * DAY },
      { clusterId: 'h2', title: 'Bitcoin tops record', kind: 'read', at: NOW - 60 * DAY },
      { clusterId: 'h3', title: 'Ethiopia war escalates in Tigray', kind: 'followed', at: NOW - 3 * DAY },
      { clusterId: 'h4', title: 'Something briefed', kind: 'briefed', at: NOW - DAY },
    ],
  };
  const m = migrateInterestVector(structuredClone(profile), NOW);
  assert.equal(m.vecV, 1);
  assert.ok(Array.isArray(m.shown));
  const w = interestWeights(m, NOW);
  assert.ok(w['markets-macro'] >= EXPLICIT_WEIGHT);
  assert.ok(w.africa > 0.2, 'followed story topic recorded once');
  assert.ok((w.crypto || 0) < 0.01, 'a 60-day-old read has decayed to nothing');
  assert.ok(w['middle-east'] === undefined);
  // Idempotent.
  assert.deepEqual(migrateInterestVector(structuredClone(m), NOW).vec, m.vec);
});

test('blend is not lexicographic: a major story beats a weak match, a matching story beats an equal one', () => {
  const big = mkCluster('Global summit agrees landmark climate treaty after marathon talks', { score: 100, sources: ['A', 'B', 'C'], id: 'big' });
  const weak = mkCluster('Small bitcoin exchange lists new token', { score: 20, id: 'weak' });
  const filler = [
    mkCluster('Quiet vote on Danish fishing quotas', { score: 30 }),
    mkCluster('Kenya marathon record falls in Eldoret', { score: 35 }),
    mkCluster('Typhoon forecast for the Philippines coast', { score: 40 }),
    mkCluster('Parliament in Peru debates mining royalties', { score: 45 }),
  ];
  const pool = [big, weak, ...filler];
  const b = composeBriefing(pool, new Map(), { interests: ['crypto'] }, { now: NOW, limits: { essential: 2 } });
  assert.ok(b.essential.some((i) => i.clusterId === 'big'), 'the major non-matching story is not buried by a weak match');

  const a = mkCluster('Bitcoin hits record as miners expand in Texas', { score: 60, id: 'a' });
  const z = mkCluster('Typhoon forces evacuations across Philippines coast', { score: 60, id: 'z' });
  const eq = composeBriefing([z, a], new Map(), { interests: ['crypto'] }, { now: NOW, limits: { essential: 1 } });
  assert.equal(eq.essential[0].clusterId, 'a', 'equal significance: the interest decides');
});

test('graded interest: a stronger weight lifts a story further', () => {
  const pool = mkPool();
  const weak = composeBriefing(pool, new Map(), { interestWeights: { crypto: 0.2 } }, { now: NOW });
  const strong = composeBriefing(pool, new Map(), { interestWeights: { crypto: 0.9 } }, { now: NOW });
  const rel = (b) => b.essential.find((i) => /Bitcoin/.test(i.title))?.relevance ?? 0;
  assert.ok(rel(strong) > rel(weak) || (rel(strong) > 0 && !weak.essential.some((i) => /Bitcoin/.test(i.title))));
});

test('exploration slot: deterministic, stable across reloads, outside the reader topics, labelled', () => {
  const pool = mkPool();
  const profile = { interests: ['middle-east', 'defense-security'] };
  const forced = composeBriefing(pool, new Map(), profile, { now: NOW, forceExploration: true });
  const ex = forced.essential.filter((i) => i.exploration);
  assert.equal(ex.length, 1);
  assert.equal(ex[0].slot, 'exploration');
  assert.ok(!ex[0].topics.some((t) => ['middle-east', 'defense-security'].includes(t)));
  assert.equal(forced.exploration, EXPLORATION_LABEL);
  assert.equal(EXPLORATION_LABEL, 'Outside your usual topics');
  // Stable across reloads on the same day...
  const later = composeBriefing(pool, new Map(), profile, { now: NOW + 3 * 36e5, forceExploration: true });
  assert.deepEqual(later.essential.map((i) => i.clusterId), forced.essential.map((i) => i.clusterId));
  // ...and the natural rate is epsilon-per-slot (about a third of days with 4 slots), not zero and not always.
  let days = 0;
  for (let d = 0; d < 120; d++) {
    const b = composeBriefing(pool, new Map(), profile, { now: NOW + d * DAY });
    if (b.essential.some((i) => i.exploration)) days++;
  }
  assert.ok(days > 15 && days < 70, `exploration on ${days}/120 days`);
});

test('no exploration for readers without interests (everything is already global)', () => {
  const pool = mkPool();
  const b = composeBriefing(pool, new Map(), {}, { now: NOW, forceExploration: true });
  assert.ok(!b.essential.some((i) => i.exploration));
  assert.equal(b.exploration, null);
});

test('the seed depends on the date and the interests, not on input order', () => {
  assert.equal(weightsHash({ energy: 0.5, crypto: 0.5 }), weightsHash({ crypto: 0.5, energy: 0.5 }));
  assert.notEqual(weightsHash({ energy: 0.5 }), weightsHash({ crypto: 0.5 }));
  assert.equal(weightsHash({ energy: 0.5 }), weightsHash({ energy: 0.52, crypto: 0.01 }), 'quantised against decay jitter');
});
