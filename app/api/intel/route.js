import { NextResponse } from 'next/server';
import { getEditionClusters, clusterSummary } from '@/lib/ingest';
import { warmIntel } from '@/lib/intelligence/extract.mjs';
import { keepAlive } from '@/lib/keepalive.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WARM_EVERY_MS = 60_000;
const lastWarm = new Map(); // edition -> timestamp

/** Cluster (story) list for an edition — powers story links and list views. */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const edition = searchParams.get('edition') === 'finance' ? 'finance' : 'geopolitics';

  const { generatedAt, clusters } = await getEditionClusters(edition);

  // Pre-generate analyses for the top stories (budgeted; skips cached and
  // not-yet-retryable ones), at most once a minute per edition and instance.
  if (Date.now() - (lastWarm.get(edition) || 0) > WARM_EVERY_MS) {
    lastWarm.set(edition, Date.now());
    keepAlive(warmIntel(clusters.slice(0, 6), { limit: 3, budgetMs: 35_000 }).catch(() => {}));
  }

  return NextResponse.json(
    {
      edition,
      generatedAt,
      clusters: clusters.map((c) => ({ ...clusterSummary(c), topics: c.topics || [] })),
    },
    { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } }
  );
}
