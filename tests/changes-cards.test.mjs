/**
 * Materiality precision for "What changed" cards, measured on the labelled
 * set (tests/fixtures/labels/change-cards.json) against the legacy detector
 * kept in tests/legacy/changes.legacy.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { detectChanges, noteFirstSeen, arrivalTime } from '../lib/intelligence/changes.mjs';
import { detectChanges as legacyDetect } from './legacy/changes.legacy.mjs';
import { CARD_SET, evaluateCards } from './helpers/change-cards.mjs';

const NOW = 1793300000000;
const H = 36e5;

test('label set has >= 100 cards covering both classes and the late-indexed case', () => {
  assert.ok(CARD_SET.items.length >= 100, `have ${CARD_SET.items.length}`);
  const kinds = new Set(CARD_SET.items.map((c) => c.kind));
  for (const k of ['material', 'immaterial', 'material-late-indexed', 'immaterial-stale']) assert.ok(kinds.has(k), k);
  assert.ok(CARD_SET.items.filter((c) => c.expectChange).length >= 40);
  assert.ok(CARD_SET.items.filter((c) => !c.expectChange).length >= 40);
});

test('change-card precision and recall beat the legacy detector', () => {
  const before = evaluateCards(legacyDetect);
  const after = evaluateCards(detectChanges);
  console.log(
    `# change cards n=${after.n} before P ${before.precision.toFixed(2)} R ${before.recall.toFixed(2)} after P ${after.precision.toFixed(2)} R ${after.recall.toFixed(2)}`
  );
  assert.ok(after.precision >= 0.95, `precision ${after.precision}: ${after.falsePositives.join(' | ')}`);
  assert.ok(after.recall >= 0.9, `recall ${after.recall}: ${after.falseNegatives.join(' | ')}`);
  assert.ok(after.precision > before.precision + 0.3);
});

function oneNew(seenTitle, newTitle, summary = '', over = {}) {
  const seen = { id: 's', title: seenTitle, summary: '', sourceName: 'BBC', publishedAt: NOW - 5 * H };
  const neu = { id: 'n', title: newTitle, summary, sourceName: 'Reuters', publishedAt: NOW - H, ...over };
  const cluster = { id: 'c', title: seenTitle, edition: 'geopolitics', articles: [seen, neu], articleIds: ['s', 'n'], latestAt: NOW };
  return detectChanges(cluster, { articleIds: ['s'], lastSeenAt: NOW - 3 * H }, { firstSeen: new Map() });
}

test('ambiguous trigger words no longer fire', () => {
  for (const t of [
    'Police fired tear gas at protesters outside parliament',
    'Minister rules out tax rises',
    'Minister clarifies earlier remarks',
    'Workers say strike threat is not a bluff',
    'Analysts warn of a market correction',
    'Ruling party faces questions over spending',
  ]) {
    assert.equal(oneNew('Protesters gather outside parliament', t).changes.length, 0, t);
  }
  assert.equal(oneNew('Court weighs case', 'Supreme Court rules emergency tariffs unlawful').changes[0].type, 'Court ruling');
});

test('interest-only items need two independent weak signals', () => {
  // A figure alone is not enough...
  assert.equal(oneNew('Summit opens', 'Delegates discuss agenda for 3 days', 'About 400 delegates attend.').changes.length, 0);
  // ...a figure plus a weak development verb is.
  const res = oneNew('Summit opens', 'Organisers announce 4,000 extra seats for the summit', 'Capacity rose to 12,000.');
  assert.equal(res.changes.length, 1);
  assert.equal(res.changes[0].type, 'New data');
});

test('late-indexed articles (published before the last visit, indexed after) are reported', () => {
  const published = NOW - 4 * H; // before lastSeenAt (3 h ago)
  const dropped = oneNew('Talks on shipping lane', 'Egypt signs transit agreement for shipping lane', '', { publishedAt: published });
  assert.equal(dropped.changes.length, 0, 'without a first-seen time it is old news');

  const tracker = new Map([['n', NOW - H]]);
  const seen = { id: 's', title: 'Talks on shipping lane', summary: '', sourceName: 'BBC', publishedAt: NOW - 5 * H };
  const neu = { id: 'n', title: 'Egypt signs transit agreement for shipping lane', summary: '', sourceName: 'Reuters', publishedAt: published };
  const cluster = { id: 'c', title: seen.title, edition: 'geopolitics', articles: [seen, neu], articleIds: ['s', 'n'], latestAt: NOW };
  const res = detectChanges(cluster, { articleIds: ['s'], lastSeenAt: NOW - 3 * H }, { firstSeen: tracker });
  assert.equal(res.changes.length, 1);
  assert.equal(arrivalTime(neu, tracker), NOW - H);
  // An explicit firstSeenAt on the article works the same way.
  assert.equal(arrivalTime({ ...neu, firstSeenAt: NOW - 2 * H }, new Map()), NOW - 2 * H);
});

test('noteFirstSeen only records recent articles, so old ones cannot look new after a restart', () => {
  const now = Date.now();
  noteFirstSeen([{ id: 'fs-recent', publishedAt: now - H }, { id: 'fs-old', publishedAt: now - 60 * H }], now);
  assert.equal(arrivalTime({ id: 'fs-recent', publishedAt: now - H }), now);
  assert.equal(arrivalTime({ id: 'fs-old', publishedAt: now - 60 * H }), now - 60 * H);
});

test('detectChanges is order-invariant over cluster articles', () => {
  const mk = (id, title, h) => ({ id, title, summary: '', sourceName: 'X', publishedAt: NOW - h * H });
  const arts = [mk('a', 'Rebels seize provincial capital after days of fighting', 2), mk('b', 'Prime minister resigns after coalition partner quits', 1), mk('s', 'Unrest grows', 6)];
  const run = (list) =>
    detectChanges({ id: 'c', title: 'Unrest grows', edition: 'geopolitics', articles: list, articleIds: list.map((a) => a.id), latestAt: NOW }, { articleIds: ['s'], lastSeenAt: NOW - 4 * H }, { firstSeen: new Map() })
      .changes.map((c) => c.what);
  assert.deepEqual(run(arts), run([...arts].reverse()));
});
