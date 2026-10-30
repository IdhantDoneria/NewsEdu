import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  archiveBrief,
  buildSnapshot,
  readArchive,
  archiveDays,
  buildTrends,
  readTrends,
  dayOf,
  isDay,
  displayEntity,
} from '../lib/archive.mjs';

const H = 3600e3;
const D = 24 * H;
const NOW = Date.UTC(2026, 9, 29, 12, 30);

beforeEach(() => {
  for (const k of ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']) delete process.env[k];
  globalThis.__meridianKv.map.clear();
});

const article = (id, title, over = {}) => ({
  id,
  title,
  link: `https://news.example/${id}`,
  sourceName: 'Wire',
  publishedAt: NOW - H,
  rankScore: 80,
  score: 80,
  ...over,
});

function brief(at, clusters) {
  const articles = clusters.flatMap((c) => c.articles);
  return { edition: 'geopolitics', generatedAt: at, articles, clusters };
}

const cluster = (id, title, entities, topics, over = {}) => {
  const a = article(`a-${id}`, title);
  return { id, title, entities, topics, articleIds: [a.id], articles: [a], size: 1, score: 80, ...over };
};

test('buildSnapshot compacts clusters and drops everything else', () => {
  const c = cluster('c1', 'Talks resume in Geneva', ['iran', 'united states'], ['middle-east'], { aliases: ['c0'] });
  c.articles[0].summary = 'LONG BODY THAT MUST NOT BE ARCHIVED';
  const snap = buildSnapshot('geopolitics', brief(NOW, [c]));
  assert.equal(snap.at, NOW);
  assert.deepEqual(snap.stories[0], {
    id: 'c1',
    t: 'Talks resume in Geneva',
    l: 'https://news.example/a-c1',
    s: 'Wire',
    p: NOW - H,
    r: 80,
    n: 1,
    e: ['iran', 'united states'],
    tp: ['middle-east'],
    al: ['c0'],
  });
  assert.ok(!JSON.stringify(snap).includes('LONG BODY'));
});

test('buildSnapshot falls back to articles when the payload has no clusters (the /api/news shape)', () => {
  const snap = buildSnapshot('finance', {
    generatedAt: NOW,
    articles: [article('x', 'Fed holds rates', { clusterId: 'cx' }), article('y', 'Oil slips', { rankScore: 90 })],
  });
  assert.equal(snap.edition, 'finance');
  assert.deepEqual(snap.stories.map((s) => [s.id, s.t]), [[null, 'Oil slips'], ['cx', 'Fed holds rates']]);
});

test('archiveBrief stores one snapshot per hour bucket (dedupe) and indexes it', async () => {
  const mk = (at) => brief(at, [cluster('c1', 'Story one', ['iran'], [])]);
  assert.equal(await archiveBrief('geopolitics', mk(NOW)), true);
  assert.equal(await archiveBrief('geopolitics', mk(NOW + 10 * 60e3)), false); // same hour
  assert.equal(await archiveBrief('geopolitics', mk(NOW + H)), true); // next hour
  assert.equal(await archiveBrief('finance', mk(NOW)), true); // other edition independent

  const day = await readArchive('geopolitics', dayOf(NOW));
  assert.equal(day.length, 2);
  assert.ok(day[0].at < day[1].at, 'oldest first');
  assert.deepEqual(await archiveDays('geopolitics'), [dayOf(NOW)]);
  assert.equal((await readArchive('finance', dayOf(NOW))).length, 1);
});

test('archiveBrief and readers never throw and skip empty or malformed input', async () => {
  assert.equal(await archiveBrief('geopolitics', null), false);
  assert.equal(await archiveBrief('geopolitics', { articles: [] }), false);
  assert.equal(await archiveBrief('geopolitics', { articles: 'nope', clusters: 7 }), false);
  assert.deepEqual(await readArchive('geopolitics', '../etc/passwd'), []);
  assert.deepEqual(await readArchive('geopolitics', '2026-10-29'), []);
  assert.deepEqual(await archiveDays('geopolitics'), []);
  assert.equal(isDay('2026-13-45'), false);
});

test('archive entries get a 30-day TTL', async () => {
  await archiveBrief('geopolitics', brief(NOW, [cluster('c1', 'Story one', [], [])]));
  const entry = globalThis.__meridianKv.map.get(`archive:geopolitics:${dayOf(NOW)}`);
  const ttlDays = (entry.exp - Date.now()) / D;
  assert.ok(ttlDays > 29.9 && ttlDays <= 30, ttlDays);
});

// ---- trends -------------------------------------------------------------------

function snapshot(daysAgo, hour, stories) {
  const at = Date.UTC(2026, 9, 29 - daysAgo, hour);
  return { v: 1, edition: 'geopolitics', at, stories };
}
const story = (id, t, e, tp = [], extra = {}) => ({ id, t, l: `https://n/${id}`, s: 'Wire', p: 0, r: 80, n: 1, e, tp, ...extra });

test('buildTrends with no data is a clean empty state', () => {
  const t = buildTrends([], { days: 7, now: NOW });
  assert.equal(t.snapshots, 0);
  assert.equal(t.daysWithData, 0);
  assert.equal(t.hasBaseline, false);
  assert.deepEqual([t.entities, t.topics, t.rising, t.recurring], [[], [], [], []]);
  assert.equal(t.dates.length, 7);
  assert.equal(t.dates.at(-1), '2026-10-29');
});

test('buildTrends: entity counts per day count distinct stories, not snapshots', () => {
  const s1 = story('c1', 'Iran talks', ['iran']);
  const snaps = [snapshot(0, 8, [s1]), snapshot(0, 9, [s1, story('c2', 'Iran nuclear', ['iran'])])];
  const t = buildTrends(snaps, { days: 3, now: NOW });
  const iran = t.entities.find((e) => e.name === 'iran');
  assert.deepEqual(iran.series, [0, 0, 2]);
  assert.equal(iran.label, 'Iran');
  assert.equal(displayEntity('us'), 'US');
  assert.equal(displayEntity('united states'), 'United States');
});

test('buildTrends: topic share is per-day fraction and null on days without data', () => {
  const snaps = [
    snapshot(2, 8, [story('a', 'A', [], ['energy']), story('b', 'B', [], ['energy', 'china']), story('c', 'C', [], []), story('d', 'D', [], [])]),
    snapshot(0, 8, [story('e', 'E', [], ['china'])]),
  ];
  const t = buildTrends(snaps, { days: 3, now: NOW });
  const energy = t.topics.find((x) => x.id === 'energy');
  const china = t.topics.find((x) => x.id === 'china');
  assert.deepEqual(energy.share, [0.5, null, 0]);
  assert.deepEqual(china.share, [0.25, null, 1]);
  assert.equal(china.label, 'China'); // label from the topic taxonomy
});

test('buildTrends: recurring stories follow an id through aliases across days', () => {
  const snaps = [
    snapshot(2, 8, [story('c1', 'Election recount', ['x'], [], { r: 70 })]),
    snapshot(1, 8, [story('c2', 'Election recount continues', ['x'], [], { al: ['c1'], r: 90 })]),
    snapshot(0, 8, [story('c2', 'Election recount ends', ['x'], [], { r: 60 }), story('solo', 'One-day story', ['y'])]),
  ];
  const t = buildTrends(snaps, { days: 3, now: NOW });
  assert.equal(t.recurring.length, 1);
  const r = t.recurring[0];
  assert.equal(r.daysSeen, 3);
  assert.equal(r.title, 'Election recount ends'); // latest title
  assert.equal(r.peakRank, 90);
  assert.equal(t.stories, 2);
});

test('buildTrends: rising entities need a baseline, then compare recent vs earlier days', () => {
  const quiet = (day) => snapshot(day, 8, [story(`q${day}`, 'Other', ['france'])]);
  const hot = (day, n) =>
    snapshot(day, 8, Array.from({ length: n }, (_, i) => story(`h${day}-${i}`, `Taiwan ${i}`, ['taiwan'])));

  // single day: nothing can be called rising
  assert.equal(buildTrends([hot(0, 4)], { days: 7, now: NOW }).hasBaseline, false);
  assert.deepEqual(buildTrends([hot(0, 4)], { days: 7, now: NOW }).rising, []);

  const t = buildTrends([quiet(3), quiet(2), hot(1, 3), hot(0, 5), snapshot(0, 9, [story('f', 'F', ['france'])])], { days: 7, now: NOW });
  assert.equal(t.hasBaseline, true);
  assert.equal(t.rising[0].name, 'taiwan');
  assert.equal(t.rising[0].isNew, true);
  assert.equal(t.rising[0].prior, 0);
  assert.equal(t.rising[0].recent, 4);
  assert.ok(!t.rising.some((r) => r.name === 'france'), 'steady entities are not rising');
});

test('buildTrends ignores snapshots outside the window', () => {
  const t = buildTrends([snapshot(10, 8, [story('old', 'Old', ['x'])]), snapshot(0, 8, [story('new', 'New', ['y'])])], { days: 3, now: NOW });
  assert.equal(t.snapshots, 1);
  assert.deepEqual(t.entities.map((e) => e.name), ['y']);
});

test('readTrends works end to end on the in-memory store, including empty', async () => {
  const empty = await readTrends('geopolitics', 7, { now: NOW });
  assert.equal(empty.durable, false);
  assert.equal(empty.snapshots, 0);

  const c = (id, e) => cluster(id, `Story ${id}`, e, []);
  await archiveBrief('geopolitics', brief(Date.UTC(2026, 9, 27, 9), [c('c1', ['iran'])]));
  await archiveBrief('geopolitics', brief(Date.UTC(2026, 9, 28, 9), [c('c1', ['iran']), c('c2', ['iran'])]));
  await archiveBrief('geopolitics', brief(Date.UTC(2026, 9, 29, 9), [c('c1', ['iran']), c('c2', ['iran']), c('c3', ['iran'])]));
  const t = await readTrends('geopolitics', 7, { now: NOW });
  assert.equal(t.snapshots, 3);
  assert.equal(t.daysWithData, 3);
  assert.equal(t.recurring[0].id, 'c1');
  assert.equal(t.rising[0].name, 'iran');
  assert.equal((await readTrends('finance', 7, { now: NOW })).snapshots, 0);
});
