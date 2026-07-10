/**
 * Personalized Daily Intelligence Briefing composer.
 *
 * Finite by construction: at most 4 essential + 3 developing + 1 understand
 * + 3 watch items. Ranking blends personal relevance with global
 * significance — default 70/30, configurable per request. The composer is
 * fully deterministic; AI cost is zero (it reuses cached cluster scores and
 * intelligence objects).
 */

import { topicsForCluster, topicById } from './topics.mjs';
import { detectChanges } from './changes.mjs';

const LIMITS = { essential: 4, developing: 3, understand: 1, watch: 3 };

function relevanceScore(cluster, interests, followedIds) {
  let r = 0;
  const topics = cluster.topics || topicsForCluster(cluster);
  for (const t of topics) {
    if (interests.includes(t)) r += 40;
  }
  if (followedIds.has(cluster.id)) r += 50;
  return Math.min(100, r);
}

function globalScore(cluster) {
  // Normalised curation score, boosted by multi-source corroboration.
  const corroborationBoost = Math.min(20, (cluster.sources.length - 1) * 8);
  return Math.min(100, (cluster.score || 0) * 0.8 + corroborationBoost);
}

function summarizeForBriefing(cluster, intelRecord) {
  const intel = intelRecord?.intel;
  // Fallback intel's whatHappened starts with the headline — don't repeat the
  // title as the summary line.
  let summary = intel?.whatHappened?.text || '';
  if (summary.startsWith(cluster.title)) {
    summary = summary.slice(cluster.title.length).replace(/^\s*[—–-]\s*/, '');
  }
  if (!summary) summary = cluster.articles[0]?.summary || '';
  return {
    clusterId: cluster.id,
    edition: cluster.edition,
    title: cluster.title,
    summary: summary.slice(0, 260),
    whyItMatters: intel?.whyItMatters?.[0]?.text?.slice(0, 220) || '',
    sources: cluster.sources.slice(0, 4),
    size: cluster.size,
    score: cluster.score,
    latestAt: cluster.latestAt,
    topics: cluster.topics || [],
  };
}

/**
 * Compose the briefing.
 *
 * @param clusters      all current clusters (both editions merged)
 * @param intelByCluster Map<clusterId, intelRecord> for clusters that have one
 * @param profile       { interests: [topicId], follows: [{clusterId, snapshot}], weights? }
 */
export function composeBriefing(clusters, intelByCluster, profile = {}) {
  const interests = Array.isArray(profile.interests) ? profile.interests : [];
  const follows = Array.isArray(profile.follows) ? profile.follows : [];
  const followedIds = new Set(follows.map((f) => f.clusterId));
  const snapshotById = new Map(follows.map((f) => [f.clusterId, f.snapshot]));

  const wRel = clampWeight(profile.weights?.relevance, 0.7);
  const wGlob = 1 - wRel;

  const ranked = clusters
    .map((c) => {
      const rel = relevanceScore(c, interests, followedIds);
      const glob = globalScore(c);
      return { cluster: c, rel, glob, blended: rel * wRel + glob * wGlob };
    })
    .sort((a, b) => b.blended - a.blended);

  const used = new Set();
  const take = (list, n, pred = () => true) => {
    const out = [];
    for (const item of list) {
      if (out.length >= n) break;
      if (used.has(item.cluster.id)) continue;
      if (!pred(item)) continue;
      used.add(item.cluster.id);
      out.push(item);
    }
    return out;
  };

  // ESSENTIAL — the blended top, but guarantee global significance keeps a
  // floor: at least one slot goes to the top pure-global story even for a
  // heavily personalised profile.
  const essential = take(ranked, LIMITS.essential - 1);
  const topGlobal = [...ranked].sort((a, b) => b.glob - a.glob);
  essential.push(...take(topGlobal, 1));
  essential.sort((a, b) => b.blended - a.blended);

  // DEVELOPING — followed or interest-matched stories with material change
  // since the user's snapshot.
  const developing = [];
  for (const item of ranked) {
    if (developing.length >= LIMITS.developing) break;
    if (used.has(item.cluster.id)) continue;
    if (item.rel <= 0) continue;
    const snapshot = snapshotById.get(item.cluster.id);
    const delta = detectChanges(item.cluster, snapshot || { articleIds: [], lastSeenAt: 0 });
    if (delta.changes.length > 0) {
      used.add(item.cluster.id);
      developing.push({ ...item, topChange: delta.changes[delta.changes.length - 1] });
    }
  }

  // UNDERSTAND ONE ISSUE — the richest story (most sources, most articles)
  // worth deeper context.
  const richest = [...ranked].sort(
    (a, b) =>
      b.cluster.sources.length * 10 + b.cluster.size - (a.cluster.sources.length * 10 + a.cluster.size)
  );
  const understand = take(richest, LIMITS.understand, (i) => i.cluster.size >= 2);
  if (understand.length === 0) understand.push(...take(richest, 1));

  // WATCH NEXT — upcoming decisions/releases pulled from intelligence
  // objects' watchNext / scenarios where available.
  const watch = [];
  for (const item of ranked) {
    if (watch.length >= LIMITS.watch) break;
    const intel = intelByCluster.get(item.cluster.id)?.intel;
    const w = intel?.watchNext?.[0] || null;
    const s = intel?.scenarios?.[0] || null;
    if (w || s) {
      watch.push({
        clusterId: item.cluster.id,
        title: item.cluster.title,
        text: w ? w.text : `Scenario to watch: ${s.description}`,
        classification: w ? w.classification : 'SCENARIO',
        uncertainty: s?.uncertainty,
      });
    }
  }

  const toItem = (i) => ({
    ...summarizeForBriefing(i.cluster, intelByCluster.get(i.cluster.id)),
    relevance: Math.round(i.rel),
    global: Math.round(i.glob),
    followed: followedIds.has(i.cluster.id),
    topChange: i.topChange || null,
  });

  return {
    generatedAt: Date.now(),
    weights: { relevance: wRel, global: wGlob },
    personalized: interests.length > 0 || follows.length > 0,
    essential: essential.map(toItem),
    developing: developing.map(toItem),
    understand: understand.map(toItem),
    watch,
    interestsUsed: interests.map((id) => topicById(id)?.label).filter(Boolean),
  };
}

function clampWeight(w, dflt) {
  const n = Number(w);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(0.9, Math.max(0.1, n));
}
