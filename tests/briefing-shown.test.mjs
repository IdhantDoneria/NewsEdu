import test from 'node:test';
import assert from 'node:assert/strict';

import { composeBriefing } from '../lib/intelligence/briefing.mjs';
import { mkCluster, mkPool, intelWatching, NOW, allIds } from './helpers/briefing-fixtures.mjs';

const H = 36e5;

test('stories shown in the last 48 h are not repeated', () => {
  const pool = mkPool();
  const intel = intelWatching(pool);
  const day1 = composeBriefing(pool, intel, {}, { now: NOW });
  const shown = allIds(day1).map((id) => ({ id, at: NOW }));
  const day2 = composeBriefing(pool, intel, { shown }, { now: NOW + 24 * H });
  const repeats = allIds(day2).filter((id) => allIds(day1).includes(id));
  assert.deepEqual(repeats, [], 'no repeats without changes');
  assert.ok(day2.essential.length >= 2);
  assert.ok(day2.suppressedRepeats > 0);
});

test('bare id strings (older clients) count as just shown', () => {
  const pool = mkPool();
  const day1 = composeBriefing(pool, new Map(), {}, { now: NOW });
  const day2 = composeBriefing(pool, new Map(), { shown: day1.essential.map((i) => i.clusterId) }, { now: NOW });
  assert.equal(day2.essential.filter((i) => day1.essential.some((j) => j.clusterId === i.clusterId)).length, 0);
});

test('shown state older than 48 h expires', () => {
  const pool = mkPool();
  const top = composeBriefing(pool, new Map(), {}, { now: NOW }).essential[0].clusterId;
  const shown = [{ id: top, at: NOW }];
  const recent = composeBriefing(pool, new Map(), { shown }, { now: NOW + 47 * H });
  assert.ok(!recent.essential.some((i) => i.clusterId === top), 'still suppressed at 47 h');
  const expired = composeBriefing(pool, new Map(), { shown }, { now: NOW + 49 * H });
  assert.ok(expired.essential.some((i) => i.clusterId === top), 'entry is ignored after 48 h');
});

test('a shown story returns when it has a material development, flagged as updated', () => {
  const pool = mkPool();
  const top = pool[0]; // the strongest story
  const shownAt = NOW - 2 * H; // after the story's own article (3 h old), before the new one
  const fresh = {
    id: 'fresh1',
    title: 'Israel and Hamas agree to a ceasefire after Cairo talks',
    summary: 'The truce begins at dawn.',
    link: 'https://example.com/fresh1',
    sourceName: 'Reuters',
    publishedAt: NOW - H,
    score: 90,
  };
  const updated = { ...top, articles: [...top.articles, fresh], articleIds: [...top.articleIds, fresh.id] };
  const others = pool.slice(1);
  const b = composeBriefing([updated, ...others], new Map(), { shown: [{ id: top.id, at: shownAt }] }, { now: NOW });
  const item = b.essential.find((i) => i.clusterId === top.id);
  assert.ok(item, 'material change brings it back');
  assert.equal(item.repeat, true);
  assert.match(item.topChange.type, /De-escalation/);

  // The same story without a new article stays out.
  const quiet = composeBriefing(pool, new Map(), { shown: [{ id: top.id, at: shownAt }] }, { now: NOW });
  assert.ok(!quiet.essential.some((i) => i.clusterId === top.id));
});

test('a trivial retelling does not bring a shown story back', () => {
  const pool = mkPool();
  const top = pool[0];
  const filler = {
    id: 'fill1',
    title: 'Explainer: what we know about the Gaza talks',
    summary: '',
    link: 'https://example.com/fill1',
    sourceName: 'Reuters',
    publishedAt: NOW - H,
    score: 70,
  };
  const updated = { ...top, articles: [...top.articles, filler], articleIds: [...top.articleIds, filler.id] };
  const b = composeBriefing([updated, ...pool.slice(1)], new Map(), { shown: [{ id: top.id, at: NOW - 2 * H }] }, { now: NOW });
  assert.ok(!b.essential.some((i) => i.clusterId === top.id));
});

test('suppression cannot empty a small briefing (best repeats backfill)', () => {
  const only = [mkCluster('Parliament passes budget after overnight vote', { score: 70 })];
  const b = composeBriefing(only, new Map(), { shown: [{ id: only[0].id, at: NOW - H }] }, { now: NOW });
  assert.equal(b.essential.length, 1);
  assert.equal(b.essential[0].repeat, true);
});

test('a re-clustered story is recognised by alias', () => {
  const pool = mkPool();
  const moved = { ...pool[0], id: 'newid', aliases: [pool[0].id] };
  const b = composeBriefing([moved, ...pool.slice(1)], new Map(), { shown: [{ id: pool[0].id, at: NOW - H }] }, { now: NOW });
  assert.ok(!b.essential.some((i) => i.clusterId === 'newid'));
});
