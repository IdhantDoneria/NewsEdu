/** Unit tests for BM25 retrieval (lib/intelligence/retrieval.mjs). */

import test from 'node:test';
import assert from 'node:assert/strict';

import { retrieve, tokenize, queryTerms, MIN_SOURCES } from '../lib/intelligence/retrieval.mjs';
import { retrieveSources, answerChat } from '../lib/intelligence/chat.mjs';
import { marketAliasTerms, MARKET_ALIAS_TERMS, MARKET_KEYS } from '../lib/intelligence/marketsctx.mjs';

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;

const NOW = Date.UTC(2026, 9, 29, 12);
let seq = 0;
function art(title, summary = '', { score = 50, hoursAgo = 1, clusterId = null } = {}) {
  seq++;
  return { id: `r${seq}`, title, summary, link: `https://e.com/${seq}`, sourceName: 'Wire', publishedAt: NOW - hoursAgo * 36e5, score, clusterId };
}

test('tokenizer folds accents, hyphens, possessives and country spellings', () => {
  assert.deepEqual(tokenize('Zürich'), tokenize('Zurich'));
  assert.ok(tokenize('Cease-fire holds').includes(tokenize('ceasefire')[0]));
  assert.deepEqual(tokenize("Netanyahu's"), tokenize('Netanyahu'));
  assert.deepEqual(tokenize('U.S. troops'), tokenize('US troops'));
  assert.ok(tokenize('The Israeli election').includes(tokenize('Israel')[0]), 'demonym folds to the country');
  assert.ok(tokenize('EU and AI').length >= 2, 'two-letter tokens are kept');
  assert.ok(tokenize('GDP grew 3.4%').includes('3.4'));
});

test('tokenizer handles CJK with bigrams and keeps Devanagari intact', () => {
  assert.ok(tokenize('中国股市').includes('股市'));
  assert.ok(tokenize('भारत में चुनाव').includes('भारत'));
});

test('IDF: a rare term outweighs a term present in most articles', () => {
  const pool = [
    art('Markets rally as markets cheer data', 'Markets markets markets.'),
    art('Markets slip on weak data', 'Markets fell.'),
    art('Markets steady before the meeting', 'Markets flat.'),
    art('Quokka population recovers on Rottnest', 'Markets are not mentioned here.'),
  ];
  const r = retrieve(pool, 'quokka markets');
  assert.match(r.sources[0].title, /Quokka/);
});

test('title matches beat body-only matches', () => {
  const pool = [
    art('Quarterly report released', 'Analysts discussed the lithium supply outlook at length.'),
    art('Lithium supply tightens', 'Quarterly results will follow later this month.'),
    art('Unrelated gardening notes', 'Tulips bloom in spring.'),
  ];
  assert.match(retrieve(pool, 'lithium supply').sources[0].title, /Lithium supply tightens/);
});

test('length normalisation: a short focused article beats a long one that mentions the term once', () => {
  const filler = 'Officials met and discussed various matters across several sectors of the economy and trade. '.repeat(8);
  const pool = [
    art('Regional update', `${filler} The ferry strike was mentioned briefly.`),
    art('Ferry strike ends', 'Workers return to the ferries.'),
    art('Other news', 'Nothing relevant here.'),
  ];
  assert.match(retrieve(pool, 'ferry strike').sources[0].title, /Ferry strike ends/);
});

test('ties break on recency, then rank score', () => {
  const pool = [
    art('Port strike enters week three', 'Dockworkers.', { hoursAgo: 30, score: 90 }),
    art('Port strike enters week three', 'Dockworkers.', { hoursAgo: 2, score: 10 }),
    art('Other thing', 'x'),
  ];
  const r = retrieve(pool, 'port strike');
  assert.equal(r.sources[0].id, pool[1].id);
});

test('padding is explicit: unmatched fillers are copies flagged lowRelevance', () => {
  const pool = [
    art('Oil prices climb', 'Brent crude rose.', { score: 10 }),
    ...Array.from({ length: 8 }, (_, i) => art(`Story number ${i}`, 'Something happened.', { score: 90 - i })),
  ];
  const r = retrieve(pool, 'oil prices');
  assert.equal(r.sources.length, MIN_SOURCES);
  assert.ok(!r.sources[0].lowRelevance);
  assert.ok(r.sources.slice(1).every((a) => a.lowRelevance === true));
  assert.equal(pool.some((a) => 'lowRelevance' in a), false, 'pool articles are never mutated');
  assert.equal(r.meta.lowRelevance, false);
});

