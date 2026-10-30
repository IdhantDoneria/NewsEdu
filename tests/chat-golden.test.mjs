/**
 * Retrieval quality on the golden question set (tests/golden/questions.json),
 * measured offline against the fixture snapshots: BM25 vs the old lexical
 * ranker. No model is involved.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { retrieveSources, retrieveSourcesLexical } from '../lib/intelligence/chat.mjs';
import { retrieve } from '../lib/intelligence/retrieval.mjs';
import { safeUserText } from '../lib/intelligence/promptsafe.mjs';
import { fixturesAvailable, loadGolden, loadPools, scoreRetriever } from './golden/golden.mjs';

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;

const skip = fixturesAvailable() ? false : 'fixture snapshots not present';
const golden = loadGolden();

test('golden set is large, varied and consistent with the fixtures', { skip }, () => {
  const qs = golden.questions;
  assert.ok(qs.length >= 150, `only ${qs.length} questions`);
  const pools = loadPools();
  const ids = {
    geopolitics: new Set(pools.geopolitics.map((a) => a.id)),
    finance: new Set(pools.finance.map((a) => a.id)),
  };
  const seen = new Set();
  for (const q of qs) {
    assert.ok(!seen.has(q.id), `duplicate id ${q.id}`);
    seen.add(q.id);
    assert.ok(ids[q.edition], `edition of ${q.id}`);
    for (const id of q.expected) assert.ok(ids[q.edition].has(id), `${q.id}: unknown article ${id}`);
  }
  const count = (tag) => qs.filter((q) => q.tags.includes(tag)).length;
  assert.ok(count('nonen') >= 20, 'non-English questions');
  assert.ok(count('market') >= 8, 'market questions');
  assert.ok(count('indian') >= 8, 'Indian questions');
  assert.ok(count('adversarial') >= 10, 'adversarial questions');
  assert.ok(count('followup') >= 4, 'follow-ups');
  assert.ok(qs.filter((q) => q.expected.length).length >= 150, 'questions with expected ids');
});

test('BM25 recall@10 beats the lexical baseline, most of all on non-English questions', { skip }, () => {
  const pools = loadPools();
  const lex = scoreRetriever(retrieveSourcesLexical, golden, pools, { k: 10 });
  const bm = scoreRetriever(retrieveSources, golden, pools, { k: 10 });
  const lexNon = scoreRetriever(retrieveSourcesLexical, golden, pools, { k: 10, tag: 'nonen' });
  const bmNon = scoreRetriever(retrieveSources, golden, pools, { k: 10, tag: 'nonen' });
  const lex3 = scoreRetriever(retrieveSourcesLexical, golden, pools, { k: 3 });
  const bm3 = scoreRetriever(retrieveSources, golden, pools, { k: 3 });
  console.log(
    `recall@10 lexical ${lex.recall.toFixed(3)} -> bm25 ${bm.recall.toFixed(3)} (hit ${lex.hit.toFixed(3)} -> ${bm.hit.toFixed(3)}, n=${bm.n}); ` +
      `non-English ${lexNon.recall.toFixed(3)} -> ${bmNon.recall.toFixed(3)}; recall@3 ${lex3.recall.toFixed(3)} -> ${bm3.recall.toFixed(3)}`
  );
  assert.ok(bm.n >= 150);
  assert.ok(bm.recall >= 0.95, `bm25 recall@10 ${bm.recall}`);
  assert.ok(bm.recall > lex.recall + 0.04, 'bm25 must clearly beat lexical overall');
  assert.ok(bmNon.recall >= 0.9 && bmNon.recall > lexNon.recall + 0.3, 'non-English retrieval');
  assert.ok(bm3.recall > lex3.recall + 0.04, 'ranking quality at k=3');
  assert.ok(bm.hit >= 0.98, `every answerable question should find a relevant article (${bm.hit})`);
});

test('questions the wire does not cover are flagged low-relevance, not padded silently', { skip }, () => {
  const pools = loadPools();
  const none = golden.questions.filter((q) => q.tags.includes('no-coverage'));
  assert.ok(none.length >= 10);
  let flagged = 0;
  for (const q of none) {
    const r = retrieve(pools[q.edition], safeUserText(q.q, 500), {});
    if (r.meta.lowRelevance) {
      flagged++;
      assert.ok(r.sources.slice(r.meta.matched).every((a) => a.lowRelevance), `${q.id}: padded items must be flagged`);
    }
  }
  assert.ok(flagged / none.length >= 0.6, `only ${flagged}/${none.length} flagged`);
  // Index-name questions with no Indian market coverage are the clear cases.
  const clear = golden.questions.filter((x) => x.expectNoMatch && /nifty|sensex|rupee|mumbai/i.test(x.q) && !x.tags.includes('nonen'));
  assert.ok(clear.length >= 3);
  for (const q of clear) {
    const r = retrieve(pools[q.edition], safeUserText(q.q, 500), {});
    assert.equal(r.meta.lowRelevance, true, `${q.id} ${q.q}`);
  }
});

test('broad questions get the top-ranked stories without a low-relevance flag', { skip }, () => {
  const pools = loadPools();
  for (const q of golden.questions.filter((x) => x.tags.includes('broad') && !x.tags.includes('market'))) {
    const r = retrieve(pools[q.edition], q.q, {});
    assert.equal(r.meta.lowRelevance, false);
    assert.ok(r.sources.length >= 6);
    assert.ok(r.sources.every((a) => !a.lowRelevance));
  }
});
