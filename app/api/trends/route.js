import { NextResponse } from 'next/server';
import { readTrends } from '@/lib/archive.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Entity/topic frequency over time, recurring stories and rising entities: /api/trends?edition=&days= */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const edition = searchParams.get('edition') === 'finance' ? 'finance' : 'geopolitics';
  const days = Math.min(30, Math.max(1, Math.floor(Number(searchParams.get('days'))) || 7));

  const trends = await readTrends(edition, days);
  return NextResponse.json(trends, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
  });
}
