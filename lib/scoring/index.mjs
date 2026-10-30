/**
 * Barrel + async ingestion helper.
 *
 * The scoring pipelines themselves are pure and synchronous; wrapping them in
 * `Promise.resolve().then(...)` inside `scoreArticleAsync` yields to the
 * microtask queue between articles so the ingestion `Promise.all` can
 * interleave scoring with the tail of feed I/O rather than serialising the
 * whole CPU pass in one tick.
 *
 * Scale: `rankScore` is the unclamped sort key (it may exceed 100 or go
 * below 0). `finalCurationScore` is `displayScore(rankScore)`, a monotonic
 * 0-100 value for display and the noise floor; never sort on it.
 */

export { calculateGeopoliticalScore, calculateGeopoliticalScoreDetailed } from './geopolitics.mjs';
export { calculateFinancialScore, calculateFinancialScoreDetailed } from './finance.mjs';
export { displayScore, receiptTotal } from './scale.mjs';
export { resolveOutlet, outletBaseline, OUTLET_BAND } from './outlets.mjs';

import { calculateGeopoliticalScoreDetailed } from './geopolitics.mjs';
import { calculateFinancialScoreDetailed } from './finance.mjs';

/**
 * Score one article through both pipelines. The edition-relevant pipeline also
 * returns its per-layer breakdown (`scoreBreakdown`), whose deltas sum exactly
 * to `rankScore`, so the UI receipt always reconciles with the sort key.
 *
 * @param {object} article        normalised article (title, summary, link, publishedAt, source)
 * @param {string} [edition]      'geopolitics' | 'finance'
 * @param {{ now?: number }} [opts]  fetch time (defaults to Date.now())
 * @returns {Promise<{ geopoliticalScore:number, financialScore:number, finalCurationScore:number, rankScore:number, scoreBreakdown:Array }>}
 */
export async function scoreArticleAsync(article, edition = 'geopolitics', opts = {}) {
  const isFinance = edition === 'finance';
  const o = { now: opts?.now };
  const [geo, fin] = await Promise.all([
    Promise.resolve().then(() => calculateGeopoliticalScoreDetailed(article, o)),
    Promise.resolve().then(() => calculateFinancialScoreDetailed(article, o)),
  ]);
  const primary = isFinance ? fin : geo;
  return {
    geopoliticalScore: geo.score,
    financialScore: fin.score,
    finalCurationScore: primary.score,
    rankScore: primary.rank,
    scoreBreakdown: primary.layers,
  };
}

/**
 * Convenience wrapper for a batch of articles. `Promise.all` yields between
 * microtasks so DB writes / other async work in ingestion are not blocked.
 *
 * @param {object[]} articles
 * @param {string}   edition
 * @param {{ now?: number }} [opts]
 */
export function scoreArticlesAsync(articles, edition = 'geopolitics', opts = {}) {
  return Promise.all(articles.map((a) => scoreArticleAsync(a, edition, opts)));
}
