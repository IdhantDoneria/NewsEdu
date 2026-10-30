import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clusterArticles } from '../lib/intelligence/cluster.mjs';
import { rankPool } from '../lib/ingestion/build.mjs';
import { outletKey, regionShare, compareRank } from '../lib/ingestion/pipeline.mjs';
import { regionOf } from '../lib/feeds.js';

// Offline replay of the 2026-10-29 production snapshots (post-cap output of the
// old pipeline) through the new ranking stages. The snapshot is only the old
// top 60, so this shows how the stages re-order and re-balance that pool; the
// larger gains (cluster-before-cap, new regional feeds) need the full pool and
// are measured live (see the stream report).

const DIR = new URL('./fixtures/snapshots/2026-10-29/', import.meta.url);
const load = (ed) => JSON.parse(readFileSync(new URL(`news-${ed}.json`, DIR), 'utf8'));

function asScored(snapshot) {
  return snapshot.articles.map((a) => {
    const rank = a.scoreBreakdown.reduce((t, l) => t + l.delta, 0); // unclamped, as scoring now sorts
    const { clusterId, ...rest } = a;
    return { ...rest, rankScore: rank, region: regionOf(snapshot.edition, a.sourceName) };
  });
}

function metrics(list, eventOf) {
  const top = (n) => list.slice(0, n);
  const events = (n) => new Set(top(n).map((a) => eventOf.get(a.id))).size;
  const shares = {};
  for (const a of top(20)) shares[outletKey(a)] = (shares[outletKey(a)] || 0) + 1;
  const maxShare = Math.max(...Object.values(shares)) / Math.min(20, list.length);
  return {
    n: list.length,
    events20: events(20),
    events60: events(60),
    maxOutletShare20: Math.round(maxShare * 100) / 100,
    outlets20: Object.entries(shares).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '),
    regions20: regionShare(top(20)),
    regions60: regionShare(top(60)),
  };
}

for (const edition of ['geopolitics', 'finance']) {
  test(`replay ${edition}: new stages keep the pool, balance the top 20, never lose distinct events`, async (t) => {
    const snapshot = load(edition);
    const scored = asScored(snapshot);
    const now = snapshot.generatedAt;

    const clusters = clusterArticles([...scored].sort(compareRank), edition, { now });
    const eventOf = new Map();
    for (const c of clusters) for (const id of c.articleIds) eventOf.set(id, c.id);

    const before = metrics(
      snapshot.articles.map((a) => scored.find((s) => s.id === a.id)), // snapshot (old) order
      eventOf
    );
    const ranked = await rankPool(scored, edition, { now, noiseFloor: 0 });
    const after = metrics(ranked.articles, eventOf);

    t.diagnostic(`${edition} BEFORE ${JSON.stringify(before)}`);
    t.diagnostic(`${edition} AFTER  ${JSON.stringify(after)}`);

    // Same pool (noise floor disabled here), nothing invented.
    assert.equal(ranked.articles.length, scored.length);
    assert.deepEqual([...new Set(ranked.articles.map((a) => a.id))].sort(), scored.map((a) => a.id).sort());

    // Caps hold wherever the pool is diverse enough to honour them.
    const outletsAvailable = new Set(scored.map(outletKey)).size;
    if (outletsAvailable >= 7) assert.ok(after.maxOutletShare20 <= 0.25 + 1e-9, `outlet share ${after.maxOutletShare20}`);
    assert.ok(after.maxOutletShare20 <= before.maxOutletShare20 + 1e-9, 'never more concentrated than before');

    // Distinct events: the story cap and duplicate penalties can only help the top 20.
    assert.ok(after.events20 >= before.events20, `events@20 ${before.events20} -> ${after.events20}`);
    assert.equal(after.events60, before.events60, 'the same events survive in the 60');

    // Regions are carried through to the stats.
    assert.ok(Object.keys(after.regions60).length >= 1);
  });
}

test('replay: story cap bounds repeats of one event in the top 20 on the real snapshot', async () => {
  const snapshot = load('geopolitics');
  const scored = asScored(snapshot);
  const ranked = await rankPool(scored, 'geopolitics', { now: snapshot.generatedAt, noiseFloor: 0 });
  const perCluster = new Map();
  for (const a of ranked.articles.slice(0, 20)) perCluster.set(a.clusterId, (perCluster.get(a.clusterId) || 0) + 1);
  assert.ok(Math.max(...perCluster.values()) <= 2);
});
