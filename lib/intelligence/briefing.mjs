/**
 * Personalized Daily Intelligence Briefing composer.
 *
 * Finite by construction (slots in BRIEFING_LIMITS) and fully deterministic:
 * a pure function of (clusters, intel, profile, now). AI cost is zero (it
 * reuses cached cluster scores and intelligence objects).
 *
 * Ranking blends personal relevance with global significance (default
 * 70/30). Both are put on comparable 0-100 ranges (global is normalised
 * against the current pool, relevance is a graded interest affinity) and
 * relevance is gated by story quality, so a weak match cannot outrank a major
 * story and a major story cannot be buried by any match.
 *
 * Essential is diversified with MMR (lambda 0.8): at most `maxPerTopic` per
 * topic, one slot reserved for the best global story that does not overlap
 * earlier picks, and (when personalised) a seeded exploration slot from
 * outside the reader's topics. Watch/Understand/Developing never repeat an
 * Essential pick. Stories already shown in the last 48 h are skipped unless
 * they have material new developments.
 */

import { topicsForCluster, topicById } from './topics.mjs';
import { detectChanges } from './changes.mjs';
import { titleTokenSet } from './cluster.mjs';
import { EXPLICIT_WEIGHT, MAX_WEIGHT, fnv1a, weightsHash } from '../personal/interests.mjs';

/** Slots per section. */
export const BRIEFING_LIMITS = { essential: 4, developing: 3, understand: 1, watch: 3 };

export const BRIEFING_CONFIG = {
  mmrLambda: 0.8, // relevance vs redundancy in Essential
  maxPerTopic: 2, // per topic, across Essential
  shownWindowMs: 48 * 36e5, // repeat suppression window
  explorationEpsilon: 0.1, // per-Essential-slot chance of an exploration slot (seeded, deterministic)
  explorationPool: 5, // exploration picks among the top N non-matching stories
  activeInterest: 0.15, // weight above which a topic counts as "your topic"
  followWeight: 0.6, // affinity of a followed story
  minEssentialBackfill: 2, // never let suppression leave Essential emptier than this
};

export const EXPLORATION_LABEL = 'Outside your usual topics';

/* --------------------------------- helpers --------------------------------- */

