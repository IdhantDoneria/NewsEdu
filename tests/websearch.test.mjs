/** Web search: citation markers from search metadata, fallback order, cache, response shaping. */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyGroundingCitations,
  searchWeb,
  setTestSearch,
  webSearchEnabled,
  webOffer,
  webChatReply,
  webStoryReply,
  WEB_NOTICE,
} from '../lib/intelligence/websearch.mjs';
import { answerChat } from '../lib/intelligence/chat.mjs';
import { setTestModels, resetLlmState } from '../lib/intelligence/llm.mjs';

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.OPENROUTER_API_KEY;

afterEach(() => {
  setTestSearch(null);
  setTestModels(null);
  resetLlmState();
});

const SRC = [
  { n: 1, title: 'reuters.com', source: 'reuters.com', link: 'https://example.com/r' },
  { n: 2, title: 'ft.com', source: 'ft.com', link: 'https://example.com/f' },
];

test('applyGroundingCitations numbers the sources and places markers by segment text', () => {
  const text = 'Brent rose 2% on Friday. Analysts expect more volatility next week.';
  const r = applyGroundingCitations(text, {
    groundingChunks: [
      { web: { uri: 'https://example.com/r', title: 'reuters.com' } },
      { web: { uri: 'https://example.com/f', title: 'ft.com' } },
      { web: { uri: 'javascript:alert(1)', title: 'evil' } },
    ],
    groundingSupports: [
      { segment: { text: 'Brent rose 2% on Friday.', endIndex: 24 }, groundingChunkIndices: [0, 1, 2] },
      { segment: { text: 'Analysts expect more volatility next week.' }, groundingChunkIndices: [1] },
    ],
  });
  assert.equal(r.text, 'Brent rose 2% on Friday.[1][2] Analysts expect more volatility next week.[2]');
  assert.equal(r.sources.length, 2); // the non-http source is dropped
  assert.deepEqual(r.sources.map((s) => s.link), ['https://example.com/r', 'https://example.com/f']);
});

test('applyGroundingCitations tolerates missing metadata', () => {
  const r = applyGroundingCitations('plain', undefined);
  assert.equal(r.text, 'plain');
  assert.deepEqual(r.sources, []);
});

const backend = (out, tag = 'a') => ({ provider: 'gemini', model: `mock-${tag}`, search: async () => out });

test('searchWeb returns a sourced answer and caches it', async () => {
  let calls = 0;
  setTestSearch([{ provider: 'gemini', model: 'mock', search: async () => { calls++; return { text: 'Brent rose 2%.[1]', sources: SRC, queries: ['brent oil price'] }; } }]);
  const q = `What happened to Brent crude after the cache test ${Math.random()}?`;
  const a = await searchWeb({ question: q });
  assert.equal(a.ok, true);
  assert.equal(a.cached, false);
  assert.equal(a.citations.length, 2);
  assert.equal(a.citations[0].web, true);
  const b = await searchWeb({ question: q });
  assert.equal(b.cached, true);
  assert.equal(calls, 1);
});

test('searchWeb discards an answer without web sources and moves to the next backend', async () => {
  setTestSearch([
    backend({ text: 'An unsourced guess.', sources: [], queries: [] }, 'nosrc'),
    backend({ text: 'Sourced answer.[1]', sources: SRC, queries: [] }, 'good'),
  ]);
  const r = await searchWeb({ question: `fallback order ${Math.random()}` });
  assert.equal(r.ok, true);
  assert.equal(r.model, 'mock-good');
});

test('searchWeb reports no-sources, out-of-scope and unavailable plainly', async () => {
  setTestSearch([backend({ text: 'guess', sources: [] })]);
  assert.equal((await searchWeb({ question: `none ${Math.random()}` })).reason, 'no-sources');

  setTestSearch([backend({ text: 'OUT_OF_SCOPE', sources: SRC })]);
  assert.equal((await searchWeb({ question: `scope ${Math.random()}` })).reason, 'out-of-scope');

  setTestSearch([{ provider: 'gemini', model: 'down', search: async () => { throw new Error('429 quota'); } }]);
  assert.equal((await searchWeb({ question: `down ${Math.random()}` })).reason, 'unavailable');
});

