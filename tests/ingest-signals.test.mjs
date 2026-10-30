import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIKI, wikiTitle, pageviewsUrl, spikeRatio, spikeBonus, wikipediaSignal } from '../lib/signals/wikipedia.mjs';
import { GDELT, gdeltUrl, volumeRatio, volumeBonus, gdeltSignal } from '../lib/signals/gdelt.mjs';
import { MAX_SIGNAL_BONUS, signalFlags, clusterSignalBonuses } from '../lib/signals/index.mjs';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const views = (arr) => ({ items: arr.map((v) => ({ views: v })) });
const flat = (n, v = 1000) => Array(n).fill(v);

test('signal flags are off by default and on for 1/true', () => {
  assert.deepEqual(signalFlags({}), { wikipedia: false, gdelt: false });
  assert.deepEqual(signalFlags({ SIGNAL_WIKIPEDIA: '1', SIGNAL_GDELT: '0' }), { wikipedia: true, gdelt: false });
  assert.deepEqual(signalFlags({ SIGNAL_WIKIPEDIA: 'true', SIGNAL_GDELT: '1' }), { wikipedia: true, gdelt: true });
});

test('wikiTitle capitalises entity names for the pageviews API', () => {
  assert.equal(wikiTitle('iran'), 'Iran');
  assert.equal(wikiTitle('united states'), 'United_States');
  assert.equal(wikiTitle('bank of england'), 'Bank_of_England');
  assert.equal(wikiTitle('  '), '');
  assert.equal(wikiTitle(null), '');
});

test('pageviewsUrl covers a 14-day baseline ending yesterday and encodes the title', () => {
  const now = Date.UTC(2026, 9, 29, 12);
  const url = pageviewsUrl('AT&T', now);
  assert.match(url, /per-article\/en\.wikipedia\/all-access\/user\/AT%26T\/daily\/20261014\/20261028$/);
});

test('spikeRatio needs enough data and a non-trivial baseline', () => {
  assert.equal(spikeRatio([1, 2, 3]), null);
  assert.equal(spikeRatio(flat(10, 10)), null, 'obscure pages are ignored');
  assert.equal(spikeRatio([...flat(14, 1000), 4000]), 4);
  assert.equal(spikeRatio(null), null);
});

test('spikeBonus is 0 below 2x, monotonic, and capped at 4', () => {
  assert.equal(spikeBonus(null), 0);
  assert.equal(spikeBonus(1.9), 0);
  let prev = -1;
  for (const r of [2, 3, 4, 6, 8, 16, 100, 1e6]) {
    const b = spikeBonus(r);
    assert.ok(b >= prev && b <= WIKI.MAX_BONUS, `r=${r} b=${b}`);
    prev = b;
  }
  assert.equal(spikeBonus(1e6), 4);
});

test('wikipediaSignal: fetches once per hour per title, and degrades to no signal', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    assert.match(url, /\/Iran\/daily\//);
    return json(views([...flat(14, 1000), 5000]));
  };
  const cacheMap = new Map();
  const now = 1_800_000_000_000;
  const a = await wikipediaSignal('iran', { fetchImpl, now, cacheMap });
  assert.equal(a.ratio, 5);
  assert.ok(a.points > 0 && a.points <= 4);
  await wikipediaSignal('iran', { fetchImpl, now: now + 30 * 60e3, cacheMap });
  assert.equal(calls, 1, 'cached for an hour');
  await wikipediaSignal('iran', { fetchImpl, now: now + 61 * 60e3, cacheMap });
  assert.equal(calls, 2, 'refetched after the TTL');

  const dead = async () => {
    throw new Error('network down');
  };
  assert.deepEqual(await wikipediaSignal('France', { fetchImpl: dead, cacheMap: new Map() }), { ratio: null, points: 0, title: 'France' });
  const notFound = async () => json({ type: 'not_found' }, 404);
  assert.equal((await wikipediaSignal('Nowhere', { fetchImpl: notFound, cacheMap: new Map() })).points, 0);
  const garbage = async () => new Response('<html>', { status: 200 });
  assert.equal((await wikipediaSignal('Garbage', { fetchImpl: garbage, cacheMap: new Map() })).points, 0);
  assert.equal((await wikipediaSignal('', { fetchImpl: dead })).points, 0);
});

test('wikipediaSignal sends a 2 s timeout signal', async () => {
  let sawSignal = false;
  await wikipediaSignal('Spain', {
    cacheMap: new Map(),
    fetchImpl: async (url, init) => {
      sawSignal = init.signal instanceof AbortSignal;
      return json(views(flat(15)));
    },
  });
  assert.equal(sawSignal, true);
  assert.equal(WIKI.TIMEOUT_MS, 2000);
});

const timeline = (prev, cur) => ({
  timeline: [{ data: [...Array(12).fill({ value: prev }), ...Array(12).fill({ value: cur })] }],
});

