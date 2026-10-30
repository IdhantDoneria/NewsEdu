/** Story intelligence generation: sticky-fallback recovery, warmIntel, in-flight sharing. */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { getIntelForCluster, warmIntel, retryDue, needsAnalysis } from '../lib/intelligence/extract.mjs';
import { getStored, putStored } from '../lib/intelligence/store.mjs';
import { clusterArticles } from '../lib/intelligence/cluster.mjs';
import { setTestModels, resetLlmState } from '../lib/intelligence/llm.mjs';

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.OPENROUTER_API_KEY;

const quiet = console.error;
console.error = () => {};
process.on('exit', () => {
  console.error = quiet;
});
afterEach(() => {
  setTestModels(null);
  resetLlmState();
});

const NOW = Date.now();
let n = 0;
function story(label) {
  n++;
  const title = `${label} parliament passes sweeping reform bill after marathon session ${n}`;
  const a = {
    id: `iq${n}a`, title, summary: `Lawmakers in ${label} approved the reform bill by 212 votes to 180 on Tuesday night.`,
    link: `https://e.com/${n}a`, sourceName: 'BBC World', publishedAt: NOW - 36e5, score: 70, meridianScore: 70,
  };
  return clusterArticles([a], 'geopolitics')[0];
}

const goodReply = (cluster) => ({
  whatHappened: {
    text: 'Lawmakers approved the reform bill by 212 votes to 180.',
    classification: 'FACT',
    citations: [cluster.articleIds[0]],
    quote: 'approved the reform bill by 212 votes to 180 on Tuesday night',
  },
  whyItMatters: [{ text: 'The bill reshapes policy.', classification: 'ANALYSIS', citations: [] }],
});

function models(...fns) {
  setTestModels(fns.map((call, i) => ({ provider: 'gemini', model: `m${i}`, call })));
}

test('a failed generation stores a marked fallback with a retry time; it is regenerated when due', async () => {
  const c = story('Alpha');
  let healthy = false;
  models(async () => {
    if (!healthy) throw new Error('503 overloaded');
    return goodReply(c);
  });
  const first = await getIntelForCluster(c);
  assert.equal(first.mode, 'fallback');
  assert.equal(first.fallback, true);
  assert.ok(first.retryAfter > Date.now());
  assert.equal(first.attempts, 1);

  // not due yet: the stored fallback is served without another model call
  healthy = true;
  resetLlmState(); // the 503 had put the model on a short cooldown
  const again = await getIntelForCluster(c);
  assert.equal(again.mode, 'fallback');
  assert.equal(retryDue(again), false);

  // once due and a model answers, the fallback is replaced by a grounded AI record
  putStored(`intel:${c.id}`, { ...getStored(`intel:${c.id}`), retryAfter: Date.now() - 1 });
  assert.equal(retryDue(getStored(`intel:${c.id}`)), true);
  const fixed = await getIntelForCluster(c);
  assert.equal(fixed.mode, 'ai');
  assert.equal(fixed.fallback, undefined);
  assert.equal(fixed.provider, 'gemini');
  assert.deepEqual([fixed.intel.grounding.supported, fixed.intel.grounding.total], [1, 1]);
  assert.equal((await getIntelForCluster(c)).mode, 'ai', 'and stays cached');
});

test('retries back off, and quota errors wait longer', async () => {
  const c = story('Beta');
  models(async () => {
    throw new Error('429 RESOURCE_EXHAUSTED');
  });
  const a = await getIntelForCluster(c);
  assert.ok(a.retryAfter - a.generatedAt >= 5 * 60_000);
  putStored(`intel:${c.id}`, { ...a, retryAfter: 0 });
  const b = await getIntelForCluster(c);
  assert.equal(b.attempts, 2);
});

test('a fallback written with no model configured is retried as soon as one appears', async () => {
  const c = story('Gamma');
  const first = await getIntelForCluster(c); // no models at all
  assert.equal(first.mode, 'fallback');
  assert.equal(first.retryAfter, 0);
  assert.equal(needsAnalysis(c), false, 'nothing to do while no model exists');
  models(async () => goodReply(c));
  assert.equal(needsAnalysis(c), true);
  assert.equal((await getIntelForCluster(c)).mode, 'ai');
});

test('cheap reads never generate, and the previous version is kept for change detection', async () => {
  const c = story('Delta');
  models(async () => goodReply(c));
  assert.equal(await getIntelForCluster(c, { allowGenerate: false }), null);
  const rec = await getIntelForCluster(c);
  assert.equal(rec.mode, 'ai');
});

test('concurrent requests for one story share a single model call', async () => {
  const c = story('Epsilon');
  let calls = 0;
  models(async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 30));
    return goodReply(c);
  });
  const [x, y, z] = await Promise.all([getIntelForCluster(c), getIntelForCluster(c), getIntelForCluster(c)]);
  assert.equal(calls, 1);
  assert.equal(x, y);
  assert.equal(y, z);
});

test('a reply that fails quote grounding still yields a usable (demoted) analysis; an unusable one falls through', async () => {
  const c = story('Zeta');
  models(
    async () => ({ whatHappened: { text: 'short' } }), // invalid -> next model
    async () => ({
      ...goodReply(c),
      whatHappened: { ...goodReply(c).whatHappened, quote: 'a sentence nobody wrote' },
    })
  );
  const rec = await getIntelForCluster(c);
  assert.equal(rec.mode, 'ai');
  assert.equal(rec.model, 'm1');
  assert.equal(rec.intel.whatHappened.classification, 'ANALYSIS');
  assert.deepEqual([rec.intel.grounding.supported, rec.intel.grounding.total], [0, 1]);
});

test('warmIntel is budgeted, skips cached stories and does nothing without a model', async () => {
  const cs = ['Eta', 'Theta', 'Iota', 'Kappa', 'Lambda'].map(story);
  assert.deepEqual(await warmIntel(cs, { limit: 3 }), { attempted: 0, generated: 0, failed: 0, skipped: 5 });

  let calls = 0;
  models(async (prompt) => {
    calls++;
    const c = cs.find((x) => prompt.includes(x.articleIds[0])) || cs[0];
    return goodReply(c);
  });
  const r1 = await warmIntel(cs, { limit: 3, concurrency: 2 });
  assert.equal(r1.attempted, 3);
  assert.equal(r1.generated, 3);
  assert.equal(calls, 3);

  // the first three are cached now, so the next call only does the remaining two
  const r2 = await warmIntel(cs, { limit: 5 });
  assert.equal(r2.attempted, 2);
  assert.equal(r2.skipped, 3);
  assert.equal(calls, 5);

  // a time budget of zero starts nothing
  const fresh = story('Mu');
  const r3 = await warmIntel([fresh], { budgetMs: 0 });
  assert.equal(r3.attempted, 0);
});
