import { NextResponse } from 'next/server';
import { getEditionClusters } from '@/lib/ingest';
import { detectChanges } from '@/lib/intelligence/changes.mjs';
import { readJsonBounded } from '@/lib/intelligence/http.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SNAPSHOTS = 50;

/**
 * "What Changed" — the client POSTs snapshots of followed stories
 * ({ clusterId, articleIds, lastSeenAt }); the server returns material
 * change cards per story. Stories no longer in the live window are reported
 * as expired so the UI can say so instead of silently dropping them.
 */
export async function POST(request) {
  const read = await readJsonBounded(request);
  if (read.error) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = read.body;

  const snapshots = (Array.isArray(body?.snapshots) ? body.snapshots : [])
    .filter((s) => s && typeof s.clusterId === 'string')
    .slice(0, MAX_SNAPSHOTS)
    .map((s) => ({
      clusterId: s.clusterId,
      articleIds: Array.isArray(s.articleIds) ? s.articleIds.map(String).slice(0, 100) : [],
      lastSeenAt: Number(s.lastSeenAt) || 0,
    }));

  if (snapshots.length === 0) {
    return NextResponse.json({ results: [], generatedAt: Date.now() });
  }

  const [geo, fin] = await Promise.all([
    getEditionClusters('geopolitics'),
    getEditionClusters('finance'),
  ]);
  const byId = new Map([...geo.clusters, ...fin.clusters].map((c) => [c.id, c]));

  const results = snapshots.map((snap) => {
    const cluster = byId.get(snap.clusterId);
    if (!cluster) {
      return {
        clusterId: snap.clusterId,
        expired: true,
        changes: [],
        newArticleCount: 0,
      };
    }
    return { expired: false, ...detectChanges(cluster, snap) };
  });

  return NextResponse.json({ results, generatedAt: Date.now() });
}
