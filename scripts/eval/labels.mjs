/**
 * Labelled-set loaders and evaluators.
 *
 * Own sets (stream G):   soft-vs-hard.json, pump-vs-legit.json, edition-topicality.json
 * Other streams' sets:   cluster-pairs.json (C), topics.json (D), change-cards.json (D)
 * Any missing/unreadable file is skipped with a reason - never an error.
 * Scorers are run on headline-only articles with a neutral outlet and a fixed age so the metric isolates
 * what the scoring layers do with *content*, not with outlet or recency.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, CODE_ROOT, sortKey, displayOf } from './replay.mjs';
import { auc, bestF1, mean, prf, prfFromLabels, quantile, share, round } from './metrics.mjs';

export const LABEL_DIR = process.env.EVAL_LABEL_DIR ? path.resolve(process.env.EVAL_LABEL_DIR) : path.join(ROOT, 'tests', 'fixtures', 'labels');

export function loadLabelFile(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(LABEL_DIR, name), 'utf8'));
  } catch {
    return null;
  }
}

/** Accepts `[...]` or `{ items|pairs|data|rows: [...] }`. */
export function rowsOf(file) {
  if (Array.isArray(file)) return file;
  if (file && typeof file === 'object') {
    for (const k of ['items', 'pairs', 'rows', 'data', 'examples', 'cases']) if (Array.isArray(file[k])) return file[k];
  }
  return [];
}

export const normTitle = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const imp = (rel) => import(pathToFileURL(path.join(CODE_ROOT, rel)).href);

const NEUTRAL = { name: 'Eval Wire', trust: 14, authority: 7 };

function neutralArticle(title, i, edition, nowMs) {
  return {
    id: `eval${i}`,
    title,
    summary: '',
    link: `https://eval.invalid/${i}`,
    image: null,
    publishedAt: nowMs - 2 * 36e5,
    ageHours: 2,
    sourceName: NEUTRAL.name,
    source: { ...NEUTRAL },
    edition,
    metrics: { headlineIntegrity: 20, sourceTrust: 20, freshness: 20 },
    corroboration: 0,
    scoreNotes: [],
  };
}

/** Score titles in an edition's pipeline; returns [{ key, display }] aligned with `titles`. */
export async function scoreTitles(titles, edition, nowMs) {
  const { scoreArticlesAsync } = await imp('lib/scoring/index.mjs');
  const arts = titles.map((t, i) => neutralArticle(t, i, edition, nowMs));
  const res = await scoreArticlesAsync(arts, edition, { now: nowMs });
  return res.map((r, i) => ({ key: sortKey(r), display: displayOf(r), title: titles[i] }));
}

async function noiseFloor() {
  try {
    return (await imp('lib/score.js')).NOISE_FLOOR ?? 32;
  } catch {
    return 32;
  }
}

const skipped = (reason, extra = {}) => ({ skipped: reason, ...extra });

// ---------------------------------------------------------------------------------------------------------
// Own sets
// ---------------------------------------------------------------------------------------------------------

export async function evalSoftVsHard(nowMs, file = loadLabelFile('soft-vs-hard.json')) {
  const rows = rowsOf(file);
  if (!rows.length) return skipped('soft-vs-hard.json missing or empty');
  const floor = await noiseFloor();
  const out = { n: rows.length, softShare: round(share(rows, (r) => r.label === 'soft')), editions: {} };
  const aucs = [];
  const gaps = [];
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const edition of ['geopolitics', 'finance']) {
    const sub = rows.filter((r) => r.edition === edition);
    if (sub.length < 10) continue;
    const sc = await scoreTitles(sub.map((r) => r.title), edition, nowMs);
    const hard = sc.filter((_, i) => sub[i].label === 'hard').map((s) => s.key);
    const soft = sc.filter((_, i) => sub[i].label === 'soft').map((s) => s.key);
    const a = auc(hard, soft);
    const ranked = sc.map((s, i) => ({ ...s, soft: sub[i].label === 'soft' })).sort((x, y) => y.key - x.key);
    const topN = Math.max(1, Math.round(ranked.length * 0.2));
    const top = ranked.slice(0, topN);
    const f1 = bestF1(sc.map((s) => s.key), sub.map((r) => r.label === 'soft'), { lowIsPositive: true });
    const flagged = sc.map((s) => s.display < floor);
    const c = prfFromLabels(sub.map((r) => r.label === 'soft'), flagged);
    tp += c.tp;
    fp += c.fp;
    fn += c.fn;
    out.editions[edition] = {
      n: sub.length,
      aucHardOverSoft: round(a),
      softShareTop20pct: round(share(top, (t) => t.soft)),
      softBaseRate: round(share(sub, (r) => r.label === 'soft')),
      meanGapHardMinusSoft: round(mean(hard) - mean(soft), 2),
      bestF1SoftFlag: round(f1.f1),
    };
    if (a !== null) aucs.push(a);
    gaps.push(mean(hard) - mean(soft));
  }
  out.aucHardOverSoft = round(mean(aucs));
  out.meanGapHardMinusSoft = round(mean(gaps), 2);
  const atFloor = prf(tp, fp, fn);
  out.softCutByNoiseFloor = { floor, precision: round(atFloor.precision), recall: round(atFloor.recall), f1: round(atFloor.f1) };
  return out;
}

