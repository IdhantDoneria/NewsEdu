/** Quote-grounded citations in the chat (item 21), with a mocked model chain. */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { answerChat, resolveCitations } from '../lib/intelligence/chat.mjs';
import { setTestModels, resetLlmState } from '../lib/intelligence/llm.mjs';
import { quoteInArticle, numbersIn, groundClaim, normalizeForMatch } from '../lib/intelligence/grounding.mjs';
import { groundAnswer, parseClaims } from '../lib/intelligence/chatground.mjs';

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.OPENROUTER_API_KEY;

const NOW = Date.now();
let seq = 0;
function art(title, summary = '', score = 50) {
  seq++;
  return { id: `g${seq}`, title, summary, link: `https://e.com/${seq}`, sourceName: 'BBC World', publishedAt: NOW - 36e5, score, clusterId: null };
}

const RATES = art('Central bank holds interest rates at 4.5% amid inflation worries', 'The bank kept its benchmark rate unchanged on Thursday as inflation stayed above target at 3.2%.', 90);
const OIL = art('Oil prices climb as Red Sea shipping disruptions persist', 'Brent crude rose two percent after new attacks on tankers in the Red Sea.', 80);
const POOL = [RATES, OIL, art('Election results contested', 'Opposition parties dispute the vote count.', 40)];

let prompts = [];
function model(reply) {
  prompts = [];
  setTestModels([
    {
      provider: 'gemini',
      model: 'mock-lite',
      call: async (prompt) => {
        prompts.push(prompt);
        return typeof reply === 'function' ? reply(prompt) : reply;
      },
    },
  ]);
}
afterEach(() => {
  setTestModels(null);
  resetLlmState();
});

const ask = (message, extra = {}) => answerChat({ articles: POOL, edition: 'finance', message, ...extra });

test('a sentence with a verified quote keeps its citation and carries the quote', async () => {
  model({
    answer: 'The bank held interest rates at 4.5% [S1].',
    claims: [{ ref: 'S1', quote: 'Central bank holds interest rates at 4.5% amid inflation worries' }],
    followUps: ['What about inflation?'],
  });
  const res = await ask('What did the central bank do on interest rates?');
  assert.equal(res.provider, 'gemini');
  assert.equal(res.answer, 'The bank held interest rates at 4.5% [1].');
  assert.equal(res.citations[0].id, RATES.id);
  assert.match(res.citations[0].quote, /holds interest rates/);
  assert.deepEqual([res.grounding.supported, res.grounding.total, res.dropped], [1, 1, 0]);
  assert.equal(res.notice, undefined);
  assert.equal(res.model, 'mock-lite');
  assert.ok(Number.isFinite(res.modelMs));
});

test('a fabricated quote drops the sentence; the verified one survives', async () => {
  model({
    answer: 'Rates were held at 4.5% [S1]. Oil is expected to hit $200 by Friday [S2].',
    claims: [
      { ref: 'S1', quote: 'holds interest rates at 4.5%' },
      { ref: 'S2', quote: 'Oil will hit two hundred dollars by Friday' },
    ],
  });
  const res = await ask('interest rates and oil');
  assert.equal(res.answer, 'Rates were held at 4.5% [1].');
  assert.equal(res.citations.length, 1);
  assert.deepEqual([res.grounding.supported, res.grounding.total, res.dropped], [1, 2, 1]);
  assert.match(res.notice, /Removed 1 statement/);
});

test('a quote from the wrong article does not support the cited one (S2 vs S5 case)', async () => {
  model({
    answer: 'Brent crude rose two percent [S2].',
    claims: [{ ref: 'S2', quote: 'kept its benchmark rate unchanged on Thursday' }], // that is S1's text
  });
  const res = await ask('oil and rates');
  assert.equal(res.provider, 'fallback', 'nothing verifiable left -> extractive');
  assert.equal(res.grounding.supported, 0);
  assert.equal(res.grounding.total, 1);
  assert.match(res.notice, /verified against the sources/);
});

