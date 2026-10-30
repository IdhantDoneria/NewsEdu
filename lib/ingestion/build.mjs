/**
 * Brief builder: the whole fetch -> rank pipeline for one edition, with its
 * I/O injectable so it can run offline in tests. lib/ingest.js wraps it with
 * caching, stale-while-revalidate, identity snapshots, archive and telemetry.
 *
 * Order (see docs/build-contracts.md "Ingest order"):
 *   fetch -> score (all, no cap) -> dedupe -> enrich summaries -> 10-layer score
 *   -> cluster all -> breadth bonus + duplicate/syndicated penalties
 *   (-> optional signals) -> noise floor -> per-outlet and per-story caps
 *   -> cap 60 -> reconcile cluster ids -> topics.
 */

import { EDITIONS, FINNHUB_ENDPOINT } from '../feeds.js';
import { fetchSourceFeed, safeHttpUrl } from '../rss.js';
import { scoreArticle, totalScore, NOISE_FLOOR } from '../score.js';
import { scoreArticlesAsync } from '../scoring/index.mjs';
import { clusterArticles } from '../intelligence/cluster.mjs';
import { reconcileClusterIds } from '../intelligence/identity.mjs';
import { topicsForCluster } from '../intelligence/topics.mjs';
import { enrichSummaries } from './enrich.mjs';
import { clusterSignalBonuses } from '../signals/index.mjs';
import {
  LIMITS,
  compareRank,
  applyBreadth,
  applyLeadBonuses,
  applyNoiseFloor,
  diversify,
  trimClusters,
  regionShare,
  rankOf,
} from './pipeline.mjs';

export const MAX_AGE_HOURS = 72;

// Turns a raw fetch/parse error into a short, UI-safe phrase — never leaks
// the underlying feed URL or a raw stack trace to the client.
export function summarizeFeedFailure(err) {
  const msg = err?.message || String(err || '');
  const httpMatch = msg.match(/^HTTP (\d+)/);
  if (httpMatch) return `HTTP ${httpMatch[1]}`;
  if (err?.name === 'TimeoutError' || /timeout|aborted/i.test(msg)) return 'timed out';
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) return 'DNS lookup failed';
  return 'unreachable';
}

const FINNHUB_SOURCE = { name: 'Finnhub Wire', trust: 14, authority: 8, region: 'north-america', wire: true };

