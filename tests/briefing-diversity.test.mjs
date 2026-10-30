import test from 'node:test';
import assert from 'node:assert/strict';

import { composeBriefing, BRIEFING_LIMITS, BRIEFING_CONFIG } from '../lib/intelligence/briefing.mjs';
import { mkCluster, mkPool, shuffle, intelWatching, NOW, allIds } from './helpers/briefing-fixtures.mjs';

const ME = { interests: ['middle-east', 'defense-security', 'russia-ukraine'] };

function maxTopicShare(items) {
  const counts = {};
  for (const i of items) for (const t of new Set(i.topics)) counts[t] = (counts[t] || 0) + 1;
  return Math.max(0, ...Object.values(counts)) / Math.max(1, items.length);
}

test('slot limits and MMR settings are exported constants', () => {
  assert.deepEqual(BRIEFING_LIMITS, { essential: 4, developing: 3, understand: 1, watch: 3 });
  assert.equal(BRIEFING_CONFIG.mmrLambda, 0.8);
  assert.equal(BRIEFING_CONFIG.maxPerTopic, 2);
  const pool = mkPool();
  const b = composeBriefing(pool, intelWatching(pool), {}, { now: NOW, limits: { essential: 2, watch: 1 } });
  assert.equal(b.essential.length, 2);
  assert.ok(b.watch.length <= 1);
});

test('Essential never exceeds two stories per topic, even for a heavily interested reader', () => {
  const pool = mkPool();
  const b = composeBriefing(pool, intelWatching(pool), ME, { now: NOW });
  assert.equal(b.essential.length, 4);
  const counts = {};
  for (const i of b.essential) for (const t of new Set(i.topics)) counts[t] = (counts[t] || 0) + 1;
  for (const [t, n] of Object.entries(counts)) assert.ok(n <= BRIEFING_CONFIG.maxPerTopic, `${t} has ${n}`);
  assert.ok(maxTopicShare(b.essential) <= 0.5);
});

test('the global floor is the best remaining story that does not overlap earlier picks', () => {
  const pool = mkPool();
  const b = composeBriefing(pool, intelWatching(pool), ME, { now: NOW });
  const floor = b.essential.find((i) => i.slot === 'global');
  assert.ok(floor, 'a global-floor slot exists');
  // Global significance of every story, from an unconstrained briefing.
  const everything = composeBriefing(pool, new Map(), {}, { now: NOW, limits: { essential: 16, developing: 0, understand: 0, watch: 0 } });
  const globalById = new Map(everything.essential.map((i) => [i.clusterId, i.global]));
  const picked = b.essential.filter((i) => i !== floor);
  const counts = {};
  for (const i of picked) for (const t of i.topics) counts[t] = (counts[t] || 0) + 1;
  const pickedIds = new Set(b.essential.map((i) => i.clusterId));
  for (const c of pool) {
    if (pickedIds.has(c.id) || !globalById.has(c.id)) continue;
    const capped = c.topics.some((t) => (counts[t] || 0) >= BRIEFING_CONFIG.maxPerTopic);
    if (!capped) assert.ok(globalById.get(c.id) <= floor.global, `${c.title} (${globalById.get(c.id)}) beats the floor (${floor.global})`);
  }
});

test('Watch, Understand and Developing never repeat an Essential pick', () => {
  const pool = mkPool();
  const intel = intelWatching(pool);
  for (const profile of [{}, ME, { interests: ['markets-macro', 'crypto'] }]) {
    const b = composeBriefing(pool, intel, profile, { now: NOW });
    const essential = new Set(b.essential.map((i) => i.clusterId));
    for (const w of b.watch) assert.ok(!essential.has(w.clusterId), `watch repeats ${w.title}`);
    for (const i of [...b.developing, ...b.understand]) assert.ok(!essential.has(i.clusterId));
    const ids = [...allIds(b), ...b.watch.map((w) => w.clusterId)];
    assert.equal(new Set(ids).size, ids.length, 'one story, one slot');
  }
});

test('output is a pure function of the pool and profile (permutation stable)', () => {
  const pool = mkPool();
  const intel = intelWatching(pool);
  const profile = { ...ME, shown: [{ id: pool[0].id, at: NOW - 30 * 36e5 }] };
  const base = JSON.stringify(composeBriefing(pool, intel, profile, { now: NOW }));
  for (const seed of [1, 2, 3, 4, 5]) {
    assert.equal(JSON.stringify(composeBriefing(shuffle(pool, seed), intel, profile, { now: NOW })), base, `seed ${seed}`);
  }
  assert.equal(JSON.stringify(composeBriefing(pool, intel, profile, { now: NOW })), base, 'repeat call');
});

test('ties in score are broken by id, not input order', () => {
  const a = mkCluster('Alpha treaty signed between Norway and Finland', { score: 70, id: 'aaa' });
  const b = mkCluster('Zulu volcano erupts near Quito, thousands evacuated', { score: 70, id: 'zzz' });
  const one = composeBriefing([a, b], new Map(), {}, { now: NOW }).essential.map((i) => i.clusterId);
  const two = composeBriefing([b, a], new Map(), {}, { now: NOW }).essential.map((i) => i.clusterId);
  assert.deepEqual(one, two);
});

test('uses breadth when present to favour widely covered stories', () => {
  const wide = mkCluster('Denmark approves sweeping fishing quota reform', { score: 70, id: 'wide', breadth: 6, sources: ['A', 'B', 'C'] });
  const narrow = mkCluster('Volcano erupts near Quito, thousands evacuated', { score: 70, id: 'narrow', breadth: 1 });
  const b = composeBriefing([narrow, wide], new Map(), {}, { now: NOW, limits: { essential: 1 } });
  assert.equal(b.essential[0].clusterId, 'wide');
});

test('same event from two editions occupies one slot', () => {
  const geo = mkCluster('Chip giant SK Hynix raises $26.5bn in mega US share sale', { score: 80 });
  const fin = mkCluster('SK Hynix raises $26.5 billion in U.S. offering. What to know', { score: 85, edition: 'finance' });
  const b = composeBriefing([geo, fin, mkCluster('NATO summit opens amid missile fears', { score: 90 })], new Map(), {}, { now: NOW });
  assert.equal(b.essential.filter((e) => /Hynix/.test(e.title)).length, 1);
});
