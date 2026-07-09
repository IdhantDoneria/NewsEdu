import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreArticleAsync,
  scoreArticlesAsync,
} from '../lib/scoring/index.mjs';

const now = Date.now();

const sampleGeo = {
  title: 'Russia and Ukraine agree ceasefire; NATO to weigh sanctions relief',
  summary: 'Kremlin negotiators signed the 30-day pause in Geneva.',
  link: 'https://www.reuters.com/x',
  publishedAt: now - 15 * 60 * 1000,
  source: { name: 'Reuters', trust: 19, authority: 9 },
};

const sampleFin = {
  title: '$AAPL files 10-K disclosing $394bn revenue and 25.3% margins',
  summary: 'Apple ($AAPL) filed its SEC 10-K yesterday, reporting EPS of $6.14.',
  link: 'https://www.sec.gov/edgar/apple-10k-2024',
  publishedAt: now - 15 * 60 * 1000,
  source: { name: 'SEC', trust: 20, authority: 10 },
};

test('scoreArticleAsync returns all three integer fields', async () => {
  const s = await scoreArticleAsync(sampleGeo, 'geopolitics');
  for (const k of ['geopoliticalScore', 'financialScore', 'finalCurationScore']) {
    assert.ok(Number.isInteger(s[k]), `${k} must be integer, got ${s[k]}`);
    assert.ok(s[k] >= 0 && s[k] <= 100, `${k} out of range`);
  }
});

test('finalCurationScore mirrors geopoliticalScore for geopolitics edition', async () => {
  const s = await scoreArticleAsync(sampleGeo, 'geopolitics');
  assert.equal(s.finalCurationScore, s.geopoliticalScore);
});

test('finalCurationScore mirrors financialScore for finance edition', async () => {
  const s = await scoreArticleAsync(sampleFin, 'finance');
  assert.equal(s.finalCurationScore, s.financialScore);
});

test('scoreArticlesAsync scores a batch concurrently and preserves order', async () => {
  const batch = [sampleGeo, sampleFin, sampleGeo, sampleFin];
  const results = await scoreArticlesAsync(batch, 'geopolitics');
  assert.equal(results.length, 4);
  for (const r of results) {
    assert.ok(Number.isInteger(r.finalCurationScore));
    assert.equal(r.finalCurationScore, r.geopoliticalScore);
  }
});

test('scoreArticleAsync degrades gracefully for a bad input', async () => {
  const s = await scoreArticleAsync(null, 'finance');
  assert.equal(s.geopoliticalScore, 0);
  assert.equal(s.financialScore, 0);
  assert.equal(s.finalCurationScore, 0);
});

test('scoreArticlesAsync yields to microtasks — batches do not block', async () => {
  // Interleave scoring work with a microtask that must run mid-batch. If
  // scoreArticlesAsync serialised the whole batch in one tick, the flag
  // below would still be `false` when scoring completed.
  let midBatchTaskFired = false;
  const largeBatch = Array.from({ length: 100 }, (_, i) => ({
    ...sampleGeo,
    title: sampleGeo.title + ' ' + i,
    link: sampleGeo.link + '?i=' + i,
  }));
  queueMicrotask(() => {
    midBatchTaskFired = true;
  });
  await scoreArticlesAsync(largeBatch, 'geopolitics');
  assert.equal(midBatchTaskFired, true);
});
