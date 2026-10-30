import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileClusterIds, matchFollowedCluster } from '../lib/intelligence/identity.mjs';
import { clusterArticles } from '../lib/intelligence/cluster.mjs';

const cl = (id, articleIds, extra = {}) => ({ id, articleIds, ...extra });

test('a cluster sharing >= 50% of its articles inherits the previous id; the displaced id becomes an alias', () => {
  const prev = [cl('cOLD', ['a', 'b', 'c', 'd'])];
  const next = [cl('cNEW', ['b', 'c', 'd', 'e'])];
  const [out] = reconcileClusterIds(next, prev);
  assert.equal(out.id, 'cOLD');
  assert.deepEqual(out.aliases, ['cNEW']);
  assert.deepEqual(out.articleIds, ['b', 'c', 'd', 'e'], 'other fields are untouched');
  assert.equal(next[0].id, 'cNEW', 'input is not mutated');
});

test('exactly 50% overlap inherits; below 50% does not', () => {
  const prev = [cl('cP', ['a', 'b', 'c', 'd'])];
  assert.equal(reconcileClusterIds([cl('cN', ['a', 'b', 'x', 'y'])], prev)[0].id, 'cP');
  const out = reconcileClusterIds([cl('cN', ['a', 'x', 'y', 'z'])], prev)[0];
  assert.equal(out.id, 'cN');
  assert.equal(out.aliases, undefined);
});

test('a story that grows or shrinks keeps its identity', () => {
  const prev = [cl('cP', ['a', 'b'])];
  assert.equal(reconcileClusterIds([cl('cN', ['a', 'b', 'c', 'd', 'e', 'f'])], prev)[0].id, 'cP');
  const prev2 = [cl('cQ', ['a', 'b', 'c', 'd', 'e', 'f'])];
  assert.equal(reconcileClusterIds([cl('cM', ['a', 'b'])], prev2)[0].id, 'cQ');
});

test('assignment is one-to-one and greedy by overlap: a split gives the id to the larger half', () => {
  const prev = [cl('cP', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])];
  const next = [cl('cSmall', ['f', 'g', 'h']), cl('cBig', ['a', 'b', 'c', 'd', 'e'])];
  const out = reconcileClusterIds(next, prev);
  assert.equal(out[1].id, 'cP');
  assert.equal(out[0].id, 'cSmall');
});

test('a merge inherits the id of the larger predecessor; the other predecessor is free', () => {
  const prev = [cl('cA', ['a', 'b', 'c', 'd', 'e']), cl('cB', ['x', 'y'])];
  const [out] = reconcileClusterIds([cl('cN', ['a', 'b', 'c', 'd', 'e', 'x', 'y'])], prev);
  assert.equal(out.id, 'cA');
});

test('ids stay unique when a base id collides with an inherited one', () => {
  // The old story moved to cluster N1 (base id cNEW); N2 is a different story whose base id is cOLD.
  const prev = [cl('cOLD', ['a', 'b', 'c', 'd'])];
  const next = [cl('cNEW', ['a', 'b', 'c']), cl('cOLD', ['z', 'y'])];
  const out = reconcileClusterIds(next, prev);
  assert.equal(out[0].id, 'cOLD');
  assert.notEqual(out[1].id, 'cOLD');
  assert.equal(new Set(out.map((c) => c.id)).size, 2);
  assert.ok(!(out[1].aliases || []).includes('cOLD'));
});

test('aliases accumulate across runs (old links keep resolving) and stay bounded', () => {
  let prev = [cl('c0', ['a', 'b', 'c'])];
  for (let i = 1; i <= 30; i++) {
    prev = reconcileClusterIds([cl(`c${i}`, ['a', 'b', 'c', `n${i}`])], prev);
  }
  assert.equal(prev[0].id, 'c0');
  assert.ok(prev[0].aliases.includes('c30'));
  assert.ok(prev[0].aliases.length <= 12);
  assert.ok(!prev[0].aliases.includes('c0'));
});

test('reconcile is deterministic under input order and tolerant of bad input', () => {
  const prev = [cl('cP1', ['a', 'b']), cl('cP2', ['a', 'b'])];
  const next = [cl('cN1', ['a', 'b']), cl('cN2', ['a', 'b'])];
  const x = reconcileClusterIds(next, prev).map((c) => c.id);
  const y = reconcileClusterIds([...next].reverse(), [...prev].reverse()).map((c) => c.id).reverse();
  assert.deepEqual(x, y);
  assert.deepEqual(reconcileClusterIds([], prev), []);
  assert.deepEqual(reconcileClusterIds(next, null).map((c) => c.id), ['cN1', 'cN2']);
  assert.deepEqual(reconcileClusterIds(next, [{ id: 'z' }, null]).map((c) => c.id), ['cN1', 'cN2']);
});

