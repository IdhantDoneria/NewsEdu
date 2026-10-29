import { NextResponse } from 'next/server';
import { readArchive, archiveDays, dayOf, isDay } from '@/lib/archive.mjs';
import { kvAvailable } from '@/lib/store/kv.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hourly story snapshots for one UTC day: /api/archive?edition=&day=YYYY-MM-DD (default today). */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const edition = searchParams.get('edition') === 'finance' ? 'finance' : 'geopolitics';
  const dayParam = searchParams.get('day');
  if (dayParam && !isDay(dayParam)) {
    return NextResponse.json({ error: 'invalid-day', message: 'Use day=YYYY-MM-DD.' }, { status: 400 });
  }
  const day = dayParam || dayOf(Date.now());

  const [snapshots, days] = await Promise.all([readArchive(edition, day), archiveDays(edition)]);
  return NextResponse.json(
    { edition, day, durable: kvAvailable(), days, snapshots },
    { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } }
  );
}
