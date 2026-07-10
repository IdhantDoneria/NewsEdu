import { NextResponse } from 'next/server';
import { findClusterById, clusterSummary } from '@/lib/ingest';
import { getIntelForCluster } from '@/lib/intelligence/extract.mjs';
import { compareSources, framingNarrative } from '@/lib/intelligence/compare.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Full Story Intelligence payload: cluster, member articles, the cached
 * structured intelligence object, deterministic source comparison, and the
 * (cached, optional) AI framing narrative. Intelligence is persisted —
 * a page view serves the stored object; regeneration happens only when the
 * cluster's membership version changes.
 */
export async function GET(request, { params }) {
  const { searchParams } = new URL(request.url);
  const editionHint = searchParams.get('edition') || undefined;

  const cluster = await findClusterById(params.id, editionHint);
  if (!cluster) {
    return NextResponse.json(
      {
        error: 'story-not-found',
        message:
          'This story is no longer in the live 72-hour window, or the link is invalid.',
      },
      { status: 404 }
    );
  }

  const [intelRecord, framing] = await Promise.all([
    getIntelForCluster(cluster),
    framingNarrative(cluster).catch(() => null),
  ]);

  const comparison = compareSources(cluster);

  return NextResponse.json({
    cluster: { ...clusterSummary(cluster), topics: cluster.topics || [] },
    articles: cluster.articles.map((a) => ({
      id: a.id,
      title: a.title,
      link: a.link,
      summary: a.summary,
      publishedAt: a.publishedAt,
      sourceName: a.sourceName,
      meridianScore: a.meridianScore,
      score: a.score,
      image: a.image || null,
    })),
    intel: {
      version: intelRecord.version,
      generatedAt: intelRecord.generatedAt,
      mode: intelRecord.mode,
      ...intelRecord.intel,
    },
    comparison,
    framing,
  });
}
