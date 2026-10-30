import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDITIONS, REGIONS, regionOf } from '../lib/feeds.js';
import { fetchFeed, fetchSourceFeed } from '../lib/rss.js';

const now = Date.now();
const rfc = (offsetMin) => new Date(now - offsetMin * 60e3).toUTCString();

function rss(items) {
  return (
    `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>` +
    items
      .map(
        (it) =>
          `<item><title><![CDATA[${it.title}]]></title><link>${it.link}</link>` +
          `<description>${it.description ?? ''}</description><pubDate>${rfc(it.ageMin ?? 5)}</pubDate></item>`
      )
      .join('') +
    `</channel></rss>`
  );
}

const xmlResponse = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'application/rss+xml' } });

test('registry: every source has a valid region, ranges, https url and unique name', () => {
  for (const [edition, sources] of Object.entries(EDITIONS)) {
    const names = new Set();
    for (const s of sources) {
      assert.ok(!names.has(s.name), `${edition}: duplicate name ${s.name}`);
      names.add(s.name);
      assert.ok(REGIONS.includes(s.region), `${s.name}: region ${s.region}`);
      assert.ok(s.trust >= 0 && s.trust <= 20, `${s.name}: trust`);
      assert.ok(s.authority >= 0 && s.authority <= 10, `${s.name}: authority`);
      for (const u of [s.url, ...(s.altUrls || [])]) assert.match(u, /^https?:\/\//, `${s.name}: ${u}`);
      if (s.maxItems !== undefined) assert.ok(s.maxItems > 0);
    }
  }
});

test('registry: coverage of Asia-Pacific, India, Africa, Latin America and a wire per edition', () => {
  for (const edition of ['geopolitics', 'finance']) {
    const sources = EDITIONS[edition];
    for (const region of ['asia-pacific', 'india', 'africa', 'latin-america']) {
      assert.ok(sources.some((s) => s.region === region), `${edition} lacks ${region}`);
    }
    assert.ok(sources.some((s) => s.wire), `${edition} lacks a wire`);
  }
  assert.ok(EDITIONS.finance.filter((s) => s.region === 'india').length >= 4, 'India finance desks');
  const names = EDITIONS.finance.map((s) => s.name).join('|');
  for (const n of ['Economic Times', 'Mint', 'Moneycontrol', 'Hindu BusinessLine', 'Hindustan Times']) {
    assert.ok(names.includes(n), `finance registry missing ${n}`);
  }
  assert.ok(EDITIONS.geopolitics.some((s) => s.name === 'The Hindu'));
});

test('registry: the feeds found failing in the audit have fallbacks', () => {
  const find = (ed, name) => EDITIONS[ed].find((s) => s.name === name);
  for (const [ed, name] of [
    ['geopolitics', 'The Guardian World'],
    ['finance', 'Yahoo Finance'],
    ['finance', 'Fox Business Markets'],
  ]) {
    assert.ok((find(ed, name).altUrls || []).length >= 1, `${name} has alternates`);
  }
});

test('regionOf maps names to regions and is null for unknown sources', () => {
  assert.equal(regionOf('geopolitics', 'The Hindu'), 'india');
  assert.equal(regionOf('finance', 'Moneyweb'), 'africa');
  assert.equal(regionOf('finance', 'Finnhub Wire'), null);
});

test('fetchFeed honours maxItems and an injected fetch', async () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ title: `T${i}`, link: `https://x.com/${i}` }));
  const fetchImpl = async () => xmlResponse(rss(items));
  assert.equal((await fetchFeed('https://x.com/feed', { fetchImpl })).length, 10);
  assert.equal((await fetchFeed('https://x.com/feed', { fetchImpl, maxItems: 3 })).length, 3);
});

test('fetchSourceFeed falls back to altUrls when the primary fails (non-fatal)', async () => {
  const tried = [];
  const fetchImpl = async (url) => {
    tried.push(url);
    if (url === 'https://a.com/primary') return xmlResponse('blocked', 403);
    if (url === 'https://a.com/alt1') throw new Error('socket');
    return xmlResponse(rss([{ title: 'From the second alternate', link: 'https://a.com/x' }]));
  };
  const items = await fetchSourceFeed(
    { name: 'A', url: 'https://a.com/primary', altUrls: ['https://a.com/alt1', 'https://a.com/alt2'] },
    { fetchImpl }
  );
  assert.deepEqual(tried, ['https://a.com/primary', 'https://a.com/alt1', 'https://a.com/alt2']);
  assert.equal(items[0].title, 'From the second alternate');
});

test('fetchSourceFeed throws the first error only when every URL fails', async () => {
  const fetchImpl = async (url) => xmlResponse('no', url.endsWith('primary') ? 403 : 500);
  await assert.rejects(
    fetchSourceFeed({ name: 'A', url: 'https://a.com/primary', altUrls: ['https://a.com/alt'] }, { fetchImpl }),
    /HTTP 403/
  );
});

test('fetchSourceFeed tries the next URL when the primary is empty, and stops at the first with items', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    return url.endsWith('empty') ? xmlResponse(rss([])) : xmlResponse(rss([{ title: 'Real', link: 'https://a.com/1' }]));
  };
  const items = await fetchSourceFeed({ name: 'A', url: 'https://a.com/empty', altUrls: ['https://a.com/alt', 'https://a.com/alt2'] }, { fetchImpl });
  assert.equal(items.length, 1);
  assert.equal(calls, 2);
});

test('fetchSourceFeed applies stripSource, noSummary and maxItems (Google News style)', async () => {
  const items = [
    { title: 'Fed holds rates - Reuters', link: 'https://news.google.com/rss/articles/1', description: '<ol><li>junk link list</li></ol>' },
    { title: 'Oil jumps - Reuters', link: 'https://news.google.com/rss/articles/2', description: 'more junk' },
    { title: 'Third - Reuters', link: 'https://news.google.com/rss/articles/3', description: 'x' },
  ];
  const out = await fetchSourceFeed(
    { name: 'Reuters', url: 'https://news.google.com/rss/search?q=x', stripSource: 'Reuters', noSummary: true, maxItems: 2 },
    { fetchImpl: async () => xmlResponse(rss(items)) }
  );
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((i) => i.title), ['Fed holds rates', 'Oil jumps']);
  assert.ok(out.every((i) => i.summary === ''));
});

test('fetchFeed survives feeds with >1000 entity references', async () => {
  const items = Array.from({ length: 1200 }, (_, i) => ({ title: `AT&amp;T story ${i}`, link: `https://x.com/${i}` }));
  const out = await fetchFeed('https://x.com/feed', { fetchImpl: async () => xmlResponse(rss(items)) });
  assert.equal(out.length, 1200);
  assert.equal(out[0].title, 'AT&T story 0');
});
