#!/usr/bin/env node
/**
 * Evaluation harness: replay snapshots through the CURRENT code and print ranking vitals + labelled-set metrics.
 *
 *   npm run eval                                   # markdown tables on stdout
 *   npm run eval -- --json                         # JSON on stdout
 *   npm run eval -- --out /tmp/eval.json --md-out /tmp/eval.md
 *   npm run eval -- --compare docs/eval-baseline.json      # deltas vs a previous run (good/bad arrows)
 *   npm run eval -- --snapshot 2026-10-29-1841,2026-10-29  # default; first one is the primary
 *   npm run eval -- --snapshot latest-raw --prev 2026-10-29-1841   # real day-over-day instead of simulated
 *   npm run eval -- --mode rescore                 # skip the full ingest replay
 *   npm run eval -- --no-augment                   # do not back-fill blocked feeds from the production snapshot
 *
 * Interfaces change during the build, so every read is defensive: sort key = rankScore ?? finalCurationScore ?? score.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ROOT,
  CODE_ROOT,
  EDITIONS,
  loadSnapshot,
  freezeClock,
  replayEdition,
  clusterAndTag,
  sortKey,
  displayOf,
  ageHoursOf,
} from './replay.mjs';
import {
  mean,
  sd,
  median,
  share,
  distinctCount,
  tiedItems,
  tally,
  round,
  flattenNumbers,
} from './metrics.mjs';
import {
  evalSoftVsHard,
  evalPumpVsLegit,
  evalTopicality,
  evalClusterPairs,
  evalTopics,
  evalChangeCards,
  labelLookups,
  LABEL_DIR,
  normTitle,
} from './labels.mjs';
import { evalFrontPages } from './frontpages.mjs';

export const DEFAULT_SNAPSHOTS = ['2026-10-29-1841', '2026-10-29'];
const imp = (rel) => import(pathToFileURL(path.join(CODE_ROOT, rel)).href);

const NON_REGIONAL = new Set(['us', 'usa', 'united-states', 'north-america', 'northamerica', 'europe', 'eu', 'uk', 'global', 'world', 'unknown', 'other', '']);

// ------------------------------------------------------------------------------------------------ per-edition

function edition_vitals(replay, nowMs, lookups) {
  const arts = replay.articles || [];
  const keys = arts.map(sortKey);
  const disp = arts.map(displayOf);
  const top20 = arts.slice(0, 20);
  const top50keys = keys.slice(0, 50);

  const clusterOf = new Map();
  for (const c of replay.clusters || []) for (const id of c.articleIds || []) clusterOf.set(id, c.id);
  const events = new Set(arts.slice(0, 60).map((a) => clusterOf.get(a.id) ?? `solo:${a.id}`));
  const singletons = (replay.clusters || []).filter((c) => (c.articleIds || []).length === 1).length;

  const outlets = tally(top20.map((a) => a.sourceName || a.source?.name || 'unknown'));
  const ages = top20.map((a) => ageHoursOf(a, nowMs));
  const allAges = arts.map((a) => ageHoursOf(a, nowMs));

  const regioned = arts.filter((a) => typeof a.region === 'string' && a.region);
  const top60 = arts.slice(0, 60);
  const regionKnown = top60.filter((a) => typeof a.region === 'string' && a.region);

  let labelled = 0;
  let soft = 0;
  let off = 0;
  let offLabelled = 0;
  for (const a of top20) {
    const k = normTitle(a.title);
    if (lookups.soft.has(k)) {
      labelled++;
      if (lookups.soft.get(k) === 'soft') soft++;
    }
    const t = lookups.topic.get(k);
    if (t) {
      offLabelled++;
      if (!(t.label === replay.edition || t.also === replay.edition)) off++;
    }
  }

  return {
    mode: replay.mode,
    nArticles: arts.length,
    nClusters: (replay.clusters || []).length,
    singletonClusterShare: round(share(replay.clusters || [], (c) => (c.articleIds || []).length === 1)),
    shareAt100: round(share(disp, (d) => d >= 100)),
    shareSortKeyOver100: round(share(keys, (k) => k > 100)),
    medianDisplay: round(median(disp), 1),
    sdDisplay: round(sd(disp), 2),
    sdSortKey: round(sd(keys), 2),
    distinctDisplay: distinctCount(disp, 0),
    distinctSortKey: distinctCount(keys, 4),
    tiesTop50: tiedItems(top50keys, 4),
    outletMaxShareTop20: round(outlets.length ? outlets[0][1] / Math.max(1, top20.length) : 0),
    distinctOutletsTop20: outlets.length,
    medianAgeTop20Hours: round(median(ages), 1),
    shareOver24hTop20: round(share(ages, (h) => h > 24)),
    shareOver24hAll: round(share(allAges, (h) => h > 24)),
    regionKnownShare: round(share(top60, (a) => typeof a.region === 'string' && a.region)),
    regionNonUsEuShareTop60: regioned.length ? round(share(regionKnown, (a) => !NON_REGIONAL.has(a.region.toLowerCase()))) : null,
    distinctEventsTop60: events.size,
    softShareTop20: labelled >= 10 ? round(soft / labelled) : null,
    offTopicShareTop20: offLabelled >= 10 ? round(off / offLabelled) : null,
    labelCoverageTop20: round(Math.max(labelled, offLabelled) / Math.max(1, top20.length)),
    details: {
      outletsTop20: outlets.slice(0, 5).map(([n, c]) => `${n}:${c}`),
      augmentedFeeds: replay.augmentedFeeds || [],
      note: replay.note || null,
    },
  };
}

// ------------------------------------------------------------------------------------------------ briefing

// The shown-state key is not fixed by the contracts (D owns it); pass the day-1 ids under every plausible name. Extra profile keys are ignored by code that does not know them.
const SHOWN_KEYS = ['shown', 'shownIds', 'shownClusterIds', 'briefedClusterIds', 'briefedIds', 'recentlyBriefed', 'recentBriefed', 'recent', 'recentIds', 'seenBriefing', 'seenClusterIds', 'lastShown', 'history', 'briefedHistory'];

function briefedItems(b) {
  return [...(b?.essential || []), ...(b?.developing || []), ...(b?.understand || [])];
}

function maxTopicShare(items) {
  if (!items.length) return 0;
  const counts = tally(items.flatMap((i) => [...new Set(i.topics || [])]));
  return counts.length ? counts[0][1] / items.length : 0;
}

async function briefingVitals(replays, nowMs, prevReplays = null) {
  const { composeBriefing } = await imp('lib/intelligence/briefing.mjs');
  const clusters = EDITIONS.flatMap((ed) => replays[ed]?.clusters || []);
  if (!clusters.length) return { skipped: 'no clusters' };
  const compose = (cl, profile) => composeBriefing(cl, new Map(), profile);
  const neutral = compose(clusters, {});
  const interested = compose(clusters, { interests: ['middle-east', 'defense-security', 'russia-ukraine'] });

  const out = {
    essentialCount: (neutral.essential || []).length,
    essentialMaxTopicShare: round(maxTopicShare(neutral.essential || [])),
    essentialMaxTopicShareInterested: round(maxTopicShare(interested.essential || [])),
    essentialDistinctOutletsMean: round(mean((neutral.essential || []).map((i) => (i.sources || []).length)), 2),
  };

  // Day-over-day: same reader, next day. Real if a previous snapshot was supplied, else simulated by aging the pool 24 h.
  const day1 = neutral;
  const day1Clusters = clusters;
  let day2Clusters;
  let simulated;
  if (prevReplays) {
    // `replays` is today, `prevReplays` is yesterday
    day2Clusters = clusters;
    simulated = false;
  } else {
    simulated = true;
    day2Clusters = [];
    for (const ed of EDITIONS) {
      const arts = (replays[ed]?.articles || [])
        .map((a) => ({ ...a, ageHours: (a.ageHours ?? ageHoursOf(a, nowMs)) + 24 }))
        .filter((a) => a.ageHours <= 72)
        .map(({ clusterId, ...rest }) => rest);
      if (arts.length) day2Clusters.push(...(await clusterAndTag(arts, ed, nowMs + 24 * 36e5)));
    }
  }
  const baseDay1Clusters = prevReplays ? EDITIONS.flatMap((ed) => prevReplays[ed]?.clusters || []) : day1Clusters;
  const baseDay1 = prevReplays ? compose(baseDay1Clusters, {}) : day1;
  const day1Ids = briefedItems(baseDay1).map((i) => i.clusterId);
  const shownProfile = Object.fromEntries(SHOWN_KEYS.map((k) => [k, day1Ids]));
  const day2 = compose(day2Clusters, shownProfile);
  const byId = new Map(baseDay1Clusters.map((c) => [c.id, c]));
  const day1Articles = new Set(day1Ids.flatMap((id) => (byId.get(id)?.articleIds || [])));
  const day2Cl = new Map(day2Clusters.map((c) => [c.id, c]));
  const isRepeat = (item) => {
    const c = day2Cl.get(item.clusterId);
    const lead = c?.articleIds?.[0];
    return day1Ids.includes(item.clusterId) || (lead != null && day1Articles.has(lead));
  };
  const d2 = briefedItems(day2);
  const d2e = day2.essential || [];
  out.dayOverDay = {
    simulated,
    repeatRateAll: round(d2.length ? d2.filter(isRepeat).length / d2.length : 0),
    repeatRateEssential: round(d2e.length ? d2e.filter(isRepeat).length / d2e.length : 0),
    day2Items: d2.length,
  };
  return out;
}

async function retrievalVitals(replays) {
  let retrieveSources;
  try {
    ({ retrieveSources } = await imp('lib/intelligence/chat.mjs'));
  } catch {
    return { skipped: 'chat.mjs not importable' };
  }
  const out = {};
  let hits = 0;
  let asked = 0;
  for (const ed of EDITIONS) {
    const r = replays[ed];
    if (!r) continue;
    const articles = r.articles;
    for (const c of (r.clusters || []).filter((x) => (x.entities || []).length >= 2).slice(0, 15)) {
      const q = `What is happening with ${c.entities.slice(0, 2).join(' and ')}?`;
      try {
        const got = retrieveSources(articles, q, {});
        asked++;
        if (got.some((a) => (c.articleIds || []).includes(a.id))) hits++;
      } catch {
        /* skip */
      }
    }
    try {
      const generic = retrieveSources(articles, "what's happening today?", {});
      const t = tally(generic.map((a) => a.sourceName));
      out[`${ed}GenericMaxOutletShare`] = round(generic.length ? t[0][1] / generic.length : 0);
    } catch {
      /* skip */
    }
  }
  out.entityQueryHitRate = asked ? round(hits / asked) : null;
  out.queries = asked;
  return out;
}

