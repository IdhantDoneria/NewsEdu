/** Market-impact mode of the chat: intent, cross-asset sources, validated analysis. */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  isImpactQuestion,
  wantsMarketImpact,
  asksForDecision,
  pickAssets,
  assetSource,
  marketDataStrip,
  sanitizeAnalysis,
  ASSETS,
} from '../lib/intelligence/impact.mjs';
import { answerChat } from '../lib/intelligence/chat.mjs';
import { setTestModels, resetLlmState } from '../lib/intelligence/llm.mjs';

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.OPENROUTER_API_KEY;

test('impact intent: market-implication questions yes, plain news no', () => {
  for (const q of [
    'How will the Iran strikes affect oil and the Sensex?',
    'What does this mean for my portfolio?',
    'Should I sell my Nifty ETF now?',
    'What is the outlook for gold?',
    'Is this bullish or bearish for tech stocks?',
  ]) assert.equal(isImpactQuestion(q), true, q);
  for (const q of ['What is the capital of France?', 'Top stories today', 'Who is the prime minister of Japan?']) {
    assert.equal(isImpactQuestion(q), false, q);
  }
});

test('geopolitics-edition questions need a market cue to enter impact mode', () => {
  assert.equal(wantsMarketImpact('What will happen next in the Israeli election?', 'geopolitics'), false);
  assert.equal(wantsMarketImpact('How will the strikes affect oil prices?', 'geopolitics'), true);
  // finance edition: impact intent alone is enough
  assert.equal(wantsMarketImpact('What happens next?', 'finance'), true);
});

test('asksForDecision detects explicit what-should-I-do questions only', () => {
  assert.equal(asksForDecision('Should I buy gold now?'), true);
  assert.equal(asksForDecision('Is it a good time to invest?'), true);
  assert.equal(asksForDecision('How will this affect gold?'), false);
});

test('pickAssets: named assets first, core dashboard fills the rest, capped', () => {
  const keys = pickAssets('What does the rupee fall mean for oil importers?').map((a) => a.key);
  assert.ok(keys.indexOf('usdinr') < keys.indexOf('spx') || keys.includes('usdinr'));
  assert.ok(keys.includes('brent'));
  assert.ok(keys.length <= 6);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(pickAssets('hello').length > 0);
  assert.ok(pickAssets('and gold?', { priorText: 'effect on bitcoin' }).some((a) => a.key === 'btc'));
});

test('assetSource builds a citable pinned source with the live numbers', () => {
  const brent = ASSETS.find((a) => a.key === 'brent');
  const src = assetSource(brent, { symbol: 'BZ=F', price: 84.2, changePercent: 1.31, change5dPercent: 4.2, currency: 'USD', asOf: Date.now() });
  assert.equal(src.id, 'mkt-x-brent');
  assert.match(src.title, /Brent crude: 84\.20 \(\+1\.31% today\)/);
  assert.match(src.summary, /4\.20% over the past five sessions/);
  assert.equal(assetSource(brent, null), null);
  const stale = assetSource(brent, { symbol: 'BZ=F', price: 84.2, changePercent: -1.2, asOf: Date.now() - 40 * 36e5 });
  assert.match(stale.title, /-1\.20% last session/);
});

test('marketDataStrip drops missing quotes and rounds', () => {
  const brent = ASSETS.find((a) => a.key === 'brent');
  const gold = ASSETS.find((a) => a.key === 'gold');
  const strip = marketDataStrip([[brent, { price: 84.2, changePercent: 1.3149, change5dPercent: null }], [gold, null]]);
  assert.equal(strip.length, 1);
  assert.equal(strip[0].changePercent, 1.31);
  assert.equal(strip[0].change5dPercent, null);
});

const SOURCES = [{ title: 'Brent crude: 84.20 (+1.31% today)', summary: 'Brent crude last traded at 84.20 USD, up 1.31%.' }];