export async function evalPumpVsLegit(nowMs, file = loadLabelFile('pump-vs-legit.json')) {
  const rows = rowsOf(file);
  if (!rows.length) return skipped('pump-vs-legit.json missing or empty');
  const floor = await noiseFloor();
  const sc = await scoreTitles(rows.map((r) => r.title), 'finance', nowMs);
  const isPump = rows.map((r) => r.label === 'pump');
  const pumpKeys = sc.filter((_, i) => isPump[i]).map((s) => s.key);
  const legitKeys = sc.filter((_, i) => !isPump[i]).map((s) => s.key);
  const med = quantile(legitKeys, 0.5);
  const q25 = quantile(legitKeys, 0.25);
  const f1 = bestF1(sc.map((s) => s.key), isPump, { lowIsPositive: true });
  const atFloor = prfFromLabels(isPump, sc.map((s) => s.display < floor));
  const realLegit = sc.filter((_, i) => !isPump[i] && !rows[i].synthetic).map((s) => s.key);
  return {
    nPump: pumpKeys.length,
    nLegit: legitKeys.length,
    aucLegitOverPump: round(auc(legitKeys, pumpKeys)),
    meanGapLegitMinusPump: round(mean(legitKeys) - mean(pumpKeys), 2),
    pumpAtOrAboveMedianLegit: round(share(pumpKeys, (k) => k >= med)),
    pumpAboveLegitQ25: round(share(pumpKeys, (k) => k > q25)),
    bestF1PumpFlag: round(f1.f1),
    bestF1Precision: round(f1.precision),
    bestF1Recall: round(f1.recall),
    pumpCutByNoiseFloor: { floor, precision: round(atFloor.precision), recall: round(atFloor.recall), f1: round(atFloor.f1) },
    realLegitMeanScore: round(mean(realLegit), 1),
    pumpMeanScore: round(mean(pumpKeys), 1),
  };
}

