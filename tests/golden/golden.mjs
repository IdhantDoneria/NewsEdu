/**
 * Shared helpers for the chat golden set (tests/golden/questions.json):
 * loading the fixture pools and scoring retrieval. Used by the offline recall
 * test and by scripts/eval-chat.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
export const FIXTURE_DIR = path.join(ROOT, 'tests', 'fixtures', 'snapshots', '2026-10-29');

import { safeUserText } from '../../lib/intelligence/promptsafe.mjs';

export function loadGolden() {
  return JSON.parse(fs.readFileSync(path.join(here, 'questions.json'), 'utf8'));
}

/** Article pool per edition, as /api/news served it on the fixture date. */
export function loadPools() {
  const read = (ed) => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `news-${ed}.json`), 'utf8')).articles;
  return { geopolitics: read('geopolitics'), finance: read('finance') };
}

export function fixturesAvailable() {
  return fs.existsSync(path.join(FIXTURE_DIR, 'news-geopolitics.json')) && fs.existsSync(path.join(FIXTURE_DIR, 'news-finance.json'));
}

/** The previous user turn a follow-up borrows terms from. */
export const priorUserText = (q) => (q.history && q.history.length ? q.history[q.history.length - 1] : '');

/**
 * Score a retriever over the golden questions with expected ids.
 * recall@k = |expected ∩ top-k| / |expected| (mean over questions);
 * hit@k = share of questions with at least one expected id in the top k.
 */
export function scoreRetriever(retriever, golden, pools, { k = 10, tag } = {}) {
  const rows = [];
  for (const q of golden.questions) {
    if (!q.expected.length) continue;
    if (tag && !q.tags.includes(tag)) continue;
    const got = retriever(pools[q.edition], safeUserText(q.q, 500), { priorUserText: priorUserText(q) })
      .slice(0, k)
      .map((a) => a.id);
    const hits = q.expected.filter((id) => got.includes(id)).length;
    rows.push({ id: q.id, q: q.q, recall: hits / q.expected.length, hit: hits > 0 ? 1 : 0, got });
  }
  const mean = (f) => (rows.length ? rows.reduce((s, r) => s + f(r), 0) / rows.length : 0);
  return { n: rows.length, recall: mean((r) => r.recall), hit: mean((r) => r.hit), rows };
}
