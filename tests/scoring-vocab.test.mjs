import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findPlaces,
  findActors,
  findStats,
  findInstruments,
  classifySoftNews,
  financeTopicHit,
  geoTopicHit,
  FIN_FIGURES,
} from '../lib/scoring/vocab.mjs';
import { distinctSpans } from '../lib/scoring/spans.mjs';
import { scoreArticleAsync } from '../lib/scoring/index.mjs';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const has = (set, ...keys) => keys.every((k) => set.has(k));

/* ------------------------------ Geopolitics ------------------------------ */

test('"US sanctions Iran" and "United States sanctions Iran" are the same two entities', () => {
  assert.deepEqual([...findPlaces('US sanctions Iran')].sort(), ['iran', 'us']);
  assert.deepEqual([...findPlaces('United States sanctions Iran')].sort(), ['iran', 'us']);
  assert.deepEqual([...findPlaces('U.S. and U.K. leaders meet')].sort(), ['uk', 'us']);
  assert.deepEqual([...findPlaces('USA beat the UK')].sort(), ['uk', 'us']);
});

test('lowercase "us" and "uk"-like prose words are not countries', () => {
  assert.equal(findPlaces('they told us what happened').size, 0);
  assert.equal(findPlaces('Let us know').size, 0);
});

test('demonyms and plurals resolve to the country: "Israeli strikes Rafah" equals "Israel strikes Gaza"', () => {
  assert.ok(has(findPlaces('Israeli strikes Rafah'), 'israel', 'palestine'));
  assert.ok(has(findPlaces('Russian forces advance'), 'russia'));
  assert.ok(has(findPlaces('Russians and Ukrainians swap prisoners'), 'russia', 'ukraine'));
  assert.ok(has(findPlaces('Chinese and Indian troops'), 'china', 'india'));
  assert.ok(has(findPlaces('Iranians protest'), 'iran'));
  assert.equal(findPlaces('Russia Russian Russians').size, 1);
  assert.ok(has(findPlaces('Turkiye and Türkiye'), 'turkey'));
});

test('capitals, territories and transliterations: Kyiv/Kiev, Beijing, West Bank, North/South Korea', () => {
  assert.ok(has(findPlaces('Kyiv'), 'ukraine'));
  assert.ok(has(findPlaces('Kiev'), 'ukraine'));
  assert.ok(has(findPlaces('Beijing warns Taipei'), 'china', 'taiwan'));
  assert.ok(has(findPlaces('West Bank raid'), 'palestine'));
  assert.ok(has(findPlaces('North Korea fires missile; South Korea responds'), 'northkorea', 'southkorea'));
});

test('missing countries are now covered', () => {
  const t = 'Sri Lanka, Nepal, Oman, Bahrain, Mali, Somalia, Kosovo, Moldova, Paraguay, Uruguay and Cambodia';
  assert.ok(findPlaces(t).size >= 11);
});

test('Georgia is the country only with country context, never the US state', () => {
  assert.equal(findPlaces('Georgia Senate passes budget; Atlanta lawmakers vote').has('georgia'), false);
  assert.equal(findPlaces('Georgia Bulldogs win in Athens').has('georgia'), false);
  assert.ok(findPlaces('Georgia protesters clash with police in Tbilisi').has('georgia'));
  assert.ok(findPlaces('Georgian Dream party wins vote in Georgia').has('georgia'));
});

test('Jordan, Chile and Turkey are disambiguated', () => {
  assert.equal(findPlaces('Michael Jordan returns to the court').has('jordan'), false);
  assert.ok(findPlaces('Jordan and Israel sign water deal; King Abdullah visits').has('jordan'));
  assert.ok(findPlaces('Jordanians protest').has('jordan'));
  assert.equal(findPlaces('Recipe: Chile pepper sauce').has('chile'), false);
  assert.equal(findPlaces('chile con carne tonight').has('chile'), false);
  assert.ok(findPlaces('Chile elects new president').has('chile'));
  assert.ok(findPlaces('Chilean copper output falls').has('chile'));
  assert.equal(findPlaces('Thanksgiving turkey prices rise').has('turkey'), false);
  assert.ok(findPlaces('Turkey and Greece hold talks').has('turkey'));
});

test('everyday words that double as demonyms need a capital: "polish the floor" vs "Polish army"', () => {
  assert.equal(findPlaces('polish the floor').has('poland'), false);
  assert.ok(findPlaces('Polish army mobilises').has('poland'));
});

test('organisations and leaders are case-insensitive; acronyms stay case-sensitive', () => {
  assert.ok(has(findActors('kremlin says putin will meet trump'), 'kremlin', 'putin', 'trump'));
  assert.ok(has(findActors('PUTIN MEETS XI JINPING'), 'putin', 'xi'));
  assert.ok(has(findActors('NATO and the UN warn'), 'nato', 'un'));
  assert.ok(has(findActors('Zelenskiy, Zelensky and Zelenskyy'), 'zelensky'));
  assert.equal(findActors('who is un-happy about it, and what about eu cheese').size, 0);
  assert.equal(findActors('Xi').size, 0, 'bare "Xi" is not enough');
  assert.ok(findActors("Xi's visit").has('xi'));
});

test('Indian geopolitical terms are recognised', () => {
  assert.ok(has(findPlaces('New Delhi and Islamabad trade barbs over Kashmir'), 'india', 'pakistan', 'kashmir'));
  assert.ok(has(findActors('Modi and Jaishankar address the Lok Sabha'), 'modi', 'jaishankar', 'loksabha'));
});

