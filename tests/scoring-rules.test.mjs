import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreArticleAsync } from '../lib/scoring/index.mjs';
import { __test__ as fin } from '../lib/scoring/finance.mjs';
import { scoreArticle, NOISE_FLOOR, headlineIntegrity } from '../lib/score.js';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const HOUR = 3_600_000;
const wire = { link: 'https://www.reuters.com/x', source: { name: 'Reuters', trust: 19 } };
const art = (title, summary = '', extra = {}) => ({ title, summary, publishedAt: NOW - HOUR, ...wire, ...extra });
const run = (a, edition) => scoreArticleAsync(a, edition, { now: NOW });
const layer = (r, key) => r.scoreBreakdown.find((l) => l.key === key).delta;

/* ------------------------ Topic gate (regression probes) ------------------ */

test('Apple chargers on Reuters no longer score like market news (both editions)', async () => {
  const charger = art("Apple's new MagSafe chargers hit shelves ahead of the holiday season", 'The company said the chargers go on sale Tuesday.');
  for (const [edition, onTopic] of [
    ['finance', art('Fed holds rates steady as inflation cools to 3.1%', 'Treasury yields fell.')],
    ['geopolitics', art('Russia and NATO trade warnings over Baltic troop build-up', 'The Kremlin said it would respond.')],
  ]) {
    const off = await run(charger, edition);
    const on = await run(onTopic, edition);
    assert.ok(layer(off, 'topicGate') <= -20, `${edition} gate: ${layer(off, 'topicGate')}`);
    assert.ok(on.rankScore - off.rankScore >= 25, `${edition}: on-topic ${on.rankScore} vs off-topic ${off.rankScore}`);
    assert.ok(off.finalCurationScore < on.finalCurationScore);
  }
});

test('a topical lead softens the gate; a regulator source is on-topic by definition', async () => {
  const lead = await run(art('Apple chargers hit shelves', 'Shares of Apple rose 2% as investors weighed earnings.'), 'finance');
  assert.equal(layer(lead, 'topicGate'), -8);
  const sec = await run(
    { title: 'Order instituting proceedings', summary: '', link: 'https://www.sec.gov/x', source: { name: 'SEC' }, publishedAt: NOW },
    'finance'
  );
  assert.equal(layer(sec, 'topicGate'), 0);
});

test('on-topic headlines are never gated, including Indian and venture finance', async () => {
  for (const t of [
    'Sensex, Nifty fall as FIIs sell; rupee weakens',
    'Startup raises $20M Series A led by Sequoia',
    'RBI keeps repo rate unchanged at 6.5%',
    'Bitcoin tops $100,000',
  ]) assert.equal(layer(await run(art(t), 'finance'), 'topicGate'), 0, t);
  for (const t of ['Modi meets Putin in Moscow', 'Houthi missile strikes tanker', 'Israeli strikes hit Gaza']) {
    assert.equal(layer(await run(art(t), 'geopolitics'), 'topicGate'), 0, t);
  }
});

/* -------------------------------- Soft news ------------------------------ */

test('soft news is penalised: how-to, listicle, personal finance, sport, index wraps', async () => {
  const cases = [
    ['finance', 'How to retire early on $60k a year', -6],
    ['finance', '7 stocks to buy before year-end', -6],
    ['finance', 'Should I move my 401(k) into cash?', -14],
    ['finance', 'Stock market today: Dow and S&P 500 slip as yields rise', -8],
    ['geopolitics', 'How to plan a trip around a running race', -6],
    ['geopolitics', 'Football: Arsenal beat Spurs in the Premier League', -20],
  ];
  for (const [edition, title, atLeast] of cases) {
    const r = await run(art(title), edition);
    assert.ok(layer(r, 'softNews') <= atLeast, `${edition} "${title}": ${layer(r, 'softNews')}`);
  }
  const hard = await run(art('Fed holds rates steady as inflation cools'), 'finance');
  assert.equal(layer(hard, 'softNews'), 0);
});

test('soft-news penalties are capped so one headline cannot be driven to the floor by soft news alone', async () => {
  const r = await run(art('Top 10 celebrity football wedding tips: should I retire?'), 'finance');
  assert.ok(layer(r, 'softNews') >= -24);
});

/* -------------------------------- Finance rules --------------------------- */

