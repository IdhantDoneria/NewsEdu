import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import { generateMarketSummary } from '@/lib/gemini';
import { fetchIndexSnapshot, MARKET_INDEX } from '@/lib/quotes';
import { safeHttpUrl } from '@/lib/rss';
import { normalizeHeadline, stripTrailingSource } from '@/lib/text.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKETS = {
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

// Short cache so switching markets rapidly (or re-rendering) doesn't hammer
// Google News / Yahoo Finance — prices still feel close to live.
const cache = new Map(); // market -> { at, payload }
const CACHE_TTL_MS = 2 * 60 * 1000;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const marketKey = MARKETS[searchParams.get('market')] ? searchParams.get('market') : 'US';
  const query = MARKETS[marketKey];

  const cached = cache.get(marketKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload);
  }

  const [newsResult, snapshotResult] = await Promise.allSettled([
    (async () => {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' when:1d')}&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
      const xml = await res.text();
      const parser = new XMLParser();
      const parsed = parser.parse(xml);
      const items = parsed?.rss?.channel?.item || [];
      const articlesArray = Array.isArray(items) ? items : [items];
      return articlesArray
        .slice(0, 10)
        .map((item) => {
          const source = item.source?.['#text'] || item.source || 'Google News';
          // Google News titles arrive as "Headline - Source Name" — the byline
          // rendered directly under each headline already shows the source,
          // so the suffix is pure redundancy if left in.
          const title = normalizeHeadline(stripTrailingSource(item.title, source));
          const link = safeHttpUrl(typeof item.link === 'string' ? item.link : item.link?.['#text']);
          return { title, link, publishedAt: item.pubDate, source };
        })
        .filter((a) => a.title && a.link);
    })(),
    fetchIndexSnapshot(marketKey),
  ]);

  const topArticles = newsResult.status === 'fulfilled' ? newsResult.value : [];
  const newsOk = newsResult.status === 'fulfilled';
  const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : null;

  // Summarize using Gemini if API key is present
  let summary = '';
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!geminiKey) {
    summary =
      'AI summary requires a Gemini API key. Set GEMINI_API_KEY in environment variables. Get your free key at: https://aistudio.google.com/apikey';
  } else if (topArticles.length === 0) {
    summary = 'No recent news found to summarize.';
  } else {
    try {
      const headlines = topArticles.map((a) => a.title);
      summary = await generateMarketSummary(marketKey, headlines);
    } catch (aiError) {
      console.error('Gemini API Error:', aiError.message || aiError);
      summary = `AI summary unavailable: ${aiError.message || 'Unknown error'}. Verify your GEMINI_API_KEY is valid at https://aistudio.google.com/apikey`;
    }
  }

  const payload = {
    market: marketKey,
    indexName: MARKET_INDEX[marketKey]?.name || null,
    summary,
    articles: topArticles,
    newsOk,
    snapshot,
    generatedAt: Date.now(),
  };

  if (newsOk || snapshot) cache.set(marketKey, { at: Date.now(), payload });

  return NextResponse.json(payload);
}
