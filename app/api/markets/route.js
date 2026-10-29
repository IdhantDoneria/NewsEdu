import { NextResponse } from 'next/server';
import { generateMarketSummary } from '@/lib/gemini';
import { fetchIndexSnapshot, MARKET_INDEX } from '@/lib/quotes';
import { MARKET_QUERIES, fetchMarketHeadlines } from '@/lib/markets.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKETS = MARKET_QUERIES;

// Short cache so switching markets rapidly (or re-rendering) doesn't hammer
// Google News / Yahoo Finance — prices still feel close to live.
const cache = new Map(); // market -> { at, payload }
const CACHE_TTL_MS = 2 * 60 * 1000;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const marketKey = MARKETS[searchParams.get('market')] ? searchParams.get('market') : 'US';

  const cached = cache.get(marketKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload);
  }

  const [newsResult, snapshotResult] = await Promise.allSettled([
    fetchMarketHeadlines(marketKey),
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