// ------------------------------------------------------------------------------------------------ run

async function runSnapshot(name, opts, lookups, prevName) {
  const snap = loadSnapshot(name);
  const restore = freezeClock(snap.nowMs);
  try {
    const replays = {};
    for (const ed of EDITIONS) {
      replays[ed] = await replayEdition(snap, ed, { mode: opts.mode, augment: opts.augment });
    }
    const res = { name: snap.name, mode: replays.geopolitics?.mode || replays.finance?.mode || 'none', editions: {} };
    for (const ed of EDITIONS) if (replays[ed]) res.editions[ed] = edition_vitals(replays[ed], snap.nowMs, lookups);

    let prevReplays = null;
    if (prevName) {
      const prev = loadSnapshot(prevName);
      const r2 = freezeClock(prev.nowMs);
      try {
        prevReplays = {};
        for (const ed of EDITIONS) prevReplays[ed] = await replayEdition(prev, ed, { mode: opts.mode, augment: opts.augment });
      } finally {
        r2();
      }
      freezeClock(snap.nowMs);
    }
    try {
      res.briefing = await briefingVitals(replays, snap.nowMs, prevReplays);
    } catch (e) {
      res.briefing = { skipped: `briefing failed: ${String(e?.message || e).slice(0, 120)}` };
    }
    try {
      res.retrieval = await retrievalVitals(replays);
    } catch (e) {
      res.retrieval = { skipped: `retrieval failed: ${String(e?.message || e).slice(0, 120)}` };
    }
    res.frontPages = evalFrontPages(
      snap.name,
      Object.fromEntries(EDITIONS.map((ed) => [ed, replays[ed]?.articles || []]))
    );
    return { res, nowMs: snap.nowMs };
  } finally {
    restore();
  }
}

