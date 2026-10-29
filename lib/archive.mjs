/**
 * Story archive: one compact snapshot of an edition's ranked stories per hour,
 * kept for 30 days, and the trend analysis computed from it.
 *
 * Layout in KV (all via lib/store/kv.mjs, so it works in memory with no env):
 *   archive:<edition>:<YYYY-MM-DD>     list of that UTC day's snapshots (newest first)
 *   archive:index:<edition>            list of hour buckets that have a snapshot
 *   archive:claim:<edition>:<bucket>   INCR claim so each hour is stored once
 * Nothing here throws; with no durable KV the archive simply holds whatever
 * this server instance has seen since it started.
 */
import { kvIncr, kvPush, kvRange, kvAvailable } from './store/kv.mjs';
import { topicById } from './intelligence/topics.mjs';

export const ARCHIVE_TTL_SEC = 30 * 24 * 3600;
export const MAX_STORIES = 60;
const MAX_ENTITIES = 6;
const DAY_MS = 864e5;

const normEdition = (e) => (e === 'finance' ? 'finance' : 'geopolitics');

export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const hourOf = (ms) => new Date(ms).toISOString().slice(0, 13); // YYYY-MM-DDTHH
export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const num = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

/**
 * Compact one cluster (or bare article) into the archived story shape:
 * { id, al?, t (title), l (link), s (source), p (publishedAt), r (rankScore),
 *   n (cluster size), e (entities), tp (topic ids) }
 */
function compactStory(c, articleById) {
  const lead = c.articles?.[0] || articleById.get(c.articleIds?.[0]) || {};
  const s = {
    id: str(c.id, 40) || null,
    t: str(c.title || lead.title, 200),
    l: str(lead.link, 400),
    s: str(lead.sourceName || lead.source?.name, 60),
    p: Number.isFinite(lead.publishedAt) ? lead.publishedAt : null,
    r: num(lead.rankScore ?? lead.score ?? c.score),
    n: Number(c.size) || 1,
    e: (c.entities || []).slice(0, MAX_ENTITIES).map((e) => str(e, 60)).filter(Boolean),
    tp: (c.topics || []).slice(0, 6).map((t) => str(t, 40)).filter(Boolean),
  };
  if (Array.isArray(c.aliases) && c.aliases.length) s.al = c.aliases.slice(0, 5).map((a) => str(a, 40));
  return s;
}

/** Build the snapshot body from a brief ({ articles, clusters? , generatedAt }). */
export function buildSnapshot(edition, brief, now = Date.now()) {
  const at = Number.isFinite(brief?.generatedAt) ? brief.generatedAt : now;
  const articles = Array.isArray(brief?.articles) ? brief.articles : [];
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const clusters = Array.isArray(brief?.clusters) ? brief.clusters : [];

  let stories;
  if (clusters.length) {
    stories = clusters.map((c) => compactStory(c, articleById));
  } else {
    // /api/news-shaped payload without cluster objects: one story per article.
    stories = articles.map((a) => ({
      id: str(a.clusterId, 40) || null,
      t: str(a.title, 200),
      l: str(a.link, 400),
      s: str(a.sourceName || a.source?.name, 60),
      p: Number.isFinite(a.publishedAt) ? a.publishedAt : null,
      r: num(a.rankScore ?? a.score),
      n: 1,
      e: [],
      tp: Array.isArray(a.topics) ? a.topics.slice(0, 6) : [],
    }));
  }
  stories = stories
    .filter((s) => s.t)
    .sort((a, b) => (b.r ?? 0) - (a.r ?? 0))
    .slice(0, MAX_STORIES);
  return { v: 1, edition: normEdition(edition), at, stories };
}

/**
 * Store an hourly snapshot (first caller in each UTC hour wins). Resolves true
 * when a snapshot was written, false when skipped or on any error.
 */
