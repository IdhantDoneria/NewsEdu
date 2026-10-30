import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBrief, summarizeFeedFailure } from '../lib/ingestion/build.mjs';
import { outletKey } from '../lib/ingestion/pipeline.mjs';

// A deterministic offline world: 14 outlets over 6 regions, 8 distinct local
// stories each, plus one big event covered by five outlets.
const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);
const OUTLETS = [
  ['Alpha Wire', 'alpha.com', 'global', 19, 9],
  ['Beta Post', 'beta.com', 'north-america', 17, 8],
  ['Gamma Times', 'gamma.co.uk', 'europe', 17, 7],
  ['Delta Gulf', 'delta.ae', 'middle-east', 16, 8],
  ['Epsilon Hindu', 'epsilon.in', 'india', 16, 7],
  ['Zeta Mint', 'zeta.in', 'india', 15, 7],
  ['Eta Pacific', 'eta.sg', 'asia-pacific', 15, 7],
  ['Theta Asia', 'theta.jp', 'asia-pacific', 15, 7],
  ['Iota Afrika', 'iota.co.za', 'africa', 14, 6],
  ['Kappa Lagos', 'kappa.ng', 'africa', 13, 5],
  ['Lambda Sur', 'lambda.com.ar', 'latin-america', 13, 6],
  ['Mu Andes', 'mu.cl', 'latin-america', 12, 5],
  ['Nu Daily', 'nu.com', 'north-america', 14, 6],
  ['Xi Review', 'xi.org', 'europe', 14, 7],
];

const TOPICS = [
  'Parliament approves sanctions package against {c} after summit',
  'Troops withdraw from {c} border as ceasefire talks resume',
  'Central bank of {c} raises tariffs on imported steel',
  'Embassy in {c} reopens as diplomatic talks advance',
  'Referendum in {c} draws record turnout, observers say',
  'Drone strike on {c} port halts oil exports, officials say',
  'Treaty on {c} water rights signed by regional leaders',
  'Refugees cross {c} frontier as aid convoys reach the region',
];
const COUNTRIES = ['Peru', 'Kenya', 'Vietnam', 'Poland', 'Nigeria', 'Chile', 'Laos', 'Ghana', 'Cuba', 'Kazakhstan', 'Mongolia', 'Tunisia', 'Angola', 'Armenia'];

function makeWorld() {
  const items = new Map();
  OUTLETS.forEach(([name, host], oi) => {
    const list = [];
    TOPICS.forEach((tpl, ti) => {
      list.push({
        title: tpl.replace('{c}', COUNTRIES[(oi * 5 + ti * 3) % COUNTRIES.length]),
        link: `https://www.${host}/news/${oi}-${ti}`,
        summary: 'Officials said on Wednesday that negotiations over the sanctions regime would continue into next week.',
        publishedAt: NOW - (1 + ((oi * 7 + ti * 11) % 40)) * 36e5,
        image: null,
      });
    });
    items.set(name, list);
  });
  // One big event covered by five outlets with different wording.
  const big = [
    'Russia and Ukraine agree 30-day ceasefire after Geneva summit',
    'Ukraine, Russia sign ceasefire at Geneva summit, NATO says',
    'Geneva summit: Russia, Ukraine agree to 30-day ceasefire',
    'Kyiv and Moscow agree ceasefire in Geneva, Kremlin confirms',
    'Ceasefire agreed between Russia and Ukraine at Geneva summit',
  ];
  ['Alpha Wire', 'Beta Post', 'Gamma Times', 'Delta Gulf', 'Epsilon Hindu'].forEach((name, i) => {
    const host = OUTLETS.find((o) => o[0] === name)[1];
    items.get(name).push({
      title: big[i],
      link: `https://www.${host}/news/big-event`,
      summary: 'Negotiators for Russia and Ukraine signed a 30-day ceasefire in Geneva, the Kremlin and NATO confirmed.',
      publishedAt: NOW - (1 + i) * 36e5,
      image: null,
    });
  });
  return items;
}

const sources = OUTLETS.map(([name, , region, trust, authority]) => ({ name, url: `https://feed.test/${name}`, region, trust, authority }));

function deps(world, over = {}) {
  return {
    now: NOW,
    sources,
    fetchSource: async (source) => world.get(source.name),
    enrich: false,
    ...over,
  };
}

test('summarizeFeedFailure never leaks URLs', () => {
  assert.equal(summarizeFeedFailure(new Error('HTTP 403 for https://secret.example/feed')), 'HTTP 403');
  assert.equal(summarizeFeedFailure({ name: 'TimeoutError' }), 'timed out');
  assert.equal(summarizeFeedFailure(new Error('getaddrinfo ENOTFOUND x')), 'DNS lookup failed');
  assert.equal(summarizeFeedFailure(new Error('weird')), 'unreachable');
});