export async function computeAll(opts = {}) {
  const o = { snapshots: DEFAULT_SNAPSHOTS, mode: 'auto', augment: true, prev: null, ...opts };
  const lookups = labelLookups();
  const out = { meta: {}, snapshots: {}, labelled: {} };
  let primaryNow = null;
  for (let i = 0; i < o.snapshots.length; i++) {
    const { res, nowMs } = await runSnapshot(o.snapshots[i], o, lookups, i === 0 ? o.prev : null);
    out.snapshots[res.name] = res;
    if (i === 0) primaryNow = nowMs;
  }
  const restore = freezeClock(primaryNow ?? Date.now());
  try {
    const run = async (key, fn) => {
      try {
        out.labelled[key] = await fn(primaryNow);
      } catch (e) {
        out.labelled[key] = { skipped: `failed: ${String(e?.message || e).slice(0, 160)}` };
      }
    };
    await run('softVsHard', evalSoftVsHard);
    await run('pumpVsLegit', evalPumpVsLegit);
    await run('editionTopicality', evalTopicality);
    await run('clusterPairs', evalClusterPairs);
    await run('topics', evalTopics);
    await run('changeCards', evalChangeCards);
  } finally {
    restore();
  }
  let commit = null;
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: CODE_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    /* not a git checkout */
  }
  const labelFiles = {};
  for (const fname of ['soft-vs-hard.json', 'pump-vs-legit.json', 'edition-topicality.json', 'cluster-pairs.json', 'topics.json', 'change-cards.json', 'front-pages.json']) {
    try {
      const buf = fs.readFileSync(path.join(LABEL_DIR, fname));
      labelFiles[fname] = { bytes: buf.length, sha1: createHash('sha1').update(buf).digest('hex').slice(0, 10) };
    } catch {
      /* absent */
    }
  }
  out.meta = { commit, snapshots: Object.keys(out.snapshots), primary: Object.keys(out.snapshots)[0], mode: opts.mode || 'auto', labelFiles };
  return out;
}

