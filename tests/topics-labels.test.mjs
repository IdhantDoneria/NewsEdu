/**
 * Topic tagging against the hand-labelled headline set
 * (tests/fixtures/labels/topics.json), with the pre-rewrite patterns kept in
 * tests/legacy/topics.legacy.mjs so the improvement is measured, not asserted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { TOPICS, topicsForText, topicsForCluster, topicById } from '../lib/intelligence/topics.mjs';
import { TOPICS as LEGACY } from './legacy/topics.legacy.mjs';

const SET = JSON.parse(fs.readFileSync(new URL('./fixtures/labels/topics.json', import.meta.url), 'utf8'));
const legacyFor = (text) => LEGACY.filter((t) => t.re.test(text)).map((t) => t.id);

function score(fn, items = SET.items) {
  const per = Object.fromEntries(TOPICS.map((t) => [t.id, { tp: 0, fp: 0, fn: 0 }]));
  for (const it of items) {
    const got = new Set(fn(it.title));
    const want = new Set(it.topics);
    for (const id of Object.keys(per)) {
      if (got.has(id) && want.has(id)) per[id].tp++;
      else if (got.has(id)) per[id].fp++;
      else if (want.has(id)) per[id].fn++;
    }
  }
  const sum = Object.values(per).reduce((a, r) => ({ tp: a.tp + r.tp, fp: a.fp + r.fp, fn: a.fn + r.fn }), { tp: 0, fp: 0, fn: 0 });
  return {
    per,
    precision: sum.tp / (sum.tp + sum.fp),
    recall: sum.tp / (sum.tp + sum.fn),
  };
}

test('label set is large enough and well-formed', () => {
  assert.ok(SET.items.length >= 200, `need >= 200 labelled headlines, have ${SET.items.length}`);
  const ids = new Set(TOPICS.map((t) => t.id));
  for (const it of SET.items) {
    assert.ok(it.title && Array.isArray(it.topics));
    for (const t of it.topics) assert.ok(ids.has(t), `unknown topic ${t}`);
  }
  assert.ok(SET.items.filter((i) => i.origin.startsWith('snapshot:')).length >= 100, 'derived from production snapshots');
  for (const id of ids) {
    assert.ok(SET.items.filter((i) => i.topics.includes(id)).length >= 4, `${id} needs positive examples`);
  }
});

test('topic tagging beats the legacy patterns and clears precision/recall floors', () => {
  const before = score(legacyFor);
  const after = score(topicsForText);
  console.log(
    `# topics micro P/R before ${before.precision.toFixed(2)}/${before.recall.toFixed(2)} after ${after.precision.toFixed(2)}/${after.recall.toFixed(2)}`
  );
  for (const [id, r] of Object.entries(after.per)) {
    const p = r.tp / Math.max(1, r.tp + r.fp);
    const rc = r.tp / Math.max(1, r.tp + r.fn);
    console.log(`#   ${id.padEnd(18)} P ${p.toFixed(2)} R ${rc.toFixed(2)}`);
  }
  assert.ok(after.precision >= 0.93, `precision ${after.precision}`);
  assert.ok(after.recall >= 0.93, `recall ${after.recall}`);
  assert.ok(after.precision > before.precision && after.recall > before.recall + 0.3);
  // No topic may be worse than a coin flip on either axis.
  for (const [id, r] of Object.entries(after.per)) {
    assert.ok(r.tp / Math.max(1, r.tp + r.fp) >= 0.8, `${id} precision`);
    assert.ok(r.tp / Math.max(1, r.tp + r.fn) >= 0.8, `${id} recall`);
  }
});

test('previously verified mis-tags are fixed', () => {
  const t = (s) => topicsForText(s);
  assert.ok(!t('Woman who survived the crash speaks out').includes('health'), 'pronoun "who" is not the WHO');
  assert.ok(!t('Price war hits streaming services').includes('defense-security'));
  assert.ok(!t('Police fire tear gas at protesters').includes('energy'));
  assert.ok(!t('Government raises fuel prices').includes('venture-startups'));
  assert.ok(t('Government raises fuel prices').includes('energy'));
  const tariffs = t('US announces tariffs on Indian steel');
  assert.ok(tariffs.includes('trade-tariffs') && tariffs.includes('india'));
  assert.ok(t('Russian forces advance near Kharkiv').includes('russia-ukraine'));
  assert.ok(t('WHO warns of cholera outbreak').includes('health'));
  assert.ok(!t('Fed up with the delays').includes('markets-macro'));
  assert.ok(t('Fed holds rates').includes('markets-macro'));
  assert.ok(!t('Crime rates fall in big cities').includes('markets-macro'));
  assert.ok(!t('Startup raises concerns about the schedule').includes('crypto'));
  assert.ok(t('Startup raises $12m seed round').includes('venture-startups'));
});

test('topicsForCluster uses title and entities but not the bare United States entity', () => {
  const c = { title: 'Microsoft prices bond offering', entities: ['united states', 'microsoft'], eventTerms: ['raises', 'strike'] };
  const topics = topicsForCluster(c);
  assert.ok(!topics.includes('us-politics'));
  assert.ok(!topics.includes('venture-startups'));
  assert.ok(topicsForCluster({ title: 'Talks stall', entities: ['iran', 'israel'] }).includes('middle-east'));
});

test('topic ids and labels are unchanged (stored interests stay valid)', () => {
  const legacyIds = LEGACY.map((t) => t.id);
  assert.deepEqual(TOPICS.map((t) => t.id), legacyIds);
  for (const t of LEGACY) assert.equal(topicById(t.id).label, t.label);
});
