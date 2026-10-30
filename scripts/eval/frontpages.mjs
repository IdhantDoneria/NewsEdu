#!/usr/bin/env node
/**
 * Weak labels: editorial front pages as positives (a PROXY for editor judgement, not for reader interest).
 *
 * File: tests/fixtures/labels/front-pages.json
 *   {
 *     "version": 1,
 *     "proxy": true,
 *     "snapshots": {
 *       "<snapshot dir name>": {
 *         "geopolitics": [ { "outlet": "BBC World", "rank": 1, "title": "...", "link": "https://..." }, ... ],
 *         "finance":     [ ... ]
 *       }
 *     }
 *   }
 * `rank` is the position on that outlet's front page / top-stories feed (1 = lead).
 *
 * Metrics (computeFrontPageMetrics): precision@k and graded NDCG@k of a ranked article list against the
 * entries. An article is matched to an entry by normalised link or by title overlap. Grade of an entry:
 * rank 1-3 -> 3, 4-6 -> 2, 7+ -> 1; an article matched by several outlets gets max grade + (outlets - 1), capped at 4
 * (cross-outlet agreement is the strongest importance signal available for free).
 *
 * Builder (`--build <snapshot>`): derives a SMALL SAMPLE from a snapshot's raw feeds, using each feed's own item
 * order as the outlet's editorial order. Real front-page HTML could not be fetched reliably from the build
 * environment, so this sample is a stand-in: it measures agreement with each outlet's feed ordering, nothing more.
 * Replace/extend the file with real front-page captures as they become available.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, EDITIONS, loadSnapshot } from './replay.mjs';
import { ndcg, precisionAtK, jaccard, round } from './metrics.mjs';

export const FRONT_PAGES_PATH = path.join(ROOT, 'tests', 'fixtures', 'labels', 'front-pages.json');

export function loadFrontPages(p = FRONT_PAGES_PATH) {
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
}

const STOP = new Set(['about', 'after', 'amid', 'says', 'said', 'with', 'from', 'over', 'this', 'that', 'will', 'what', 'have', 'been', 'their', 'into', 'more', 'than', 'could', 'would']);
const toks = (t) =>
  (String(t || '').toLowerCase().normalize('NFKD').match(/[a-z0-9]{4,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(?:ing|ed|es|s)$/, ''));

export function normLink(u) {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return String(u || '').toLowerCase();
  }
}

export function entryGrade(rank) {
  return rank <= 3 ? 3 : rank <= 6 ? 2 : 1;
}

/** Grade (0-4) of one article against a list of front-page entries. */
export function gradeArticle(article, entries) {
  const link = normLink(article.link);
  const t = toks(article.title);
  const outlets = new Map();
  for (const e of entries) {
    const sameLink = e.link && normLink(e.link) === link;
    let match = sameLink;
    if (!match && e.title) {
      const et = toks(e.title);
      const inter = t.filter((x) => et.includes(x)).length;
      match = inter >= 3 && jaccard(t, et) >= 0.5;
    }
    if (match) outlets.set(e.outlet || 'outlet', Math.max(outlets.get(e.outlet || 'outlet') || 0, entryGrade(e.rank || 99)));
  }
  if (!outlets.size) return 0;
  return Math.min(4, Math.max(...outlets.values()) + outlets.size - 1);
}

/** Precision@k / graded NDCG@k of `ranked` (best first) against front-page `entries`. */
export function computeFrontPageMetrics(ranked, entries, { k = 10 } = {}) {
  if (!entries?.length || !ranked?.length) return null;
  const grades = ranked.map((a) => gradeArticle(a, entries));
  const matchedEntries = entries.filter((e) => ranked.some((a) => gradeArticle(a, [e]) > 0)).length;
  return {
    k,
    nEntries: entries.length,
    articlesMatched: grades.filter((g) => g > 0).length,
    entryCoverage: round(matchedEntries / entries.length),
    precisionAtK: round(precisionAtK(grades, k)),
    ndcgAtK: round(ndcg(grades, k, { pool: grades })),
  };
}

/** Evaluate every edition of a replay against the front-page file (if it has this snapshot). */
export function evalFrontPages(snapshotName, rankedByEdition, file = loadFrontPages()) {
  const snap = file?.snapshots?.[snapshotName];
  if (!snap) return { skipped: `no front-page entries for snapshot ${snapshotName}` };
  const out = { proxy: file.proxy !== false };
  for (const ed of EDITIONS) {
    const m = computeFrontPageMetrics(rankedByEdition[ed] || [], snap[ed] || []);
    if (m) out[ed] = m;
  }
  return Object.keys(out).length > 1 ? out : { skipped: 'front-page entries present but no overlap with the replay' };
}

/** Build a sample front-pages entry from a snapshot's raw feed order. */
export function buildFromRaw(snapshotSpec, { perOutlet = 10 } = {}) {
  const snap = loadSnapshot(snapshotSpec);
  const entry = {};
  for (const ed of EDITIONS) {
    const raw = snap.raw[ed];
    if (!raw) continue;
    entry[ed] = raw.items
      .filter((it) => (it.feedRank || 99) <= perOutlet)
      .map((it) => ({ outlet: it.sourceName, rank: it.feedRank, title: it.title, link: it.link }));
  }
  return { name: snap.name, entry };
}

function main() {
  const args = process.argv.slice(2);
  const bi = args.indexOf('--build');
  if (bi < 0) {
    console.log('usage: node scripts/eval/frontpages.mjs --build <snapshot> [--per-outlet 10]');
    return;
  }
  const spec = args[bi + 1];
  const pi = args.indexOf('--per-outlet');
  const { name, entry } = buildFromRaw(spec, { perOutlet: pi >= 0 ? Number(args[pi + 1]) : 10 });
  const file = loadFrontPages() || {
    version: 1,
    proxy: true,
    description:
      'Editorial front-page positives. PROXY ONLY: entries marked source=feed-order are each outlet\'s own feed order (not a fetched front page). See scripts/eval/frontpages.mjs.',
    snapshots: {},
  };
  file.snapshots[name] = { source: 'feed-order', ...entry };
  fs.writeFileSync(FRONT_PAGES_PATH, JSON.stringify(file, null, 1) + '\n');
  console.log(`wrote ${path.relative(ROOT, FRONT_PAGES_PATH)} (${name}: ${EDITIONS.map((e) => `${e}=${entry[e]?.length || 0}`).join(', ')})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
