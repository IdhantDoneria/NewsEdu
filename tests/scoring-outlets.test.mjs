import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOutlet,
  outletBaseline,
  listOutlets,
  isRegulatorHost,
  OUTLET_BAND,
  TIER_RELIABILITY,
} from '../lib/scoring/outlets.mjs';
import { scoreArticleAsync } from '../lib/scoring/index.mjs';

// The feed registry at the time of writing (hard-coded so new feeds added elsewhere cannot break this test).
const FEEDS = [
  ['BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml'],
  ['Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml'],
  ['France 24', 'https://www.france24.com/en/rss'],
  ['Foreign Policy', 'https://foreignpolicy.com/feed/'],
  ['The Guardian World', 'https://www.theguardian.com/world/rss'],
  ['NYT World', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'],
  ['Deutsche Welle', 'https://rss.dw.com/rdf/rss-en-world'],
  ['TechCrunch Venture', 'https://techcrunch.com/category/venture/feed/'],
  ['Crunchbase News', 'https://news.crunchbase.com/feed/'],
  ['MarketWatch', 'https://feeds.content.dowjones.io/public/rss/mw_topstories'],
  ['CNBC Markets', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258'],
  ['Yahoo Finance', 'https://finance.yahoo.com/news/rssindex'],
  ['Fortune', 'https://fortune.com/feed/'],
  ['Sifted', 'https://sifted.eu/feed'],
  ['Investing.com', 'https://www.investing.com/rss/news.rss'],
  ['Fox Business Markets', 'https://moxie.foxbusiness.com/google-publisher/markets.xml'],
  ['Finnhub Wire', 'https://finnhub.io/api/v1/news'],
];

const NOW = Date.parse('2026-10-29T12:00:00Z');
const text = {
  title: 'Fed holds rates steady as inflation cools to 3.1% ahead of the FOMC minutes',
  summary: 'Treasury yields fell after the Federal Reserve left rates unchanged on Wednesday.',
  publishedAt: NOW - 2 * 3_600_000,
};
const rank = async (extra, edition = 'finance') =>
  (await scoreArticleAsync({ ...text, ...extra }, edition, { now: NOW })).rankScore;

test('the outlet table has a defined band and every row sits inside it', () => {
  assert.ok(OUTLET_BAND.max - OUTLET_BAND.min <= 15, 'outlet influence must be bounded');
  const rows = listOutlets();
  assert.ok(rows.length >= 100);
  for (const r of rows) {
    assert.ok([1, 2, 3, 4, 5].includes(r.tier), r.key);
    assert.ok(r.baseline >= OUTLET_BAND.min && r.baseline <= OUTLET_BAND.max, r.key);
    assert.equal(r.reliability, TIER_RELIABILITY[r.tier]);
  }
  // Unknown outlets can never reach the top tier.
  const unknown = outletBaseline({ link: 'https://never-heard-of-it.example/a', source: { trust: 20 } });
  assert.ok(unknown < outletBaseline({ link: 'https://reuters.com/a' }));
});

test('same outlet = same baseline whether resolved by link host, subdomain or source name', () => {
  const byHost = outletBaseline({ link: 'https://www.nytimes.com/2026/10/29/world/x.html' });
  const bySub = outletBaseline({ link: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' });
  const byName = outletBaseline({ source: { name: 'NYT World', trust: 3 } });
  const bySourceName = outletBaseline({ sourceName: 'NYT World' });
  const noisyTrust = outletBaseline({ link: 'https://nytimes.com/x', source: { name: 'NYT World', trust: 1, authority: 1 } });
  for (const v of [bySub, byName, bySourceName, noisyTrust]) assert.equal(v, byHost);

  // Feed-registry names resolve even with no usable link.
  for (const [name, url] of FEEDS) {
    const viaHost = resolveOutlet({ link: url, source: { name: 'zzz', trust: 0 } });
    const viaName = resolveOutlet({ source: { name, trust: 0 } });
    assert.ok(viaName.known, `${name} is not in the outlet table by name`);
    assert.ok(viaHost.known, `${name} (${url}) is not in the outlet table by host`);
    assert.equal(viaName.reliability, viaHost.reliability, `${name}: name and host disagree`);
  }
});

test('same outlet gives the same baseline in both editions', async () => {
  const a = await scoreArticleAsync({ ...text, link: 'https://www.cnbc.com/x', source: { name: 'CNBC Markets' } }, 'finance', { now: NOW });
  const b = await scoreArticleAsync({ ...text, link: 'https://www.cnbc.com/x', source: { name: 'CNBC Markets' } }, 'geopolitics', { now: NOW });
  assert.equal(a.scoreBreakdown[0].delta, b.scoreBreakdown[0].delta);
});

test('Object.prototype names in a hostname or outlet name never hit the lookup', () => {
  for (const host of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    const r = resolveOutlet({ link: `https://${host}/x`, source: { name: host, trust: 10 } });
    assert.equal(r.known, false, host);
    assert.equal(r.via, 'trust');
    assert.ok(Number.isFinite(outletBaseline({ link: `https://${host}.example.com/`, source: { name: host } })));
  }
  assert.equal(resolveOutlet({ link: 'https://constructor.nytimes.com/x' }).key, 'nytimes.com');
});

test('identical text from different outlets differs only by the bounded outlet band', async () => {
  const outlets = [
    { link: 'https://www.reuters.com/a', source: { name: 'Reuters', trust: 19 } },
    { link: 'https://www.cnbc.com/a', source: { name: 'CNBC Markets', trust: 16 } },
    { link: 'https://sifted.eu/a', source: { name: 'Sifted', trust: 14 } },
    { link: 'https://www.investing.com/a', source: { name: 'Investing.com', trust: 12 } },
    { link: 'https://reddit.com/a', source: { name: 'Reddit', trust: 4 } },
    { link: 'https://brand-new-feed.example/a', source: { name: 'New Feed', trust: 20, authority: 10 } },
  ];
  for (const edition of ['finance', 'geopolitics']) {
    const ranks = [];
    for (const o of outlets) ranks.push(await rank(o, edition));
    const spread = Math.max(...ranks) - Math.min(...ranks);
    assert.ok(spread <= OUTLET_BAND.max - OUTLET_BAND.min + 1e-9, `${edition} spread ${spread} exceeds the band`);
    assert.ok(spread < 14);
  }
});

test('feed-registry authority no longer adds a second outlet term', async () => {
  const lo = await rank({ link: 'https://x.example/a', source: { name: 'X', trust: 12, authority: 0 } });
  const hi = await rank({ link: 'https://x.example/a', source: { name: 'X', trust: 12, authority: 10 } });
  assert.equal(lo, hi);
});

test('an unvetted feed claiming maximum trust cannot out-rank a reviewed tier-2 outlet', () => {
  const claimed = outletBaseline({ link: 'https://new.example/a', source: { name: 'New', trust: 20, authority: 10 } });
  const reviewed = outletBaseline({ link: 'https://www.bbc.co.uk/a' });
  assert.ok(claimed < reviewed);
});

test('regulator hosts are recognised as primary sources; ordinary outlets are not', () => {
  assert.equal(isRegulatorHost('https://www.sec.gov/edgar/x'), true);
  assert.equal(isRegulatorHost('https://www.federalreserve.gov/newsevents'), true);
  assert.equal(isRegulatorHost('https://www.reuters.com/x'), false);
  assert.equal(isRegulatorHost('https://un.org/x'), false);
  assert.equal(isRegulatorHost(undefined), false);
});

test('unknown outlets fall back to a trust prior inside the tier 3-4 corridor, and to a neutral default without data', () => {
  const hi = resolveOutlet({ source: { name: 'Nobody', trust: 20 } });
  const lo = resolveOutlet({ source: { name: 'Nobody', trust: 2 } });
  const none = resolveOutlet({});
  assert.equal(hi.via, 'trust');
  assert.ok(hi.reliability <= 72 && lo.reliability >= 50 && hi.reliability > lo.reliability);
  assert.equal(none.via, 'default');
  assert.equal(none.known, false);
});
