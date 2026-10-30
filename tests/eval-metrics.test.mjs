import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mean,
  sd,
  median,
  quantile,
  share,
  distinctCount,
  tiedItems,
  tally,
  prf,
  prfFromLabels,
  precisionAtK,
  dcg,
  ndcg,
  auc,
  bestF1,
  jaccard,
  flattenNumbers,
} from '../scripts/eval/metrics.mjs';
import { computeFrontPageMetrics, gradeArticle, entryGrade, normLink } from '../scripts/eval/frontpages.mjs';
import { stampUtc } from '../scripts/eval/capture.mjs';
import { direction, renderCompare } from '../scripts/eval/vitals.mjs';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('descriptive stats', () => {
  close(mean([1, 2, 3, 4]), 2.5);
  close(sd([2, 4, 4, 4, 5, 5, 7, 9]), 2); // classic population-SD example
  close(median([5, 1, 3]), 3);
  close(median([1, 2, 3, 4]), 2.5);
  close(quantile([0, 10], 0.25), 2.5);
  close(share([1, 2, 3, 4], (x) => x > 2), 0.5);
  assert.equal(distinctCount([1, 1, 2, 3.0000001], 3), 3);
  assert.equal(tiedItems([1, 1, 2, 3, 3, 3]), 5);
  assert.deepEqual(tally(['a', 'b', 'a']), [['a', 2], ['b', 1]]);
});

test('empty input never yields NaN', () => {
  for (const v of [mean([]), sd([]), median([]), quantile([], 0.5), share([], Boolean), precisionAtK([], 10), ndcg([], 10), prf(0, 0, 0).f1]) {
    assert.equal(v, 0);
  }
  assert.equal(auc([], [1]), null);
});

test('precision / recall / F1', () => {
  const r = prf(8, 2, 4);
  close(r.precision, 0.8);
  close(r.recall, 8 / 12);
  close(r.f1, (2 * 0.8 * (8 / 12)) / (0.8 + 8 / 12));
  const c = prfFromLabels([true, true, false, false, true], [true, false, true, false, true]);
  assert.deepEqual([c.tp, c.fp, c.fn, c.tn], [2, 1, 1, 1]);
  close(c.precision, 2 / 3);
  close(c.recall, 2 / 3);
});

test('precision@k handles short lists and graded relevance', () => {
  close(precisionAtK([1, 0, 1, 1], 2), 0.5);
  close(precisionAtK([1, 0], 10), 0.5); // clipped to list length
  close(precisionAtK([3, 0, 2], 3), 2 / 3);
});

test('DCG / NDCG', () => {
  close(dcg([3, 2, 1], 3), 3 + 2 / Math.log2(3) + 1 / 2);
  close(ndcg([3, 2, 1], 3), 1); // already ideal
  assert.ok(ndcg([1, 2, 3], 3) < 1);
  close(ndcg([0, 0, 0], 3), 0);
  // ideal drawn from a larger pool lowers the score when relevant items were missed
  assert.ok(ndcg([1, 0], 2, { pool: [3, 1] }) < ndcg([1, 0], 2));
  // exponential gain
  close(dcg([3], 1, { exponential: true }), 7);
});

test('AUC counts ties as half', () => {
  close(auc([3, 4], [1, 2]), 1);
  close(auc([1, 2], [3, 4]), 0);
  close(auc([1, 2], [1, 2]), 0.5);
  close(auc([2], [2]), 0.5);
});

test('bestF1 finds the separating threshold', () => {
  const scores = [10, 9, 8, 3, 2, 1];
  const truth = [true, true, true, false, false, false];
  const hi = bestF1(scores, truth);
  close(hi.f1, 1);
  const lo = bestF1(scores, truth.map((t) => !t), { lowIsPositive: true });
  close(lo.f1, 1);
});

test('jaccard and flattenNumbers', () => {
  close(jaccard(['a', 'b'], ['b', 'c']), 1 / 3);
  assert.deepEqual(flattenNumbers({ a: { b: 1, c: 'x', d: [1] }, e: 2, f: null }), { 'a.b': 1, e: 2 });
});

test('front-page grading and metrics', () => {
  assert.equal(entryGrade(1), 3);
  assert.equal(entryGrade(5), 2);
  assert.equal(entryGrade(9), 1);
  assert.equal(normLink('https://www.example.com/a/b/?utm=1#x'), 'example.com/a/b');
  const entries = [
    { outlet: 'A', rank: 1, title: 'Prime minister survives confidence vote in parliament', link: 'https://a.com/1' },
    { outlet: 'B', rank: 2, title: 'Prime minister survives confidence vote after long debate', link: 'https://b.com/9' },
    { outlet: 'A', rank: 8, title: 'Central bank holds rates steady', link: 'https://a.com/2' },
  ];
  const ranked = [
    { title: 'Completely unrelated cooking feature', link: 'https://x.com/0' },
    { title: 'Prime minister survives confidence vote', link: 'https://x.com/1' }, // title match to two outlets
    { title: 'Anything', link: 'https://a.com/2?ref=rss' }, // link match
  ];
  assert.equal(gradeArticle(ranked[0], entries), 0);
  assert.equal(gradeArticle(ranked[2], entries), 1);
  assert.equal(gradeArticle(ranked[1], entries), 4); // grade 3 + one extra outlet
  const m = computeFrontPageMetrics(ranked, entries, { k: 3 });
  close(m.precisionAtK, 2 / 3, 1e-3);
  assert.ok(m.ndcgAtK > 0 && m.ndcgAtK < 1);
  assert.equal(computeFrontPageMetrics([], entries), null);
});

test('capture helpers and compare renderer', () => {
  assert.equal(stampUtc(new Date(Date.UTC(2026, 9, 29, 7, 5))), '2026-10-29-0705');
  assert.equal(direction('x.shareAt100'), 'lower');
  assert.equal(direction('x.sdDisplay'), 'higher');
  const a = { snapshots: { s: { editions: { finance: { shareAt100: 0.1, sdDisplay: 5 } } } }, labelled: {} };
  const b = { snapshots: { s: { editions: { finance: { shareAt100: 0.3, sdDisplay: 4 } } } }, labelled: {} };
  const md = renderCompare(a, b, 'base');
  assert.match(md, /better/);
  assert.match(md, /2 metric/);
});
