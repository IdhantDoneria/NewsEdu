import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanIncomingMemory,
  effectiveScore,
  mergeMemory,
  pruneMemory,
  sanitizeUpdates,
  selectForRequest,
  MAX_STORE,
} from '../lib/intelligence/memory.mjs';

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 28);
const note = (id, text, over = {}) => ({
  id, text, kind: 'interest', score: 6, uses: 1, createdAt: NOW, lastUsedAt: NOW, ...over,
});

test('sanitizeUpdates discards low-importance candidates (self-flagged as useless)', () => {
  const u = sanitizeUpdates({
    add: [
      { text: 'Follows Israeli politics closely', kind: 'interest', importance: 4 },
      { text: 'Asked about cricket once today', kind: 'interest', importance: 2 },
      { text: 'Prefers short bullet answers', kind: 'preference' }, // unrated
    ],
    drop: [],
  });
  assert.deepEqual(u.add.map((a) => a.text), ['Follows Israeli politics closely']);
});

test('sanitizeUpdates rejects identifiers and sensitive details', () => {
  const u = sanitizeUpdates({
    add: [
      { text: 'Email is reader@example.com for updates', importance: 5 },
      { text: 'Phone number 9876543210 on file', importance: 5 },
      { text: 'Has a medical diagnosis they follow', importance: 5 },
      { text: 'Reads https://example.com/page daily', importance: 5 },
      { text: 'Tracks semiconductor export controls', importance: 5 },
    ],
  });
  assert.deepEqual(u.add.map((a) => a.text), ['Tracks semiconductor export controls']);
});

test('sanitizeUpdates caps adds, dedupes, clamps importance and kind', () => {
  const u = sanitizeUpdates({
    add: [
      { text: 'Follows Federal Reserve policy', kind: 'bogus', importance: 9 },
      { text: 'Follows the Federal Reserve policy', importance: 4 },
      { text: 'Is a graduate economics student', kind: 'context', importance: 4 },
      { text: 'Prefers concise answers always', kind: 'preference', importance: 4 },
    ],
  });
  assert.equal(u.add.length, 2);
  assert.equal(u.add[0].kind, 'interest');
  assert.equal(u.add[0].importance, 5);
});

test('sanitizeUpdates only drops ids the model was shown', () => {
  const u = sanitizeUpdates({ add: [], drop: ['m1', 'm9', 'm1'] }, ['m1', 'm2']);
  assert.deepEqual(u.drop, ['m1']);
  assert.deepEqual(sanitizeUpdates(null, []), { add: [], drop: [] });
});

test('mergeMemory adds, then reinforces a near-duplicate instead of duplicating it', () => {
  const first = mergeMemory([], { add: [{ text: 'Follows Israeli politics closely', kind: 'interest', importance: 3 }] }, NOW);
  assert.equal(first.memory.length, 1);
  const before = first.memory[0].score;
  const again = mergeMemory(first.memory, { add: [{ text: 'Follows Israeli politics', kind: 'interest', importance: 3 }] }, NOW + DAY);
  assert.equal(again.memory.length, 1);
  assert.ok(again.memory[0].score > before);
  assert.equal(again.memory[0].uses, 2);
  assert.equal(again.reinforced.length, 1);
});

test('mergeMemory drops named notes', () => {
  const m = [note('m1', 'Follows the Brazil election'), note('m2', 'Prefers short answers')];
  const r = mergeMemory(m, { add: [], drop: ['m1'] }, NOW);
  assert.deepEqual(r.memory.map((n) => n.id), ['m2']);
  assert.deepEqual(r.dropped, ['Follows the Brazil election']);
});

test('unused notes decay and are discarded; reinforced ones survive', () => {
  const stale = note('m1', 'Follows Brazilian politics', { score: 4.5, lastUsedAt: NOW - 70 * DAY });
  const fresh = note('m2', 'Follows Israeli politics', { score: 4.5, lastUsedAt: NOW - 10 * DAY });
  assert.ok(effectiveScore(stale, NOW) < 1);
  assert.deepEqual(pruneMemory([stale, fresh], NOW).map((n) => n.id), ['m2']);
  assert.deepEqual(pruneMemory([note('m3', 'Follows old topics', { score: 10, lastUsedAt: NOW - 100 * DAY })], NOW), []);
});

test('pruneMemory caps the store, keeping the strongest', () => {
  const many = Array.from({ length: MAX_STORE + 10 }, (_, i) =>
    note(`m${i}`, `Follows topic number ${i} closely`, { score: 2 + (i % 8) })
  );
  const kept = pruneMemory(many, NOW);
  assert.equal(kept.length, MAX_STORE);
  assert.ok(Math.min(...kept.map((n) => n.score)) >= 3);
});

test('selectForRequest returns only id/text/kind and cleanIncomingMemory revalidates', () => {
  const sel = selectForRequest([note('m1', 'Follows Israeli politics', { extra: 'x' })], NOW);
  assert.deepEqual(Object.keys(sel[0]).sort(), ['id', 'kind', 'text']);
  const cleaned = cleanIncomingMemory([
    ...sel,
    { id: 'bad id!', text: 'Follows something valid here' },
    { id: 'm9', text: 'password is hunter2 for the site' },
    { id: 'm8', text: 'x' },
  ]);
  assert.deepEqual(cleaned.map((n) => n.id), ['m1']);
});

test('reinforcing a long-idle note builds on its decayed score, not its original peak', () => {
  const idle = note('m1', 'Follows Israeli politics closely', { score: 9, lastUsedAt: NOW - 80 * DAY });
  const before = effectiveScore(idle, NOW);
  assert.ok(before < 1.5);
  const r = mergeMemory([idle], { add: [{ text: 'Follows Israeli politics', kind: 'interest', importance: 3 }] }, NOW);
  assert.equal(r.memory.length, 1);
  // ~1.4 decayed + 1.5 = ~2.9, not 9 + 1.5
  assert.ok(r.memory[0].score < 4, `score was ${r.memory[0].score}`);
  assert.ok(r.memory[0].score > before);
});