export async function evalTopicality(nowMs, file = loadLabelFile('edition-topicality.json')) {
  const rows = rowsOf(file);
  if (!rows.length) return skipped('edition-topicality.json missing or empty');
  const out = { n: rows.length, offTopicShare: round(share(rows, (r) => r.label === 'off-topic')), editions: {} };
  const aucs = [];
  const tops = [];
  for (const edition of ['geopolitics', 'finance']) {
    const sc = await scoreTitles(rows.map((r) => r.title), edition, nowMs);
    const on = rows.map((r) => r.label === edition || r.also === edition);
    const onKeys = sc.filter((_, i) => on[i]).map((s) => s.key);
    const offKeys = sc.filter((_, i) => !on[i]).map((s) => s.key);
    const ranked = sc.map((s, i) => ({ ...s, off: !on[i] })).sort((a, b) => b.key - a.key);
    const topN = Math.max(1, Math.round(ranked.length * 0.2));
    const a = auc(onKeys, offKeys);
    out.editions[edition] = {
      aucOnOverOff: round(a),
      offTopicShareTop20pct: round(share(ranked.slice(0, topN), (t) => t.off)),
      offTopicBaseRate: round(share(on, (x) => !x)),
    };
    if (a !== null) aucs.push(a);
    tops.push(out.editions[edition].offTopicShareTop20pct);
  }
  out.aucOnOverOff = round(mean(aucs));
  out.offTopicShareTop20pct = round(mean(tops));
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Other streams' sets (best-effort schema tolerance; see docs/eval-labels.md)
// ---------------------------------------------------------------------------------------------------------

const editionOf = (r) => (r?.edition === 'finance' || /(^|[:/_-])finance\b/.test(String(r?.origin || '')) ? 'finance' : 'geopolitics');

const asArticle = (x, i, edition, nowMs, tag) => {
  const o = typeof x === 'string' ? { title: x } : x || {};
  const id = o.id ? `${tag}${o.id}` : `${tag}${i}`;
  return {
    ...neutralArticle(o.title || o.headline || '', 0, edition, nowMs),
    id,
    link: o.link || o.url || `https://eval.invalid/${id}`,
    summary: o.summary || o.description || '',
    sourceName: o.sourceName || o.source?.name || (typeof o.source === 'string' ? o.source : null) || `Wire ${tag}`,
    source: typeof o.source === 'object' && o.source ? o.source : { ...NEUTRAL, name: o.sourceName || (typeof o.source === 'string' ? o.source : `Wire ${tag}`) },
    publishedAt: Number.isFinite(o.publishedAt)
      ? o.publishedAt
      : Number.isFinite(o.hoursAgo)
        ? nowMs - o.hoursAgo * 36e5
        : o.publishedAt
          ? Date.parse(o.publishedAt) || nowMs - 3 * 36e5
          : nowMs - (tag === 'a' ? 3 : 4) * 36e5,
    rankScore: o.rankScore ?? 80,
    score: o.score ?? 80,
    finalCurationScore: o.finalCurationScore ?? 80,
  };
};

const truthyLabel = (v) => v === true || v === 1 || /^(same|same[_ -]?event|true|yes|1|duplicate|merge)$/i.test(String(v));

function pairFields(r) {
  const a = r.a ?? r.A ?? r.left ?? r.first ?? (r.titleA != null ? { title: r.titleA } : r.title_a != null ? { title: r.title_a } : r.headlineA != null ? { title: r.headlineA } : null) ?? (Array.isArray(r.pair) ? r.pair[0] : null);
  const b = r.b ?? r.B ?? r.right ?? r.second ?? (r.titleB != null ? { title: r.titleB } : r.title_b != null ? { title: r.title_b } : r.headlineB != null ? { title: r.headlineB } : null) ?? (Array.isArray(r.pair) ? r.pair[1] : null);
  const labelRaw = r.same ?? r.sameEvent ?? r.same_event ?? r.isSame ?? r.label ?? r.match;
  return { a, b, labelRaw };
}

export async function evalClusterPairs(nowMs, file = loadLabelFile('cluster-pairs.json')) {
  if (!file) return skipped('tests/fixtures/labels/cluster-pairs.json absent (stream C)');
  const rows = rowsOf(file);
  // Stream C's schema: { articles: [{id, title, sourceName, hoursAgo, ...}], pairs: [{a: id, b: id, label: 'same'|'different'}] }
  const byId = new Map((Array.isArray(file.articles) ? file.articles : []).map((x) => [x.id, x]));
  const { clusterArticles } = await imp('lib/intelligence/cluster.mjs');
  const truth = [];
  const pred = [];
  const stable = [];
  let unreadable = 0;
  for (let i = 0; i < rows.length; i++) {
    const pf = pairFields(rows[i]);
    const resolve = (x) => (typeof x === 'string' && byId.has(x) ? byId.get(x) : x);
    const a = resolve(pf.a);
    const b = resolve(pf.b);
    const labelRaw = pf.labelRaw;
    if (!a || !b || labelRaw === undefined) {
      unreadable++;
      continue;
    }
    const edition = rows[i].edition === 'finance' ? 'finance' : editionOf(a);
    const A = asArticle(a, i, edition, nowMs, 'a');
    const B = asArticle(b, i, edition, nowMs, 'b');
    const together = (arts) => {
      const cs = clusterArticles(arts, edition, { now: nowMs });
      return cs.some((c) => (c.articleIds || []).includes(A.id) && (c.articleIds || []).includes(B.id));
    };
    try {
      const fwd = together([A, B]);
      const rev = together([B, A]);
      truth.push(truthyLabel(labelRaw));
      pred.push(fwd);
      stable.push(fwd === rev);
    } catch {
      unreadable++;
    }
  }
  if (!truth.length) return skipped(`cluster-pairs.json present but schema unrecognised (${rows.length} rows; expected {a,b,same})`);
  const r = prfFromLabels(truth, pred);
  return {
    n: truth.length,
    unreadable,
    precision: round(r.precision),
    recall: round(r.recall),
    f1: round(r.f1),
    accuracy: round((r.tp + r.tn) / truth.length),
    orderInvariantShare: round(share(stable, Boolean)),
  };
}

export async function evalTopics(nowMs, file = loadLabelFile('topics.json')) {
  if (!file) return skipped('tests/fixtures/labels/topics.json absent (stream D)');
  const rows = rowsOf(file);
  const { clusterArticles } = await imp('lib/intelligence/cluster.mjs');
  const { topicsForCluster } = await imp('lib/intelligence/topics.mjs');
  const per = new Map();
  const bump = (t, k) => {
    if (!per.has(t)) per.set(t, { tp: 0, fp: 0, fn: 0 });
    per.get(t)[k]++;
  };
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const expected = r.topics ?? r.labels ?? r.topicIds ?? r.expected ?? r.tags;
    const title = r.title ?? r.headline;
    if (!Array.isArray(expected) || !title) continue;
    const edition = editionOf(r);
    try {
      const art = asArticle({ title, summary: r.summary }, i, edition, nowMs, 't');
      const cluster = clusterArticles([art], edition, { now: nowMs })[0];
      const got = new Set(topicsForCluster(cluster));
      const want = new Set(expected);
      for (const t of got) bump(t, want.has(t) ? 'tp' : 'fp');
      for (const t of want) if (!got.has(t)) bump(t, 'fn');
      n++;
    } catch {
      /* skip row */
    }
  }
  if (!n) return skipped(`topics.json present but schema unrecognised (${rows.length} rows; expected {title, topics:[ids]})`);
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const c of per.values()) {
    tp += c.tp;
    fp += c.fp;
    fn += c.fn;
  }
  const micro = prf(tp, fp, fn);
  const macroP = mean([...per.values()].map((c) => prf(c.tp, c.fp, c.fn).precision));
  const macroR = mean([...per.values()].map((c) => prf(c.tp, c.fp, c.fn).recall));
  return { n, microPrecision: round(micro.precision), microRecall: round(micro.recall), microF1: round(micro.f1), macroPrecision: round(macroP), macroRecall: round(macroR) };
}