test('"!" is charged once (clickbait layer), not again in the volatility layer', async () => {
  const quiet = await run(art('Fed holds rates steady'), 'finance');
  const bang = await run(art('Fed holds rates steady!'), 'finance');
  assert.equal(layer(bang, 'sentiment'), layer(quiet, 'sentiment'));
  assert.equal(layer(bang, 'speculation') - layer(quiet, 'speculation'), -3);
  const gbang = await run(art('Russia and NATO hold talks!'), 'geopolitics');
  const gquiet = await run(art('Russia and NATO hold talks'), 'geopolitics');
  assert.equal(layer(gbang, 'subjectivity'), layer(gquiet, 'subjectivity'));
  assert.equal(layer(gbang, 'clickbait') - layer(gquiet, 'clickbait'), -3);
});

test('pump-and-dump variants are recognised', () => {
  for (const t of [
    'This is a pump and dump scheme',
    'Classic pump-and-dump in microcaps',
    'A pump & dump on Telegram',
    'Another pump n dump coin',
    'Penny stocks to the moon',
    'Guaranteed returns on this hidden gem',
    'The next Tesla is a 100x multibagger',
    'Easy money: get rich quick with this secret stock',
  ]) assert.ok(fin.speculationPenalty({ title: t, summary: '' }) >= 8, t);
  assert.equal(fin.speculationPenalty({ title: 'SEC charges founder in pump-and-dump scheme' , summary: ''}) >= 8, true);
  assert.equal(fin.speculationPenalty({ title: 'Oil majors pump more crude as demand rebounds', summary: '' }), 0);
});

test('plummet, tumble and slump join the volatility vocabulary (distinct terms, capped)', () => {
  assert.ok(fin.volatilityPenalty('Shares plummet') > 0);
  assert.ok(fin.volatilityPenalty('Stocks tumble') > 0);
  assert.ok(fin.volatilityPenalty('Profits slump') > 0);
  assert.equal(fin.volatilityPenalty('plunge plunge plunge plunge'), fin.volatilityPenalty('plunge'));
  assert.ok(fin.volatilityPenalty('plunge crash plummet tumble slump collapse meltdown rout carnage') <= 12);
});

test('regulatory bonus is keyed to filing forms or the regulator host; keyword-only gets +3', async () => {
  const keywordOnly = await run(art('Court filing: Tesla CEO faces pay lawsuit'), 'finance');
  const form = await run(art('Tesla files 8-K disclosing CEO pay lawsuit'), 'finance');
  const host = await run(
    { title: 'Tesla CEO faces pay lawsuit', summary: '', link: 'https://www.sec.gov/x', source: { name: 'SEC' }, publishedAt: NOW - HOUR },
    'finance'
  );
  const none = await run(art('Tesla CEO faces pay lawsuit'), 'finance');
  assert.equal(layer(none, 'regulatory'), 0);
  assert.equal(layer(keywordOnly, 'regulatory'), 3);
  assert.equal(layer(form, 'regulatory'), 8);
  assert.equal(layer(host, 'regulatory'), 8);
});

test('density counts a figure once ($6.14 is not a currency figure and a decimal)', () => {
  const once = fin.densityPoints('Apple reports EPS of $6.14 for the quarter, beating the street handily'); // 12 words
  assert.ok(Math.abs(once - (1 / 12) * 100 * 0.5) < 1e-9, `once=${once}`);
  const two = fin.densityPoints('Apple reports EPS of $6.14 and $7.20 for the quarter, beating the street');
  assert.ok(Math.abs(two - (2 / 13) * 100 * 0.5) < 1e-9, `two=${two}`);
});

test('ticker layer is capped (it was unbounded)', () => {
  assert.equal(fin.instrumentPoints('$A $B $C $D $E $F $G $H $I $J'), 6);
});

test('fundamentals counts unique terms: repeating EPS does not stack', () => {
  assert.equal(fin.fundamentalsPoints('EPS EPS EPS EPS EPS EPS EPS EPS'), fin.fundamentalsPoints('EPS'));
});

/* ----------------------------- Clickbait / caps --------------------------- */

test('acronyms are not shouting: NATO and UNESCO condemn strike', async () => {
  const r = await run(art('NATO and UNESCO condemn strike on Odesa'), 'geopolitics');
  assert.equal(layer(r, 'clickbait'), 0);
  const s = await run(art('BREAKING SHOCKING STRIKE ON ODESA'), 'geopolitics');
  assert.ok(layer(s, 'clickbait') <= -6);
});

test('explainer phrasing ("here\'s what") costs less than hard clickbait', async () => {
  const soft = await run(art("Here's what to know about the Fed decision"), 'finance');
  const hard = await run(art("You won't believe what the Fed just did"), 'finance');
  assert.ok(layer(soft, 'speculation') > layer(hard, 'speculation'));
  assert.ok(layer(soft, 'speculation') >= -4);
});

