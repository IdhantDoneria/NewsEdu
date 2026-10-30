import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENRICH,
  extractDescription,
  isPrivateAddress,
  isPublicHostname,
  checkPublicUrl,
  fetchPageDescription,
  pickEnrichmentCandidates,
  enrichSummaries,
  needsSummary,
  _clearEnrichCache,
} from '../lib/ingestion/enrich.mjs';

beforeEach(() => _clearEnrichCache());

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const html = (desc, extra = '') =>
  `<html><head><meta property="og:description" content="${desc}">${extra}</head><body>x</body></html>`;
const LONG = 'A sufficiently long description of what the article reports on today.';

// A fetch that never answers but rejects on abort. (AbortSignal.timeout timers
// are unref'd, so a real socket normally keeps the loop alive; here we do.)
function makeHang() {
  return (url, { signal }) =>
    new Promise((_, reject) => {
      const keep = setTimeout(() => {}, 5000);
      signal.addEventListener('abort', () => {
        clearTimeout(keep);
        reject(signal.reason);
      });
    });
}

function htmlResponse(body, init = {}) {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });
}

test('extractDescription prefers og:description, then twitter, then meta description', () => {
  assert.equal(
    extractDescription(`<meta name="description" content="plain"><meta property="og:description" content="og one">`),
    'og one'
  );
  assert.equal(
    extractDescription(`<meta name="description" content="plain"><meta name="twitter:description" content="tw">`),
    'tw'
  );
  assert.equal(extractDescription(`<meta content="reversed attr order" name="description">`), 'reversed attr order');
  assert.equal(extractDescription('<html><head></head></html>'), '');
});

test('extractDescription decodes entities, strips tags, collapses space and truncates', () => {
  const d = extractDescription(
    `<meta property="og:description" content="Tom &amp; Jerry&#39;s  &lt;b&gt;big&lt;/b&gt; <i>day</i>&nbsp;out">`
  );
  assert.equal(d, "Tom & Jerry's <b>big</b> day out");
  const long = extractDescription(`<meta property="og:description" content="${'x'.repeat(2000)}">`);
  assert.equal(long.length, ENRICH.MAX_SUMMARY_CHARS);
});

test('isPrivateAddress / isPublicHostname refuse localhost and private ranges', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:7f00:1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
  for (const h of ['localhost', 'intranet', 'printer.local', 'db.internal', '127.0.0.1', '[::1]', '192.168.0.9', '']) {
    assert.equal(isPublicHostname(h), false, h);
  }
  assert.equal(isPublicHostname('www.example.com'), true);
  assert.equal(isPublicHostname('8.8.8.8'), true);
});

test('checkPublicUrl: http(s) only, public hosts only, DNS answers checked', async () => {
  assert.equal(await checkPublicUrl('https://example.com/a', { lookup: publicLookup }), 'https://example.com/a');
  assert.equal(await checkPublicUrl('ftp://example.com/a', { lookup: publicLookup }), null);
  assert.equal(await checkPublicUrl('javascript:alert(1)', { lookup: publicLookup }), null);
  assert.equal(await checkPublicUrl('http://localhost:3000/x', { lookup: publicLookup }), null);
  assert.equal(await checkPublicUrl('http://2130706433/x', { lookup: publicLookup }), null, 'decimal IP form normalises to 127.0.0.1');
  assert.equal(await checkPublicUrl('http://0x7f.1/x', { lookup: publicLookup }), null);
  assert.equal(await checkPublicUrl('https://user:pw@example.com/', { lookup: publicLookup }), null);
  const rebinding = async () => [{ address: '10.0.0.5', family: 4 }];
  assert.equal(await checkPublicUrl('https://evil.example.com/', { lookup: rebinding }), null, 'public name resolving to a private IP');
  const failing = async () => {
    throw new Error('ENOTFOUND');
  };
  assert.equal(await checkPublicUrl('https://nx.example.com/', { lookup: failing }), null);
});

test('fetchPageDescription returns the description and never touches private hosts', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return htmlResponse(html(LONG));
  };
  assert.equal(await fetchPageDescription('https://example.com/a', { fetchImpl, lookup: publicLookup }), LONG);
  assert.equal(await fetchPageDescription('http://127.0.0.1/admin', { fetchImpl, lookup: publicLookup }), '');
  assert.equal(await fetchPageDescription('http://169.254.169.254/latest/meta-data', { fetchImpl, lookup: publicLookup }), '');
  assert.deepEqual(calls, ['https://example.com/a']);
});

test('fetchPageDescription follows redirects but re-checks every hop', async () => {
  const fetchImpl = async (url) => {
    if (url === 'https://example.com/short') {
      return new Response(null, { status: 302, headers: { location: 'https://example.com/final' } });
    }
    if (url === 'https://example.com/evil') {
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:8080/secret' } });
    }
    if (url === 'https://example.com/final') return htmlResponse(html(LONG));
    throw new Error(`unexpected fetch ${url}`);
  };
  assert.equal(await fetchPageDescription('https://example.com/short', { fetchImpl, lookup: publicLookup }), LONG);
  assert.equal(await fetchPageDescription('https://example.com/evil', { fetchImpl, lookup: publicLookup }), '');
});