// ------------------------------------------------------------------------------------------------ output

const GOOD = [
  [/shareAt100|shareSortKeyOver100|tiesTop50|outletMaxShare|medianAge|shareOver24h|softShare|offTopicShare|MaxTopicShare|repeatRate|singletonClusterShare|MaxOutletShare/i, 'lower'],
  [/sdDisplay|sdSortKey|distinct|auc|precision|recall|f1|ndcg|coverage|HitRate|entryCoverage|meanGap|nonUsEu|accuracy|orderInvariant/i, 'higher'],
];
export function direction(key) {
  for (const [re, d] of GOOD) if (re.test(key)) return d;
  return null;
}

const pct = (x) => (x === null || x === undefined ? '-' : `${(x * 100).toFixed(0)}%`);
const f = (x, d = 2) => (x === null || x === undefined ? '-' : Number(x).toFixed(d).replace(/\.?0+$/, ''));

export function renderMarkdown(r) {
  const L = [];
  const snaps = Object.values(r.snapshots);
  L.push(`# Evaluation run${r.meta.commit ? ` @ ${r.meta.commit}` : ''}`, '');
  for (const s of snaps) {
    L.push(`## Vitals: snapshot ${s.name} (${s.mode} replay)`, '');
    L.push('| Vital | Geopolitics | Finance | Better |', '|---|---|---|---|');
    const rows = [
      ['Articles / clusters', (e) => `${e.nArticles} / ${e.nClusters}`, null],
      ['Share of display scores at 100', (e) => pct(e.shareAt100), 'lower'],
      ['Share of sort keys above 100', (e) => pct(e.shareSortKeyOver100), 'info'],
      ['Median display score', (e) => f(e.medianDisplay, 1), 'info'],
      ['SD of display score', (e) => f(e.sdDisplay), 'higher'],
      ['SD of sort key', (e) => f(e.sdSortKey), 'higher'],
      ['Distinct display values', (e) => e.distinctDisplay, 'higher'],
      ['Distinct sort-key values', (e) => e.distinctSortKey, 'higher'],
      ['Items tied in top 50 (sort key)', (e) => e.tiesTop50, 'lower'],
      ['Top outlet share of top 20', (e) => pct(e.outletMaxShareTop20), 'lower'],
      ['Distinct outlets in top 20', (e) => e.distinctOutletsTop20, 'higher'],
      ['Median age of top 20 (h)', (e) => f(e.medianAgeTop20Hours, 1), 'lower'],
      ['Share of top 20 older than 24 h', (e) => pct(e.shareOver24hTop20), 'lower'],
      ['Regional metadata present (top 60)', (e) => pct(e.regionKnownShare), 'info'],
      ['Non-US/EU share (top 60, if region)', (e) => pct(e.regionNonUsEuShareTop60), 'higher'],
      ['Distinct events in top 60', (e) => e.distinctEventsTop60, 'higher'],
      ['Soft-news share of top 20 (labelled)', (e) => pct(e.softShareTop20), 'lower'],
      ['Off-topic share of top 20 (labelled)', (e) => pct(e.offTopicShareTop20), 'lower'],
    ];
    for (const [label, fn, better] of rows) {
      const g = s.editions.geopolitics ? fn(s.editions.geopolitics) : '-';
      const fi = s.editions.finance ? fn(s.editions.finance) : '-';
      L.push(`| ${label} | ${g} | ${fi} | ${better === 'info' || !better ? '' : better} |`);
    }
    const top = (ed) => (s.editions[ed]?.details?.outletsTop20 || []).join(', ') || '-';
    L.push('', `Top-20 outlets: geopolitics ${top('geopolitics')}; finance ${top('finance')}.`);
    const aug = EDITIONS.flatMap((ed) => s.editions[ed]?.details?.augmentedFeeds || []);
    if (aug.length) L.push(`Feeds back-filled from the production snapshot (blocked at capture): ${[...new Set(aug)].join(', ')}.`);
    L.push('');
    const b = s.briefing;
    if (b && !b.skipped) {
      L.push('Briefing', '', '| Metric | Value |', '|---|---|');
      L.push(`| Max single-topic share in Essential (neutral profile) | ${pct(b.essentialMaxTopicShare)} |`);
      L.push(`| Max single-topic share in Essential (Middle East/defence/Russia interests) | ${pct(b.essentialMaxTopicShareInterested)} |`);
      L.push(`| Day-over-day repeat rate, all briefed items (${b.dayOverDay?.simulated ? 'simulated: pool aged 24 h' : 'real previous snapshot'}) | ${pct(b.dayOverDay?.repeatRateAll)} |`);
      L.push(`| Day-over-day repeat rate, Essential | ${pct(b.dayOverDay?.repeatRateEssential)} |`, '');
    } else if (b) L.push(`Briefing skipped: ${b.skipped}`, '');
    const rt = s.retrieval;
    if (rt && !rt.skipped) L.push(`Retrieval: entity-query hit rate ${pct(rt.entityQueryHitRate)} over ${rt.queries} queries; generic-question max outlet share geopolitics ${pct(rt.geopoliticsGenericMaxOutletShare)}, finance ${pct(rt.financeGenericMaxOutletShare)}.`, '');
    const fp = s.frontPages;
    if (fp && !fp.skipped) {
      L.push(`Front-page proxy (${fp.proxy ? 'feed-order proxy, not real front pages' : 'real front pages'}):`, '');
      L.push('| Edition | Entries | Articles matched | Entry coverage | P@10 | NDCG@10 |', '|---|---|---|---|---|---|');
      for (const ed of EDITIONS) if (fp[ed]) L.push(`| ${ed} | ${fp[ed].nEntries} | ${fp[ed].articlesMatched} | ${pct(fp[ed].entryCoverage)} | ${f(fp[ed].precisionAtK)} | ${f(fp[ed].ndcgAtK)} |`);
      L.push('');
    }
  }
  const l = r.labelled;
  L.push('## Labelled sets', '');
  L.push('| Set | Metric | Value |', '|---|---|---|');
  const add = (set, o, rows) => {
    if (!o || o.skipped) return L.push(`| ${set} | skipped | ${o?.skipped || 'n/a'} |`);
    for (const [label, v] of rows(o)) L.push(`| ${set} | ${label} | ${v} |`);
  };
  add('soft-vs-hard', l.softVsHard, (o) => [
    ['n (soft share)', `${o.n} (${pct(o.softShare)})`],
    ['AUC hard over soft (1 = soft always lower)', f(o.aucHardOverSoft)],
    ['Mean score gap hard minus soft', f(o.meanGapHardMinusSoft, 1)],
    ['Soft share of top 20% by score (geo / fin)', `${pct(o.editions?.geopolitics?.softShareTop20pct)} / ${pct(o.editions?.finance?.softShareTop20pct)}`],
    ['Soft cut by noise floor: P / R', `${f(o.softCutByNoiseFloor?.precision)} / ${f(o.softCutByNoiseFloor?.recall)}`],
  ]);
  add('pump-vs-legit', l.pumpVsLegit, (o) => [
    ['n pump / legit', `${o.nPump} / ${o.nLegit}`],
    ['AUC legit over pump', f(o.aucLegitOverPump)],
    ['Mean score gap legit minus pump', f(o.meanGapLegitMinusPump, 1)],
    ['Pumps scoring at/above the median legit', pct(o.pumpAtOrAboveMedianLegit)],
    ['Best-threshold F1 (P / R)', `${f(o.bestF1PumpFlag)} (${f(o.bestF1Precision)} / ${f(o.bestF1Recall)})`],
    ['Pumps cut by noise floor: P / R', `${f(o.pumpCutByNoiseFloor?.precision)} / ${f(o.pumpCutByNoiseFloor?.recall)}`],
  ]);
  add('edition-topicality', l.editionTopicality, (o) => [
    ['n (off-topic share)', `${o.n} (${pct(o.offTopicShare)})`],
    ['AUC on-topic over off-topic (geo / fin)', `${f(o.editions?.geopolitics?.aucOnOverOff)} / ${f(o.editions?.finance?.aucOnOverOff)}`],
    ['Off-topic share of top 20% by score (geo / fin)', `${pct(o.editions?.geopolitics?.offTopicShareTop20pct)} / ${pct(o.editions?.finance?.offTopicShareTop20pct)}`],
  ]);
  add('cluster-pairs', l.clusterPairs, (o) => [
    ['n pairs', o.n],
    ['Precision / recall / F1', `${f(o.precision)} / ${f(o.recall)} / ${f(o.f1)}`],
    ['Order-invariant share', pct(o.orderInvariantShare)],
  ]);
  add('topics', l.topics, (o) => [
    ['n headlines', o.n],
    ['Micro precision / recall / F1', `${f(o.microPrecision)} / ${f(o.microRecall)} / ${f(o.microF1)}`],
    ['Macro precision / recall', `${f(o.macroPrecision)} / ${f(o.macroRecall)}`],
  ]);
  add('change-cards', l.changeCards, (o) => [
    ['n cases', o.n],
    ['Precision / recall / F1', `${f(o.precision)} / ${f(o.recall)} / ${f(o.f1)}`],
  ]);
  L.push('');
  return L.join('\n');
}

