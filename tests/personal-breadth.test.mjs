import test from 'node:test';
import assert from 'node:assert/strict';

import { features, rankArticles, PRESETS, breadthCounts } from '../lib/personal/ranking.mjs';

const art = (title, over = {}) => ({
  id: title, title, summary: '', score: 70, ageHours: 2, metrics: { sourceTrust: 15 }, clusterId: null, ...over,
});
const widely = PRESETS.find((p) => p.id === 'widely').weights;

test('breadth feature prefers the server breadth (independent outlets) over raw cluster size', () => {
  // Three syndicated copies of one wire story: cluster size 3 but one outlet.
  const pool = [art('a1', { clusterId: 'c', breadth: 1 }), art('a2', { clusterId: 'c', breadth: 1 }), art('a3', { clusterId: 'c', breadth: 1 })];
  const ctx = { counts: breadthCounts(pool), terms: [] };
  assert.equal(features(pool[0], ctx).breadth, 0);
  const wide = art('w', { clusterId: 'd', breadth: 4 });
  assert.equal(features(wide, { counts: breadthCounts([wide]), terms: [] }).breadth, 100);
});

test('without breadth the cluster article count is still used', () => {
  const pool = [art('x1', { clusterId: 'c' }), art('x2', { clusterId: 'c' })];
  assert.equal(features(pool[0], { counts: breadthCounts(pool), terms: [] }).breadth, 40);
});

test('the wide-coverage preset ranks a many-outlet story above syndicated copies', () => {
  const syndicated = art('syndicated', { score: 80, clusterId: 'c1', breadth: 1 });
  const wide = art('wide', { score: 70, clusterId: 'c2', breadth: 5 });
  assert.equal(rankArticles([syndicated, wide], widely)[0].title, 'wide');
});