test('fetchPageDescription ignores non-HTML, errors, and oversized bodies', async () => {
  const json = async () => new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } });
  assert.equal(await fetchPageDescription('https://example.com/a', { fetchImpl: json, lookup: publicLookup }), '');
  const nf = async () => new Response('nope', { status: 404 });
  assert.equal(await fetchPageDescription('https://example.com/a', { fetchImpl: nf, lookup: publicLookup }), '');
  const boom = async () => {
    throw new Error('socket hang up');
  };
  assert.equal(await fetchPageDescription('https://example.com/a', { fetchImpl: boom, lookup: publicLookup }), '');

  // The description sits after MAX_BYTES of padding: the capped read never sees it.
  let cancelled = false;
  const big = async () => {
    const chunk = new TextEncoder().encode('<!-- ' + 'p'.repeat(16 * 1024) + ' -->');
    let sent = 0;
    const body = new ReadableStream({
      pull(c) {
        if (sent < 40) {
          c.enqueue(chunk);
          sent++;
        } else {
          c.enqueue(new TextEncoder().encode(html(LONG)));
          c.close();
        }
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
  };
  assert.equal(await fetchPageDescription('https://example.com/a', { fetchImpl: big, lookup: publicLookup }), '');
  assert.equal(cancelled, true, 'the stream is cancelled once the byte budget is spent');
});

test('fetchPageDescription honours its timeout', async () => {
  const hang = makeHang();
  const t0 = Date.now();
  assert.equal(await fetchPageDescription('https://example.com/a', { fetchImpl: hang, lookup: publicLookup, timeoutMs: 50 }), '');
  assert.ok(Date.now() - t0 < 1000);
});

function item(i, over = {}) {
  return {
    id: `id${i}`,
    link: `https://site${i % 7}.example.com/story-${i}`,
    summary: '',
    publishedAt: 1_000_000 + i,
    source: { trust: 10 + (i % 5), authority: 5 },
    ...over,
  };
}

test('needsSummary / candidate picking: only thin items, best outlets first, capped', () => {
  assert.equal(needsSummary({ summary: '' }), true);
  assert.equal(needsSummary({ summary: 'short' }), true);
  assert.equal(needsSummary({ summary: LONG }), false);
  const items = [
    item(1, { summary: LONG }),
    item(2, { source: { trust: 19, authority: 10 } }),
    item(3),
    item(4, { link: 'https://news.google.com/rss/articles/abc' }),
  ];
  const picked = pickEnrichmentCandidates(items, 10).map((a) => a.id);
  assert.deepEqual(picked, ['id2', 'id3'], 'has summary / google redirect excluded, authority first');
  assert.equal(pickEnrichmentCandidates(Array.from({ length: 40 }, (_, i) => item(i)), 15).length, 15);
});

test('enrichSummaries fills summaries, at most 15 fetches, concurrency <= 6', async () => {
  let inFlight = 0;
  let peak = 0;
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 10));
    inFlight--;
    return htmlResponse(html(LONG));
  };
  const items = Array.from({ length: 40 }, (_, i) => item(i));
  const res = await enrichSummaries(items, { fetchImpl, lookup: publicLookup });
  assert.equal(calls, ENRICH.MAX_FETCHES);
  assert.ok(peak <= ENRICH.CONCURRENCY && peak > 1, `peak concurrency ${peak}`);
  assert.equal(res.enriched, 15);
  assert.equal(res.articles.filter((a) => a.summary === LONG).length, 15);
  assert.equal(res.articles.length, 40);
  assert.equal(items.every((a) => a.summary === ''), true, 'input untouched');
});

test('enrichSummaries caches by URL (hits and misses) across builds', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    return url.includes('story-1') ? htmlResponse(html(LONG)) : htmlResponse('<html><head></head></html>');
  };
  const items = [item(1), item(2)];
  const a = await enrichSummaries(items, { fetchImpl, lookup: publicLookup });
  assert.equal(calls, 2);
  const b = await enrichSummaries(items, { fetchImpl, lookup: publicLookup });
  assert.equal(calls, 2, 'second build is served entirely from cache');
  assert.equal(b.articles[0].summary, LONG);
  assert.equal(b.articles[1].summary, '');
  assert.equal(a.enriched, 1);
});

test('enrichSummaries has an overall deadline and never throws', async () => {
  const hang = makeHang();
  const t0 = Date.now();
  const res = await enrichSummaries(Array.from({ length: 12 }, (_, i) => item(i)), {
    fetchImpl: hang,
    lookup: publicLookup,
    timeoutMs: 5000,
    deadlineMs: 80,
  });
  assert.ok(Date.now() - t0 < 1500);
  assert.equal(res.enriched, 0);
  assert.equal(res.articles.length, 12);

  const bad = await enrichSummaries(null, {});
  assert.deepEqual(bad.articles, null);
  assert.equal(bad.enriched, 0);
});

test('enrichSummaries skips URLs that fail the SSRF check without fetching', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return htmlResponse(html(LONG));
  };
  const items = [item(1, { link: 'http://localhost/x' }), item(2, { link: 'http://10.0.0.1/x' }), item(3, { link: 'ftp://example.com/x' })];
  const res = await enrichSummaries(items, { fetchImpl, lookup: publicLookup });
  assert.equal(calls, 0);
  assert.equal(res.enriched, 0);
});