test('web search can be switched off', async () => {
  setTestSearch([backend({ text: 'x', sources: SRC })]);
  process.env.WEB_SEARCH_ENABLED = '0';
  assert.equal(webSearchEnabled(), false);
  assert.equal((await searchWeb({ question: 'anything at all' })).reason, 'disabled');
  delete process.env.WEB_SEARCH_ENABLED;
  assert.equal(webSearchEnabled(), true);
});

test('webOffer tells the reader outright when the budget is gone', () => {
  assert.equal(webOffer({ needsWeb: null, question: 'q', left: 3, enabled: true }), null);
  assert.equal(webOffer({ needsWeb: { missing: 'x' }, question: 'q', left: 3, enabled: false }), null);
  const ok = webOffer({ needsWeb: { missing: 'the vote count' }, question: 'Who won?', left: 3, enabled: true });
  assert.deepEqual([ok.blocked, ok.left, ok.query, ok.missing], [false, 3, 'Who won?', 'the vote count']);
  assert.equal(webOffer({ needsWeb: { missing: '' }, question: 'q', left: 0, enabled: true }).blocked, true);
});

test('webChatReply labels web answers and explains failures', () => {
  const ok = webChatReply({ ok: true, answer: 'A.[1]', citations: SRC.map((s) => ({ ...s, web: true })), queries: [], provider: 'gemini', model: 'm', cached: false }, { left: 4 });
  assert.equal(ok.source, 'web');
  assert.equal(ok.notice, WEB_NOTICE);
  assert.equal(ok.webSearchesLeft, 4);
  assert.match(webChatReply({ ok: false, reason: 'no-sources' }).answer, /would rather not guess/);
  assert.match(webChatReply({ ok: false, reason: 'out-of-scope' }).answer, /outside what I cover/);
});

test('webStoryReply splits the answer into WEB statements with their own citations', () => {
  const r = webStoryReply({
    ok: true,
    answer: '- Talks resume Monday.[1]\n- Markets were calm.[2][1]',
    citations: SRC.map((s) => ({ ...s, web: true })),
    provider: 'gemini',
    model: 'm',
  });
  assert.equal(r.answered, true);
  assert.equal(r.statements.length, 2);
  assert.equal(r.statements[0].text, 'Talks resume Monday.');
  assert.equal(r.statements[0].classification, 'WEB');
  assert.deepEqual(r.statements[1].citations.map((c) => c.source), ['ft.com', 'reuters.com']);
});

/* --------------------------- chat flags the gap ---------------------------- */

const POOL = [{ id: 'a1', title: 'Central bank holds rates steady', summary: 'The bank kept its benchmark rate unchanged.', link: 'https://e.com/1', sourceName: 'BBC World', publishedAt: Date.now() - 36e5, score: 70, clusterId: null }];
const model = (reply) => setTestModels([{ provider: 'gemini', model: 'mock', call: async () => reply }]);

test('chat: insufficient sources are reported outright with a web-search request, not guessed', async () => {
  model({ answer: 'The brief’s current sources don’t cover the Mongolian budget.', claims: [], inScope: true, sourcesSufficient: false, missing: 'Mongolian budget details', followUps: [] });
  const r = await answerChat({ articles: POOL, edition: 'finance', message: 'What is in the Mongolian budget?', history: [] });
  assert.match(r.answer, /don’t cover/);
  assert.deepEqual(r.needsWeb, { missing: 'Mongolian budget details' });
  assert.equal(r.outOfScope, undefined);
});

test('chat: a model-flagged off-topic question gets the standard refusal and no citations', async () => {
  model({ answer: 'Sure, here is a pasta recipe...', claims: [], inScope: false, followUps: [] });
  const r = await answerChat({ articles: POOL, edition: 'finance', message: 'How long do I boil spaghetti', history: [] });
  assert.equal(r.outOfScope, true);
  assert.doesNotMatch(r.answer, /pasta/);
  assert.match(r.answer, /outside what I cover/);
  assert.equal(r.citations.length, 0);
});

test('chat: a fully sourced answer carries no web offer', async () => {
  model({ answer: 'The bank kept its benchmark rate unchanged [S1].', claims: [{ ref: 'S1', quote: 'The bank kept its benchmark rate unchanged' }], inScope: true, sourcesSufficient: true, followUps: [] });
  const r = await answerChat({ articles: POOL, edition: 'finance', message: 'What did the central bank do with rates?', history: [] });
  assert.equal(r.needsWeb, undefined);
  assert.equal(r.citations.length, 1);
});
