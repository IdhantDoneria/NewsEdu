#!/usr/bin/env node
/**
 * Snapshot capture for the evaluation harness (Phase 0).
 *
 *   npm run eval:capture                      # API snapshot from production + raw feed pool
 *   npm run eval:capture -- --base http://localhost:3000
 *   npm run eval:capture -- --no-raw          # API only
 *   npm run eval:capture -- --raw-only        # raw feed pool only (imports lib/rss.js + lib/feeds.js)
 *   npm run eval:capture -- --no-intel        # skip /api/intel clusters
 *   npm run eval:capture -- --out some/dir    # write straight into this directory
 *   npm run eval:capture -- --stamp 2026-10-29-1845
 *
 * Env: EVAL_BASE_URL overrides the default base URL.
 *
 * Writes tests/fixtures/snapshots/<YYYY-MM-DD-HHmm>/ (UTC) containing
 *   news-<edition>.json    /api/news?edition=...       (post-filter, post-cap production output)
 *   intel-<edition>.json   /api/intel?edition=...      (cluster summaries, optional)
 *   raw-<edition>.json     every item every feed returned, before any filter, plus per-feed status
 *   meta.json              what was captured, from where, and what failed
 * Exit code is 0 as long as at least one file was written.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_BASE = 'https://news-edu-doneriaidhant-4248s-projects.vercel.app';
const EDITIONS = ['geopolitics', 'finance'];

export function stampUtc(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

function parseArgs(argv) {
  const a = { base: process.env.EVAL_BASE_URL || DEFAULT_BASE, out: null, stamp: null, raw: true, api: true, intel: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--base') a.base = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--stamp') a.stamp = argv[++i];
    else if (k === '--no-raw') a.raw = false;
    else if (k === '--raw-only') a.api = false;
    else if (k === '--no-intel') a.intel = false;
  }
  a.base = String(a.base).replace(/\/+$/, '');
  return a;
}

async function getJson(url, timeoutMs = 60000) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Raw pool: every item from every configured feed, pre-filter. Imports the real feed code. */
export async function captureRaw(edition) {
  const { EDITIONS: FEEDS } = await import('../../lib/feeds.js');
  const { fetchFeed } = await import('../../lib/rss.js');
  const sources = FEEDS[edition] || [];
  const feeds = [];
  const items = [];
  const settled = await Promise.allSettled(sources.map((s) => fetchFeed(s.url)));
  settled.forEach((r, i) => {
    const s = sources[i];
    if (r.status === 'fulfilled') {
      feeds.push({ source: s.name, ok: true, items: r.value.length });
      r.value.forEach((it, pos) => {
        items.push({
          title: it.title,
          link: it.link,
          summary: it.summary || '',
          publishedAt: it.publishedAt,
          // position in the feed = the outlet's own editorial order (a weak front-page proxy)
          feedRank: pos + 1,
          sourceName: s.name,
          source: { name: s.name, trust: s.trust, authority: s.authority },
        });
      });
    } else {
      feeds.push({ source: s.name, ok: false, items: 0, reason: String(r.reason?.message || r.reason).slice(0, 120) });
    }
  });
  return { edition, capturedAt: Date.now(), feeds, items };
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('usage: npm run eval:capture -- [--base URL] [--no-raw | --raw-only] [--no-intel] [--out DIR] [--stamp YYYY-MM-DD-HHmm]');
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  const stamp = args.stamp || stampUtc();
  const outDir = args.out
    ? path.resolve(process.cwd(), args.out)
    : path.join(ROOT, 'tests', 'fixtures', 'snapshots', stamp);
  await fs.mkdir(outDir, { recursive: true });

  const meta = { stamp, capturedAt: new Date().toISOString(), base: args.api ? args.base : null, files: [], errors: [] };
  const write = async (name, data) => {
    await fs.writeFile(path.join(outDir, name), JSON.stringify(data));
    meta.files.push(name);
    console.log(`  wrote ${name}`);
  };

  console.log(`Capturing to ${path.relative(ROOT, outDir)}`);
  if (args.api) {
    for (const ed of EDITIONS) {
      for (const route of args.intel ? ['news', 'intel'] : ['news']) {
        try {
          await write(`${route}-${ed}.json`, await getJson(`${args.base}/api/${route}?edition=${ed}`));
        } catch (e) {
          meta.errors.push(`${route}-${ed}: ${e.message}`);
          console.warn(`  ! ${route}-${ed}: ${e.message}`);
        }
      }
    }
  }
  if (args.raw) {
    for (const ed of EDITIONS) {
      try {
        const raw = await captureRaw(ed);
        if (raw.items.length === 0) throw new Error('no items fetched (network blocked?)');
        await write(`raw-${ed}.json`, raw);
      } catch (e) {
        meta.errors.push(`raw-${ed}: ${e.message}`);
        console.warn(`  ! raw-${ed}: ${e.message}`);
      }
    }
  }
  await fs.writeFile(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  if (meta.files.length === 0) {
    console.error('Nothing captured.');
    process.exit(1);
  }
  console.log(`Done: ${meta.files.length} file(s), ${meta.errors.length} error(s).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