test('a question nothing matches is flagged low-relevance as a whole', () => {
  const pool = Array.from({ length: 8 }, (_, i) => art(`Story ${i} about trade`, 'Tariffs and ports.', { score: 80 - i }));
  const r = retrieve(pool, 'quantum chromodynamics lattice');
  assert.equal(r.meta.lowRelevance, true);
  assert.ok(r.sources.every((a) => a.lowRelevance));
});

test('non-English questions reach the English wire through the glossary', () => {
  const pool = [
    art('Oil climbs as Red Sea shipping attacks persist', 'Brent crude rose.', { score: 10 }),
    art('Chipmaker unveils processor', 'New chips.', { score: 90 }),
    art('Election results contested', 'Votes counted.', { score: 80 }),
  ];
  assert.match(retrieve(pool, '¿Qué pasó con el petróleo en el Mar Rojo?').sources[0].title, /Oil climbs/);
  assert.match(retrieve(pool, 'Wahl Ergebnisse').sources[0].title, /Election/);
  assert.match(retrieve(pool, '石油价格').sources[0].title, /Oil/);
  const r = retrieve(pool, 'ποιος κέρδισε');
  assert.equal(r.meta.lowRelevance, true, 'an untranslatable question is not answered with generic stories as if they matched');
});

test('market aliases are shared with the markets module and expand index-name questions', () => {
  assert.deepEqual(Object.keys(MARKET_ALIAS_TERMS).sort(), [...MARKET_KEYS].sort());
  assert.ok(marketAliasTerms('How is the Sensex?').includes('india'));
  assert.deepEqual(marketAliasTerms('hello'), []);
  const pool = [
    art('India’s central bank holds rates', 'The RBI left rates unchanged.'),
    art('Chip stocks fall', 'Semiconductors slid.', { score: 90 }),
    art('Weather', 'Rain.'),
  ];
  assert.match(retrieve(pool, 'How is the Sensex doing?').sources[0].title, /India/);
  assert.ok(queryTerms('Sensex').terms.get('india') === 0.5);
});

test('broad asks get the top-ranked stories; follow-ups borrow the previous question', () => {
  const pool = [art('Quiet story', 'x', { score: 20 }), art('Biggest story', 'y', { score: 99 }), art('Mid story', 'z', { score: 60 })];
  const broad = retrieve(pool, 'What are the top headlines today?');
  assert.equal(broad.meta.broad, true);
  assert.equal(broad.sources[0].title, 'Biggest story');
  assert.ok(broad.sources.every((a) => !a.lowRelevance));

  const pool2 = [art('Port strike enters third week', 'Dockworkers.'), art('Chips', 'x', { score: 99 }), art('More', 'y')];
  assert.match(retrieve(pool2, 'why?', { priorUserText: 'tell me about the port strike' }).sources[0].title, /Port strike/);
});

test('focused story stays first and pinned market sources keep their place', async () => {
  const pool = [
    art('Oil prices climb', 'Brent.', { clusterId: 'cl-oil', score: 10 }),
    art('Rate decision', 'Bank held rates.', { score: 90 }),
  ];
  assert.equal(retrieveSources(pool, 'tell me more', { focusClusterId: 'cl-oil' })[0].clusterId, 'cl-oil');
  const pinned = [{ id: 'mkt-india-index', title: 'Nifty 50: 25,000.00 (+0.50%)', summary: 'Nifty 50 last traded at 25,000.', link: 'https://x', sourceName: 'Yahoo Finance', publishedAt: NOW, score: 99 }];
  const res = await answerChat({ articles: pool, edition: 'finance', message: 'How is the Nifty?', pinned });
  assert.match(res.answer, /Nifty 50/);
  assert.equal(res.citations[0].id, 'mkt-india-index');
});

test('answerChat reports low relevance and says so in the notice', async () => {
  const pool = Array.from({ length: 8 }, (_, i) => art(`Story ${i} about trade`, 'Tariffs and ports.', { score: 80 - i }));
  const res = await answerChat({ articles: pool, edition: 'geopolitics', message: 'quantum chromodynamics lattice' });
  assert.equal(res.lowRelevance, true);
  assert.match(res.answer, /No current article closely matches/);
});
