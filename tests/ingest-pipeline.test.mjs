import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS,
  rankOf,
  compareRank,
  outletKey,
  withLayer,
  applyBreadth,
  applyLeadBonuses,
  applyNoiseFloor,
  diversify,
  capByOutlet,
  limitPerStory,
  trimClusters,
  regionShare,
} from '../lib/ingestion/pipeline.mjs';

const display = (r) => Math.max(0, Math.min(100, Math.round(r)));

function mk(id, host, rank, extra = {}) {
  return {
    id,
    title: `Story ${id}`,
    link: `https://${host}/a/${id}`,
    sourceName: extra.sourceName || host,
    publishedAt: extra.publishedAt ?? 1_000_000,
    rankScore: rank,
    finalCurationScore: display(rank),
    score: display(rank),
    scoreBreakdown: [{ key: 'base', label: 'Base', delta: rank }],
    clusterId: extra.clusterId ?? null,
    region: extra.region ?? null,
  };
}

const sum = (a) => a.scoreBreakdown.reduce((t, l) => t + l.delta, 0);

test('compareRank: rankScore desc, then newest, then id; total order', () => {
  const a = mk('a', 'x.com', 50, { publishedAt: 10 });
  const b = mk('b', 'x.com', 50, { publishedAt: 20 });
  const c = mk('c', 'x.com', 50, { publishedAt: 20 });
  const d = mk('d', 'x.com', 60, { publishedAt: 1 });
  const sorted = [a, c, b, d].sort(compareRank).map((x) => x.id);
  assert.deepEqual(sorted, ['d', 'b', 'c', 'a']);
  assert.deepEqual([d, c, b, a].sort(compareRank).map((x) => x.id), sorted);
});

test('rankOf prefers the unclamped rankScore over the display score', () => {
  assert.equal(rankOf({ rankScore: 112.4, finalCurationScore: 100, score: 100 }), 112.4);
  assert.equal(rankOf({ finalCurationScore: 70 }), 70);
  assert.equal(rankOf({}), 0);
});

test('outletKey groups feeds of one outlet and handles multi-part TLDs', () => {
  assert.equal(outletKey({ link: 'https://www.bbc.co.uk/news/1' }), 'bbc.co.uk');
  assert.equal(outletKey({ link: 'https://www.bbc.com/news/1' }), 'bbc.com');
  assert.equal(outletKey({ link: 'https://www.theguardian.com/world/x' }), 'theguardian.com');
  assert.equal(outletKey({ link: 'https://economictimes.indiatimes.com/x' }), 'indiatimes.com');
  assert.equal(outletKey({ link: 'https://www.abc.net.au/news/x' }), 'abc.net.au');
  assert.equal(outletKey({ link: 'https://news.google.com/rss/articles/abc', sourceName: 'Reuters' }), 'Reuters');
  assert.equal(outletKey({ link: 'not a url', sourceName: 'Fallback' }), 'Fallback');
});

test('withLayer moves rank and display together and keeps the receipt reconciled', () => {
  const a = mk('a', 'x.com', 80.3);
  const b = withLayer(a, { key: 'breadth', label: 'Covered by 4 outlets', delta: 7.5 }, 'geopolitics', display);
  assert.equal(b.rankScore, 87.8);
  assert.equal(b.finalCurationScore, display(87.8));
  assert.equal(b.score, b.finalCurationScore);
  assert.equal(b.scoreBreakdown.length, 2);
  assert.ok(Math.abs(sum(b) - b.rankScore) < 1e-9);
  assert.equal(a.scoreBreakdown.length, 1, 'input is not mutated');
});