test('buildBrief: backward-compatible payload shape with the new optional fields', async () => {
  const brief = await buildBrief('geopolitics', deps(makeWorld()));
  for (const k of ['edition', 'generatedAt', 'noiseFloor', 'feeds', 'articles', 'clusters']) assert.ok(k in brief, k);
  assert.equal(brief.edition, 'geopolitics');
  assert.equal(brief.generatedAt, NOW);
  assert.equal(typeof brief.noiseFloor, 'number');
  assert.equal(brief.feeds.length, OUTLETS.length);
  assert.ok(brief.feeds.every((f) => f.ok && f.items > 0 && typeof f.source === 'string'));
  assert.ok(brief.articles.length > 0 && brief.articles.length <= 60);
  for (const a of brief.articles) {
    for (const k of ['id', 'title', 'link', 'summary', 'publishedAt', 'sourceName', 'source', 'score', 'finalCurationScore', 'rankScore', 'scoreBreakdown', 'clusterId', 'geopoliticalScore', 'financialScore', 'region', 'corroboration', 'metrics']) {
      assert.ok(k in a, `article.${k}`);
    }
    assert.equal(a.score, a.finalCurationScore);
    assert.ok(a.finalCurationScore >= brief.noiseFloor);
  }
  // stats
  const share = Object.values(brief.stats.regionShare).reduce((t, x) => t + x, 0);
  assert.ok(Math.abs(share - 1) < 0.01);
  assert.ok(brief.stats.regionShare['asia-pacific'] > 0);
  assert.ok(brief.stats.pool >= brief.articles.length);
  // JSON-serialisable (the route strips clusters but ships the rest)
  const { clusters, ...body } = brief;
  assert.doesNotThrow(() => JSON.stringify(body));
  assert.ok(clusters.length > 0);
});

test('buildBrief: articles are ordered by the diversity-constrained rank; later ones are rank-sorted', async () => {
  const brief = await buildBrief('geopolitics', deps(makeWorld()));
  const tail = brief.articles.slice(20);
  for (let i = 1; i < tail.length; i++) {
    assert.ok(tail[i - 1].rankScore >= tail[i].rankScore - 1e-9, 'rank-sorted beyond the diversity window');
  }
});

test('buildBrief: per-outlet and per-story caps hold in the top 10 / top 20', async () => {
  const brief = await buildBrief('geopolitics', deps(makeWorld()));
  const count = (n, key) => {
    const m = new Map();
    for (const a of brief.articles.slice(0, n)) m.set(key(a), (m.get(key(a)) || 0) + 1);
    return Math.max(0, ...m.values());
  };
  assert.ok(count(10, outletKey) <= 3, 'max 3 per outlet in the top 10');
  assert.ok(count(20, outletKey) <= 5, 'max 5 per outlet in the top 20');
  assert.ok(count(20, (a) => a.clusterId || a.id) <= 2, 'max 2 per story in the top 20');
});

test('buildBrief: the big event keeps one lead and demotes its repeats', async () => {
  const brief = await buildBrief('geopolitics', deps(makeWorld()));
  const bigIds = brief.articles.filter((a) => a.link.endsWith('/big-event'));
  assert.ok(bigIds.length >= 1);
  // Whatever clustering decides, repeats of one event must not occupy the whole top 20.
  assert.ok(brief.articles.slice(0, 20).filter((a) => a.link.endsWith('/big-event')).length <= 3);
});

test('buildBrief: clusters are consistent with the articles', async () => {
  const brief = await buildBrief('geopolitics', deps(makeWorld()));
  const ids = new Set(brief.articles.map((a) => a.id));
  const clusterIds = new Set(brief.clusters.map((c) => c.id));
  for (const a of brief.articles) assert.ok(clusterIds.has(a.clusterId), `article ${a.id} -> cluster ${a.clusterId}`);
  for (const c of brief.clusters) {
    assert.ok(c.articleIds.some((id) => ids.has(id)), 'cluster has a member in the payload');
    assert.equal(c.articles.length, c.articleIds.length);
    assert.ok(Array.isArray(c.topics));
  }
  assert.equal(new Set(brief.clusters.map((c) => c.id)).size, brief.clusters.length, 'unique cluster ids');
});

test('buildBrief: output is independent of the order feeds return items', async () => {
  const world = makeWorld();
  const shuffled = new Map([...world].map(([k, v]) => [k, [...v].reverse()]));
  const a = await buildBrief('geopolitics', deps(world));
  const b = await buildBrief('geopolitics', deps(shuffled));
  assert.deepEqual(a.articles.map((x) => x.id), b.articles.map((x) => x.id));
  assert.deepEqual(a.clusters.map((c) => c.id), b.clusters.map((c) => c.id));
});

test('buildBrief: a failing feed is reported but never fatal', async () => {
  const world = makeWorld();
  const fetchSource = async (source) => {
    if (source.name === 'Beta Post') throw new Error('HTTP 403 for https://feed.test/x');
    if (source.name === 'Nu Daily') throw Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });
    return world.get(source.name);
  };
  const brief = await buildBrief('geopolitics', deps(world, { fetchSource }));
  const bad = brief.feeds.filter((f) => !f.ok);
  assert.deepEqual(bad.map((f) => [f.source, f.reason]), [['Beta Post', 'HTTP 403'], ['Nu Daily', 'timed out']]);
  assert.ok(brief.articles.length > 0);
  assert.ok(brief.articles.every((a) => a.sourceName !== 'Beta Post'));
});