test('GDELT volume ratio and bonus are bounded', () => {
  assert.equal(volumeRatio({}), null);
  assert.equal(volumeRatio(timeline(0, 5)), null, 'too little baseline coverage');
  assert.equal(volumeRatio(timeline(10, 30)), 3);
  assert.equal(volumeBonus(null), 0);
  assert.equal(volumeBonus(1.2), 0);
  assert.ok(volumeBonus(2) > 0);
  assert.equal(volumeBonus(50), GDELT.MAX_BONUS);
  assert.match(gdeltUrl(['iran', 'united states', 'extra']), /query=%22iran%22%20%22united%20states%22$/);
});

test('gdeltSignal: caches, respects the 5 s rate limit, never throws', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return json(timeline(10, 30));
  };
  const cacheMap = new Map();
  const clock = { last: 0 };
  const t = 1_800_000_000_000;
  const a = await gdeltSignal(['iran'], { fetchImpl, now: t, cacheMap, clock });
  assert.equal(a.fetched, true);
  assert.ok(a.points > 0 && a.points <= GDELT.MAX_BONUS);
  const b = await gdeltSignal(['russia'], { fetchImpl, now: t + 1000, cacheMap, clock });
  assert.equal(b.fetched, false, 'a second uncached request within 5 s is skipped');
  assert.equal(calls, 1);
  const c = await gdeltSignal(['iran'], { fetchImpl, now: t + 2000, cacheMap, clock });
  assert.equal(c.points, a.points, 'cache hit needs no request and ignores the rate limit');
  assert.equal(calls, 1);
  const d = await gdeltSignal(['russia'], { fetchImpl, now: t + 6000, cacheMap, clock });
  assert.equal(d.fetched, true);

  const dead = async () => {
    throw new Error('boom');
  };
  const e = await gdeltSignal(['x'], { fetchImpl: dead, now: t + 20000, cacheMap, clock });
  assert.equal(e.points, 0);
  assert.equal((await gdeltSignal([], { fetchImpl })).points, 0);
});

const clusters = [
  { id: 'c1', entities: ['iran', 'israel'] },
  { id: 'c2', entities: ['china'] },
  { id: 'c3', entities: [] },
];

test('clusterSignalBonuses does nothing (no fetches) when both flags are off', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return json({});
  };
  const out = await clusterSignalBonuses(clusters, { flags: { wikipedia: false, gdelt: false }, fetchImpl });
  assert.equal(out.size, 0);
  assert.equal(calls, 0);
  const viaEnv = await clusterSignalBonuses(clusters, { env: {}, fetchImpl });
  assert.equal(viaEnv.size, 0);
  assert.equal(calls, 0);
});

test('clusterSignalBonuses: bonus <= 4 even with both signals at their maximum', async () => {
  const fetchImpl = async (url) =>
    url.includes('wikimedia') ? json(views([...flat(14, 1000), 1e6])) : json(timeline(10, 1000));
  const out = await clusterSignalBonuses(clusters, {
    flags: { wikipedia: true, gdelt: true },
    fetchImpl,
    wikiCache: new Map(),
    gdeltCache: new Map(),
    gdeltClock: { last: 0 },
  });
  assert.ok(out.has('c1'));
  assert.ok(!out.has('c3'), 'clusters without entities are skipped');
  for (const [, b] of out) {
    assert.ok(b.points > 0 && b.points <= MAX_SIGNAL_BONUS, `points ${b.points}`);
    assert.ok(b.notes.length > 0);
  }
  assert.equal(out.get('c1').points, MAX_SIGNAL_BONUS);
});

test('clusterSignalBonuses: failing APIs yield an empty result, not an error', async () => {
  const dead = async () => {
    throw new Error('down');
  };
  const out = await clusterSignalBonuses(clusters, {
    flags: { wikipedia: true, gdelt: true },
    fetchImpl: dead,
    wikiCache: new Map(),
    gdeltCache: new Map(),
    gdeltClock: { last: 0 },
  });
  assert.equal(out.size, 0);
  const weird = await clusterSignalBonuses(null, { flags: { wikipedia: true, gdelt: false }, fetchImpl: dead });
  assert.equal(weird.size, 0);
});

test('clusterSignalBonuses obeys its overall deadline', async () => {
  const hang = () => new Promise(() => {});
  const keep = setTimeout(() => {}, 2000);
  const t0 = Date.now();
  const out = await clusterSignalBonuses(clusters, {
    flags: { wikipedia: true, gdelt: false },
    fetchImpl: hang,
    wikiCache: new Map(),
    deadlineMs: 60,
  });
  clearTimeout(keep);
  assert.equal(out.size, 0);
  assert.ok(Date.now() - t0 < 1000);
});

test('clusterSignalBonuses only looks at the top K clusters', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return json(views(flat(15)));
  };
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, entities: [`entity ${i}`] }));
  await clusterSignalBonuses(many, { flags: { wikipedia: true, gdelt: false }, fetchImpl, wikiCache: new Map(), topK: 5 });
  assert.equal(calls, 5);
});