const byIdAsc = (a, b) => (a.cluster.id < b.cluster.id ? -1 : a.cluster.id > b.cluster.id ? 1 : 0);

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function sharedCount(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

/**
 * The geopolitics and finance pools cluster independently, so one real-world
 * event ("SK Hynix raises $26.5bn") can arrive as a cluster from each
 * edition. Collapse near-identical stories, keeping the stronger telling,
 * so a finite briefing never spends two slots on one event.
 */
function dedupeAcrossEditions(clusters) {
  const kept = [];
  const sorted = [...clusters].sort((a, b) => (b.score || 0) - (a.score || 0) || (a.id < b.id ? -1 : 1));
  for (const c of sorted) {
    const toks = titleTokenSet(c.title);
    const ents = new Set(c.entities || []);
    const dup = kept.some((k) => sameEvent(toks, ents, k.toks, k.ents));
    if (!dup) kept.push({ cluster: c, toks, ents });
  }
  return kept.map((k) => k.cluster);
}

function sameEvent(toksA, entsA, toksB, entsB) {
  const st = sharedCount(toksA, toksB);
  return st >= 3 || (st >= 2 && sharedCount(entsA, entsB) >= 1);
}

/* --------------------------------- profile --------------------------------- */

function normalizeProfile(profile, now, cfg) {
  const weights = {};
  for (const id of Array.isArray(profile.interests) ? profile.interests : []) {
    if (topicById(id)) weights[id] = EXPLICIT_WEIGHT;
  }
  const given = profile.interestWeights && typeof profile.interestWeights === 'object' ? profile.interestWeights : {};
  for (const [id, w] of Object.entries(given)) {
    const n = Number(w);
    if (topicById(id) && Number.isFinite(n) && n > 0) weights[id] = Math.max(weights[id] || 0, Math.min(MAX_WEIGHT, n));
  }

  const follows = Array.isArray(profile.follows) ? profile.follows : [];
  const followedIds = new Set(follows.map((f) => f.clusterId));
  const snapshotById = new Map(follows.map((f) => [f.clusterId, f.snapshot]));

  // Shown state: ids as strings (age unknown: treated as just shown) or
  // { id, at, articleIds }. Only the last 48 h count.
  const shown = new Map();
  for (const s of Array.isArray(profile.shown) ? profile.shown : []) {
    const id = typeof s === 'string' ? s : s?.id;
    if (!id) continue;
    const at = typeof s === 'string' ? now : Number(s.at) || 0;
    if (now - at > cfg.shownWindowMs || at > now + 36e5) continue;
    const prev = shown.get(id);
    if (!prev || at > prev.at) shown.set(id, { at, articleIds: Array.isArray(s?.articleIds) ? s.articleIds.map(String) : [] });
  }
  return { weights, follows, followedIds, snapshotById, shown };
}

/** Graded affinity 0-100: strongest topic plus damped contributions of the next two. */
function relevanceOf(topics, weights, followed, cfg) {
  const ws = topics.map((t) => weights[t] || 0).filter((w) => w > 0).sort((a, b) => b - a);
  let r = ws.length ? Math.min(1, ws[0] + 0.25 * (ws[1] || 0) + 0.1 * (ws[2] || 0)) : 0;
  if (followed) r = 1 - (1 - r) * (1 - cfg.followWeight);
  return r * 100;
}

/* --------------------------------- summary --------------------------------- */

function summarizeForBriefing(cluster, intelRecord) {
  const intel = intelRecord?.intel;
  // Fallback intel's whatHappened starts with the headline: don't repeat the
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

/* ---------------------------------- compose -------------------------------- */

/**
 * Compose the briefing.
 *
 * @param clusters       all current clusters (both editions merged)
 * @param intelByCluster Map<clusterId, intelRecord> for clusters that have one
 * @param profile        { interests: [topicId], interestWeights?: {topicId: 0..1},
 *                         follows: [{clusterId, snapshot}], shown?: [id | {id, at, articleIds}],
 *                         weights?: { relevance } }
 * @param opts           { now, limits, mmrLambda, maxPerTopic, explorationEpsilon, forceExploration }
 */
export function composeBriefing(clusters, intelByCluster, profile = {}, opts = {}) {
  const cfg = { ...BRIEFING_CONFIG, ...pick(opts, ['mmrLambda', 'maxPerTopic', 'explorationEpsilon']) };
  const limits = { ...BRIEFING_LIMITS, ...(opts.limits || {}) };
  const now = Number(opts.now ?? profile.now) || Date.now();
  const P = normalizeProfile(profile, now, cfg);

  const wRel = clampWeight(profile.weights?.relevance, 0.7);
  const wGlob = 1 - wRel;

  const pool = dedupeAcrossEditions(clusters);

  // Global significance, normalised against this pool so it spans 0-100 the
  // same way relevance does (cluster.score is an unclamped rank key).
  const raw = pool.map((c) => Number(c.score) || 0).sort((a, b) => a - b);
  const lo = percentile(raw, 0.1);
  const hi = percentile(raw, 0.95);
  const globalOf = (c) => {
    const base = hi > lo ? clamp(((Number(c.score) || 0) - lo) / (hi - lo), 0, 1) * 100 : 50;
    const breadth = Number.isFinite(c.breadth) ? c.breadth : c.sources.length;
    return clamp(base * 0.9 + Math.min(10, Math.max(0, breadth - 1) * 4), 0, 100);
  };

  const changeCache = new Map();
  const changesFor = (c, snapshot) => {
    const key = c.id;
    if (!changeCache.has(key)) changeCache.set(key, detectChanges(c, snapshot || { articleIds: [], lastSeenAt: 0 }, opts.changeOpts));
    return changeCache.get(key);
  };

  const items = pool
    .map((c) => {
      const topics = c.topics || topicsForCluster(c);
      const followed = P.followedIds.has(c.id);
      const rel = relevanceOf(topics, P.weights, followed, cfg);
      const glob = globalOf(c);
      // Relevance is gated by story quality: a match is worth full weight only
      // for a significant story, so neither side is lexicographic.
      const blended = wGlob * glob + wRel * rel * (0.35 + 0.65 * (glob / 100));
      const shownEntry = [c.id, ...(c.aliases || [])].map((id) => P.shown.get(id)).find(Boolean);
      return {
        cluster: c,
        topics,
        toks: titleTokenSet(c.title),
        ents: new Set(c.entities || []),
        topicSet: new Set(topics),
        followed,
        rel,
        glob,
        blended,
        shownEntry,
      };
    })
    .sort((a, b) => b.blended - a.blended || byIdAsc(a, b));

  // Shown-state suppression: a repeat survives only with material change.
  const suppressed = [];
  const candidates = [];
  for (const it of items) {
    if (!it.shownEntry) {
      candidates.push(it);
      continue;
    }
    const snapshot = P.snapshotById.get(it.cluster.id) || { articleIds: it.shownEntry.articleIds, lastSeenAt: it.shownEntry.at };
    const delta = changesFor(it.cluster, snapshot);
    if (delta.changes.length > 0) {
      it.repeat = true;
      it.topChange = delta.changes[delta.changes.length - 1];
      candidates.push(it);
    } else {
      suppressed.push(it);
    }
  }

  const used = new Set();
  const usedItems = [];
  const markUsed = (it) => {
    used.add(it.cluster.id);
    usedItems.push(it);
  };
  const free = (it) => !used.has(it.cluster.id);
  const overlapsUsed = (it) => usedItems.some((u) => sameEvent(it.toks, it.ents, u.toks, u.ents));

  /* ESSENTIAL ---------------------------------------------------------------- */
  const essential = [];
  const topicCount = new Map();
  const capOk = (it) => it.topics.every((t) => (topicCount.get(t) || 0) < cfg.maxPerTopic);
  const addEssential = (it, slot) => {
    it.slot = slot;
    essential.push(it);
    markUsed(it);
    for (const t of it.topics) topicCount.set(t, (topicCount.get(t) || 0) + 1);
  };
  const simTo = (it, picked) =>
    picked.reduce(
      (m, p) => Math.max(m, 0.5 * jaccard(it.topicSet, p.topicSet) + 0.5 * Math.max(jaccard(it.toks, p.toks), jaccard(it.ents, p.ents))),
      0
    );

  const activeTopics = new Set(Object.entries(P.weights).filter(([, w]) => w >= cfg.activeInterest).map(([t]) => t));
  const personalized = activeTopics.size > 0 || P.followedIds.size > 0;

  // Exploration: seeded by date + interest hash, one chance per Essential slot.
  const dayKey = new Date(now).toISOString().slice(0, 10);
  const seed = fnv1a(`${dayKey}|${weightsHash(P.weights)}`);
  let exploreSlots = 0;
  if (personalized && limits.essential >= 3) {
    if (opts.forceExploration) exploreSlots = 1;
    else {
      for (let k = 0; k < limits.essential; k++) {
        if (fnv1a(`${seed}|slot${k}`) / 4294967296 < cfg.explorationEpsilon) {
          exploreSlots = 1; // at most one exploration slot
          break;
        }
      }
    }
  }

  const reserved = 1 /* global floor */ + exploreSlots;
  const personalSlots = Math.max(0, limits.essential - reserved);
  for (let k = 0; k < personalSlots; k++) {
    const pickFrom = (strict) => {
      let best = null;
      let bestScore = -Infinity;
      for (const it of candidates) {
        if (!free(it) || (strict && !capOk(it))) continue;
        const mmr = cfg.mmrLambda * it.blended - (1 - cfg.mmrLambda) * 100 * simTo(it, essential);
        if (mmr > bestScore + 1e-9) {
          best = it;
          bestScore = mmr;
        }
      }
      return best;
    };
    const it = pickFrom(true) || pickFrom(false);
    if (!it) break;
    addEssential(it, 'personal');
  }

  // Floor: the best global story that does not overlap earlier picks.
  const byGlobal = [...candidates].sort((a, b) => b.glob - a.glob || byIdAsc(a, b));
  const floor =
    byGlobal.find((it) => free(it) && capOk(it) && !overlapsUsed(it)) ||
    byGlobal.find((it) => free(it) && !overlapsUsed(it)) ||
    byGlobal.find((it) => free(it));
  if (floor && essential.length < limits.essential) addEssential(floor, 'global');

  // Exploration: a strong story from outside the reader's topics.
  if (exploreSlots && essential.length < limits.essential) {
    const outside = byGlobal.filter(
      (it) => free(it) && !it.followed && !it.topics.some((t) => activeTopics.has(t)) && !overlapsUsed(it) && capOk(it)
    );
    const top = outside.slice(0, cfg.explorationPool);
    if (top.length) {
      const pick = top[fnv1a(`${seed}|pick`) % top.length];
      addEssential(pick, 'exploration');
    }
  }

  // Fill any slot a constraint left empty (small pools).
  while (essential.length < limits.essential) {
    const it = candidates.find((x) => free(x) && !overlapsUsed(x)) || candidates.find(free);
    if (!it) break;
    addEssential(it, 'personal');
  }

  // Suppression must not empty the briefing: backfill with the best repeats.
  const repeats = [];
  if (essential.length < Math.min(cfg.minEssentialBackfill, limits.essential)) {
    for (const it of suppressed) {
      if (essential.length >= Math.min(cfg.minEssentialBackfill, limits.essential)) break;
      if (!free(it) || overlapsUsed(it)) continue;
      it.repeat = true;
      repeats.push(it);
      addEssential(it, 'repeat');
    }
  }
  essential.sort((a, b) => b.blended - a.blended || byIdAsc(a, b));

  /* DEVELOPING --------------------------------------------------------------- */
  // Followed or interest-matched stories with material change since the
  // reader's snapshot.
  const developing = [];
  for (const it of candidates) {
    if (developing.length >= limits.developing) break;
    if (!free(it) || it.rel <= 0) continue;
    const snapshot = P.snapshotById.get(it.cluster.id) || it.shownEntry && { articleIds: it.shownEntry.articleIds, lastSeenAt: it.shownEntry.at };
    const delta = changesFor(it.cluster, snapshot);
    if (delta.changes.length > 0) {
      it.topChange = delta.changes[delta.changes.length - 1];
      markUsed(it);
      developing.push(it);
    }
  }

  /* UNDERSTAND --------------------------------------------------------------- */
  // The richest story (most outlets, most articles) worth deeper context.
  const richness = (it) => (Number.isFinite(it.cluster.breadth) ? it.cluster.breadth : it.cluster.sources.length) * 10 + it.cluster.size;
  const richest = [...candidates].sort((a, b) => richness(b) - richness(a) || byIdAsc(a, b));
  const understand = [];
  const pickUnderstand = (pred) => {
    for (const it of richest) {
      if (understand.length >= limits.understand) break;
      if (free(it) && !overlapsUsed(it) && pred(it)) {
        markUsed(it);
        understand.push(it);
      }
    }
  };
  pickUnderstand((it) => it.cluster.size >= 2);
  if (understand.length === 0) pickUnderstand(() => true);

  /* WATCH -------------------------------------------------------------------- */
  // Upcoming decisions/releases from the intelligence objects. Never a story
  // already placed above.
  const watch = [];
  for (const it of items) {
    if (watch.length >= limits.watch) break;
    if (!free(it) || it.shownEntry && !candidates.includes(it) || overlapsUsed(it)) continue;
    const intel = intelByCluster.get(it.cluster.id)?.intel;
    const w = intel?.watchNext?.[0] || null;
    const s = intel?.scenarios?.[0] || null;
    if (w || s) {
      markUsed(it);
      watch.push({
        clusterId: it.cluster.id,
        title: it.cluster.title,
        text: w ? w.text : `Scenario to watch: ${s.description}`,
        classification: w ? w.classification : 'SCENARIO',
        uncertainty: s?.uncertainty,
      });
    }
  }

  const toItem = (it) => ({
    ...summarizeForBriefing(it.cluster, intelByCluster.get(it.cluster.id)),
    relevance: Math.round(it.rel),
    global: Math.round(it.glob),
    followed: it.followed,
    matchedTopics: it.topics.filter((t) => (P.weights[t] || 0) > 0).slice(0, 3).map((t) => topicById(t)?.label).filter(Boolean),
    slot: it.slot || null,
    exploration: it.slot === 'exploration',
    repeat: Boolean(it.repeat),
    topChange: it.topChange || null,
  });

  return {
    generatedAt: now,
    weights: { relevance: wRel, global: wGlob },
    personalized: personalized || Object.keys(P.weights).length > 0 || P.followedIds.size > 0,
    essential: essential.map(toItem),
    developing: developing.map(toItem),
    understand: understand.map(toItem),
    watch,
    interestsUsed: Object.entries(P.weights)
      .filter(([, w]) => w >= cfg.activeInterest)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([id]) => topicById(id)?.label)
      .filter(Boolean),
    exploration: essential.some((i) => i.slot === 'exploration') ? EXPLORATION_LABEL : null,
    suppressedRepeats: suppressed.length - repeats.length,
  };
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function clampWeight(w, dflt) {
  const n = Number(w);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(0.9, Math.max(0.1, n));
}
