import { NextResponse } from 'next/server';
import { getEditionBrief } from '@/lib/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const edition = searchParams.get('edition') === 'finance' ? 'finance' : 'geopolitics';
  const force = searchParams.get('refresh') === '1';

  const payload = await getEditionBrief(edition, { force });

  // Keep the historical payload shape: full cluster objects (with duplicated
  // article refs) stay server-side; articles carry only their clusterId.
  const { clusters, ...body } = payload;

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
  });
}
