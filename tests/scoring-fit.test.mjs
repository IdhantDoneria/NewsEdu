import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreArticleAsync } from '../lib/scoring/index.mjs';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const art = (title, summary = '') => ({
  title,
  summary,
  link: 'https://www.reuters.com/x',
  source: { name: 'Reuters', trust: 19 },
  publishedAt: NOW - 3_600_000,
});
const run = (a, edition) => scoreArticleAsync(a, edition, { now: NOW });
const layer = (r, key) => r.scoreBreakdown.find((l) => l.key === key).delta;

test('market news inside the geopolitics edition is marked down; the same story with a geopolitical event is not', async () => {
  const market = await run(art('Stocks slide as bond yields climb and inflation surprises'), 'geopolitics');
  assert.ok(layer(market, 'topicGate') <= -10);
  const placed = await run(art('Stocks slide in Europe as bond yields climb'), 'geopolitics');
  assert.equal(layer(placed, 'topicGate'), -10);
  const sanctions = await run(art('Oil jumps as sanctions hit Russia exports'), 'geopolitics');
  assert.equal(layer(sanctions, 'topicGate'), 0);
});

test('recall extras: Niger, "to Xi", Albanian, sized money amounts', async () => {
  const gate = async (t, ed = 'geopolitics') => layer(await run(art(t), ed), 'topicGate');
  assert.equal(await gate('Niger: guards accused of cruel treatment after 33 die in detention'), 0);
  assert.equal(await gate('Why party plenums matter so much to Xi'), 0);
  assert.equal(await gate('Albanian opposition storms parliament'), 0);
  assert.equal(await gate('Orion Group Holdings wins $250M in October contracts', 'finance'), 0);
});

test('sport and lifestyle features are marked down hard in the geopolitics edition', async () => {
  const soft = async (t) => layer(await run(art(t), 'geopolitics'), 'softNews');
  assert.ok((await soft('Jake Paul returns to boxing for Dubai fight')) <= -28);
  assert.ok((await soft('Liverpool beat Arsenal 2-1 in thrilling clash')) <= -28);
  assert.ok((await soft('The best restaurants to try in Lisbon this autumn')) < 0);
  assert.equal(await soft('Russia and Ukraine hold talks in Istanbul'), 0);
});
