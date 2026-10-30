import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEntities, canonical, displayCase, normalizeText, placesConflict, entityKind } from '../lib/intelligence/entities.mjs';
import { foldAccents, normalizeTitleKey, wordShingles, jaccard, outletKey } from '../lib/text.mjs';

const ids = (text, ctx) => extractEntities(text, ctx).map((e) => e.canonical);

test('transliteration aliases agree: Kiev/Kyiv, Zelenskiy/Zelenskyy/Zelensky, Peking/Beijing, Bombay/Mumbai, Burma/Myanmar', () => {
  assert.equal(canonical('Kiev'), canonical('Kyiv'));
  assert.equal(canonical('Zelenskiy'), 'zelensky');
  assert.equal(canonical('Zelenskyy'), 'zelensky');
  assert.equal(canonical('Peking'), canonical('Beijing'));
  assert.equal(canonical('Bombay'), canonical('Mumbai'));
  assert.equal(canonical('Calcutta'), canonical('Kolkata'));
  assert.equal(canonical('Bangalore'), canonical('Bengaluru'));
  assert.equal(canonical('Burma'), canonical('Myanmar'));
  assert.equal(canonical('Türkiye'), 'turkey');
  for (const v of ['Qaddafi', 'Gaddafi', 'Kadhafi', 'Khadafy', 'Qadhafi']) assert.equal(canonical(v), 'gaddafi', v);
  assert.deepEqual(ids('Kiev and Kyiv, Peking and Beijing'), ['kyiv', 'beijing']);
});

test('demonyms resolve to their country', () => {
  const got = ids('Russian forces and Chinese army, Israeli strikes, Iranian missiles, Ukrainian drones, British minister, French police');
  for (const c of ['russia', 'china', 'israel', 'iran', 'ukraine', 'britain', 'france']) assert.ok(got.includes(c), c);
  assert.deepEqual(ids('Russia army'), ids('Russian forces'));
  assert.ok(ids('Americans and the U.S. and the US and America').every((c, _, a) => a.length === 1 && c === 'united states'));
});

test('accents are folded (NFKD)', () => {
  assert.equal(foldAccents('Erdoğan Zelenskyy Flávio Müller Curaçao'), 'Erdogan Zelenskyy Flavio Muller Curacao');
  assert.deepEqual(ids('Erdoğan meets Zelenskiy in Türkiye'), ['erdogan', 'zelensky', 'turkey']);
  assert.equal(canonical('Flávio Bolsonaro'), canonical('Flavio Bolsonaro'));
});

test('Indian entities: RBI, SEBI, Sensex, Nifty, Modi, Reserve Bank of India, NSE/BSE, FIIs', () => {
  assert.equal(canonical('Reserve Bank of India'), 'rbi');
  assert.equal(canonical('Securities and Exchange Board of India'), 'sebi');
  assert.equal(canonical('BSE Sensex'), 'sensex');
  assert.equal(canonical('Nifty 50'), 'nifty');
  assert.equal(canonical('Narendra Modi'), 'modi');
  const got = ids('Sensex, Nifty close lower; Reserve Bank of India and Sebi watch FIIs as Modi speaks. NSE and BSE volumes rose.');
  for (const c of ['sensex', 'nifty', 'rbi', 'sebi', 'fii', 'modi', 'nse', 'bse']) assert.ok(got.includes(c), c);
  assert.ok(!got.includes('reserve bank'), 'vocabulary hits are not re-extracted as phrases');
  assert.equal(entityKind('rbi'), 'organization');
  assert.equal(displayCase('rbi'), 'RBI');
  assert.equal(displayCase('nato'), 'NATO');
  assert.equal(displayCase('united states'), 'United States');
});

