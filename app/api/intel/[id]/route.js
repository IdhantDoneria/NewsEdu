import { NextResponse } from 'next/server';
import { findClusterById, clusterSummary } from '@/lib/ingest';
import { getIntelForCluster, buildFallbackIntel } from '@/lib/intelligence/extract.mjs';
import { compareSources, peekFraming } from '@/lib/intelligence/compare.mjs';
import { clusterVersion } from '@/lib/intelligence/cluster.mjs';
import { hasAnyModel } from '@/lib/intelligence/llm.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/**
 * Full Story Intelligence payload: cluster, member articles, the cached
 * structured intelligence object, deterministic source comparison, and the
 * (cached, optional) AI framing narrative.
 *
 * Writing the AI analysis can take seconds, so the page asks twice:
 *   ?fast=1  returns immediately: the stored analysis if there is one,
 *            otherwise the deterministic extractive brief, flagged `pending`.
 *   (none)   waits for the AI analysis and returns it.
 * The framing narrative is a separate call (/framing); `framingPending` says
 * whether one is worth asking for.
 */
export async function GET(request, { params }) {
  const { searchParams } = new URL(request.url);
  const editionHint = searchParams.get('edition') || undefined;
  const fast = searchParams.get('fast') === '1';

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

  const version = clusterVersion(cluster);
  let record;
  let pending = false;
  if (fast) {
    const stored = await getIntelForCluster(cluster, { allowGenerate: false });
    record =
      stored ||
      {
        version,
        generatedAt: Date.now(),
        mode: 'fallback',
        intel: buildFallbackIntel(cluster),
      };
    // An AI analysis is still to come unless the stored one is current and AI-made.
    pending = hasAnyModel() && !(stored && stored.version === version && stored.mode === 'ai');
  } else {
    record = await getIntelForCluster(cluster);
  }

  const framing = peekFraming(cluster);
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
      version: record.version,
      generatedAt: record.generatedAt,
      mode: record.mode,
      ...record.intel,
    },
    pending,
    comparison,
    framing,
    framingPending: !framing && hasAnyModel() && cluster.sources.length >= 2,
  });
}
