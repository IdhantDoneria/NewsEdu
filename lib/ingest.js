/**
 * Shared ingestion pipeline for The Meridian Brief.
 *
 * This is the exact fetch → score → corroborate → rank pass that used to live
 * inside app/api/news/route.js, extracted so the intelligence layer
 * (lib/intelligence/*) can consume the same scored article pool without a
 * second, competing pipeline. /api/news remains a thin wrapper around
 * getEditionBrief() — behaviour and payload shape are unchanged.
 */

import { EDITIONS, FINNHUB_ENDPOINT } from '@/lib/feeds';
import { fetchFeed } from '@/lib/rss';
import {
  scoreArticle,
  applyCorroboration,
  totalScore,
  NOISE_FLOOR,
} from '@/lib/score';
import { scoreArticlesAsync } from '@/lib/scoring/index.mjs';
import { clusterArticles, clusterSummary } from '@/lib/intelligence/cluster.mjs';
import { topicsForCluster } from '@/lib/intelligence/topics.mjs';

const MAX_AGE_HOURS = 72;
const MAX_ARTICLES = 60;

// Per-edition in-memory cache so a burst of clients doesn't hammer the feeds.
const cache = new Map(); // edition -> { at, payload }
const CACHE_TTL_MS = 5 * 60 * 1000;

// Coalesce concurrent cold-cache requests into one feed pass.
const inflight = new Map(); // edition -> Promise<payload>

async function finnhubArticles() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`${FINNHUB_ENDPOINT}&token=${key}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.slice(0, 40).map((it) => ({
      raw: {
        title: it.headline,
        link: it.url,
        summary: it.summary,
        publishedAt: it.datetime * 1000,
        image: it.image || null,
      },
      source: { name: 'Finnhub Wire', trust: 14, authority: 8 },
    }));
  } catch {
    return [];
  }
}

async function buildBrief(edition) {
  const sources = EDITIONS[edition];
  const now = Date.now();

  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const items = await fetchFeed(source.url);
      return items.map((raw) => ({ raw, source }));
    })
  );

  let pool = [];
  const feedStatus = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      pool.push(...result.value);
      feedStatus.push({ source: sources[i].name, ok: true, items: result.value.length });
    } else {
      feedStatus.push({ source: sources[i].name, ok: false, items: 0 });
    }
  });

  if (edition === 'finance') {
    pool.push(...(await finnhubArticles()));
  }

  // Score, drop stale and unscorable items
  let articles = pool
    .map(({ raw, source }) => scoreArticle(raw, source, edition, now))
    .filter(Boolean)
    .filter((a) => a.ageHours <= MAX_AGE_HOURS);

  // Corroboration pass works best when the strongest telling comes first
  articles.sort(
    (a, b) =>
      b.metrics.headlineIntegrity + b.metrics.sourceTrust -
      (a.metrics.headlineIntegrity + a.metrics.sourceTrust)
  );
  applyCorroboration(articles);

  // Run the two 10-layer pipelines (geopolitics + finance) concurrently over
  // the whole batch. Each article is scored through both algorithms so the
  // response carries geopoliticalScore, financialScore, and finalCurationScore
  // (the edition-appropriate one) — the frontend can sort/filter on any of
  // them. Because scoring is CPU-bound but wrapped in Promise.all, we yield
  // between microtasks and don't block the response.
  const pipelineScores = await scoreArticlesAsync(articles, edition);
  articles = articles.map((a, i) => {
    const scores = pipelineScores[i] || {
      geopoliticalScore: 0,
      financialScore: 0,
      finalCurationScore: 0,
    };
    return {
      ...a,
      geopoliticalScore: scores.geopoliticalScore,
      financialScore: scores.financialScore,
      finalCurationScore: scores.finalCurationScore,
      // Keep the legacy Meridian totalScore around for observability & the
      // metric-strip breakdown UI, but the primary "score" the frontend
      // ranks / renders is now the 10-layer pipeline's finalCurationScore.
      meridianScore: totalScore(a),
      score: scores.finalCurationScore,
    };
  });

  articles = articles
    .filter((a) => a.finalCurationScore >= NOISE_FLOOR) // the clickbait cut
    .sort((a, b) => b.finalCurationScore - a.finalCurationScore)
    .slice(0, MAX_ARTICLES);

  // Event clustering runs once, here at ingestion — every downstream system
  // (story pages, briefing, comparison, Q&A, recall) reuses these clusters.
  const clusters = clusterArticles(articles, edition);
  for (const c of clusters) c.topics = topicsForCluster(c);
  const clusterIdByArticle = new Map();
  for (const c of clusters) {
    for (const id of c.articleIds) clusterIdByArticle.set(id, c.id);
  }
  articles = articles.map((a) => ({ ...a, clusterId: clusterIdByArticle.get(a.id) || null }));
  // Cluster member refs must point at the annotated articles.
  const byId = new Map(articles.map((a) => [a.id, a]));
  for (const c of clusters) c.articles = c.articleIds.map((id) => byId.get(id)).filter(Boolean);

  return {
    edition,
    generatedAt: now,
    noiseFloor: NOISE_FLOOR,
    feeds: feedStatus,
    articles,
    clusters,
  };
}

/**
 * Fetch (or serve from the 5-minute cache) the ranked brief for an edition.
 * Identical payload to the historical /api/news response body.
 */
export async function getEditionBrief(edition, { force = false } = {}) {
  const ed = edition === 'finance' ? 'finance' : 'geopolitics';

  const cached = cache.get(ed);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.payload;
  }

  if (!force && inflight.has(ed)) return inflight.get(ed);

  const p = buildBrief(ed)
    .then((payload) => {
      if (payload.articles.length > 0) cache.set(ed, { at: payload.generatedAt, payload });
      return payload;
    })
    .finally(() => inflight.delete(ed));
  if (!force) inflight.set(ed, p);
  return p;
}

/** Full cluster objects (with member article refs) for an edition. */
export async function getEditionClusters(edition, opts = {}) {
  const brief = await getEditionBrief(edition, opts);
  return { generatedAt: brief.generatedAt, clusters: brief.clusters || [] };
}

/**
 * Locate one cluster by ID. Checks the requested edition first, then the
 * other — cluster IDs are deterministic, so after a cold start the lookup
 * transparently rebuilds the pool and finds the story again.
 */
export async function findClusterById(id, editionHint) {
  const order =
    editionHint === 'finance' ? ['finance', 'geopolitics'] : ['geopolitics', 'finance'];
  for (const ed of order) {
    const { clusters } = await getEditionClusters(ed);
    const hit = clusters.find((c) => c.id === id);
    if (hit) return hit;
  }
  return null;
}

export { clusterSummary };