test('numbers in a sentence must appear in the quote or its article', async () => {
  model({
    answer: 'The bank held rates at 9% [S1].',
    claims: [{ ref: 'S1', quote: 'kept its benchmark rate unchanged on Thursday' }],
  });
  const res = await ask('central bank interest rates');
  assert.equal(res.provider, 'fallback');
  assert.equal(res.dropped, 1);
});

test('matching ignores case, punctuation, quote styles and ellipses', () => {
  assert.ok(quoteInArticle('CENTRAL BANK holds interest rates at 4.5%', RATES));
  assert.ok(quoteInArticle('“kept its benchmark rate” … “above target at 3.2%”', RATES));
  assert.ok(!quoteInArticle('benchmark rate unchanged on Friday', RATES));
  assert.ok(!quoteInArticle('rates', RATES), 'too short to be evidence');
  assert.ok(!quoteInArticle('', RATES));
  assert.equal(normalizeForMatch('Zürich’s “Café”'), 'zurich s cafe');
  assert.deepEqual([...numbersIn('Up 1,200 or 3.40% in 2026')].sort(), ['1200', '2026', '3.4']);
  const ok = groundClaim('Inflation stayed at 3.2%', [{ article: RATES, quote: 'inflation stayed above target at 3.2%' }]);
  assert.equal(ok.supported, true);
  assert.equal(groundClaim('Inflation hit 8%', [{ article: RATES, quote: 'inflation stayed above target at 3.2%' }]).supported, false);
});

test('literal [n] markers typed by the model are removed before renumbering', () => {
  const { text, citations } = resolveCitations('Rates held [1][2]. Oil rose [S2] [3].', POOL, 'finance');
  assert.equal(text, 'Rates held. Oil rose [1].');
  assert.equal(citations.length, 1);
  assert.equal(citations[0].id, OIL.id);
});

test('uncited numbers must exist in the sources unless the answer is background', () => {
  const claims = parseClaims([]);
  const g = groundAnswer('Rates are 4.5%. Rates are 77%. The cat sat.', claims, POOL);
  assert.equal(g.text, 'Rates are 4.5%. The cat sat.');
  assert.deepEqual([g.supported, g.total], [1, 2]);
  const bg = groundAnswer('A rate hike of 25 basis points is typical.', claims, POOL, { background: true });
  assert.equal(bg.text, 'A rate hike of 25 basis points is typical.');
  assert.equal(bg.total, 0);
});

test('bullets keep their structure and each cited line is checked on its own', () => {
  const claims = parseClaims([
    { ref: 'S1', quote: 'holds interest rates at 4.5%' },
    { ref: 'S2', quote: 'invented words that are not there' },
  ]);
  const g = groundAnswer('- Rates held at 4.5% [S1].\n- Oil crashed [S2].\n- Nothing else is known.', claims, POOL);
  assert.equal(g.text, '- Rates held at 4.5% [S1].\n- Nothing else is known.');
});

test('an answer that cites without any claims is not trusted', async () => {
  model({ answer: 'Rates were held [S1].' });
  const res = await ask('central bank interest rates');
  assert.equal(res.provider, 'fallback');
  assert.deepEqual([res.grounding.supported, res.grounding.total], [0, 1]);
});

test('the prompt asks for quotes and warns the model when retrieval is weak', async () => {
  model({ answer: 'The coverage does not address that.', claims: [] });
  const res = await ask('quantum chromodynamics lattice');
  assert.match(prompts[0], /"claims": \[\{"ref": "S1"/);
  assert.match(prompts[0], /RETRIEVAL WARNING/);
  assert.match(prompts[0], /relevance="low"/);
  assert.equal(res.lowRelevance, true);
  assert.match(res.notice, /No current article closely matches/);
  assert.equal(res.answer, 'The coverage does not address that.');
});
