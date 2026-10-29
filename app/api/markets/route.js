import { NextResponse } from 'next/server';
import { fetchIndexSnapshot, MARKET_INDEX } from '@/lib/quotes';
import {
  MARKET_QUERIES,
  fetchMarketHeadlines,
  peekMarketSummary,
} from '@/lib/markets.mjs';
import { hasAnyModel } from '@/lib/intelligence/llm.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKETS = MARKET_QUERIES;

// Short cache so switching markets rapidly (or re-rendering) doesn't hammer
// Google News / Yahoo Finance; prices still feel close to live.
const cache = new Map(); // market -> { at, payload }
const CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * Headlines and the index level only, so the tab renders fast. The AI summary
 * is a separate, slower call (/api/markets/summary); `summary` is included here
 * only when one is already cached, and `summaryPending` says whether to ask.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const marketKey = MARKETS[searchParams.get('market')] ? searchParams.get('market') : 'US';

  let payload = null;
  const cached = cache.get(marketKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    payload = cached.payload;
  } else {
    const [newsResult, snapshotResult] = await Promise.allSettled([
      fetchMarketHeadlines(marketKey),
      fetchIndexSnapshot(marketKey),
    ]);
    const newsOk = newsResult.status === 'fulfilled';
    const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : null;
    payload = {
      market: marketKey,
      indexName: MARKET_INDEX[marketKey]?.name || null,
      articles: newsOk ? newsResult.value : [],
      newsOk,
      snapshot,
      generatedAt: Date.now(),
    };
    if (newsOk || snapshot) cache.set(marketKey, { at: Date.now(), payload });
  }

  const summary = peekMarketSummary(marketKey);
  return NextResponse.json({
    ...payload,
    summary,
    summaryPending: !summary && hasAnyModel() && payload.articles.length > 0,
  });
}
