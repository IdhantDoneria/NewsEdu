/**
 * Stable story identity.
 *
 * Cluster ids are `c` + a hash of the earliest member's link (see
 * cluster.mjs). That is reproducible across serverless instances but fragile:
 * when the earliest article ages out or a new article scoops it, the id
 * changes and anything that saved the old id (follows, bookmarks, an open
 * story page) is orphaned. This module reconciles ids across runs:
 *
 *   reconcileClusterIds(newClusters, prevClusters)
 *     A new cluster that overlaps a previous cluster by >= 50% inherits that
 *     cluster's id; the id it would otherwise have had is kept in `aliases`
 *     (together with the previous cluster's own aliases) so old links keep
 *     resolving. Assignment is one-to-one and greedy by overlap size.
 *
 *   matchFollowedCluster(follow, clusters)
 *     Resolves a stored follow `{ clusterId, articleIds }` to the current
 *     cluster: by id, then by alias, then by article overlap (>= 50%).
 *
 * Overlap ratio = |shared article ids| / min(|a|, |b|), so a story that grows
 * (2 -> 8 articles) or shrinks (8 -> 2) keeps its identity; a split gives the
 * id to the larger half. Every tie-break is deterministic.
 */

const MIN_OVERLAP = 0.5;
const MAX_ALIASES = 12;

function idSet(ids) {
  return new Set(Array.isArray(ids) ? ids.filter((x) => x != null).map(String) : []);
}

function overlap(a, b) {
  let n = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) n++;
  const denom = Math.min(a.size, b.size);
  return { n, ratio: denom ? n / denom : 0 };
}

function hashId(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * @param {object[]} newClusters clusters from this run (ids = base ids)
 * @param {object[]} prevClusters clusters from the previous run
 * @returns {object[]} newClusters, with inherited ids and `aliases` set
 */
export function reconcileClusterIds(newClusters, prevClusters = []) {
  if (!Array.isArray(newClusters) || newClusters.length === 0) return newClusters || [];
  const prev = (prevClusters || []).filter((p) => p && p.id != null);
  const newSets = newClusters.map((c) => idSet(c.articleIds));
  const prevSets = prev.map((p) => idSet(p.articleIds));

  // Candidate (new, prev) pairs: >= 50% overlap, strongest first.
  const cands = [];
  for (let i = 0; i < newClusters.length; i++) {
    for (let j = 0; j < prev.length; j++) {
      const { n, ratio } = overlap(newSets[i], prevSets[j]);
      if (n > 0 && ratio >= MIN_OVERLAP) {
        cands.push({ i, j, n, ratio, same: newClusters[i].id === prev[j].id ? 0 : 1 });
      }
    }
  }
  cands.sort(
    (a, b) =>
      b.n - a.n ||
      b.ratio - a.ratio ||
      a.same - b.same || // keep an id where it already is
      cmp(String(prev[a.j].id), String(prev[b.j].id)) ||
      cmp(String(newClusters[a.i].id), String(newClusters[b.i].id)) ||
      a.i - b.i
  );

  const usedNew = new Set();
  const usedPrev = new Set();
  const assigned = new Map(); // new index -> prev index
  for (const c of cands) {
    if (usedNew.has(c.i) || usedPrev.has(c.j)) continue;
    usedNew.add(c.i);
    usedPrev.add(c.j);
    assigned.set(c.i, c.j);
  }

  // Final ids: inherited where assigned, base id otherwise (made unique).
  const inherited = new Set([...assigned.values()].map((j) => String(prev[j].id)));
  const taken = new Set();
  const out = newClusters.map((c, i) => {
    if (assigned.has(i)) {
      const p = prev[assigned.get(i)];
      taken.add(String(p.id));
      return { cluster: c, id: String(p.id), prev: p };
    }
    return { cluster: c, id: null, prev: null };
  });
  out.forEach((o, i) => {
    if (o.id) return;
    let id = String(o.cluster.id);
    // The base id may already belong to another cluster (inherited, or its
    // anchor article moved to a different story): re-derive deterministically.
    let k = 1;
    while (taken.has(id) || inherited.has(id)) id = `c${hashId(`${o.cluster.id}#${k++}`)}`;
    taken.add(id);
    o.id = id;
  });

  return out.map(({ cluster, id, prev: p }) => {
    const aliases = [];
    const add = (a) => {
      if (a != null && String(a) !== id && !aliases.includes(String(a))) aliases.push(String(a));
    };
    for (const a of cluster.aliases || []) add(a);
    if (p) {
      add(cluster.id); // displaced by the inherited id
      for (const a of p.aliases || []) add(a);
    }
    const next = { ...cluster, id };
    if (aliases.length) next.aliases = aliases.slice(0, MAX_ALIASES);
    else delete next.aliases;
    return next;
  });
}

/**
 * Resolve a stored follow to the current cluster, or null.
 * @param {{ clusterId?: string, articleIds?: string[] }} follow
 * @param {object[]} clusters current clusters
 */
export function matchFollowedCluster(follow, clusters) {
  if (!follow || !Array.isArray(clusters) || clusters.length === 0) return null;
  const cid = follow.clusterId != null ? String(follow.clusterId) : null;
  if (cid) {
    const byId = clusters.find((c) => String(c.id) === cid);
    if (byId) return byId;
    const byAlias = clusters
      .filter((c) => Array.isArray(c.aliases) && c.aliases.map(String).includes(cid))
      .sort((a, b) => cmp(String(a.id), String(b.id)));
    if (byAlias.length) return byAlias[0];
  }
  const saved = idSet(follow.articleIds);
  if (!saved.size) return null;
  let best = null;
  for (const c of clusters) {
    const { n, ratio } = overlap(saved, idSet(c.articleIds));
    if (n === 0 || ratio < MIN_OVERLAP) continue;
    const cand = { c, n, ratio, size: (c.articleIds || []).length };
    if (
      !best ||
      cand.n > best.n ||
      (cand.n === best.n && cand.ratio > best.ratio) ||
      (cand.n === best.n && cand.ratio === best.ratio && cand.size > best.size) ||
      (cand.n === best.n && cand.ratio === best.ratio && cand.size === best.size && cmp(String(c.id), String(best.c.id)) < 0)
    ) {
      best = cand;
    }
  }
  return best ? best.c : null;
}