test('applyBreadth: lead gets the bonus, members are penalised, receipts reconcile', () => {
  const lead = mk('l', 'a.com', 90);
  const dup = mk('d', 'b.com', 85);
  const synd = mk('s', 'c.com', 84);
  const solo = mk('o', 'd.com', 70);
  const clusters = [
    { id: 'c1', articleIds: ['d', 'l', 's'], breadth: 3, syndicated: ['s'] },
    { id: 'c2', articleIds: ['o'], breadth: 1 },
  ];
  const { articles, leads } = applyBreadth([dup, solo, lead, synd], clusters, {
    edition: 'geopolitics',
    bonusFn: (n) => (n > 1 ? 4 * (n - 1) : 0),
    display,
  });
  const by = Object.fromEntries(articles.map((a) => [a.id, a]));
  assert.equal(leads.get('c1'), 'l');
  assert.equal(by.l.rankScore, 98);
  assert.equal(by.l.scoreBreakdown.at(-1).key, 'breadth');
  assert.equal(by.l.corroboration, 8);
  assert.equal(by.d.rankScore, 85 - LIMITS.DUPLICATE_PENALTY);
  assert.equal(by.d.scoreBreakdown.at(-1).key, 'duplicate');
  assert.equal(by.s.rankScore, 84 - LIMITS.SYNDICATED_PENALTY);
  assert.equal(by.s.scoreBreakdown.at(-1).key, 'syndicated');
  assert.equal(by.d.corroboration, -LIMITS.DUPLICATE_PENALTY);
  assert.equal(by.o.rankScore, 70, 'singletons are untouched');
  assert.equal(by.o.corroboration, 0);
  for (const a of articles) assert.ok(Math.abs(sum(a) - a.rankScore) < 1e-9, `receipt sums for ${a.id}`);
  assert.deepEqual(articles.map((a) => a.id), ['d', 'o', 'l', 's'], 'input order preserved');
});

test('applyBreadth with a zero bonus curve still penalises duplicates and leaves leads alone', () => {
  const clusters = [{ id: 'c', articleIds: ['a', 'b'], breadth: 2 }];
  const { articles } = applyBreadth([mk('a', 'x.com', 80), mk('b', 'y.com', 70)], clusters, {
    bonusFn: () => 0,
    display,
  });
  assert.equal(articles[0].rankScore, 80);
  assert.equal(articles[0].scoreBreakdown.length, 1);
  assert.equal(articles[1].rankScore, 70 - LIMITS.DUPLICATE_PENALTY);
});

test('applyBreadth: lead is chosen by rank, not by input or cluster order', () => {
  const clusters = [{ id: 'c', articleIds: ['b', 'a'], breadth: 2 }];
  const run = (list) =>
    applyBreadth(list, clusters, { bonusFn: () => 5, display }).articles.find((a) => a.scoreBreakdown.some((l) => l.key === 'breadth')).id;
  const a = mk('a', 'x.com', 80);
  const b = mk('b', 'y.com', 90);
  assert.equal(run([a, b]), 'b');
  assert.equal(run([b, a]), 'b');
});

test('applyLeadBonuses adds a signals layer to the lead only', () => {
  const a = mk('a', 'x.com', 80);
  const b = mk('b', 'y.com', 70);
  const out = applyLeadBonuses([a, b], new Map([['c1', 'a']]), new Map([['c1', { points: 3, notes: ['spike'] }]]), { display });
  assert.equal(out[0].rankScore, 83);
  assert.equal(out[0].scoreBreakdown.at(-1).key, 'signals');
  assert.equal(out[1], b);
  assert.equal(applyLeadBonuses([a], new Map(), new Map(), { display })[0], a);
});

test('applyNoiseFloor drops by display score', () => {
  const list = [mk('a', 'x.com', 40), mk('b', 'x.com', 31.4), mk('c', 'x.com', 31.6)];
  assert.deepEqual(applyNoiseFloor(list, 32).map((a) => a.id), ['a', 'c']);
});

function dominated() {
  // 12 articles from one outlet outrank everything, then 25 outlets with 1 each
  const list = [];
  for (let i = 0; i < 12; i++) list.push(mk(`big${i}`, 'big.com', 100 - i, { clusterId: `big${i}` }));
  for (let i = 0; i < 25; i++) list.push(mk(`s${i}`, `site${i}.com`, 80 - i, { clusterId: `s${i}` }));
  return list.sort(compareRank);
}

test('capByOutlet: <= 3 per outlet in the top 10 and <= 5 in the top 20', () => {
  const out = capByOutlet(dominated());
  const count = (n, host) => out.slice(0, n).filter((a) => outletKey(a) === host).length;
  assert.ok(count(10, 'big.com') <= 3);
  assert.ok(count(20, 'big.com') <= 5);
  assert.equal(out.length, 37, 'nothing is dropped, only deferred');
  assert.equal(new Set(out.map((a) => a.id)).size, 37);
});

