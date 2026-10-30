import { NextResponse } from 'next/server';
import { getEditionClusters } from '@/lib/ingest';
import { getIntelForCluster, buildFallbackIntel } from '@/lib/intelligence/extract.mjs';
import { clusterVersion } from '@/lib/intelligence/cluster.mjs';
import { keepAlive } from '@/lib/keepalive.mjs';
import { composeBriefing } from '@/lib/intelligence/briefing.mjs';
import { readJsonBounded } from '@/lib/intelligence/http.mjs';
import { matchFollowedCluster } from '@/lib/intelligence/identity.mjs';
import { noteClustersFirstSeen } from '@/lib/intelligence/changes.mjs';
import { topicById } from '@/lib/intelligence/topics.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FOLLOWS = 50;
const MAX_INTERESTS = 18;
const MAX_SHOWN = 80; // 48 h of briefed ids; the client prunes, this bounds a hostile payload
// Cap on background intelligence generation per briefing request (AI cost bound).
const INTEL_BUDGET = 6;

/**
 * Personalized Daily Intelligence Briefing.
 * The client POSTs its locally-held profile (interests, follows with
 * snapshots).
 */
export async function POST(request) {
  const read = await readJsonBounded(request);
  if (read.error === 'payload-too-large') {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = read.body || {}; // malformed JSON degrades to the new-user state

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
    interestWeights: sanitizeWeights(body?.interestWeights),
    shown: sanitizeShown(body?.shown),
  };

  const [geo, fin] = await Promise.all([
    getEditionClusters('geopolitics'),
    getEditionClusters('finance'),
  ]);
  const clusters = [...geo.clusters, ...fin.clusters];
  const now = Date.now();
  noteClustersFirstSeen(clusters, now);

  // A followed story whose id changed (re-clustering) is matched by id, alias
  // or article overlap, and the follow is pointed at the current cluster.
  profile.follows = profile.follows.map((f) => {
    const m = matchFollowedCluster({ clusterId: f.clusterId, articleIds: f.snapshot.articleIds }, clusters);
    return m && m.id !== f.clusterId ? { ...f, clusterId: m.id } : f;
  });

  // Never make the reader wait for the AI. Use the stored analysis where there
  // is one and the deterministic extractive brief otherwise, and warm the AI
  // analyses for the clusters most likely to surface (top-scored and followed)
  // in the background, bounded, so the next briefing and story views have them.
  const intelByCluster = new Map();
  const followedIds = new Set(profile.follows.map((f) => f.clusterId));
  const priority = [...clusters]
    .sort((a, b) => (followedIds.has(b.id) ? 1 : 0) - (followedIds.has(a.id) ? 1 : 0) || b.score - a.score)
    .slice(0, INTEL_BUDGET);

  const toWarm = [];
  await Promise.all(
    clusters.map(async (c) => {
      const stored = await getIntelForCluster(c, { allowGenerate: false });
      const fresh = stored && stored.version === clusterVersion(c) && stored.mode === 'ai';
      if (stored) {
        intelByCluster.set(c.id, stored);
      } else {
        intelByCluster.set(c.id, {
          clusterId: c.id,
          version: clusterVersion(c),
          generatedAt: Date.now(),
          mode: 'fallback',
          intel: buildFallbackIntel(c),
        });
      }
      if (!fresh && priority.includes(c)) toWarm.push(c);
    })
  );
  keepAlive(Promise.allSettled(toWarm.map((c) => getIntelForCluster(c))));

  const briefing = composeBriefing(clusters, intelByCluster, profile, { now });
  return NextResponse.json(briefing);
}

/** { topicId: weight } with known topics only, weights clamped to 0-1. */
function sanitizeWeights(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, w] of Object.entries(raw).slice(0, MAX_INTERESTS * 2)) {
    const n = Number(w);
    if (topicById(id) && Number.isFinite(n) && n > 0) out[id] = Math.min(1, n);
  }
  return out;
}

/** Shown-state: [{ id, at, articleIds? }] (bare id strings are accepted). */
function sanitizeShown(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => (typeof s === 'string' ? { id: s, at: Date.now() } : s))
    .filter((s) => s && typeof s.id === 'string' && s.id.length <= 64)
    .slice(0, MAX_SHOWN)
    .map((s) => ({
      id: s.id,
      at: Number(s.at) || 0,
      articleIds: Array.isArray(s.articleIds) ? s.articleIds.map(String).slice(0, 12) : [],
    }));
}