export async function evalChangeCards(nowMs, file = loadLabelFile('change-cards.json')) {
  if (!file) return skipped('tests/fixtures/labels/change-cards.json absent (stream D)');
  const rows = rowsOf(file);
  const { detectChanges } = await imp('lib/intelligence/changes.mjs');
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let n = 0;
  for (const r of rows) {
    const cluster = r.cluster || (Array.isArray(r.articles) ? { id: 'eval', title: r.title || '', edition: 'geopolitics', articles: r.articles } : null);
    const snapshot = r.snapshot || r.seen;
    const expectBool = r.expectChange ?? r.shouldFire ?? r.material ?? r.expected;
    const expectTypes = r.expectTypes ?? r.expectedTypes;
    if (!cluster?.articles || !snapshot || (typeof expectBool !== 'boolean' && !Array.isArray(expectTypes))) continue;
    try {
      const res = detectChanges(cluster, snapshot);
      const types = (res.changes || []).map((c) => c.type);
      n++;
      if (Array.isArray(expectTypes)) {
        for (const t of types) (expectTypes.includes(t) ? (tp += 1) : (fp += 1));
        for (const t of expectTypes) if (!types.includes(t)) fn++;
      } else {
        const fired = types.length > 0;
        if (fired && expectBool) tp++;
        else if (fired && !expectBool) fp++;
        else if (!fired && expectBool) fn++;
      }
    } catch {
      /* skip row */
    }
  }
  if (!n) return skipped(`change-cards.json present but schema unrecognised (${rows.length} rows; expected {cluster|articles, snapshot, expectChange|expectTypes})`);
  const r = prf(tp, fp, fn);
  return { n, precision: round(r.precision), recall: round(r.recall), f1: round(r.f1) };
}

/** Normalised-title lookup of the soft/off-topic labels, to annotate real replays with label-based vitals. */
export function labelLookups() {
  const soft = new Map();
  const topic = new Map();
  for (const r of rowsOf(loadLabelFile('soft-vs-hard.json'))) soft.set(normTitle(r.title), r.label);
  for (const r of rowsOf(loadLabelFile('edition-topicality.json'))) topic.set(normTitle(r.title), r);
  return { soft, topic };
}
