/**
 * Summary enrichment: many feeds ship headlines with no description, and
 * summary-less items score ~8 points lower purely for missing text. Before
 * scoring we fetch `og:description` / `<meta name="description">` for a
 * bounded number of them.
 *
 * Hard budget (a slow publisher must never slow the brief):
 *   - at most MAX_FETCHES uncached page fetches per build
 *   - at most CONCURRENCY in flight, TIMEOUT_MS each, DEADLINE_MS overall
 *   - reads stop after MAX_BYTES or at </head>
 *   - results (including misses) are cached per URL in memory
 *
 * SSRF guard: feed links are untrusted. Only http(s) URLs (via safeHttpUrl)
 * with a public host are fetched; localhost, .local/.internal names, private,
 * loopback, link-local and CGNAT IP literals are refused, hostnames are
 * resolved and every address checked, and redirects are followed manually
 * (max 2 hops) with the same checks on each hop.
 *
 * Never throws: a failed enrichment simply leaves the summary empty.
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { safeHttpUrl } from '../rss.js';

export const ENRICH = {
  MAX_FETCHES: 15,
  CONCURRENCY: 6,
  TIMEOUT_MS: 2500,
  DNS_TIMEOUT_MS: 1000,
  DEADLINE_MS: 5000,
  MAX_BYTES: 96 * 1024,
  MIN_SUMMARY_CHARS: 40,
  MAX_SUMMARY_CHARS: 400,
  HIT_TTL_MS: 6 * 3600e3,
  MISS_TTL_MS: 30 * 60e3,
  CACHE_MAX: 1000,
};

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 MeridianBrief/1.0',
  Accept: 'text/html,application/xhtml+xml',
};

// url -> { at, value: string|null }
const defaultCache = new Map();

/* ------------------------------ host safety ------------------------------ */

function ipv4Private(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast / reserved
  );
}

function ipv6Private(ip) {
  const h = ip.toLowerCase();
  return (
    h === '::' ||
    h === '::1' ||
    h.startsWith('::ffff:') || // IPv4-mapped: refuse outright
    h.startsWith('fc') ||
    h.startsWith('fd') ||
    h.startsWith('fe8') ||
    h.startsWith('fe9') ||
    h.startsWith('fea') ||
    h.startsWith('feb') ||
    h.startsWith('ff')
  );
}

/** True when an IP literal is loopback / private / link-local / reserved. */
export function isPrivateAddress(ip) {
  const v = isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v === 6) return ipv6Private(ip);
  return true; // not an IP: caller must not treat as safe
}

/** Syntactic host check (no DNS). */
export function isPublicHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return false;
  if (isIP(host)) return !isPrivateAddress(host);
  if (host === 'localhost' || !host.includes('.')) return false;
  return !/\.(local|localhost|internal|intranet|lan|home|corp|private)$/.test(host);
}

/**
 * Full check: safe http(s) URL, public hostname, and (when `lookup` is given)
 * every resolved address public. Returns the normalised URL or null.
 */
export async function checkPublicUrl(url, { lookup = dnsLookup } = {}) {
  const safe = safeHttpUrl(url);
  if (!safe) return null;
  const u = new URL(safe);
  if (u.username || u.password) return null;
  if (!isPublicHostname(u.hostname)) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!isIP(host) && lookup) {
    try {
      // Bounded: a slow resolver must not eat the enrichment budget.
      let timer;
      const addrs = await Promise.race([
        lookup(host, { all: true }),
        new Promise((_, rej) => {
          timer = setTimeout(() => rej(new Error('dns timeout')), ENRICH.DNS_TIMEOUT_MS);
        }),
      ]).finally(() => clearTimeout(timer));
      if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return null;
    } catch {
      return null;
    }
  }
  return safe;
}

/* ------------------------------ HTML parsing ----------------------------- */

