import { NextResponse } from 'next/server';
import { MARKET_QUERIES, getMarketSummary } from '@/lib/markets.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/** The AI summary for one market: slow, cached for 10 minutes, shared across requests. */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const marketKey = MARKET_QUERIES[searchParams.get('market')] ? searchParams.get('market') : 'US';
  try {
    return NextResponse.json({ market: marketKey, summary: await getMarketSummary(marketKey) });
  } catch (err) {
    console.error(`[markets] summary failed: ${String(err?.message || err).slice(0, 200)}`);
    return NextResponse.json(
      { market: marketKey, summary: null, error: 'summary-unavailable' },
      { status: 200 }
    );
  }
}