export function renderCompare(cur, base, baseLabel) {
  const a = flattenNumbers({ snapshots: cur.snapshots, labelled: cur.labelled });
  const b = flattenNumbers({ snapshots: base.snapshots, labelled: base.labelled });
  const rows = [];
  for (const k of Object.keys(a)) {
    if (!(k in b) || /\.(n|queries|nArticles|nClusters|day2Items|essentialCount|nPump|nLegit|nEntries|floor|tp|fp|fn|tn|k)$/.test(k)) continue;
    const d = a[k] - b[k];
    if (Math.abs(d) < 1e-9) continue;
    const dir = direction(k);
    const verdict = !dir ? '' : (dir === 'lower' ? d < 0 : d > 0) ? 'better' : 'worse';
    rows.push({ k, from: b[k], to: a[k], d, verdict });
  }
  const L = [`# Deltas vs ${baseLabel}`, '', `${rows.length} metric(s) changed. better: ${rows.filter((r) => r.verdict === 'better').length}, worse: ${rows.filter((r) => r.verdict === 'worse').length}.`, ''];
  if (!rows.length) return L.join('\n') + 'No numeric differences.\n';
  L.push('| Metric | Baseline | Now | Delta | |', '|---|---|---|---|---|');
  for (const r of rows) L.push(`| ${r.k} | ${f(r.from, 3)} | ${f(r.to, 3)} | ${r.d > 0 ? '+' : ''}${f(r.d, 3)} | ${r.verdict} |`);
  return L.join('\n') + '\n';
}

function parseArgs(argv) {
  const a = { json: false, out: null, mdOut: null, compare: null, snapshots: null, prev: null, mode: 'auto', augment: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--json') a.json = true;
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--md-out') a.mdOut = argv[++i];
    else if (k === '--compare') a.compare = argv[++i];
    else if (k === '--snapshot') a.snapshots = argv[++i].split(',').filter(Boolean);
    else if (k === '--prev') a.prev = argv[++i];
    else if (k === '--mode') a.mode = argv[++i];
    else if (k === '--no-augment') a.augment = false;
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await computeAll({
    ...(args.snapshots ? { snapshots: args.snapshots } : {}),
    prev: args.prev,
    mode: args.mode,
    augment: args.augment,
  });
  if (args.out) fs.writeFileSync(path.resolve(process.cwd(), args.out), JSON.stringify(result, null, 2) + '\n');
  const md = renderMarkdown(result);
  if (args.mdOut) fs.writeFileSync(path.resolve(process.cwd(), args.mdOut), md);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(md);
  if (args.compare) {
    const base = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), args.compare), 'utf8'));
    console.log(renderCompare(result, base, args.compare));
  }
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
