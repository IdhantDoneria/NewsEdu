/**
 * Shared ingestion entry point for The Meridian Brief.
 *
 * The ranking pipeline itself lives in lib/ingestion/ (build.mjs orchestrates,
 * pipeline.mjs holds the pure stages) so it can be tested offline. This module
 * adds what must be stateful: the per-edition cache with stale-while-revalidate,
 * coalescing of concurrent builds, stable cluster identity across rebuilds,
 * the fire-and-forget archive snapshot and ingest telemetry.
 *
 * /api/news remains a thin wrapper around getEditionBrief(); the payload is
 * backward compatible (new optional fields only: rankScore, region, stats).
 */

import { buildBrief } from '@/lib/ingestion/build.mjs';
import { clusterSummary } from '@/lib/intelligence/cluster.mjs';
import { keepAlive } from '@/lib/keepalive.mjs';
import { kvAvailable, kvGet, kvSet } from '@/lib/store/kv.mjs';
import { archiveBrief } from '@/lib/archive.mjs';
import { recordEvent } from '@/lib/telemetry.mjs';

// Per-edition in-memory cache so a burst of clients doesn't hammer the feeds.
const cache = new Map(); // edition -> { at, payload }
const CACHE_TTL_MS = 5 * 60 * 1000;

// Coalesce concurrent cold-cache requests into one feed pass.
const inflight = new Map(); // edition -> Promise<payload>

// Compact previous clusters ({ id, articleIds, aliases }) used to keep story
// ids stable across rebuilds. Memory first; a KV snapshot survives cold starts
// and is shared across instances when KV is configured.
const identityMem = new Map(); // edition -> compact[]
const IDENTITY_TTL_SEC = 24 * 3600;
const identityKey = (ed) => `identity:${ed}`;

function compactClusters(clusters) {
  return (clusters || []).map((c) => ({
    id: c.id,
    articleIds: c.articleIds || [],
    aliases: c.aliases || [],
  }));
}

async function loadPrevClusters(ed) {
  const prev = new Map();
  const add = (list) => {
    for (const c of list || []) if (c?.id && !prev.has(c.id)) prev.set(c.id, c);
  };
  add(compactClusters(cache.get(ed)?.payload.clusters));
  add(identityMem.get(ed));
  if (kvAvailable()) add(await kvGet(identityKey(ed)));
  return [...prev.values()];
}

function saveIdentity(ed, clusters) {
  const compact = compactClusters(clusters);
  identityMem.set(ed, compact);
  if (kvAvailable()) kvSet(identityKey(ed), compact, { ttlSec: IDENTITY_TTL_SEC }).catch(() => {});
}

async function build(ed) {
  const prevClusters = await loadPrevClusters(ed);
  return buildBrief(ed, { prevClusters });
}

// A cached brief older than the TTL is still served (instantly) for up to this
// long while a fresh one is built in the background.
const STALE_MAX_MS = 30 * 60 * 1000;

function startBuild(ed) {
  const t0 = Date.now();
  const p = build(ed)
    .then((payload) => {
      if (payload.articles.length > 0) {
        cache.set(ed, { at: payload.generatedAt, payload });
        saveIdentity(ed, payload.clusters);
        // Fire and forget: neither may delay or fail the response.
        keepAlive(archiveBrief(ed, payload).catch(() => {}));
      }
      recordEvent('ingest', {
        edition: ed,
        ms: Date.now() - t0,
        articles: payload.articles.length,
        clusters: payload.clusters.length,
        feedsOk: payload.feeds.filter((f) => f.ok).length,
        feedsFailed: payload.feeds.filter((f) => !f.ok).length,
      });
      return payload;
    })
    .finally(() => {
      if (inflight.get(ed) === p) inflight.delete(ed);
    });
  inflight.set(ed, p);
  return p;
}

/**
 * Fetch the ranked brief for an edition: fresh from the 5-minute cache, else a
 * slightly stale copy returned immediately while a rebuild runs in the
 * background (stale-while-revalidate), else a blocking build.
 * Identical payload to the historical /api/news response body.
 */
export async function getEditionBrief(edition, { force = false } = {}) {
  const ed = edition === 'finance' ? 'finance' : 'geopolitics';

  const cached = cache.get(ed);
  const age = cached ? Date.now() - cached.at : Infinity;
  if (!force && cached && age < CACHE_TTL_MS) return cached.payload;

  if (!force && cached && age < STALE_MAX_MS) {
    if (!inflight.has(ed)) keepAlive(startBuild(ed).catch(() => {}));
    return cached.payload;
  }

  if (!force && inflight.has(ed)) return inflight.get(ed);
  return startBuild(ed);
}

/** Full cluster objects (with member article refs) for an edition. */
export async function getEditionClusters(edition, opts = {}) {
  const brief = await getEditionBrief(edition, opts);
  return { generatedAt: brief.generatedAt, clusters: brief.clusters || [] };
}

const matchesId = (c, id) => c.id === id || (Array.isArray(c.aliases) && c.aliases.includes(id));

/**
 * A story id that no longer matches (the cluster was re-keyed since the link
 * was shared) is resolved through the identity snapshot: the snapshot knows
 * which articles that id covered, and the current cluster holding most of them
 * (>= 50 %) is the same story.
 */
async function resolveViaSnapshot(id, ed, clusters) {
  const snap = [...(identityMem.get(ed) || []), ...(kvAvailable() ? (await kvGet(identityKey(ed))) || [] : [])];
  const old = snap.find((c) => c.id === id || c.aliases?.includes(id));
  if (!old?.articleIds?.length) return null;
  const want = new Set(old.articleIds);
  let best = null;
  let bestShare = 0;
  for (const c of clusters) {
    const shared = c.articleIds.filter((a) => want.has(a)).length;
    const share = shared / want.size;
    if (share > bestShare) {
      best = c;
      bestShare = share;
    }
  }
  return bestShare >= 0.5 ? best : null;
}

/**
 * Locate one cluster by ID (or by an alias it inherited when it was re-keyed).
 * Checks the requested edition first, then the other — cluster IDs are
 * deterministic, so after a cold start the lookup transparently rebuilds the
 * pool and finds the story again.
 */
export async function findClusterById(id, editionHint) {
  const order =
    editionHint === 'finance' ? ['finance', 'geopolitics'] : ['geopolitics', 'finance'];
  for (const ed of order) {
    const { clusters } = await getEditionClusters(ed);
    const hit = clusters.find((c) => matchesId(c, id));
    if (hit) return hit;
  }
  for (const ed of order) {
    const { clusters } = await getEditionClusters(ed);
    const hit = await resolveViaSnapshot(id, ed, clusters);
    if (hit) return hit;
  }
  return null;
}

export { clusterSummary };
