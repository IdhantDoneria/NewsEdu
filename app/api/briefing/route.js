import { NextResponse } from 'next/server';
import { getEditionClusters } from '@/lib/ingest';
import { getIntelForCluster } from '@/lib/intelligence/extract.mjs';
import { composeBriefing } from '@/lib/intelligence/briefing.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FOLLOWS = 50;
const MAX_INTERESTS = 18;
// Cap on lazy intelligence generation per briefing request (AI cost bound).
const INTEL_BUDGET = 6;

/**
 * Personalized Daily Intelligence Briefing.
 * The client POSTs its locally-held profile (interests, follows with
 * snapshots) — no user data is stored server-side.
 */
export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    // empty profile is a valid new-user state
  }

  const profile = {
    interests: (Array.isArray(body?.interests) ? body.interests : [])
      .map(String)
      .slice(0, MAX_INTERESTS),
    follows: (Array.isArray(body?.follows) ? body.follows : [])
      .filter((f) => f && typeof f.clusterId === 'string')
      .map((f) => ({
        clusterId: f.clusterId,
        snapshot: {
          articleIds: Array.isArray(f.snapshot?.articleIds)
            ? f.snapshot.articleIds.map(String).slice(0, 100)
            : [],
          lastSeenAt: Number(f.snapshot?.lastSeenAt) || 0,
        },
      }))
      .slice(0, MAX_FOLLOWS),
    weights: body?.weights,
  };

  const [geo, fin] = await Promise.all([
    getEditionClusters('geopolitics'),
    getEditionClusters('finance'),
  ]);
  const clusters = [...geo.clusters, ...fin.clusters];

  // Load stored intelligence cheaply for everything; generate (bounded) for
  // the clusters most likely to surface: top-scored and followed.
  const intelByCluster = new Map();
  const followedIds = new Set(profile.follows.map((f) => f.clusterId));
  const priority = [...clusters]
    .sort((a, b) => (followedIds.has(b.id) ? 1 : 0) - (followedIds.has(a.id) ? 1 : 0) || b.score - a.score)
    .slice(0, INTEL_BUDGET);

  await Promise.all(
    priority.map(async (c) => {
      try {
        const rec = await getIntelForCluster(c);
        if (rec) intelByCluster.set(c.id, rec);
      } catch {
        /* briefing degrades gracefully without intel */
      }
    })
  );
  await Promise.all(
    clusters
      .filter((c) => !intelByCluster.has(c.id))
      .map(async (c) => {
        const rec = await getIntelForCluster(c, { allowGenerate: false });
        if (rec) intelByCluster.set(c.id, rec);
      })
  );

  const briefing = composeBriefing(clusters, intelByCluster, profile);
  return NextResponse.json(briefing);
}
