/**
 * Barrel + async ingestion helper.
 *
 * The scoring pipelines themselves are pure and synchronous; wrapping them in
 * `Promise.resolve().then(...)` inside `scoreArticleAsync` yields to the
 * microtask queue between articles so the ingestion `Promise.all` can
 * interleave scoring with the tail of feed I/O rather than serialising the
 * whole CPU pass in one tick.
 */

export { calculateGeopoliticalScore, calculateGeopoliticalScoreDetailed } from './geopolitics.mjs';
export { calculateFinancialScore, calculateFinancialScoreDetailed } from './finance.mjs';

import { calculateGeopoliticalScore, calculateGeopoliticalScoreDetailed } from './geopolitics.mjs';
import { calculateFinancialScore, calculateFinancialScoreDetailed } from './finance.mjs';

/**
 * Score one article through both pipelines concurrently. The edition-relevant
 * pipeline also returns its per-layer breakdown (`scoreBreakdown`) — the exact
 * signed contributions that summed to `finalCurationScore` — so the UI can
 * show an explanation that is guaranteed to match the displayed number. The
 * off-edition pipeline only needs its plain integer, so it isn't run twice.
 *
 * @param {object} article        — normalised article (title, summary, link, publishedAt, source)
 * @param {string} [edition]      — 'geopolitics' | 'finance'; picks the final_curation_score
 * @returns {Promise<{ geopoliticalScore:number, financialScore:number, finalCurationScore:number, scoreBreakdown:Array }>}
 */
export async function scoreArticleAsync(article, edition = 'geopolitics', _opts = {}) {
  const isFinance = edition === 'finance';
  const [primary, secondary] = await Promise.all([
    Promise.resolve().then(() =>
      isFinance ? calculateFinancialScoreDetailed(article) : calculateGeopoliticalScoreDetailed(article)
    ),
    Promise.resolve().then(() =>
      isFinance ? calculateGeopoliticalScore(article) : calculateFinancialScore(article)
    ),
  ]);
  const geopoliticalScore = isFinance ? secondary : primary.score;
  const financialScore = isFinance ? primary.score : secondary;
  return {
    geopoliticalScore,
    financialScore,
    finalCurationScore: displayScore(primary.score, edition),
    rankScore: primary.score, // unclamped sort key; finalCurationScore is for display only
    scoreBreakdown: primary.layers,
  };
}

/**
 * Map the sort key to the 0-100 display score. Stub: identity clamp.
 * Contract: monotonic non-decreasing in `rank`.
 */
export function displayScore(rank, _edition = 'geopolitics') {
  return Math.max(0, Math.min(100, Math.round(rank)));
}

/**
 * Convenience wrapper for a batch of articles. Runs all articles' scoring
 * concurrently — `Promise.all` yields between microtasks so DB writes / other
 * async work in the ingestion phase are not blocked by the CPU pass.
 *
 * @param {object[]} articles
 * @param {string}   edition
 */
export function scoreArticlesAsync(articles, edition = 'geopolitics', opts = {}) {
  return Promise.all(articles.map((a) => scoreArticleAsync(a, edition, opts)));
}
