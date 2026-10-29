/**
 * Snapshot loading and replay for the evaluation harness.
 *
 * Two replay modes, both running the CURRENT code in this checkout:
 *
 *  - "pipeline": needs raw-<edition>.json. Serves the raw feed items from a mocked `fetch` and runs the
 *    real lib/ingest.js `getEditionBrief` (filters, legacy score, 10-layer scoring, dedupe, noise floor, cap,
 *    clustering, whatever the ingest stage does at this commit). Date.now is frozen at capture time.
 *  - "rescore": needs only news-<edition>.json (post-cap production output). Strips the old scores,
 *    re-scores the articles through `scoreArticlesAsync`, re-sorts and re-clusters. Cannot exercise
 *    ingest-stage logic (caps, breadth bonus) because the pool was already cut to 60.
 *
 * Interfaces change during the build; every read is defensive (`rankScore ?? finalCurationScore ?? score`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Code under test. Defaults to this checkout; EVAL_CODE_ROOT=/path/to/other/checkout evaluates other code against these fixtures. */
export const CODE_ROOT = process.env.EVAL_CODE_ROOT ? path.resolve(process.env.EVAL_CODE_ROOT) : ROOT;
export const SNAPSHOT_ROOT = path.join(ROOT, 'tests', 'fixtures', 'snapshots');
export const EDITIONS = ['geopolitics', 'finance'];
export const MAX_ARTICLES = 60;

let aliasRegistered = false;
export function registerAlias() {
  if (aliasRegistered) return;
  register(pathToFileURL(path.join(ROOT, 'scripts', 'eval', 'alias-loader.mjs')).href);
  aliasRegistered = true;
}