test('stats: each figure counts once, and Indian magnitudes are recognised', () => {
  assert.deepEqual(findStats('The $12bn deal'), ['$12bn']);
  assert.equal(findStats('₹5,000 crore and 12 lakh').length, 2);
  assert.equal(findStats('2,000 troops').length, 1);
  assert.equal(findStats('GDP grew 3.4% in 2026').length, 2);
});

/* --------------------------------- Finance -------------------------------- */

test('"$6.14" is one figure, not a currency figure plus a decimal', () => {
  const spans = distinctSpans('EPS of $6.14 on revenue', FIN_FIGURES);
  assert.deepEqual(spans, ['$6.14']);
  assert.deepEqual(distinctSpans('shares rose 3.5% to $12.50', FIN_FIGURES).sort(), ['$12.50', '3.5%']);
  assert.equal(distinctSpans('$6.14 and $6.14 again', FIN_FIGURES).length, 1);
});

test('bare tickers, parenthesised tickers, indices and FX are instruments', () => {
  assert.ok(findInstruments('$AAPL and $MSFT rally').size === 2);
  assert.ok(findInstruments('Apple (AAPL) beats estimates').has('t:AAPL'));
  assert.ok(findInstruments('(NSE:RELIANCE) jumps').has('t:RELIANCE'));
  assert.equal(findInstruments('The US (UK) said (CEO) and (GDP)').size, 0);
  assert.ok(findInstruments('Gold, Brent and bitcoin climb').size === 3);
});

test('Indian market terms: Sensex, Nifty, BSE, NSE, USD/INR, rupee, Dalal Street', () => {
  const i = findInstruments('Sensex and Nifty fall on BSE and NSE; USD/INR hits 85 as rupee weakens near Dalal Street');
  for (const k of ['sensex', 'nifty', 'in:bse', 'in:nse', 'p:USD/INR', 'rupee', 'in:dalalstreet']) assert.ok(i.has(k), k);
  // A pair is one instrument: its legs are not counted again.
  assert.equal(findInstruments('USD/INR').size, 1);
});

test('Indian finance terms feed the macro, flow, regulatory and figure layers', async () => {
  const score = async (title) =>
    scoreArticleAsync(
      { title, summary: '', link: 'https://www.livemint.com/x', source: { name: 'Mint' }, publishedAt: NOW },
      'finance',
      { now: NOW }
    );
  const layer = (r, key) => r.scoreBreakdown.find((l) => l.key === key).delta;
  const flows = await score('FIIs sold shares worth ₹5,000 crore while DIIs bought; RBI repo rate unchanged');
  assert.ok(layer(flows, 'institutional') > 0);
  assert.ok(layer(flows, 'macro') > 0);
  assert.ok(layer(flows, 'density') > 0);
  assert.ok(layer(flows, 'regulatory') > 0, 'RBI is a regulator keyword');
  assert.equal(layer(flows, 'topicGate'), 0);
});

/* ------------------------------- Topic gates ------------------------------ */

test('geopolitics gate: place, actor and event vocabulary count; consumer news does not', () => {
  assert.ok(geoTopicHit('Ceasefire talks resume'));
  assert.ok(geoTopicHit('Modi to visit Moscow'));
  assert.equal(geoTopicHit('Apple unveils new charger lineup'), false);
  assert.equal(geoTopicHit('Georgia Senate passes budget bill'), false, 'US state politics is not geopolitics');
});

test('finance gate: market, funding and macro vocabulary count; consumer news does not', () => {
  assert.ok(financeTopicHit('Startup raises $20M Series A'));
  assert.ok(financeTopicHit('Fed holds rates'));
  assert.ok(financeTopicHit('Company files 10-K showing EPS of $6.14'));
  assert.equal(financeTopicHit("Apple's new MagSafe chargers hit shelves ahead of the holidays"), false);
  assert.equal(financeTopicHit('How to plan a trip around a running race'), false);
});

/* -------------------------------- Soft news ------------------------------- */

test('soft-news classifier: how-to, listicle, personal finance, sport, entertainment, index wrap', () => {
  assert.ok(classifySoftNews('How to retire early on a $60k salary').howto);
  assert.ok(classifySoftNews('7 stocks to buy before the holidays').howto);
  assert.ok(classifySoftNews('Looking for income? These dividend stocks have high yields').howto);
  assert.ok(classifySoftNews('Should I move my 401(k) to cash?').personal);
  assert.ok(classifySoftNews("Our church has a $1.5 million bequest. Is inflation eroding it?").personal);
  assert.ok(classifySoftNews('Bangladesh opener hits century as West Indies collapse').sports);
  assert.ok(classifySoftNews('Premier League: Arsenal beat Spurs').sports);
  assert.ok(classifySoftNews('Celebrity wedding of the year').entertainment);
  assert.ok(classifySoftNews('Stock market today: Dow, S&P 500 slip as yields rise').indexWrap);
  assert.ok(classifySoftNews('Stocks making the biggest moves premarket').indexWrap);
});

test('soft-news classifier leaves hard news alone', () => {
  for (const t of [
    'Fed holds rates steady as inflation cools',
    'Russia and Ukraine agree ceasefire terms',
    'How Israel’s election could end',
    'Marathon talks between the two delegations end without a deal',
    'Why the factor model fails: Fed officials weigh tractor sales',
  ]) {
    const c = classifySoftNews(t);
    assert.equal(Object.values(c).some(Boolean), false, t);
  }
});