test('capByOutlet is configurable', () => {
  const out = capByOutlet(dominated(), { max10: 1, max20: 2 });
  assert.equal(out.slice(0, 10).filter((a) => outletKey(a) === 'big.com').length, 1);
  assert.equal(out.slice(0, 20).filter((a) => outletKey(a) === 'big.com').length, 2);
});

test('capByOutlet falls back to the best remaining when the caps cannot be met', () => {
  const only = Array.from({ length: 8 }, (_, i) => mk(`a${i}`, 'one.com', 90 - i)).sort(compareRank);
  const out = capByOutlet(only);
  assert.equal(out.length, 8);
  assert.deepEqual(out.map((a) => a.id), only.map((a) => a.id), 'order is the rank order when nothing else exists');
});

test('limitPerStory: <= 2 items of one story in the top 20, extras deferred', () => {
  const list = [];
  for (let i = 0; i < 6; i++) list.push(mk(`e${i}`, `o${i}.com`, 100 - i, { clusterId: 'election' }));
  for (let i = 0; i < 20; i++) list.push(mk(`x${i}`, `p${i}.com`, 60 - i, { clusterId: `x${i}` }));
  const out = limitPerStory(list.sort(compareRank));
  assert.ok(out.slice(0, 20).filter((a) => a.clusterId === 'election').length <= 2);
  assert.equal(out.length, 26);
  assert.ok(out.slice(20).filter((a) => a.clusterId === 'election').length >= 4, 'deferred items follow the top 20');
});

test('diversify is deterministic and independent of input order', () => {
  const list = dominated();
  const a = diversify([...list].sort(compareRank), { limit: 20 }).map((x) => x.id);
  const b = diversify([...list].reverse().sort(compareRank), { limit: 20 }).map((x) => x.id);
  assert.deepEqual(a, b);
  assert.equal(a.length, 20);
});

test('trimClusters keeps clusters with a final member and recomputes their fields', () => {
  const a = mk('a', 'x.com', 90);
  const b = mk('b', 'y.com', 80);
  const c = mk('c', 'z.com', 70);
  const clusters = [
    { id: 'k1', articleIds: ['b', 'a', 'gone'], sources: [], size: 3 },
    { id: 'k2', articleIds: ['c'], sources: [], size: 1 },
    { id: 'k3', articleIds: ['gone'], sources: [], size: 1 },
  ];
  const out = trimClusters(clusters, [a, b, c], new Set(['a', 'b']));
  assert.deepEqual(out.map((k) => k.id), ['k1'], 'k2 has no final member, k3 has no survivor');
  assert.deepEqual(out[0].articleIds, ['a', 'b']);
  assert.equal(out[0].size, 2);
  assert.equal(out[0].score, 90);
  assert.deepEqual(out[0].sources, ['x.com', 'y.com']);
});

test('regionShare sums to ~1 and buckets untagged items as other', () => {
  const list = [
    mk('1', 'a.com', 1, { region: 'india' }),
    mk('2', 'a.com', 1, { region: 'india' }),
    mk('3', 'a.com', 1, { region: 'africa' }),
    mk('4', 'a.com', 1),
  ];
  const share = regionShare(list);
  assert.deepEqual(share, { india: 0.5, africa: 0.25, other: 0.25 });
  assert.deepEqual(regionShare([]), {});
});

test('capByOutlet: a loose cap over the top 60 keeps one outlet from filling the brief', () => {
  const list = [];
  for (let i = 0; i < 70; i++) list.push(mk(`big${i}`, 'big.com', 200 - i, { clusterId: `b${i}` }));
  for (let i = 0; i < 70; i++) list.push(mk(`o${i}`, `site${i % 14}.com`, 100 - i / 10, { clusterId: `o${i}` }));
  const out = capByOutlet(list.sort(compareRank), { limit: 60 });
  assert.equal(out.length, 60);
  assert.equal(out.filter((a) => outletKey(a) === 'big.com').length, LIMITS.OUTLET_TOP_C_MAX);
});
