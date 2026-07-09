/**
 * Barrel + async ingestion helper.
 *
 * The scoring pipelines themselves are pure and synchronous; wrapping them in
 * `Promise.resolve().then(...)` inside `scoreArticleAsync` yields to the
 * microtask queue between articles so the ingestion `Promise.all` can
 * interleave scoring with the tail of feed I/O rather than serialising the
 * whole CPU pass in one tick.
 */

export { calculateGeopoliticalScore } from './geopolitics.mjs';
export { calculateFinancialScore } from './finance.mjs';

import { calculateGeopoliticalScore } from './geopolitics.mjs';
import { calculateFinancialScore } from './finance.mjs';

/**
 * Score one article through both pipelines concurrently.
 *
 * @param {object} article        — normalised article (title, summary, link, publishedAt, source)
 * @param {string} [edition]      — 'geopolitics' | 'finance'; picks the final_curation_score
 * @returns {Promise<{ geopoliticalScore:number, financialScore:number, finalCurationScore:number }>}
 */
export async function scoreArticleAsync(article, edition = 'geopolitics') {
  const [geopoliticalScore, financialScore] = await Promise.all([
    Promise.resolve().then(() => calculateGeopoliticalScore(article)),
    Promise.resolve().then(() => calculateFinancialScore(article)),
  ]);
  const finalCurationScore =
    edition === 'finance' ? financialScore : geopoliticalScore;
  return { geopoliticalScore, financialScore, finalCurationScore };
}

/**
 * Convenience wrapper for a batch of articles. Runs all articles' scoring
 * concurrently — `Promise.all` yields between microtasks so DB writes / other
 * async work in the ingestion phase are not blocked by the CPU pass.
 *
 * @param {object[]} articles
 * @param {string}   edition
 */
export function scoreArticlesAsync(articles, edition = 'geopolitics') {
  return Promise.all(articles.map((a) => scoreArticleAsync(a, edition)));
}