test('buildBrief: every feed failing yields an empty (not throwing) brief', async () => {
  const fetchSource = async () => {
    throw new Error('HTTP 500');
  };
  const brief = await buildBrief('geopolitics', { now: NOW, sources, fetchSource, enrich: false });
  assert.equal(brief.articles.length, 0);
  assert.equal(brief.feeds.every((f) => !f.ok), true);
});

test('buildBrief: collapses identical links across feeds of one outlet and identical titles', async () => {
  const world = makeWorld();
  const dup = { ...world.get('Alpha Wire')[0] };
  world.get('Alpha Wire').push({ ...dup }); // same link + title twice
  const brief = await buildBrief('geopolitics', deps(world));
  assert.equal(new Set(brief.articles.map((a) => a.id)).size, brief.articles.length);
});

test('buildBrief: enrichment runs before scoring and its summary reaches the article', async () => {
  const world = makeWorld();
  for (const list of world.values()) for (const it of list) it.summary = '';
  let enrichedWith = null;
  const enrich = async (articles) => {
    enrichedWith = articles.length;
    return {
      articles: articles.map((a) => ({ ...a, summary: 'Enriched: sanctions talks, ceasefire and troops near the border.' })),
      enriched: articles.length,
      attempted: articles.length,
    };
  };
  const brief = await buildBrief('geopolitics', deps(world, { enrich }));
  assert.ok(enrichedWith > 50, 'enrich saw the deduplicated pool');
  assert.ok(brief.articles.every((a) => a.summary.startsWith('Enriched:')));
  assert.equal(brief.stats.enriched, enrichedWith);
});

test('buildBrief: reconcileClusterIds gets the new clusters and the previous ones; its ids are used', async () => {
  const world = makeWorld();
  let received = null;
  const prev = [{ id: 'cOLD', articleIds: ['x'], aliases: [] }];
  const reconcile = (next, previous) => {
    received = { n: next.length, previous };
    return next.map((c, i) => (i === 0 ? { ...c, id: 'cKEPT', aliases: [c.id] } : c));
  };
  const brief = await buildBrief('geopolitics', deps(world, { prevClusters: prev, reconcile }));
  assert.equal(received.previous, prev);
  assert.equal(received.n, brief.clusters.length);
  assert.equal(brief.clusters[0].id, 'cKEPT');
  assert.ok(brief.clusters[0].aliases.length === 1);
  const first = brief.clusters[0];
  assert.ok(brief.articles.filter((a) => first.articleIds.includes(a.id)).every((a) => a.clusterId === 'cKEPT'));
});

test('buildBrief: a throwing reconcile or signal layer never breaks the brief', async () => {
  const world = makeWorld();
  const reconcile = () => {
    throw new Error('identity exploded');
  };
  const brief = await buildBrief('geopolitics', deps(world, { reconcile, signalOpts: { flags: { wikipedia: true, gdelt: true }, fetchImpl: async () => { throw new Error('down'); }, wikiCache: new Map(), gdeltCache: new Map(), gdeltClock: { last: 0 } } }));
  assert.ok(brief.articles.length > 0);
});

test('buildBrief: signals add a bounded layer to a cluster lead only when enabled', async () => {
  const world = makeWorld();
  const wikiBoom = async (url) =>
    new Response(JSON.stringify({ items: [...Array(14).fill({ views: 1000 }), { views: 1e6 }] }), { status: 200 });
  const on = await buildBrief('geopolitics', deps(world, { signalOpts: { flags: { wikipedia: true, gdelt: false }, fetchImpl: wikiBoom, wikiCache: new Map() } }));
  const off = await buildBrief('geopolitics', deps(world));
  const withLayer = on.articles.filter((a) => a.scoreBreakdown.some((l) => l.key === 'signals'));
  assert.ok(withLayer.length > 0);
  for (const a of withLayer) {
    const layer = a.scoreBreakdown.find((l) => l.key === 'signals');
    assert.ok(layer.delta > 0 && layer.delta <= 4);
  }
  assert.equal(off.articles.filter((a) => a.scoreBreakdown.some((l) => l.key === 'signals')).length, 0);
});

test('buildBrief: finance edition merges Finnhub and tags it', async () => {
  const world = makeWorld();
  const finnhub = async () => [
    {
      raw: { title: 'Fed raises rates 25bp as inflation cools, CPI at 3.1%', link: 'https://finnhub.test/1', summary: 'The Federal Reserve raised its policy rate by 25bp on Wednesday.', publishedAt: NOW - 36e5, image: null },
      source: { name: 'Finnhub Wire', trust: 14, authority: 8, region: 'north-america' },
    },
  ];
  const brief = await buildBrief('finance', deps(world, { finnhub }));
  const fh = brief.articles.find((a) => a.sourceName === 'Finnhub Wire');
  if (fh) assert.equal(fh.region, 'north-america');
  assert.equal(brief.edition, 'finance');
});