/** Sort key used everywhere: unclamped rank when present, else the display score. */
export const sortKey = (a) => a?.rankScore ?? a?.finalCurationScore ?? a?.score ?? 0;
export const displayOf = (a) => a?.finalCurationScore ?? a?.score ?? a?.rankScore ?? 0;

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function listSnapshots() {
  try {
    return fs
      .readdirSync(SNAPSHOT_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/** Resolve a snapshot by directory name, absolute/relative path, or 'latest' / 'latest-raw'. */
export function resolveSnapshotDir(spec = 'latest') {
  const names = listSnapshots();
  const usable = (n, needRaw) =>
    EDITIONS.some((ed) => fs.existsSync(path.join(SNAPSHOT_ROOT, n, `${needRaw ? 'raw' : 'news'}-${ed}.json`)));
  if (spec === 'latest' || spec === 'latest-raw') {
    const hit = [...names].reverse().find((n) => usable(n, spec === 'latest-raw')) || [...names].reverse().find((n) => usable(n, false));
    if (!hit) throw new Error('no snapshots found under tests/fixtures/snapshots');
    return path.join(SNAPSHOT_ROOT, hit);
  }
  const direct = path.join(SNAPSHOT_ROOT, spec);
  if (fs.existsSync(direct)) return direct;
  const abs = path.resolve(process.cwd(), spec);
  if (fs.existsSync(abs)) return abs;
  throw new Error(`snapshot not found: ${spec}`);
}

export function loadSnapshot(spec = 'latest') {
  const dir = resolveSnapshotDir(spec);
  const snap = { name: path.basename(dir), dir, news: {}, raw: {}, intel: {}, meta: readJson(path.join(dir, 'meta.json')) };
  for (const ed of EDITIONS) {
    snap.news[ed] = readJson(path.join(dir, `news-${ed}.json`));
    snap.raw[ed] = readJson(path.join(dir, `raw-${ed}.json`));
    snap.intel[ed] = readJson(path.join(dir, `intel-${ed}.json`));
  }
  const stamps = EDITIONS.flatMap((ed) => [snap.raw[ed]?.capturedAt, snap.news[ed]?.generatedAt]).filter(Number.isFinite);
  snap.nowMs = stamps.length ? Math.max(...stamps) : Date.now();
  return snap;
}

/** Freeze Date.now (scoring reads it directly). Returns a restore function. */
export function freezeClock(ms) {
  const real = Date.now;
  Date.now = () => ms;
  return () => {
    Date.now = real;
  };
}

const SCORE_FIELDS = ['geopoliticalScore', 'financialScore', 'finalCurationScore', 'rankScore', 'scoreBreakdown', 'score', 'meridianScore', 'clusterId'];

/** Merge a scoring result onto an article, mirroring what lib/ingest.js does. */
function applyScores(a, s) {
  const out = { ...a, ...s };
  out.score = s?.finalCurationScore ?? s?.rankScore ?? 0;
  return out;
}

function stablySorted(arts) {
  return arts
    .map((a, i) => [a, i])
    .sort((x, y) => sortKey(y[0]) - sortKey(x[0]) || x[1] - y[1])
    .map(([a]) => a);
}

async function loadScoring() {
  return import(pathToFileURL(path.join(CODE_ROOT, 'lib', 'scoring', 'index.mjs')).href);
}
async function loadCluster() {
  return import(pathToFileURL(path.join(CODE_ROOT, 'lib', 'intelligence', 'cluster.mjs')).href);
}
async function loadTopics() {
  return import(pathToFileURL(path.join(CODE_ROOT, 'lib', 'intelligence', 'topics.mjs')).href);
}

/** Cluster ranked articles with the current clusterer; annotate topics + member refs. */
export async function clusterAndTag(articles, edition, nowMs) {
  const { clusterArticles } = await loadCluster();
  const { topicsForCluster } = await loadTopics();
  const clusters = clusterArticles(articles, edition, { now: nowMs });
  for (const c of clusters) {
    if (!Array.isArray(c.topics)) c.topics = topicsForCluster(c);
  }
  return clusters;
}

/** Rescore mode: re-score the snapshot's articles with the current scoring code. */
export async function replayRescore(snap, edition) {
  const news = snap.news[edition];
  if (!news?.articles?.length) return null;
  const now = snap.nowMs;
  const { scoreArticlesAsync } = await loadScoring();
  const inputs = news.articles.map((a) => {
    const c = { ...a };
    for (const f of SCORE_FIELDS) delete c[f];
    c.ageHours = Math.round(((now - a.publishedAt) / 36e5) * 10) / 10;
    return c;
  });
  const scores = await scoreArticlesAsync(inputs, edition, { now });
  let articles = inputs.map((a, i) => applyScores(a, scores[i] || {}));
  articles = stablySorted(articles).slice(0, MAX_ARTICLES);
  const clusters = await clusterAndTag(articles, edition, now);
  const byId = new Map(articles.map((a) => [a.id, a]));
  const idToCluster = new Map();
  for (const c of clusters) {
    for (const id of c.articleIds || []) idToCluster.set(id, c.id);
    c.articles = (c.articleIds || []).map((id) => byId.get(id)).filter(Boolean);
  }
  articles = articles.map((a) => ({ ...a, clusterId: a.clusterId ?? idToCluster.get(a.id) ?? null }));
  return { mode: 'rescore', edition, articles, clusters, feeds: news.feeds || [] };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toRss(items) {
  const body = items
    .map(
      (it) =>
        `<item><title>${esc(it.title)}</title><link>${esc(it.link)}</link><description>${esc(it.summary)}</description><pubDate>${new Date(it.publishedAt).toUTCString()}</pubDate></item>`
    )
    .join('');
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>eval</title>${body}</channel></rss>`;
}

/**
 * Pipeline mode: run the real ingest stage over the raw pool.
 * Feeds that failed at capture time (egress blocks) are optionally back-filled from the production
 * `news-<edition>.json` of the same snapshot (their already-ranked items), so well-known outlets are present.
 */
export async function replayPipeline(snap, edition, { augment = true } = {}) {
  const raw = snap.raw[edition];
  if (!raw?.items?.length) return null;
  registerAlias();
  const { EDITIONS: FEEDS } = await import(pathToFileURL(path.join(CODE_ROOT, 'lib', 'feeds.js')).href);
  const sources = FEEDS[edition] || [];
  const feedXml = new Map();
  const augmented = [];
  for (const s of sources) {
    const status = (raw.feeds || []).find((f) => f.source === s.name);
    let items = raw.items.filter((it) => it.sourceName === s.name).sort((a, b) => (a.feedRank || 0) - (b.feedRank || 0));
    if ((!status || !status.ok) && augment) {
      items = (snap.news[edition]?.articles || []).filter((a) => a.sourceName === s.name);
      if (items.length) augmented.push(s.name);
    }
    if (items.length) feedXml.set(s.url, toRss(items));
  }
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (feedXml.has(u)) return new Response(feedXml.get(u), { status: 200, headers: { 'content-type': 'application/xml' } });
    if (sources.some((s) => s.url === u)) return new Response('unavailable at capture time', { status: 503 });
    throw new Error('offline (eval replay)');
  };
  try {
    const ingest = await import(pathToFileURL(path.join(CODE_ROOT, 'lib', 'ingest.js')).href);
    const payload = await ingest.getEditionBrief(edition, { force: true });
    const articles = (payload.articles || []).map((a) => ({ ...a }));
    const byId = new Map(articles.map((a) => [a.id, a]));
    const clusters = (payload.clusters || []).map((c) => ({
      ...c,
      articles: (c.articleIds || []).map((id) => byId.get(id)).filter(Boolean),
    }));
    return { mode: 'pipeline', edition, articles, clusters, feeds: payload.feeds || [], augmentedFeeds: augmented };
  } finally {
    globalThis.fetch = realFetch;
  }
}

/** Replay one edition in the best available mode; falls back to rescore if the pipeline cannot run. */
export async function replayEdition(snap, edition, { mode = 'auto', augment = true } = {}) {
  let note = null;
  if (mode !== 'rescore' && snap.raw[edition]?.items?.length) {
    try {
      const r = await replayPipeline(snap, edition, { augment });
      if (r && r.articles.length) return r;
      note = 'pipeline produced no articles; fell back to rescore';
    } catch (e) {
      note = `pipeline failed (${String(e?.message || e).slice(0, 160)}); fell back to rescore`;
    }
  }
  const r = await replayRescore(snap, edition);
  if (r && note) r.note = note;
  return r;
}

/** Age in hours of an article relative to `nowMs`. */
export function ageHoursOf(a, nowMs) {
  if (Number.isFinite(a?.publishedAt)) return Math.max(0, (nowMs - a.publishedAt) / 36e5);
  return Number.isFinite(a?.ageHours) ? a.ageHours : 0;
}