test('sanitizeAnalysis forces enums, bounds text and drops invented numbers', () => {
  const out = sanitizeAnalysis(
    {
      stance: 'MOONSHOT',
      horizon: 'weeks',
      confidence: 'high',
      assets: [
        { name: 'Brent crude', direction: 'up', size: 'huge', confidence: 'medium', why: 'Supply risk adds a premium; already at 84.20.' },
        { name: 'Gold', direction: 'up', size: 'small', confidence: 'low', why: 'Expect it to reach 3450 by Friday.' },
        { name: 'Rupee', direction: 'sideways', why: 'x' },
        { name: '', direction: 'up', why: 'no name' },
      ],
      pricedIn: 'Partly: Brent is up 1.31% today. See [S2].',
      watch: ['OPEC statement', 'Inventories fall 9% next week'],
      risks: ['A ceasefire would reverse the move'],
    },
    SOURCES
  );
  assert.equal(out.stance, 'mixed'); // unknown stance falls back
  assert.equal(out.horizon, 'weeks');
  assert.equal(out.assets.length, 1); // invented price target, bad direction and nameless rows removed
  assert.equal(out.assets[0].size, 'small'); // unknown size falls back
  assert.ok(!/\[S/.test(out.pricedIn));
  assert.deepEqual(out.watch, ['OPEC statement']); // "9%" is not in the sources
  assert.equal(out.risks.length, 1);
});

test('sanitizeAnalysis returns null for junk and tolerates missing parts', () => {
  assert.equal(sanitizeAnalysis(null, SOURCES), null);
  assert.equal(sanitizeAnalysis('text', SOURCES), null);
  assert.equal(sanitizeAnalysis({ assets: [] }, SOURCES), null);
  assert.ok(sanitizeAnalysis({ watch: ['Fed minutes'] }, SOURCES));
});

/* ----------------------------- chat integration ---------------------------- */

const NOW = Date.now();
const POOL = [
  { id: 'a1', title: 'Oil prices climb as Red Sea shipping disruptions persist', summary: 'Brent crude rose two percent after new attacks on tankers.', link: 'https://e.com/1', sourceName: 'Reuters', publishedAt: NOW - 36e5, score: 80, clusterId: null },
  { id: 'a2', title: 'Central bank holds rates steady', summary: 'The bank kept its benchmark rate unchanged.', link: 'https://e.com/2', sourceName: 'BBC World', publishedAt: NOW - 36e5, score: 70, clusterId: null },
];
const PINNED = [
  assetSource(ASSETS.find((a) => a.key === 'brent'), { symbol: 'BZ=F', price: 84.2, changePercent: 1.31, change5dPercent: 4.2, currency: 'USD', asOf: NOW }),
];

afterEach(() => {
  setTestModels(null);
  resetLlmState();
});

test('impact mode: prompt carries the rules, analysis is validated and returned with the live data', async () => {
  let prompt = '';
  setTestModels([
    {
      provider: 'gemini',
      model: 'mock',
      call: async (p) => {
        prompt = p;
        return {
          answer: 'Brent is at 84.20, up 1.31% today [S1]. A supply premium would typically lift crude and pressure importers.',
          claims: [{ ref: 'S1', quote: 'Brent crude: 84.20 (+1.31% today)' }],
          usedBackgroundKnowledge: true,
          analysis: {
            stance: 'bearish',
            horizon: 'days',
            confidence: 'medium',
            assets: [{ name: 'Brent crude', direction: 'up', size: 'moderate', confidence: 'medium', why: 'Shipping risk adds a supply premium.' }],
            pricedIn: 'Partly, Brent is already up 1.31% today.',
            watch: ['OPEC response'],
            risks: ['De-escalation would unwind the premium'],
          },
          followUps: [],
        };
      },
    },
  ]);

  const marketData = [{ key: 'brent', name: 'Brent crude', price: 84.2, changePercent: 1.31 }];
  const res = await answerChat({
    articles: POOL,
    edition: 'finance',
    message: 'How will the Red Sea attacks affect oil and should I be worried?',
    history: [],
    pinned: PINNED,
    impact: { decision: false, marketData },
  });

  assert.match(prompt, /IMPACT MODE/);
  assert.match(prompt, /"analysis": \{"stance"/);
  assert.match(prompt, /Do not tell the reader to buy or sell unless they ask/);
  assert.equal(res.provider, 'gemini');
  assert.equal(res.analysis.stance, 'bearish');
  assert.equal(res.analysis.assets[0].direction, 'up');
  assert.deepEqual(res.marketData, marketData);
  assert.match(res.answer, /84\.20/);
  assert.ok(res.citations.length >= 1);
});

test('impact mode with a decision question asks for a conditional lean', async () => {
  let prompt = '';
  setTestModels([{ provider: 'gemini', model: 'mock', call: async (p) => { prompt = p; return { answer: 'Unclear.', claims: [], followUps: [] }; } }]);
  await answerChat({ articles: POOL, edition: 'finance', message: 'Should I sell my oil stocks?', history: [], pinned: PINNED, impact: { decision: true, marketData: [] } });
  assert.match(prompt, /conditional lean/);
  assert.match(prompt, /position size and time horizon are theirs to judge/);
});

test('normal questions are unchanged: no analysis fields, no impact rules', async () => {
  let prompt = '';
  setTestModels([{ provider: 'gemini', model: 'mock', call: async (p) => { prompt = p; return { answer: 'Rates were held.', claims: [], followUps: [] }; } }]);
  const res = await answerChat({ articles: POOL, edition: 'finance', message: 'What did the central bank do?', history: [] });
  assert.doesNotMatch(prompt, /IMPACT MODE/);
  assert.equal('analysis' in res, false);
});

test('keyless fallback in impact mode still returns the live prices', async () => {
  const marketData = [{ key: 'brent', name: 'Brent crude', price: 84.2, changePercent: 1.31 }];
  const res = await answerChat({ articles: POOL, edition: 'finance', message: 'How will oil move?', history: [], pinned: PINNED, impact: { marketData } });
  assert.equal(res.provider, 'fallback');
  assert.deepEqual(res.marketData, marketData);
  assert.match(res.answer, /Brent crude: 84\.20/);
});
