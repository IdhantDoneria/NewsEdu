import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clusterArticles } from '../lib/intelligence/cluster.mjs';

const NOW = Date.UTC(2026, 9, 29, 12);

function labelArticles() {
  const data = JSON.parse(fs.readFileSync(new URL('./fixtures/labels/cluster-pairs.json', import.meta.url), 'utf8'));
  return data.articles.map((a, i) => ({
    id: a.id,
    title: a.title,
    summary: a.summary || '',
    link: `https://example.com/${a.id}`,
    publishedAt: NOW - a.hoursAgo * 36e5,
    sourceName: a.sourceName,
    rankScore: 60 + (i % 23),
    score: 60 + (i % 23),
  }));
}

function snapshotArticles(rel, key) {
  const file = new URL(`./fixtures/snapshots/${rel}`, import.meta.url);
  if (!fs.existsSync(file)) return null;
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = j[key] || j.articles || j.items;
  return list.map((a) => ({ ...a, id: a.id || a.link, rankScore: a.rankScore ?? a.score ?? a.finalCurationScore ?? 50 }));
}

// Deterministic PRNG so a failure is reproducible.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rnd) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const view = (clusters) =>
  clusters.map((c) => ({
    id: c.id,
    title: c.title,
    articleIds: c.articleIds,
    entities: c.entities,
    sources: c.sources,
    breadth: c.breadth,
    syndicated: c.syndicated,
    earliestAt: c.earliestAt,
    latestAt: c.latestAt,
    articleOrder: c.articles.map((a) => a.id),
  }));

function permutationCheck(articles, edition, runs = 20) {
  const base = view(clusterArticles(articles, edition, { now: NOW }));
  const rnd = mulberry32(20261029);
  for (let r = 0; r < runs; r++) {
    const got = view(clusterArticles(shuffled(articles, rnd), edition, { now: NOW }));
    assert.deepEqual(got, base, `permutation ${r} changed the clustering`);
  }
  return base;
}

test('permutation: 20 shuffles of the labelled fixture leave clusters and ids unchanged', () => {
  const base = permutationCheck(labelArticles(), 'geopolitics');
  assert.ok(base.length > 50 && base.length < 298, 'sanity: some, but not all, articles merge');
  assert.equal(new Set(base.map((c) => c.id)).size, base.length, 'cluster ids are unique');
});

for (const [rel, key, edition] of [
  ['2026-10-29/news-geopolitics.json', 'articles', 'geopolitics'],
  ['2026-10-29/news-finance.json', 'articles', 'finance'],
  ['2026-10-29-1841/raw-geopolitics.json', 'items', 'geopolitics'],
  ['2026-10-29-1841/raw-finance.json', 'items', 'finance'],
]) {
  test(`permutation: 20 shuffles of ${rel} leave clusters and ids unchanged`, (t) => {
    const arts = snapshotArticles(rel, key);
    if (!arts) return t.skip('snapshot not present');
    const base = permutationCheck(arts, edition);
    assert.equal(new Set(base.map((c) => c.id)).size, base.length, 'cluster ids are unique');
    const ids = base.flatMap((c) => c.articleIds);
    assert.equal(new Set(ids).size, arts.length, 'every article lands in exactly one cluster');
  });
}

test('input articles are not mutated and the input array order is untouched', () => {
  const arts = labelArticles().slice(0, 40);
  const before = JSON.stringify(arts);
  clusterArticles(arts, 'geopolitics', { now: NOW });
  assert.equal(JSON.stringify(arts), before);
});

test('ties in publishedAt and rank are broken deterministically', () => {
  const mk = (id, title, src) => ({ id, title, link: `https://x/${id}`, summary: '', publishedAt: NOW, sourceName: src, rankScore: 70 });
  const arts = [
    mk('a', 'Tesla recalls 400,000 vehicles over steering defect', 'Reuters'),
    mk('b', 'Tesla recall: NHTSA says Model Y steering part may fail', 'CNBC'),
    mk('c', 'Tesla issues massive recall for faulty power steering', 'MarketWatch'),
  ];
  const fwd = view(clusterArticles(arts, 'finance'));
  const rev = view(clusterArticles([...arts].reverse(), 'finance'));
  assert.deepEqual(rev, fwd);
});

test('empty and single-article inputs', () => {
  assert.deepEqual(clusterArticles([], 'finance'), []);
  const [c] = clusterArticles([{ id: 'z', title: 'Lone headline about a summit', link: 'https://x/z', publishedAt: NOW, sourceName: 'BBC' }], 'finance');
  assert.equal(c.size, 1);
  assert.equal(c.breadth, 1);
  assert.deepEqual(c.syndicated, []);
});
