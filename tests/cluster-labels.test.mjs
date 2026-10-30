import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clusterArticles } from '../lib/intelligence/cluster.mjs';

const NOW = Date.UTC(2026, 9, 29, 12);
const data = JSON.parse(fs.readFileSync(new URL('./fixtures/labels/cluster-pairs.json', import.meta.url), 'utf8'));
const arts = data.articles.map((a, i) => ({
  id: a.id,
  title: a.title,
  summary: a.summary || '',
  link: `https://example.com/${a.id}`,
  publishedAt: NOW - a.hoursAgo * 36e5,
  sourceName: a.sourceName,
  rankScore: 60 + (i % 23),
}));
const byId = new Map(arts.map((a) => [a.id, a]));

function prf(tp, fp, fn) {
  const p = tp / Math.max(1, tp + fp);
  const r = tp / Math.max(1, tp + fn);
  return { p, r, f1: p + r ? (2 * p * r) / (p + r) : 0 };
}

test('label set is well formed: >= 300 pairs, both classes, trap tags present', () => {
  assert.ok(data.pairs.length >= 300);
  const same = data.pairs.filter((p) => p.label === 'same').length;
  assert.ok(same >= 100 && data.pairs.length - same >= 100);
  for (const p of data.pairs) {
    assert.ok(byId.has(p.a) && byId.has(p.b), `unknown article in pair ${p.a} ${p.b}`);
    assert.ok(p.label === 'same' || p.label === 'different');
  }
  const tags = new Set(data.pairs.map((p) => p.tag));
  for (const t of ['translit', 'usuk', 'ambiguous-name', 'indian-entity']) assert.ok(tags.has(t), `tag ${t}`);
  assert.ok([...tags].some((t) => t.startsWith('shared-actors:iran')));
  assert.ok([...tags].some((t) => t.startsWith('shared-actors:russia')));
  assert.ok([...tags].some((t) => t.startsWith('same-name:georgia')));
});

test('batch clustering: precision/recall on the labelled pairs stay above the floors', () => {
  const clusters = clusterArticles(arts, 'geopolitics', { now: NOW });
  const cid = new Map();
  clusters.forEach((c, i) => c.articleIds.forEach((id) => cid.set(id, i)));
  let tp = 0, fp = 0, fn = 0;
  for (const p of data.pairs) {
    const pred = cid.get(p.a) === cid.get(p.b);
    if (p.label === 'same') pred ? tp++ : fn++;
    else if (pred) fp++;
  }
  const { p, r, f1 } = prf(tp, fp, fn);
  // The previous clustering scored P 0.96 / R 0.21 / F1 0.34 on this set.
  assert.ok(p >= 0.9, `precision ${p.toFixed(3)}`);
  assert.ok(r >= 0.65, `recall ${r.toFixed(3)}`);
  assert.ok(f1 >= 0.77, `F1 ${f1.toFixed(3)}`);
  assert.ok(Math.max(...clusters.map((c) => c.size)) <= 25);
});

test('isolated pairs: each labelled pair clustered on its own keeps precision high', () => {
  let tp = 0, fp = 0, fn = 0;
  for (const p of data.pairs) {
    const pred = clusterArticles([byId.get(p.a), byId.get(p.b)], 'geopolitics', { now: NOW }).length === 1;
    if (p.label === 'same') pred ? tp++ : fn++;
    else if (pred) fp++;
  }
  const { p, r } = prf(tp, fp, fn);
  assert.ok(p >= 0.93, `precision ${p.toFixed(3)}`);
  assert.ok(r >= 0.5, `recall ${r.toFixed(3)}`);
});

test('every verified over-merge trap from the spec stays split', () => {
  const traps = data.pairs.filter(
    (p) => p.label === 'different' && /^(shared-actors:(iran|trump\+iran|russia|russia\+ukraine)|same-name:georgia)/.test(p.tag)
  );
  assert.ok(traps.length >= 15);
  let merged = 0;
  for (const p of traps) {
    if (clusterArticles([byId.get(p.a), byId.get(p.b)], 'geopolitics', { now: NOW }).length === 1) merged++;
  }
  assert.equal(merged, 0, 'actor-only / name-only pairs must not merge');
});

test('under-merge traps: transliteration and US/UK spelling pairs merge', () => {
  const pos = data.pairs.filter((p) => p.label === 'same' && ['translit', 'usuk'].includes(p.tag));
  let merged = 0;
  for (const p of pos) {
    if (clusterArticles([byId.get(p.a), byId.get(p.b)], 'geopolitics', { now: NOW }).length === 1) merged++;
  }
  assert.ok(merged / pos.length >= 0.4, `merged ${merged}/${pos.length}`);
});
