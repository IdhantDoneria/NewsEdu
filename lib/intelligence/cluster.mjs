/**
 * Deterministic event clustering.
 *
 * Groups the scored article pool into story clusters — articles covering the
 * same underlying development. Design constraints (from the product spec):
 *
 *   - no duplicate clusters for the same event;
 *   - no merging of unrelated stories that merely share a country or person;
 *   - no merging of different phases of a broad conflict without meaningful
 *     event similarity;
 *   - not keyword-only: membership requires BOTH named-entity overlap AND
 *     substantive token/event-term overlap, inside a time window.
 *
 * Determinism matters more than cleverness here: cluster IDs must be
 * reproducible across serverless instances so /story/[id] URLs and
 * client-held follow state survive a cold start. The ID is derived from the
 * cluster's anchor article (the earliest, highest-integrity telling).
 */

import { extractEntities, extractEventTerms } from './entities.mjs';

const TIME_WINDOW_MS = 48 * 36e5; // join window vs the cluster's latest article

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'amid', 'among', 'because', 'before',
  'being', 'between', 'could', 'every', 'first', 'from', 'global', 'have',
  'here', 'into', 'major', 'more', 'news', 'over', 'report', 'says', 'said',
  'their', 'there', 'these', 'this', 'time', 'today', 'under', 'update',
  'week', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'world',
  'year', 'years', 'would', 'should', 'still', 'been', 'were', 'than', 'then',
  'that', 'they', 'them', 'just', 'also', 'some', 'most', 'much', 'many',
]);

function significantTokens(text) {
  const lower = String(text || '').toLowerCase();
  const words = (lower.match(/[a-z][a-z'-]{3,}/g) || []).filter((w) => !STOPWORDS.has(w));
  // Numbers are strong event discriminators ("$26.5bn offering" is the same
  // story whether the headline says "billion" or "bn"), so normalised numeric
  // tokens count toward title similarity too.
  const numbers = (lower.match(/\d+(?:\.\d+)?/g) || []).filter((n) => n.length >= 2 && !/^(19|20)\d{2}$/.test(n));
  return new Set([...words, ...numbers]);
}

function shared(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

function hashId(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function articleFeatures(article) {
  const text = `${article.title} ${article.summary || ''}`;
  return {
    article,
    entities: new Set(extractEntities(text).map((e) => e.canonical)),
    titleTokens: significantTokens(article.title),
    tokens: significantTokens(text),
    eventTerms: extractEventTerms(text),
  };
}

/**
 * Decide whether an article belongs to a cluster. Requires named-entity
 * agreement AND event-level similarity — a shared country alone never joins.
 */
function belongs(feat, cluster) {
  // Time window vs the cluster's span.
  const t = feat.article.publishedAt;
  if (t < cluster.earliestAt - TIME_WINDOW_MS || t > cluster.latestAt + TIME_WINDOW_MS) {
    return false;
  }

  const sharedEntities = shared(feat.entities, cluster.entities);
  if (sharedEntities === 0) return false;

  const sharedTitleTokens = shared(feat.titleTokens, cluster.titleTokens);
  const sharedEventTerms = shared(feat.eventTerms, cluster.eventTerms);

  // Strong headline agreement (the old corroboration signal, tightened by
  // the entity requirement above).
  if (sharedTitleTokens >= 3) return true;

  // Same actors + same kind of event + some headline agreement.
  if (sharedEntities >= 2 && sharedEventTerms >= 1 && sharedTitleTokens >= 2) return true;

  // Very specific actor set (3+ shared entities) with matching event type.
  if (sharedEntities >= 3 && sharedEventTerms >= 2) return true;

  return false;
}

/**
 * Cluster a scored, ranked article list (as produced by lib/ingest.js).
 * Greedy agglomerative pass in rank order, so the strongest telling of an
 * event anchors its cluster. Returns clusters sorted by top article score.
 */
export function clusterArticles(articles, edition) {
  const clusters = [];

  for (const article of articles) {
    const feat = articleFeatures(article);
    let best = null;
    let bestOverlap = -1;
    for (const cluster of clusters) {
      if (belongs(feat, cluster)) {
        const overlap =
          shared(feat.titleTokens, cluster.titleTokens) +
          shared(feat.entities, cluster.entities);
        if (overlap > bestOverlap) {
          best = cluster;
          bestOverlap = overlap;
        }
      }
    }

    if (best) {
      best.members.push(feat);
      for (const e of feat.entities) best.entities.add(e);
      for (const t of feat.titleTokens) best.titleTokens.add(t);
      for (const ev of feat.eventTerms) best.eventTerms.add(ev);
      best.earliestAt = Math.min(best.earliestAt, article.publishedAt);
      best.latestAt = Math.max(best.latestAt, article.publishedAt);
    } else {
      clusters.push({
        members: [feat],
        entities: new Set(feat.entities),
        titleTokens: new Set(feat.titleTokens),
        eventTerms: new Set(feat.eventTerms),
        earliestAt: article.publishedAt,
        latestAt: article.publishedAt,
      });
    }
  }

  return clusters.map((c) => finalizeCluster(c, edition));
}

function finalizeCluster(c, edition) {
  const members = [...c.members].sort(
    (a, b) => (b.article.score ?? 0) - (a.article.score ?? 0)
  );
  const articles = members.map((m) => m.article);
  const anchor =
    [...articles].sort((a, b) => a.publishedAt - b.publishedAt)[0] || articles[0];
  const top = articles[0];
  const sources = [...new Set(articles.map((a) => a.sourceName))];

  // Entity list ordered by how many member articles mention each entity —
  // the shared story subject floats to the top.
  const counts = new Map();
  for (const m of c.members) {
    for (const e of m.entities) counts.set(e, (counts.get(e) || 0) + 1);
  }
  const entities = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([e]) => e)
    .slice(0, 10);

  return {
    id: `c${hashId(anchor.link)}`,
    edition,
    title: top.title,
    entities,
    eventTerms: [...c.eventTerms].slice(0, 12),
    articleIds: articles.map((a) => a.id),
    articles,
    sources,
    size: articles.length,
    score: top.score ?? 0,
    earliestAt: c.earliestAt,
    latestAt: c.latestAt,
  };
}

/** Compact summary of a cluster, safe to ship in list payloads. */
export function clusterSummary(cluster) {
  return {
    id: cluster.id,
    edition: cluster.edition,
    title: cluster.title,
    entities: cluster.entities,
    articleIds: cluster.articleIds,
    sources: cluster.sources,
    size: cluster.size,
    score: cluster.score,
    earliestAt: cluster.earliestAt,
    latestAt: cluster.latestAt,
  };
}

/** Stable content-version hash for a cluster (changes when membership changes). */
export function clusterVersion(cluster) {
  return hashId([...cluster.articleIds].sort().join('|'));
}
