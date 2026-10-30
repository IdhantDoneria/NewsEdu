/** Quote grounding for story intelligence (schema.mjs) and story Q&A (qa.mjs). */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { validateIntel } from '../lib/intelligence/schema.mjs';
import { answerStoryQuestion, groundStatements } from '../lib/intelligence/qa.mjs';
import { clusterArticles } from '../lib/intelligence/cluster.mjs';
import { setTestModels, resetLlmState } from '../lib/intelligence/llm.mjs';

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.OPENROUTER_API_KEY;

const NOW = Date.now();
const mk = (id, title, summary, source = 'BBC World') => ({
  id, title, summary, link: `https://e.com/${id}`, sourceName: source, publishedAt: NOW - 36e5, score: 70, meridianScore: 70,
});
const A = mk('a1', 'EU approves €50 billion aid package for Ukraine reconstruction', 'The package worth €50 billion passed after Hungary dropped its veto on Tuesday.');
const B = mk('b2', 'Hungary drops veto on Ukraine aid', 'Prime Minister said the 18 member states agreed.', 'France 24');
const ARTICLES = [A, B];
const IDS = ARTICLES.map((a) => a.id);

afterEach(() => {
  setTestModels(null);
  resetLlmState();
});

test('validateIntel keeps a FACT only when its quote is found, and reports grounding', () => {
  const out = validateIntel(
    {
      whatHappened: { text: 'The EU approved a €50 billion package for Ukraine.', classification: 'FACT', citations: ['a1'], quote: 'worth €50 billion passed after Hungary dropped its veto' },
      background: [
        { text: 'Hungary had blocked the vote for months.', classification: 'FACT', citations: ['a1'], quote: 'Hungary blocked it for months in a row' },
        { text: 'Hungary dropped its veto on Tuesday.', classification: 'FACT', citations: ['b2'], quote: 'dropped its veto on Tuesday' },
      ],
      whyItMatters: [{ text: 'Reconstruction money matters for the budget.', classification: 'ANALYSIS', citations: ['a1'] }],
    },
    IDS,
    ARTICLES
  );
  assert.equal(out.whatHappened.classification, 'FACT');
  assert.deepEqual(out.whatHappened.citations, ['a1']);
  assert.match(out.whatHappened.quote, /€50 billion/);
  // fabricated quote -> demoted, citations removed
  assert.equal(out.background[0].classification, 'ANALYSIS');
  assert.deepEqual(out.background[0].citations, []);
  // quote only found in a different article of the story -> re-attributed to it
  assert.equal(out.background[1].classification, 'FACT');
  assert.deepEqual(out.background[1].citations, ['a1']);
  // analysis is not a factual claim and keeps its (id-validated) citation
  assert.deepEqual(out.whyItMatters[0].citations, ['a1']);
  assert.deepEqual([out.grounding.supported, out.grounding.total], [2, 3]);
});

test('numbers in a FACT must be covered by the evidence; unsupported key numbers are dropped', () => {
  const out = validateIntel(
    {
      whatHappened: { text: 'The EU approved a €70 billion package for Ukraine.', classification: 'FACT', citations: ['a1'], quote: 'worth €50 billion passed after Hungary dropped' },
      keyNumbers: [
        { value: '€50 billion', label: 'size of the package', citations: ['b2'] }, // cited wrongly, but a1 has it
        { value: '€900 billion', label: 'invented', citations: ['a1'] },
        { value: '18', label: 'member states', citations: [] },
      ],
    },
    IDS,
    ARTICLES
  );
  assert.equal(out.whatHappened.classification, 'ANALYSIS');
  assert.deepEqual(out.whatHappened.citations, []);
  assert.deepEqual(out.keyNumbers.map((n) => [n.value, n.citations]), [['€50 billion', ['a1']], ['18', ['b2']]]);
});

test('without the articles, validateIntel keeps its original id-only behaviour', () => {
  const out = validateIntel(
    { whatHappened: { text: 'The EU approved a package for Ukraine today.', classification: 'FACT', citations: ['a1', 'zzz'] } },
    IDS
  );
  assert.deepEqual(out.whatHappened.citations, ['a1']);
  assert.equal(out.grounding, undefined);
});

test('story Q&A: unverified claims are demoted and counted', () => {
  const [cluster] = clusterArticles(ARTICLES, 'geopolitics');
  const byId = new Map(cluster.articles.map((a) => [a.id, a]));
  const { statements, grounding } = groundStatements(
    [
      { text: 'Hungary dropped its veto on Tuesday.', classification: 'FACT', citations: [{ id: 'a1', quote: 'dropped its veto on Tuesday' }] },
      { text: 'Hungary was paid off.', classification: 'FACT', citations: [{ id: 'a1', quote: 'Hungary accepted a secret payment' }] },
      { text: 'Legacy citations without quotes are not evidence.', classification: 'PARTY CLAIM', citations: ['a1'] },
      { text: 'This is my reading of events.', classification: 'ANALYSIS', citations: [] },
    ],
    cluster,
    byId
  );
  assert.deepEqual(statements.map((s) => s.classification), ['FACT', 'ANALYSIS', 'ANALYSIS', 'ANALYSIS']);
  assert.deepEqual(statements.map((s) => s.citations.length), [1, 0, 0, 0]);
  assert.deepEqual([grounding.supported, grounding.total], [1, 3]);
});

test('story Q&A end to end with a mocked model', async () => {
  const [cluster] = clusterArticles(ARTICLES, 'geopolitics');
  setTestModels([
    {
      provider: 'gemini',
      model: 'mock',
      call: async () => ({
        statements: [
          { text: 'The package is worth €50 billion.', classification: 'FACT', citations: [{ id: 'a1', quote: 'package worth €50 billion passed' }] },
        ],
      }),
    },
  ]);
  const res = await answerStoryQuestion(cluster, null, 'How large is the aid package?');
  assert.equal(res.answered, true);
  assert.deepEqual([res.grounding.supported, res.grounding.total], [1, 1]);
  assert.equal(res.statements[0].classification, 'FACT');
  assert.deepEqual(res.statements[0].citations.map((c) => c.articleId), ['a1']);
  assert.equal(res.provider, 'gemini');
});
