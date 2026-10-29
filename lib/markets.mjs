/**
 * Market headlines (Google News) and index snapshots (Yahoo Finance), shared by
 * the Markets tab API and the chat.
 */

import { XMLParser } from 'fast-xml-parser';
import { fetchIndexSnapshot } from './quotes.js';
import { safeHttpUrl } from './rss.js';
import { normalizeHeadline, stripTrailingSource } from './text.mjs';

export const MARKET_QUERIES = {
  US: 'US stock market',
  China: 'China stock market',
  Japan: 'Japan stock market',
  India: 'India stock market',
  UK: 'UK stock market',
  France: 'France stock market',
  Canada: 'Canada stock market',
  Germany: 'Germany stock market',
  Taiwan: 'Taiwan stock market',
  'South Korea': 'South Korea stock market',
  'Saudi Arabia': 'Saudi Arabia stock market',
  Switzerland: 'Switzerland stock market',
  Australia: 'Australia stock market',
};

export async function fetchMarketHeadlines(marketKey, { timeoutMs = 8000, limit = 10 } = {}) {
  const query = MARKET_QUERIES[marketKey];
  if (!query) throw new Error('Unknown market');
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' when:1d')}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
  const parsed = new XMLParser().parse(await res.text());
  const items = parsed?.rss?.channel?.item || [];
  return (Array.isArray(items) ? items : [items])
    .slice(0, limit)
    .map((item) => {
      const source = item.source?.['#text'] || item.source || 'Google News';
      // Google News titles arrive as "Headline - Source Name"; the source is
      // shown separately, so the suffix is redundant.
      const title = normalizeHeadline(stripTrailingSource(item.title, source));
      const link = safeHttpUrl(typeof item.link === 'string' ? item.link : item.link?.['#text']);
      return { title, link, publishedAt: item.pubDate, source };
    })
    .filter((a) => a.title && a.link);
}

// Small shared cache so chat questions don't hammer Google News / Yahoo.
const TTL_MS = 2 * 60_000;
const cache = new Map(); // market -> { at, value }

/** Headlines + index snapshot for the chat. Failures degrade to partial data. */
export async function getMarketContext(marketKey, { timeoutMs = 5000 } = {}) {
  const hit = cache.get(marketKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const [news, snap] = await Promise.allSettled([
    fetchMarketHeadlines(marketKey, { timeoutMs }),
    fetchIndexSnapshot(marketKey),
  ]);
  const value = {
    articles: news.status === 'fulfilled' ? news.value : [],
    snapshot: snap.status === 'fulfilled' ? snap.value : null,
  };
  if (value.articles.length || value.snapshot) cache.set(marketKey, { at: Date.now(), value });
  return value;
}
