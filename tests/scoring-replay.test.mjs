import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scoreArticlesAsync } from '../lib/scoring/index.mjs';
import { NOISE_FLOOR } from '../lib/score.js';

// Replays the production snapshots (post-cap top 60 per edition) through the
// scorer offline. Skipped when the fixtures are not present in this checkout.
const DIR = new URL('./fixtures/snapshots/2026-10-29/', import.meta.url);
const sd = (a) => {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
};
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

for (const edition of ['geopolitics', 'finance']) {
  const file = new URL(`news-${edition}.json`, DIR);
  const present = fs.existsSync(file);

  test(`snapshot replay (${edition}): spread, ties, recency, noise floor and receipts`, { skip: !present && 'snapshot fixture not present' }, async () => {
    const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
    const now = snap.generatedAt;
    const arts = snap.articles.map((a) => ({ ...a, ageHours: (now - a.publishedAt) / 36e5 }));
    const res = await scoreArticlesAsync(arts, edition, { now });

    // Receipt reconciles exactly with the sort key, for every article.
    res.forEach((r) => assert.equal(r.scoreBreakdown.reduce((s, l) => s + l.delta, 0), r.rankScore));

    const rows = arts.map((a, i) => ({ a, r: res[i] })).sort((x, y) => y.r.rankScore - x.r.rankScore);
    const keys = rows.map((x) => x.r.rankScore);
    const disp = rows.map((x) => x.r.finalCurationScore);

    // Baseline (pre-change): 2% at 100, SD 4-6, 14-17 distinct values, 45 of the top 50 tied.
    assert.ok(disp.filter((d) => d >= 100).length / disp.length <= 0.02, 'mass ties at 100');
    assert.ok(sd(disp) >= 8, `display SD ${sd(disp)}`);
    assert.ok(new Set(keys).size >= 55, `distinct sort keys ${new Set(keys).size}`);
    const top50 = keys.slice(0, 50);
    const tied = top50.filter((k) => top50.filter((x) => x === k).length > 1).length;
    assert.ok(tied <= 4, `${tied} tied in the top 50`);

    // Recency: no stale story in the top 20 of either edition.
    const ages = rows.slice(0, 20).map((x) => x.a.ageHours);
    assert.ok(median(ages) <= 12, `median age of top 20 ${median(ages)}h`);
    assert.ok(ages.filter((h) => h > 24).length <= 2, 'stale items in the top 20');

    // The noise floor binds on the soft/off-topic tail but keeps most of the pool.
    const survive = disp.filter((d) => d >= NOISE_FLOOR).length / disp.length;
    assert.ok(survive >= 0.8 && survive < 1, `survivors ${survive}`);
  });
}
