import { NextResponse } from 'next/server';
import { getEditionClusters, clusterSummary } from '@/lib/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cluster (story) list for an edition — powers story links and list views. */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const edition = searchParams.get('edition') === 'finance' ? 'finance' : 'geopolitics';

  const { generatedAt, clusters } = await getEditionClusters(edition);

  return NextResponse.json(
    {
      edition,
      generatedAt,
      clusters: clusters.map((c) => ({ ...clusterSummary(c), topics: c.topics || [] })),
    },
    { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } }
  );
}
