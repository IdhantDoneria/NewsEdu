// Loose-floor sanity tests for the evaluation harness: they must pass on the base code AND on the final code.
// They check that the harness runs on the committed snapshots and that the labelled sets are well formed,
// not that the ranking is any good (that is what `npm run eval` reports).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeAll, renderMarkdown } from '../scripts/eval/vitals.mjs';
import { loadSnapshot, replayEdition, freezeClock, EDITIONS, SNAPSHOT_ROOT } from '../scripts/eval/replay.mjs';
import { loadLabelFile, rowsOf, LABEL_DIR } from '../scripts/eval/labels.mjs';
import { loadFrontPages } from '../scripts/eval/frontpages.mjs';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const ownLabels = (name) => rowsOf(loadLabelFile(name));

test('committed snapshots exist and parse', () => {
  const dirs = fs.readdirSync(SNAPSHOT_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.ok(dirs.length >= 1);
  const snap = loadSnapshot('2026-10-29');
  for (const ed of EDITIONS) {
    assert.ok(snap.news[ed]?.articles?.length >= 20, `news-${ed}.json should hold articles`);
    assert.ok(snap.news[ed].articles[0].title);
  }
});

test('rescore replay produces a ranked, clustered pool', async () => {
  const snap = loadSnapshot('2026-10-29');
  const restore = freezeClock(snap.nowMs);
  try {
    for (const ed of EDITIONS) {
      const r = await replayEdition(snap, ed, { mode: 'rescore' });
      assert.ok(r.articles.length >= 20 && r.articles.length <= 60);
      assert.ok(r.clusters.length >= 1);
      for (const a of r.articles) {
        const key = a.rankScore ?? a.finalCurationScore ?? a.score;
        assert.ok(isNum(key), 'every replayed article has a numeric sort key');
      }
    }
  } finally {
    restore();
  }
});

test('vitals run on the snapshots without throwing and stay in sane ranges', async () => {
  const before = Date.now;
  const res = await computeAll({ snapshots: ['2026-10-29'], mode: 'rescore' });
  assert.equal(Date.now, before, 'the frozen clock must be restored');
  const snap = res.snapshots['2026-10-29'];
  for (const ed of EDITIONS) {
    const v = snap.editions[ed];
    assert.ok(v.nArticles >= 20);
    for (const k of ['shareAt100', 'shareOver24hTop20', 'outletMaxShareTop20', 'singletonClusterShare']) {
      assert.ok(v[k] >= 0 && v[k] <= 1, `${ed}.${k}=${v[k]}`);
    }
    assert.ok(isNum(v.sdDisplay) && v.sdDisplay >= 0);
    assert.ok(v.distinctDisplay >= 3, 'scores should not be constant');
    assert.ok(v.distinctEventsTop60 >= 5 && v.distinctEventsTop60 <= 60);
    assert.ok(v.distinctOutletsTop20 >= 2, 'top 20 should not be a single outlet');
    assert.ok(isNum(v.medianAgeTop20Hours) && v.medianAgeTop20Hours >= 0 && v.medianAgeTop20Hours < 72);
  }
  assert.ok(snap.briefing && !snap.briefing.skipped, 'briefing vitals should compute');
  assert.ok(snap.briefing.essentialMaxTopicShare > 0 && snap.briefing.essentialMaxTopicShare <= 1);
  const rate = snap.briefing.dayOverDay.repeatRateAll;
  assert.ok(rate >= 0 && rate <= 1);
  const md = renderMarkdown(res);
  assert.match(md, /Vitals: snapshot 2026-10-29/);
  assert.match(md, /Labelled sets/);
});

test('own labelled sets are large enough and well formed', () => {
  const svh = ownLabels('soft-vs-hard.json');
  const pump = ownLabels('pump-vs-legit.json');
  const topic = ownLabels('edition-topicality.json');
  assert.ok(svh.length >= 200 && pump.length >= 200 && topic.length >= 200);
  const count = (rows, f) => rows.filter(f).length;
  assert.ok(count(svh, (r) => r.label === 'soft') >= 50 && count(svh, (r) => r.label === 'hard') >= 50);
  assert.ok(count(pump, (r) => r.label === 'pump') >= 50 && count(pump, (r) => r.label === 'legit') >= 50);
  for (const lab of ['geopolitics', 'finance', 'off-topic']) assert.ok(count(topic, (r) => r.label === lab) >= 30, lab);
  for (const r of svh) {
    assert.ok(['soft', 'hard'].includes(r.label) && r.title && ['geopolitics', 'finance'].includes(r.edition));
  }
  for (const r of pump) assert.ok(['pump', 'legit'].includes(r.label) && r.title);
  for (const r of topic) {
    assert.ok(['geopolitics', 'finance', 'off-topic'].includes(r.label) && r.title);
    if (r.also) assert.ok(['geopolitics', 'finance'].includes(r.also) && r.also !== r.label);
  }
  for (const rows of [svh, pump, topic]) {
    const titles = rows.map((r) => r.title.toLowerCase());
    assert.equal(new Set(titles).size, titles.length, 'duplicate headline inside a set');
  }
  for (const f of ['soft-vs-hard.json', 'pump-vs-legit.json', 'edition-topicality.json']) {
    const file = loadLabelFile(f);
    assert.ok(file.method && Array.isArray(file.limits) && file.limits.length, `${f} documents method and limits`);
  }
});

test('labelled-set metrics run and the scorer is better than a coin flip at the basics', async () => {
  const res = await computeAll({ snapshots: ['2026-10-29'], mode: 'rescore' });
  const l = res.labelled;
  assert.ok(!l.softVsHard.skipped && !l.pumpVsLegit.skipped && !l.editionTopicality.skipped);
  assert.ok(l.softVsHard.aucHardOverSoft > 0.5, `soft AUC ${l.softVsHard.aucHardOverSoft}`);
  assert.ok(l.editionTopicality.aucOnOverOff > 0.5, `topicality AUC ${l.editionTopicality.aucOnOverOff}`);
  assert.ok(l.pumpVsLegit.aucLegitOverPump > 0.4, `pump AUC ${l.pumpVsLegit.aucLegitOverPump}`);
  // other streams' sets are optional; when present they must produce numbers or a skip reason, never throw
  for (const k of ['clusterPairs', 'topics', 'changeCards']) {
    assert.ok(l[k].skipped || Object.values(l[k]).some(isNum), k);
  }
});

test('front-page file (if present) has the documented shape', () => {
  const fp = loadFrontPages();
  if (!fp) return;
  assert.equal(fp.proxy, true, 'the sample must be flagged as a proxy');
  assert.ok(fp.snapshots && typeof fp.snapshots === 'object');
  for (const snap of Object.values(fp.snapshots)) {
    for (const ed of EDITIONS) {
      for (const e of snap[ed] || []) assert.ok(e.title && e.outlet && Number.isFinite(e.rank));
    }
  }
  assert.ok(LABEL_DIR.includes('labels'));
  assert.ok(fs.existsSync(path.join(SNAPSHOT_ROOT, '2026-10-29')));
});