export async function finnhubArticles({ fetchImpl = fetch, apiKey = process.env.FINNHUB_API_KEY } = {}) {
  if (!apiKey) return [];
  try {
    const res = await fetchImpl(`${FINNHUB_ENDPOINT}&token=${apiKey}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.slice(0, 40).map((it) => ({
      raw: {
        title: it.headline,
        link: safeHttpUrl(it.url),
        summary: it.summary,
        publishedAt: it.datetime * 1000,
        image: safeHttpUrl(it.image),
      },
      source: FINNHUB_SOURCE,
    }));
  } catch {
    return [];
  }
}

/** Fetch every source of an edition in parallel; failures are per-source and non-fatal. */
export async function fetchPool(edition, { sources = EDITIONS[edition], fetchSource = fetchSourceFeed } = {}) {
  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const items = await fetchSource(source);
      return items.map((raw) => ({ raw, source }));
    })
  );
  const pool = [];
  const feeds = [];
  settled.forEach((result, i) => {
    const base = { source: sources[i].name, region: sources[i].region ?? null };
    if (result.status === 'fulfilled') {
      pool.push(...result.value);
      feeds.push({ ...base, ok: true, items: result.value.length });
    } else {
      // Surface *why* a source is down (HTTP status, timeout, parse error)
      // instead of a bare "unreachable" — the sources popover shows this.
      feeds.push({ ...base, ok: false, items: 0, reason: summarizeFeedFailure(result.reason) });
    }
  });
  return { pool, feeds };
}

/** Legacy-score the pool, drop stale/unscorable items, collapse duplicates. */
export function prepareArticles(pool, edition, now) {
  const regionBySource = new Map(pool.map(({ source }) => [source.name, source.region ?? null]));
  let articles = pool
    .map(({ raw, source }) => scoreArticle(raw, source, edition, now))
    .filter(Boolean)
    .filter((a) => a.ageHours <= MAX_AGE_HOURS)
    .map((a) => ({ ...a, region: regionBySource.get(a.sourceName) ?? null }));

  // Some feeds repeat an item verbatim under different URLs, and one outlet's
  // feeds overlap (World + regional desks): collapse identical (source, title)
  // pairs and identical links so they can't inflate clusters or change counts.
  const seenTitle = new Set();
  const seenId = new Set();
  articles = articles.filter((a) => {
    const key = `${a.sourceName}|${a.title}`;
    if (seenTitle.has(key) || seenId.has(a.id)) return false;
    seenTitle.add(key);
    seenId.add(a.id);
    return true;
  });
  return articles;
}

/** Run the 10-layer pipelines and attach their output (sort key = rankScore). */
export async function scoreAll(articles, edition, now) {
  const pipelineScores = await scoreArticlesAsync(articles, edition, { now });
  return articles.map((a, i) => {
    const s = pipelineScores[i] || {
      geopoliticalScore: 0,
      financialScore: 0,
      finalCurationScore: 0,
      scoreBreakdown: [],
    };
    return {
      ...a,
      geopoliticalScore: s.geopoliticalScore,
      financialScore: s.financialScore,
      finalCurationScore: s.finalCurationScore,
      rankScore: s.rankScore ?? s.finalCurationScore,
      scoreBreakdown: s.scoreBreakdown,
      score: s.finalCurationScore,
    };
  });
}

/**
 * The pure ranking core: scored articles in, ranked payload parts out.
 * Deterministic for a given input set regardless of input order.
 */
export async function rankPool(scored, edition, opts = {}) {
  const {
    now = Date.now(),
    prevClusters = [],
    signalOpts = {},
    noiseFloor = NOISE_FLOOR,
    maxArticles = LIMITS.MAX_ARTICLES,
    cluster = clusterArticles,
    reconcile = reconcileClusterIds,
  } = opts;

  // Stable input order so clustering sees the same sequence every build.
  const ordered = [...scored].sort(compareRank);

  // Cluster the whole pool BEFORE any cap: cross-outlet coverage is an
  // importance signal and duplicates must not eat the slots.
  const clusters = cluster(ordered, edition, { now });

  const breadth = applyBreadth(ordered, clusters, { edition });
  let adjusted = breadth.articles;

  // Optional public-attention signals (default off; failures are silent).
  const leadRank = new Map(adjusted.map((a) => [a.id, rankOf(a)]));
  const clustersBestFirst = [...clusters].sort(
    (a, b) => (leadRank.get(breadth.leads.get(b.id)) ?? 0) - (leadRank.get(breadth.leads.get(a.id)) ?? 0) || (a.id < b.id ? -1 : 1)
  );
  const bonuses = await clusterSignalBonuses(clustersBestFirst, { now, ...signalOpts });
  adjusted = applyLeadBonuses(adjusted, breadth.leads, bonuses, { edition });

  // Legacy sub-metric total, kept for observability (reads `corroboration`).
  adjusted = adjusted.map((a) => ({ ...a, meridianScore: totalScore(a) }));

  // Noise floor, then deterministic sort and the diversity caps.
  const survivors = applyNoiseFloor(adjusted, noiseFloor).sort(compareRank);

  // Provisional story grouping (pre-reconcile ids) for the per-story cap.
  const provisional = new Map();
  for (const c of clusters) for (const id of c.articleIds) provisional.set(id, c.id);
  const grouped = survivors.map((a) => ({ ...a, clusterId: provisional.get(a.id) || null }));
  const selected = diversify(grouped, { limit: maxArticles });
  const finalIds = new Set(selected.map((a) => a.id));

  // Clusters restricted to surviving members, then stable identity.
  let finalClusters = trimClusters(clusters, grouped, finalIds);
  try {
    finalClusters = reconcile(finalClusters, prevClusters || []) || finalClusters;
  } catch {
    /* identity is best effort; fresh ids are still valid */
  }

  const clusterIdByArticle = new Map();
  for (const c of finalClusters) for (const id of c.articleIds) clusterIdByArticle.set(id, c.id);
  const annotated = new Map(grouped.map((a) => [a.id, { ...a, clusterId: clusterIdByArticle.get(a.id) || null }]));
  const articles = selected.map((a) => annotated.get(a.id));
  for (const c of finalClusters) {
    c.articles = c.articleIds.map((id) => annotated.get(id)).filter(Boolean);
    c.topics = topicsForCluster(c);
  }

  return { articles, clusters: finalClusters, signals: bonuses.size };
}

/**
 * Build the full brief for an edition.
 * @param {string} edition
 * @param {object} [deps] injectable I/O for tests: now, sources, fetchSource,
 *   finnhub, enrich (false to skip), fetchImpl, prevClusters, signalOpts,
 *   cluster, reconcile
 */
export async function buildBrief(edition, deps = {}) {
  const now = deps.now ?? Date.now();
  const { pool, feeds } = await fetchPool(edition, { sources: deps.sources, fetchSource: deps.fetchSource });
  if (edition === 'finance') pool.push(...(await (deps.finnhub ?? finnhubArticles)()));

  let articles = prepareArticles(pool, edition, now);

  let enrichStats = { enriched: 0, attempted: 0 };
  if (deps.enrich !== false) {
    const res = await (deps.enrich ?? enrichSummaries)(articles, { now, fetchImpl: deps.fetchImpl });
    articles = res.articles;
    enrichStats = { enriched: res.enriched, attempted: res.attempted };
  }

  const scored = await scoreAll(articles, edition, now);
  const ranked = await rankPool(scored, edition, {
    now,
    prevClusters: deps.prevClusters,
    signalOpts: deps.signalOpts,
    ...(deps.cluster && { cluster: deps.cluster }),
    ...(deps.reconcile && { reconcile: deps.reconcile }),
  });

  return {
    edition,
    generatedAt: now,
    noiseFloor: NOISE_FLOOR,
    feeds,
    articles: ranked.articles,
    clusters: ranked.clusters,
    stats: {
      regionShare: regionShare(ranked.articles),
      regionShareTop20: regionShare(ranked.articles.slice(0, 20)),
      pool: scored.length,
      events: ranked.clusters.length,
      enriched: enrichStats.enriched,
    },
  };
}