test('all-caps headlines are matched case-insensitively', () => {
  const got = ids('TRUMP SAYS IRAN DEAL IS CLOSE AS NATO MEETS IN BRUSSELS');
  for (const c of ['trump', 'iran', 'nato']) assert.ok(got.includes(c), c);
  assert.deepEqual(ids('RBI KEEPS REPO RATE UNCHANGED AS SENSEX RALLIES'), ['rbi', 'sensex']);
  assert.ok(!ids('we will fix this for us').includes('united states'), 'pronoun "us" is not the US in ordinary text');
});

test('Title Case defeated the phrase heuristic: the summary attests the names', () => {
  const title = 'Flávio Bolsonaro Lands in Miami After Fleeing Brazil';
  assert.ok(!ids(title).includes('miami'), 'headline alone cannot tell Miami is a name');
  const withSummary = ids(`${title}. The defeated candidate arrived in Miami on Tuesday, officials said.`);
  assert.ok(withSummary.includes('miami'));
  assert.ok(withSummary.includes('bolsonaro'));
  const junk = ids('Edvisorly Raises Series A To Fix The Messy College Transfer Process With AI');
  assert.ok(!junk.includes('to fix the') && !junk.includes('process with ai'));
});

test('Georgia is disambiguated by context', () => {
  assert.deepEqual(ids('Georgia protests: thousands rally in Tbilisi'), ['georgia']);
  assert.ok(ids('Georgia Senate runoff in Atlanta').includes('georgia (us)'));
  assert.ok(ids('Georgian police use water cannon in Tbilisi').includes('georgia'));
  assert.ok(placesConflict(new Set(['georgia']), new Set(['georgia (us)'])));
  assert.ok(ids('Michael Jordan sells his stake').includes('jordan (person)'));
  assert.ok(ids('Jordan and Israel sign a water deal').includes('jordan'));
});

test('normalizeText rewrites aliases to shared tokens', () => {
  const a = normalizeText('Kiev says Russian forces enter Peking').toLowerCase().split(/\s+/);
  assert.ok(a.includes('kyiv') && a.includes('russia') && a.includes('beijing'));
  const us = normalizeText('U.S. and America and United States').toLowerCase().split(/\s+/).filter(Boolean);
  assert.deepEqual([...new Set(us.filter((t) => t !== 'and'))], ['unitedstates']);
});

test('placesConflict: different theatres conflict, one theatre does not', () => {
  assert.equal(placesConflict(new Set(['iran']), new Set(['japan'])), true);
  assert.equal(placesConflict(new Set(['israel', 'egypt']), new Set(['gaza', 'egypt'])), false);
  assert.equal(placesConflict(new Set(['kyiv']), new Set(['ukraine'])), false);
  assert.equal(placesConflict(new Set(['united states', 'china']), new Set(['china'])), false);
  assert.equal(placesConflict(new Set(['india', 'pakistan']), new Set(['pakistan', 'afghanistan'])), true);
  assert.equal(placesConflict(new Set(['fed']), new Set(['ecb'])), true);
  assert.equal(placesConflict(new Set(['nvidia']), new Set(['microsoft'])), true);
  assert.equal(placesConflict(new Set(['trump']), new Set(['putin'])), false);
});

test('text helpers: title key, shingles, Jaccard, outlet keys', () => {
  assert.equal(normalizeTitleKey('Russian Strike on Ukrainian Train Station Kills 14 - Reuters'), 'russian strike on ukrainian train station kills 14');
  const a = wordShingles(normalizeTitleKey('Russian drone attack on Ukrainian train station kills 14'));
  const b = wordShingles(normalizeTitleKey('Russian drone attack on Ukrainian train station kills 14 | Yahoo'));
  assert.ok(jaccard(a, b) > 0.9);
  assert.equal(jaccard(new Set(), a), 0);
  assert.equal(outletKey('BBC World'), outletKey('BBC News'));
  assert.equal(outletKey('NYT World'), outletKey('The New York Times'));
  assert.notEqual(outletKey('Al Jazeera'), outletKey('France 24'));
});