function decode(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function metaAttrs(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/** Pull the best description out of an HTML head. Returns '' when none. */
export function extractDescription(html) {
  const head = String(html || '').slice(0, ENRICH.MAX_BYTES);
  const found = {};
  for (const m of head.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const a = metaAttrs(m[0]);
    const key = (a.property || a.name || '').toLowerCase();
    if (!a.content) continue;
    if (['og:description', 'twitter:description', 'description'].includes(key) && !found[key]) {
      found[key] = a.content;
    }
  }
  const raw = found['og:description'] || found['twitter:description'] || found.description || '';
  return decode(raw.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, ENRICH.MAX_SUMMARY_CHARS);
}

/* ------------------------------- fetching -------------------------------- */

async function readCapped(res, maxBytes) {
  if (!res.body?.getReader) return (await res.text()).slice(0, maxBytes);
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = '';
  let bytes = 0;
  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(text)) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return text;
}

/** Fetch one page's description. Returns a string, or '' when unavailable. */
export async function fetchPageDescription(url, opts = {}) {
  const { fetchImpl = fetch, lookup = dnsLookup, timeoutMs = ENRICH.TIMEOUT_MS, signal } = opts;
  try {
    let current = await checkPublicUrl(url, { lookup });
    for (let hop = 0; current && hop <= 2; hop++) {
      const signals = [AbortSignal.timeout(timeoutMs)];
      if (signal) signals.push(signal);
      const res = await fetchImpl(current, {
        headers: HEADERS,
        redirect: 'manual',
        signal: AbortSignal.any(signals),
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers?.get?.('location');
        current = loc ? await checkPublicUrl(new URL(loc, current).href, { lookup }) : null;
        continue;
      }
      if (!res.ok) return '';
      const type = res.headers?.get?.('content-type') || 'text/html';
      if (!/html|xml/i.test(type)) return '';
      return extractDescription(await readCapped(res, ENRICH.MAX_BYTES));
    }
  } catch {
    /* timeout, abort, network: leave unenriched */
  }
  return '';
}

function cacheGet(cache, url, now) {
  const e = cache.get(url);
  if (!e) return undefined;
  const ttl = e.value ? ENRICH.HIT_TTL_MS : ENRICH.MISS_TTL_MS;
  if (now - e.at > ttl) {
    cache.delete(url);
    return undefined;
  }
  return e.value;
}

function cacheSet(cache, url, value, now) {
  if (cache.size >= ENRICH.CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(url, { at: now, value: value || null });
}

/** True when an item has too little text to score fairly. */
export function needsSummary(item) {
  return (item?.summary || '').trim().length < ENRICH.MIN_SUMMARY_CHARS;
}

/**
 * Choose which summary-less items to enrich: most credible outlet first, then
 * newest, then id (deterministic). Skips Google News redirect links.
 */
export function pickEnrichmentCandidates(items, max = ENRICH.MAX_FETCHES) {
  return items
    .filter((a) => needsSummary(a) && a.link && !/(^|\.)news\.google\.com$/i.test(new URL(a.link).hostname))
    .sort(
      (a, b) =>
        (b.source?.trust ?? 0) + (b.source?.authority ?? 0) - ((a.source?.trust ?? 0) + (a.source?.authority ?? 0)) ||
        (b.publishedAt ?? 0) - (a.publishedAt ?? 0) ||
        (a.id < b.id ? -1 : 1)
    )
    .slice(0, max);
}

/**
 * Fill empty summaries of `articles` (objects with link, summary, source,
 * publishedAt, id) in a new array. Returns { articles, enriched, attempted }.
 */
export async function enrichSummaries(articles, opts = {}) {
  const {
    fetchImpl = fetch,
    lookup = dnsLookup,
    cache = defaultCache,
    now = Date.now(),
    maxFetches = ENRICH.MAX_FETCHES,
    concurrency = ENRICH.CONCURRENCY,
    timeoutMs = ENRICH.TIMEOUT_MS,
    deadlineMs = ENRICH.DEADLINE_MS,
  } = opts;

  try {
    const candidates = pickEnrichmentCandidates(articles, maxFetches * 3);
    const found = new Map(); // id -> description
    const queue = [];
    for (const a of candidates) {
      const hit = cacheGet(cache, a.link, now);
      if (hit) found.set(a.id, hit);
      else if (hit === undefined && queue.length < maxFetches) queue.push(a);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    let next = 0;
    const worker = async () => {
      while (next < queue.length && !controller.signal.aborted) {
        const a = queue[next++];
        const desc = await fetchPageDescription(a.link, {
          fetchImpl,
          lookup,
          timeoutMs,
          signal: controller.signal,
        });
        if (!controller.signal.aborted || desc) cacheSet(cache, a.link, desc, now);
        if (desc.length >= ENRICH.MIN_SUMMARY_CHARS) found.set(a.id, desc);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    } finally {
      clearTimeout(timer);
    }

    const out = articles.map((a) =>
      found.has(a.id) ? { ...a, summary: found.get(a.id), summarySource: 'meta' } : a
    );
    return { articles: out, enriched: found.size, attempted: queue.length };
  } catch {
    return { articles, enriched: 0, attempted: 0 };
  }
}

/** Test hook. */
export function _clearEnrichCache() {
  defaultCache.clear();
}