export async function archiveBrief(edition, brief) {
  try {
    const ed = normEdition(edition);
    const snap = buildSnapshot(ed, brief);
    if (snap.stories.length === 0) return false;

    const bucket = hourOf(snap.at);
    // Atomic claim so concurrent instances do not store the same hour twice.
    const n = await kvIncr(`archive:claim:${ed}:${bucket}`, { ttlSec: 2 * 3600 });
    if (n > 1) return false;

    await kvPush(`archive:${ed}:${dayOf(snap.at)}`, snap, { max: 26, ttlSec: ARCHIVE_TTL_SEC });
    await kvPush(`archive:index:${ed}`, bucket, { max: 24 * 31, ttlSec: ARCHIVE_TTL_SEC });
    return true;
  } catch {
    return false;
  }
}

/** Snapshots for one UTC day (oldest first). Never throws. */
export async function readArchive(edition, day) {
  try {
    if (!isDay(day)) return [];
    const list = await kvRange(`archive:${normEdition(edition)}:${day}`, 0, -1);
    return list
      .filter((s) => s && Array.isArray(s.stories))
      .sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

/** Days (YYYY-MM-DD, newest first) that have at least one snapshot. */
export async function archiveDays(edition) {
  try {
    const buckets = await kvRange(`archive:index:${normEdition(edition)}`, 0, -1);
    return [...new Set(buckets.map((b) => String(b).slice(0, 10)))].filter(isDay).sort().reverse();
  } catch {
    return [];
  }
}

// ---- trends -------------------------------------------------------------------

const ACRONYMS = new Set(['us', 'uk', 'eu', 'un', 'uae', 'nato', 'opec', 'imf', 'wto', 'fed', 'ai', 'ecb', 'who', 'usa']);
export function displayEntity(name) {
  return String(name)
    .split(/\s+/)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Union-find over story ids and aliases so a story keeps one identity when its id changed. */
function storyIdentity(snapshots) {
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const add = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    return x;
  };
  const union = (a, b) => {
    const ra = find(add(a));
    const rb = find(add(b));
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const snap of snapshots) {
    for (const s of snap.stories) {
      if (!s.id) continue;
      add(s.id);
      for (const a of s.al || []) union(s.id, a);
    }
  }
  return (s) => (s.id ? find(s.id) : `t:${s.t.toLowerCase().slice(0, 80)}`);
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Pure analysis of archived snapshots over the last `days` UTC days.
 * Windows for "rising": the most recent half of the days that have data versus
 * the earlier half; with fewer than two days of data there is no baseline, so
 * nothing is called rising.
 */
export function buildTrends(snapshots, { days = 7, now = Date.now() } = {}) {
  const span = Math.min(30, Math.max(1, Math.floor(days) || 7));
  const dates = [];
  for (let i = span - 1; i >= 0; i--) dates.push(dayOf(now - i * DAY_MS));
  const inRange = new Set(dates);
  const snaps = (snapshots || []).filter((s) => s && Array.isArray(s.stories) && inRange.has(dayOf(s.at)));

  const identity = storyIdentity(snaps);
  // day -> Map(storyKey -> story) (latest snapshot of the day wins)
  const byDay = new Map(dates.map((d) => [d, new Map()]));
  const stories = new Map(); // key -> recurring-story accumulator
  for (const snap of [...snaps].sort((a, b) => a.at - b.at)) {
    const day = dayOf(snap.at);
    for (const s of snap.stories) {
      const key = identity(s);
      byDay.get(day).set(key, s);
      let acc = stories.get(key);
      if (!acc) {
        acc = { key, days: new Set(), snapshots: 0, firstSeen: snap.at, peak: -Infinity };
        stories.set(key, acc);
      }
      acc.days.add(day);
      acc.snapshots++;
      acc.lastSeen = snap.at;
      acc.title = s.t;
      acc.link = s.l;
      acc.source = s.s;
      acc.id = s.id;
      acc.size = Math.max(acc.size || 1, s.n || 1);
      if ((s.r ?? -Infinity) > acc.peak) acc.peak = s.r;
    }
  }

  const daysWithData = dates.filter((d) => byDay.get(d).size > 0);

  // Entity and topic counts per day (distinct stories mentioning each).
  const entityDay = new Map(); // entity -> Map(day -> count)
  const topicDay = new Map(); // topic -> Map(day -> count)
  const bump = (m, k, d) => {
    if (!m.has(k)) m.set(k, new Map());
    m.get(k).set(d, (m.get(k).get(d) || 0) + 1);
  };
  for (const d of daysWithData) {
    for (const s of byDay.get(d).values()) {
      for (const e of new Set(s.e || [])) bump(entityDay, e, d);
      for (const t of new Set(s.tp || [])) bump(topicDay, t, d);
    }
  }
  const sumOver = (m, ds) => ds.reduce((n, d) => n + (m.get(d) || 0), 0);
  const series = (m) => dates.map((d) => m.get(d) || 0);

  const entities = [...entityDay.entries()]
    .map(([name, m]) => ({ name, label: displayEntity(name), total: sumOver(m, dates), series: series(m) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 12);

  const dayTotals = dates.map((d) => byDay.get(d).size);
  const topics = [...topicDay.entries()]
    .map(([id, m]) => ({
      id,
      label: topicById(id)?.label || id,
      total: sumOver(m, dates),
      // share of that day's stories; null on days with no data
      share: dates.map((d, i) => (dayTotals[i] ? round((m.get(d) || 0) / dayTotals[i], 3) : null)),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // Rising entities: recent half vs earlier half of the days that have data.
  const hasBaseline = daysWithData.length >= 2;
  let rising = [];
  if (hasBaseline) {
    const cut = Math.floor(daysWithData.length / 2);
    const prior = daysWithData.slice(0, cut);
    const recent = daysWithData.slice(cut);
    rising = [...entityDay.entries()]
      .map(([name, m]) => {
        const p = sumOver(m, prior) / prior.length; // mean stories/day
        const r = sumOver(m, recent) / recent.length;
        return { name, label: displayEntity(name), recent: round(r), prior: round(p), delta: round(r - p), isNew: p === 0 };
      })
      .filter((x) => x.recent >= 1.5 && x.delta >= 1)
      .sort((a, b) => b.delta - a.delta || b.recent - a.recent || a.name.localeCompare(b.name))
      .slice(0, 10);
  }

  const recurring = [...stories.values()]
    .filter((s) => s.days.size >= 2)
    .map((s) => ({
      id: s.id,
      title: s.title,
      link: s.link,
      source: s.source,
      daysSeen: s.days.size,
      snapshots: s.snapshots,
      firstSeen: s.firstSeen,
      lastSeen: s.lastSeen,
      peakRank: Number.isFinite(s.peak) ? s.peak : null,
      size: s.size,
    }))
    .sort((a, b) => b.daysSeen - a.daysSeen || b.snapshots - a.snapshots || (b.peakRank ?? 0) - (a.peakRank ?? 0))
    .slice(0, 15);

  return {
    days: span,
    dates,
    snapshots: snaps.length,
    daysWithData: daysWithData.length,
    stories: stories.size,
    hasBaseline,
    entities,
    topics,
    rising,
    recurring,
  };
}

/** Read the archive for the last `days` days and compute trends. Never throws. */
export async function readTrends(edition, days = 7, { now = Date.now() } = {}) {
  const ed = normEdition(edition);
  const span = Math.min(30, Math.max(1, Math.floor(Number(days)) || 7));
  try {
    const dates = [];
    for (let i = 0; i < span; i++) dates.push(dayOf(now - i * DAY_MS));
    const lists = await Promise.all(dates.map((d) => readArchive(ed, d)));
    const trends = buildTrends(lists.flat(), { days: span, now });
    return { edition: ed, durable: kvAvailable(), ...trends };
  } catch {
    return { edition: ed, durable: kvAvailable(), ...buildTrends([], { days: span, now }) };
  }
}