test('clickbait cut: egregious clickbait from a low-tier outlet lands under the noise floor; the same wire copy does not', async () => {
  const bait = await run(
    { title: "You won't believe this! Here's why…", summary: 'A jaw-dropping, mind-blowing story.', link: 'https://buzzfeed.com/x', source: { name: 'BuzzFeed', trust: 6 }, publishedAt: NOW - HOUR },
    'geopolitics'
  );
  const wireCopy = await run(art('Russia and Ukraine agree ceasefire terms', 'Kremlin negotiators signed in Geneva.'), 'geopolitics');
  assert.ok(bait.finalCurationScore < NOISE_FLOOR, `bait ${bait.finalCurationScore} vs floor ${NOISE_FLOOR}`);
  assert.ok(wireCopy.finalCurationScore > NOISE_FLOOR + 30);
  const pump = await run(
    { title: 'This penny stock will explode 100x - guaranteed next Tesla to the moon!!!', summary: 'Meme stock pumping. YOLO. Rocket.', link: 'https://reddit.com/r/x', source: { name: 'Reddit', trust: 4 }, publishedAt: NOW - HOUR },
    'finance'
  );
  assert.ok(pump.finalCurationScore < NOISE_FLOOR, `pump ${pump.finalCurationScore}`);
});

/* ----------------------------- Geopolitics rules -------------------------- */

test('geopolitics L2/L5 count distinct tokens: repeating a country does not raise the score', async () => {
  const once = await run(art('Iran hits back'), 'geopolitics');
  const many = await run(art('Iran Iranian Iranians Iran hits back'), 'geopolitics');
  assert.equal(layer(once, 'factMatch'), layer(many, 'factMatch'));
});

test('geopolitics entity recall: "US sanctions Iran" scores the same entities as "United States sanctions Iran"', async () => {
  const a = await run(art('US sanctions Iran'), 'geopolitics');
  const b = await run(art('United States sanctions Iran'), 'geopolitics');
  assert.equal(layer(a, 'factMatch'), layer(b, 'factMatch'));
  assert.ok(layer(a, 'factMatch') >= 5);
});

test('"Israeli strikes Rafah" is not penalised relative to "Israel strikes Rafah"', async () => {
  const a = await run(art('Israeli strikes Rafah'), 'geopolitics');
  const b = await run(art('Israel strikes Rafah'), 'geopolitics');
  assert.equal(a.rankScore, b.rankScore);
});

/* --------------------------------- score.js ------------------------------- */

const source = { name: 'BBC World', trust: 19, authority: 8 };

test('scoreArticle clamps future and missing dates to fetch time instead of discarding or over-rewarding them', () => {
  const base = { title: 'Ceasefire holds in Gaza as aid convoys cross', link: 'https://www.bbc.co.uk/x', summary: '' };
  const future = scoreArticle({ ...base, publishedAt: NOW + 5 * HOUR }, source, 'geopolitics', NOW);
  const missing = scoreArticle({ ...base }, source, 'geopolitics', NOW);
  const fresh = scoreArticle({ ...base, publishedAt: NOW }, source, 'geopolitics', NOW);
  for (const a of [future, missing]) {
    assert.ok(a, 'must not be dropped');
    assert.equal(a.publishedAt, NOW);
    assert.equal(a.ageHours, 0);
    assert.equal(a.dateClamped, true);
  }
  assert.equal(fresh.dateClamped, undefined);
  assert.equal(scoreArticle({ ...base, title: '' }, source, 'geopolitics', NOW), null);
});

test('legacy sports filter matches whole words: "factor" and "filmed" are kept, "actor" is dropped', () => {
  const mk = (title) => scoreArticle({ title, link: 'https://x.example/a', publishedAt: NOW }, source, 'geopolitics', NOW);
  assert.ok(mk('Inflation is the deciding factor in the election'));
  assert.ok(mk('Tractor exports surge as sanctions bite'));
  assert.equal(mk('Actor wins Oscar for war drama'), null);
  assert.equal(mk('Premier League title race'), null);
});

test('NOISE_FLOOR is on the display scale and the legacy headline metric is untouched', () => {
  assert.ok(Number.isInteger(NOISE_FLOOR) && NOISE_FLOOR > 32 && NOISE_FLOOR < 60, `floor ${NOISE_FLOOR}`);
  assert.ok(headlineIntegrity('Russia and Ukraine agree ceasefire terms in Geneva talks').points > 20);
});
