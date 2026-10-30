/**
 * Pure ranking stages of the ingest pipeline (no I/O), so each one can be
 * tested and replayed offline against a snapshot.
 *
 *   score all -> cluster all -> applyBreadth (lead bonus, duplicate/syndicated
 *   penalties) -> noise floor -> diversify (per-outlet cap, <= 2 per story in
 *   the top 20) -> cap -> trim clusters
 *
 * The sort key is always `rankScore` (unclamped); `finalCurationScore` /
 * `score` is the 0-100 display value derived from it with `displayScore`.
 * Every adjustment appends a receipt layer to `scoreBreakdown` and adds the
 * same points to `rankScore`, so the receipt keeps summing to the sort key.
 */

import { breadthBonus as defaultBreadthBonus } from '../intelligence/cluster.mjs';
import { displayScore as defaultDisplayScore } from '../scoring/index.mjs';

export const LIMITS = {
  MAX_ARTICLES: 60,
  // per-outlet caps inside the top N
  OUTLET_TOP_A: 10,
  OUTLET_TOP_A_MAX: 3,
  OUTLET_TOP_B: 20,
  OUTLET_TOP_B_MAX: 5,
  OUTLET_TOP_C: 60, // loose cap over the whole brief keeps regional variety in the cut
  OUTLET_TOP_C_MAX: 12,
  // per-story cap inside the top N
  STORY_TOP: 20,
  STORY_MAX: 2,
  // rank points removed from non-lead cluster members
  SYNDICATED_PENALTY: 12, // same wire copy re-published by another outlet
  DUPLICATE_PENALTY: 6, // independent telling of the same event (still useful, never a second lead)
};

const r1 = (n) => Math.round(n * 10) / 10;

/** The sort key. Falls back for articles scored by older code paths. */
export function rankOf(a) {
  return a?.rankScore ?? a?.finalCurationScore ?? a?.score ?? 0;
}

