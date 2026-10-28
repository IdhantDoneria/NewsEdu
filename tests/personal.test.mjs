import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_WEIGHTS, PRESETS, addTerm, breadthCounts, isDefaultWeights, matchWatchlist,
  normalizeTerm, personalScore, rankArticles, sanitizeWeights,
} from '../lib/personal/ranking.mjs';
import { describeSearch, parseQuery, searchArticles, topicsFor } from '../lib/personal/search.mjs';

let seq = 0;
const art = (title, over = {}) => ({
  id: `p${++seq}`, title, summary: '', sourceName: 'BBC World', score: 70, ageHours: 2,
  publishedAt: Date.now() - 2 * 36e5, metrics: { sourceTrust: 15 }, clusterId: null, edition: 'geopolitics', ...over,
});

test('default weights reproduce the server order', () => {
  const list = [art('a', { score: 90 }), art('b', { score: 80 }), art('c', { score: 95 })];
  assert.deepEqual(rankArticles(list, DEFAULT_WEIGHTS).map((x) => x.title), ['a', 'b', 'c']);
  assert.ok(isDefaultWeights({ score: 50 }));
  assert.ok(!isDefaultWeights({ score: 50, freshness: 10 }));
});

test('sanitizeWeights clamps, fills gaps and rescues all-zero weights', () => {
  assert.deepEqual(sanitizeWeights({ score: 500, freshness: -5, trust: 'x' }), { score: 100, freshness: 0, trust: 0, breadth: 0, watchlist: 0 });
  assert.deepEqual(sanitizeWeights({ score: 0 }), DEFAULT_WEIGHTS);
  assert.deepEqual(sanitizeWeights(null), DEFAULT_WEIGHTS);
});

test('freshness weight promotes newer stories over higher-scored older ones', () => {
  const old = art('old', { score: 90, ageHours: 60 });
  const fresh = art('fresh', { score: 75, ageHours: 1 });
  const ranked = rankArticles([old, fresh], PRESETS.find((p) => p.id === 'breaking').weights);
  assert.equal(ranked[0].title, 'fresh');
});

test('wide-coverage weight uses cluster size across the pool', () => {
  const pool = [
    art('solo', { score: 85, clusterId: 'c1' }),
    art('big-1', { score: 70, clusterId: 'c2' }), art('big-2', { score: 60, clusterId: 'c2' }), art('big-3', { score: 60, clusterId: 'c2' }),
  ];
  assert.equal(breadthCounts(pool).get('c2'), 3);
  const ranked = rankArticles(pool, PRESETS.find((p) => p.id === 'widely').weights);
  assert.equal(ranked[0].clusterId, 'c2');
});

test('ranking is stable on ties and never mutates its input', () => {
  const list = [art('x', { score: 70 }), art('y', { score: 70 }), art('z', { score: 70 })];
  const copy = list.slice();
  const ranked = rankArticles(list, { score: 50, freshness: 50 });
  assert.deepEqual(ranked.map((a) => a.title), ['x', 'y', 'z']);
  assert.deepEqual(list, copy);
});

test('watchlist matches whole words and cashtags, not substrings', () => {
  const a = art('Apple shares jump as $AAPL rallies', { summary: 'Crude oil slips' });
  assert.deepEqual(matchWatchlist(a, ['aapl', 'apple', 'oil', 'cru', 'pple']), ['aapl', 'apple', 'oil']);
  assert.deepEqual(matchWatchlist(a, []), []);
});

test('watchlist terms are normalised, deduped and capped', () => {
  assert.equal(normalizeTerm('  $AAPL '), 'aapl');
  let terms = [];
  terms = addTerm(terms, '$AAPL');
  terms = addTerm(terms, 'aapl');
  assert.deepEqual(terms, ['aapl']);
  for (let i = 0; i < 40; i++) terms = addTerm(terms, `term${i}`);
  assert.equal(terms.length, 20);
});

test('watchlist weight puts matching stories first', () => {
  const list = [art('Generic markets wrap', { score: 90 }), art('Tesla recalls cars', { score: 60 })];
  const ranked = rankArticles(list, PRESETS.find((p) => p.id === 'mine').weights, { terms: ['tesla'] });
  assert.equal(ranked[0].title, 'Tesla recalls cars');
  assert.ok(personalScore(list[1], { score: 0, watchlist: 100 }, { counts: new Map(), terms: ['tesla'] }) === 100);
});

/* ---------------------------------- search --------------------------------- */

test('parseQuery handles words, phrases and exclusions', () => {
  assert.deepEqual(parseQuery('oil "red sea" -sports a'), { must: ['oil', 'red sea'], not: ['sports'] });
});

test('search ANDs terms, matches word starts, and applies exclusions', () => {
  const pool = [
    art('Tariffs hit steel exports', { summary: 'New tariff on steel' }),
    art('Steel party conference', { summary: 'a party event' }),
    art('Oil prices rise', { summary: 'sports betting on oil' }),
  ];
  assert.deepEqual(searchArticles(pool, { query: 'tariff steel' }).map((a) => a.title), ['Tariffs hit steel exports']);
  assert.equal(searchArticles(pool, { query: 'art' }).length, 0); // "art" is not a word start of "party"
  assert.deepEqual(searchArticles(pool, { query: 'oil -sports' }), []);
  assert.deepEqual(searchArticles(pool, { query: '"oil prices"' }).map((a) => a.title), ['Oil prices rise']);
});

test('search filters by edition, source, age and topic, and sorts', () => {
  const pool = [
    art('Fed holds rates', { edition: 'finance', sourceName: 'CNBC', score: 80, ageHours: 5, publishedAt: 3 }),
    art('Fed minutes released', { edition: 'finance', sourceName: 'Reuters', score: 90, ageHours: 30, publishedAt: 2 }),
    art('Ukraine ceasefire talks', { edition: 'geopolitics', score: 70, ageHours: 1, publishedAt: 5 }),
  ];
  assert.equal(searchArticles(pool, { edition: 'finance' }).length, 2);
  assert.deepEqual(searchArticles(pool, { source: 'CNBC' }).map((a) => a.title), ['Fed holds rates']);
  assert.equal(searchArticles(pool, { maxAgeHours: 6 }).length, 2);
  assert.deepEqual(searchArticles(pool, { topic: 'russia-ukraine' }).map((a) => a.title), ['Ukraine ceasefire talks']);
  assert.ok(topicsFor(pool[0]).includes('markets-macro'));
  assert.deepEqual(searchArticles(pool, { sort: 'newest' }).map((a) => a.publishedAt), [5, 3, 2]);
  assert.equal(searchArticles(pool, { sort: 'score' })[0].title, 'Fed minutes released');
});

test('describeSearch gives a compact label', () => {
  assert.equal(describeSearch({ query: 'oil', edition: 'finance', maxAgeHours: 24 }), 'oil · Finance · 24h');
  assert.equal(describeSearch({}), 'All stories');
});