test('end to end: dropping the earliest article changes the base id but not the reconciled id', () => {
  const NOW = Date.UTC(2026, 9, 29, 12);
  const mk = (id, title, hoursAgo, source) => ({ id, title, link: `https://x/${id}`, publishedAt: NOW - hoursAgo * 36e5, sourceName: source, rankScore: 70 });
  const all = [
    mk('t1', 'Tesla recalls 400,000 vehicles over steering defect', 9, 'Reuters'),
    mk('t2', 'Tesla recall: NHTSA says Model Y steering part may fail', 6, 'CNBC Markets'),
    mk('t3', 'Tesla issues massive recall for faulty power steering', 4, 'MarketWatch'),
  ];
  const run1 = clusterArticles(all, 'finance', { now: NOW });
  const run2 = clusterArticles(all.slice(1), 'finance', { now: NOW });
  assert.equal(run1.length, 1);
  assert.equal(run2.length, 1);
  assert.notEqual(run1[0].id, run2[0].id, 'the base id drifts when the anchor article leaves');
  const [stable] = reconcileClusterIds(run2, run1);
  assert.equal(stable.id, run1[0].id);
  assert.deepEqual(stable.aliases, [run2[0].id]);
});

/* ------------------------------ matchFollowedCluster ------------------------------ */

test('follow: exact id wins', () => {
  const clusters = [cl('c1', ['a']), cl('c2', ['b'])];
  assert.equal(matchFollowedCluster({ clusterId: 'c2', articleIds: ['a'] }, clusters).id, 'c2');
});

test('follow: alias resolves a stale id', () => {
  const clusters = [cl('c1', ['a']), cl('cNew', ['b', 'c'], { aliases: ['cStale'] })];
  assert.equal(matchFollowedCluster({ clusterId: 'cStale', articleIds: [] }, clusters).id, 'cNew');
});

test('follow: falls back to >= 50% article overlap, best overlap wins, ties are deterministic', () => {
  const clusters = [cl('cB', ['a', 'b', 'x']), cl('cA', ['a', 'b', 'c', 'd']), cl('cC', ['q'])];
  const f = { clusterId: 'gone', articleIds: ['a', 'b', 'c', 'd'] };
  assert.equal(matchFollowedCluster(f, clusters).id, 'cA');
  const tie = [cl('cZ', ['a', 'b']), cl('cY', ['a', 'b'])];
  assert.equal(matchFollowedCluster({ clusterId: 'gone', articleIds: ['a', 'b'] }, tie).id, 'cY');
  assert.equal(matchFollowedCluster({ clusterId: 'gone', articleIds: ['a', 'b'] }, [...tie].reverse()).id, 'cY');
});

test('follow: no match returns null', () => {
  const clusters = [cl('c1', ['a', 'b', 'c', 'd'])];
  assert.equal(matchFollowedCluster({ clusterId: 'gone', articleIds: ['a', 'x', 'y', 'z'] }, clusters), null);
  assert.equal(matchFollowedCluster({ clusterId: 'gone' }, clusters), null);
  assert.equal(matchFollowedCluster(null, clusters), null);
  assert.equal(matchFollowedCluster({ clusterId: 'c1' }, []), null);
});

test('orphaned follows per refresh = 0 across a simulated refresh', () => {
  const NOW = Date.UTC(2026, 9, 29, 12);
  const mk = (id, title, hoursAgo, source) => ({ id, title, link: `https://x/${id}`, publishedAt: NOW - hoursAgo * 36e5, sourceName: source, rankScore: 70 });
  const day1 = [
    mk('p1', 'Boeing wins record order from Qatar Airways for 737 Max jets', 8, 'Reuters'),
    mk('p2', 'Qatar Airways places huge Boeing order for 737 Max jets', 6, 'CNBC Markets'),
    mk('q1', 'Bitcoin tops $130,000 for first time', 7, 'Investing.com'),
    mk('q2', 'Bitcoin hits record high above $130,000 on ETF inflows', 5, 'Reuters'),
  ];
  const run1 = clusterArticles(day1, 'finance', { now: NOW });
  const follows = run1.map((c) => ({ clusterId: c.id, articleIds: c.articleIds }));
  const day2 = day1.filter((a) => a.id !== 'p1' && a.id !== 'q1').concat(mk('p3', 'Boeing Qatar Airways order 737 Max is largest ever', 1, 'AP'));
  const run2 = reconcileClusterIds(clusterArticles(day2, 'finance', { now: NOW }), run1);
  for (const f of follows) assert.ok(matchFollowedCluster(f, run2), `follow ${f.clusterId} orphaned`);
});