/** rankScore desc, then newest first, then id — total and deterministic. */
export function compareRank(a, b) {
  return rankOf(b) - rankOf(a) || (b.publishedAt ?? 0) - (a.publishedAt ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);

/**
 * Outlet identity for caps: the registrable domain of the article link, so
 * several feeds of one outlet (Guardian World + regions, BBC World + Business)
 * count as one. Aggregator links (Google News) fall back to the source name.
 */
export function outletKey(a) {
  try {
    const host = new URL(a.link).hostname.toLowerCase();
    if (host === 'news.google.com') return a.sourceName;
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    return parts.slice(SECOND_LEVEL.has(sld) && tld.length === 2 ? -3 : -2).join('.');
  } catch {
    return a?.sourceName || a?.id;
  }
}

/** Append a receipt layer and move rank + display score together. Returns a new article. */
export function withLayer(article, layer, edition, display = defaultDisplayScore) {
  const rankScore = rankOf(article) + layer.delta;
  const shown = display(rankScore, edition);
  return {
    ...article,
    rankScore,
    finalCurationScore: shown,
    score: shown,
    scoreBreakdown: [...(article.scoreBreakdown || []), layer],
  };
}

/**
 * Breadth bonus for each cluster's lead; penalties for its other members.
 * Replaces the old applyCorroboration pass (and keeps `corroboration`
 * populated for UI backward compatibility: lead +round(bonus), duplicates the
 * negative penalty actually applied).
 *
 * @param {object[]} articles scored articles (with rankScore + scoreBreakdown)
 * @param {object[]} clusters from clusterArticles (articleIds, breadth, syndicated?)
 * @returns {{ articles: object[], leads: Map<string,string> }} adjusted copy; leads: clusterId -> lead article id
 */
export function applyBreadth(articles, clusters, opts = {}) {
  const {
    edition = 'geopolitics',
    bonusFn = defaultBreadthBonus,
    display = defaultDisplayScore,
    syndicatedPenalty = LIMITS.SYNDICATED_PENALTY,
    duplicatePenalty = LIMITS.DUPLICATE_PENALTY,
  } = opts;

  const byId = new Map(articles.map((a) => [a.id, a]));
  const next = new Map();
  const leads = new Map();

  for (const c of clusters) {
    const members = (c.articleIds || []).map((id) => byId.get(id)).filter(Boolean);
    if (!members.length) continue;
    members.sort(compareRank);
    const lead = members[0];
    leads.set(c.id, lead.id);
    const breadth = c.breadth ?? new Set(members.map((m) => m.sourceName)).size;
    const synd = new Set(c.syndicated || []);

    const bonus = r1(Math.max(0, Number(bonusFn(breadth)) || 0));
    if (bonus > 0) {
      const layer = {
        key: 'breadth',
        label: `Covered by ${breadth} outlets`,
        delta: bonus,
        note: 'independent outlets reporting the same event',
      };
      next.set(lead.id, { ...withLayer(lead, layer, edition, display), corroboration: Math.round(bonus) });
    } else {
      next.set(lead.id, { ...lead, corroboration: 0 });
    }

    for (const m of members.slice(1)) {
      const syndicated = synd.has(m.id);
      const pts = syndicated ? syndicatedPenalty : duplicatePenalty;
      const layer = {
        key: syndicated ? 'syndicated' : 'duplicate',
        label: syndicated ? 'Syndicated copy' : 'Repeat of a covered story',
        delta: -pts,
        note: syndicated ? 'same wire text re-published' : 'another telling of an event already ranked',
      };
      next.set(m.id, { ...withLayer(m, layer, edition, display), corroboration: -pts });
    }
  }

  return { articles: articles.map((a) => next.get(a.id) || { ...a, corroboration: a.corroboration ?? 0 }), leads };
}

/**
 * Add a signal bonus (Wikipedia/GDELT) to cluster leads.
 * @param {Map<string,{points:number,notes:string[]}>} bonuses clusterId -> bonus
 */
export function applyLeadBonuses(articles, leads, bonuses, { edition = 'geopolitics', display = defaultDisplayScore } = {}) {
  if (!bonuses?.size) return articles;
  const add = new Map();
  for (const [clusterId, b] of bonuses) {
    const leadId = leads.get(clusterId);
    if (leadId && b.points > 0) {
      add.set(leadId, { key: 'signals', label: 'Public attention signal', delta: b.points, note: b.notes.join('; ') });
    }
  }
  return articles.map((a) => (add.has(a.id) ? withLayer(a, add.get(a.id), edition, display) : a));
}

/** Drop articles whose display score is under the floor. */
export function applyNoiseFloor(articles, floor) {
  return articles.filter((a) => (a.finalCurationScore ?? a.score ?? 0) >= floor);
}

/**
 * Greedy rank-order selection under diversity constraints. For each output
 * position it takes the best remaining article that keeps the caps satisfied
 * (outlet counts in the top 10/20, items per story in the top 20); articles
 * that would break a cap are deferred to later positions, never dropped. If
 * nothing satisfies the caps it falls back to the best remaining article.
 *
 * @param {object[]} sorted articles already sorted with compareRank
 * @param {{outlets?: Array<{n:number,max:number}>, story?: {n:number,max:number}|null, limit?: number}} opts
 */
export function diversify(sorted, opts = {}) {
  const {
    outlets = [
      { n: LIMITS.OUTLET_TOP_A, max: LIMITS.OUTLET_TOP_A_MAX },
      { n: LIMITS.OUTLET_TOP_B, max: LIMITS.OUTLET_TOP_B_MAX },
      { n: LIMITS.OUTLET_TOP_C, max: LIMITS.OUTLET_TOP_C_MAX },
    ],
    story = { n: LIMITS.STORY_TOP, max: LIMITS.STORY_MAX },
    limit = Infinity,
  } = opts;

  const remaining = [...sorted];
  const out = [];
  const outletCount = new Map();
  const storyCount = new Map();
  const storyKey = (a) => a.clusterId || a.id;

  const allowed = (a, pos) => {
    const oc = outletCount.get(outletKey(a)) || 0;
    for (const t of outlets) if (pos < t.n && oc >= t.max) return false;
    if (story && pos < story.n && (storyCount.get(storyKey(a)) || 0) >= story.max) return false;
    return true;
  };

  while (remaining.length && out.length < limit) {
    const pos = out.length;
    let pick = remaining.findIndex((a) => allowed(a, pos));
    if (pick < 0) pick = 0;
    const [a] = remaining.splice(pick, 1);
    out.push(a);
    outletCount.set(outletKey(a), (outletCount.get(outletKey(a)) || 0) + 1);
    storyCount.set(storyKey(a), (storyCount.get(storyKey(a)) || 0) + 1);
  }
  return out;
}

/** Per-outlet cap only: at most `max10` per outlet in the top 10, `max20` in the top 20, `max60` in the top 60. */
export function capByOutlet(
  sorted,
  { max10 = LIMITS.OUTLET_TOP_A_MAX, max20 = LIMITS.OUTLET_TOP_B_MAX, max60 = LIMITS.OUTLET_TOP_C_MAX, limit } = {}
) {
  return diversify(sorted, {
    outlets: [
      { n: 10, max: max10 },
      { n: 20, max: max20 },
      { n: 60, max: max60 },
    ],
    story: null,
    limit,
  });
}

/** Per-story cap only: at most `max` articles of one cluster in the top `n`. */
export function limitPerStory(sorted, { n = LIMITS.STORY_TOP, max = LIMITS.STORY_MAX, limit } = {}) {
  return diversify(sorted, { outlets: [], story: { n, max }, limit });
}

/**
 * Keep clusters that have a member in the final list, restricted to members
 * that survived the noise floor; recompute size/sources/score; best first.
 */
export function trimClusters(clusters, survivors, finalIds) {
  const byId = new Map(survivors.map((a) => [a.id, a]));
  const out = [];
  for (const c of clusters) {
    const members = (c.articleIds || []).map((id) => byId.get(id)).filter(Boolean);
    if (!members.length || !members.some((m) => finalIds.has(m.id))) continue;
    members.sort(compareRank);
    out.push({
      ...c,
      articleIds: members.map((m) => m.id),
      articles: members,
      sources: [...new Set(members.map((m) => m.sourceName))],
      size: members.length,
      score: members[0].finalCurationScore ?? members[0].score ?? 0,
      rankScore: rankOf(members[0]),
    });
  }
  return out.sort((a, b) => b.rankScore - a.rankScore || (a.id < b.id ? -1 : 1));
}

/** Share of articles per region (3 d.p.); untagged items count as 'other'. */
export function regionShare(articles) {
  const counts = {};
  for (const a of articles) {
    const r = a.region || 'other';
    counts[r] = (counts[r] || 0) + 1;
  }
  const total = articles.length || 1;
  return Object.fromEntries(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([r, n]) => [r, Math.round((n / total) * 1000) / 1000])
  );
}
