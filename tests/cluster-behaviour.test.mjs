import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterArticles, breadthBonus, clusterSummary, clusterVersion, titleTokenSet } from '../lib/intelligence/cluster.mjs';

const NOW = Date.UTC(2026, 9, 29, 12);
let seq = 0;
function art(title, { source = 'BBC World', summary = '', hoursAgo = 2, rank = 70, id } = {}) {
  seq++;
  return {
    id: id || `t${seq}`,
    title,
    summary,
    link: `https://example.com/${id || seq}`,
    publishedAt: NOW - hoursAgo * 36e5,
    sourceName: source,
    source: { name: source },
    rankScore: rank,
    score: rank,
  };
}
const together = (a, b, edition = 'geopolitics') => clusterArticles([a, b], edition, { now: NOW }).length === 1;

/* ---------------------------- over-merge traps (spec) ---------------------------- */

test('Iran: a deal being close and a threat of strikes are different developments', () => {
  assert.equal(together(art('Trump says Iran deal is close'), art('Trump threatens Iran with strikes', { source: 'NYT World' })), false);
});

test('Russia/Ukraine: strikes on the grid and a prisoner swap are different developments', () => {
  assert.equal(together(art('Russia strikes Ukraine grid'), art('Russia and Ukraine swap prisoners', { source: 'AP' })), false);
});

test('Georgia the country and Georgia the US state never merge', () => {
  const country = art('Georgia protests: tens of thousands march in capital');
  const state = art('Georgia Senate runoff: Democrat leads in early returns', { source: 'AP' });
  assert.equal(together(country, state), false);
  const [c1, c2] = clusterArticles([country, state], 'geopolitics', { now: NOW });
  assert.ok(c1.entities.includes('georgia') !== c2.entities.includes('georgia') || c1.entities.includes('georgia (us)') || c2.entities.includes('georgia (us)'));
});

test('shared actors alone are not enough even with several of them', () => {
  assert.equal(
    together(art('Putin and Xi meet in Beijing as Russia and China deepen ties'), art('Russia and China hold joint naval drills near Japan', { source: 'AP' })),
    false
  );
});

test('same event type in different places does not merge (two earthquakes)', () => {
  assert.equal(
    together(art('Earthquake of magnitude 6.1 strikes Iran, killing at least 12'), art('Magnitude 7.0 earthquake strikes off northern Japan, tsunami advisory issued', { source: 'Reuters' })),
    false
  );
});

test('a central bank hold is not another central bank hold', () => {
  assert.equal(
    together(art('ECB leaves rates unchanged, Lagarde flags trade risks', { source: 'Reuters' }), art('Federal Reserve leaves benchmark rate unchanged in October', { source: 'MarketWatch' }), 'finance'),
    false
  );
});

test('opposite moves of one asset are different developments', () => {
  assert.equal(together(art('Bitcoin falls 8% in sharp selloff, liquidations top $1 billion'), art('Bitcoin hits record high above $130,000 on ETF inflows')), false);
});

/* ---------------------------- under-merge traps (spec) ---------------------------- */

test('transliterations merge: Kiev/Kyiv, Zelenskiy/Zelensky, Peking/Beijing, Bombay/Mumbai, Burma/Myanmar', () => {
  assert.ok(together(art('Zelenskiy meets Polish president in Warsaw to discuss air defence'), art('Zelensky arrives in Warsaw seeking air defense pledges', { source: 'AP' })));
  assert.ok(together(art('Kiev power grid hit by Russian missiles overnight'), art('Russian missiles hit Kyiv power grid, leaving 500,000 without electricity', { source: 'Reuters' })));
  assert.ok(together(art('Peking conducts military drills near Taiwan as tensions flare'), art('Beijing launches military drills near Taiwan', { source: 'Reuters' })));
  assert.ok(together(art("Bombay floods: trains suspended as monsoon deluge hits India's financial capital"), art('Mumbai floods: local trains suspended after monsoon deluge', { source: 'The Hindu' })));
  assert.ok(together(art('Burma junta extends state of emergency'), art('Myanmar military extends emergency rule for another six months', { source: 'Reuters' })));
});

test('Russian forces / Russia army and US/UK spellings merge', () => {
  assert.ok(together(art('Russian forces capture Pokrovsk after months of fighting'), art('Russia army claims Pokrovsk capture after months of fighting', { source: 'AP' })));
  assert.ok(together(art('Merz coalition approves defence budget increase to 3.5% of GDP'), art('Germany to boost defense spending to 3.5% of economic output', { source: 'AP' })));
  assert.ok(together(art('Nvidia earnings: data-center sales surge to record'), art("Nvidia's results top forecasts as data-centre sales surge", { source: 'BBC World' })));
});

test('figures merge across notations ($26.5bn = $26.5 billion = 26.5 billion dollars)', () => {
  assert.ok(together(art('Chip giant SK Hynix raises $26.5bn in mega US share sale'), art('SK Hynix raises $26.5 billion in U.S. offering. What to know', { source: 'MarketWatch' }), 'finance'));
});

/* ------------------------ structure, bounds, ordering, fields ------------------------ */

test('time window: the same wording two weeks apart is a different story', () => {
  assert.equal(together(art('Boeing machinists ratify contract ending strike', { hoursAgo: 2 }), art('Boeing machinists ratify contract ending strike', { hoursAgo: 14 * 24, source: 'AP' })), false);
});

test('size cap: a pile of near-identical headlines is cut at the cap', () => {
  const many = Array.from({ length: 40 }, (_, i) => art('Tesla recalls vehicles over steering defect', { source: `Outlet ${i}`, id: `many${i}`, hoursAgo: 1 + (i % 5) * 0.1 }));
  const clusters = clusterArticles(many, 'finance', { now: NOW });
  assert.ok(Math.max(...clusters.map((c) => c.size)) <= 25);
  assert.equal(clusters.reduce((n, c) => n + c.size, 0), 40);
});

test('articles are ordered best-first by rankScore (falling back to score) and fields are present', () => {
  const lo = art('Tesla recalls 400,000 vehicles over steering defect', { rank: 55, id: 'lo' });
  const hi = art('Tesla recall: NHTSA says Model Y steering part may fail', { rank: 140, id: 'hi', source: 'CNBC Markets', hoursAgo: 1 });
  const [c] = clusterArticles([lo, hi], 'finance', { now: NOW });
  assert.deepEqual(c.articleIds, ['hi', 'lo']);
  assert.equal(c.title, hi.title);
  for (const k of ['id', 'edition', 'title', 'entities', 'eventTerms', 'articleIds', 'articles', 'sources', 'size', 'score', 'earliestAt', 'latestAt', 'breadth', 'syndicated']) {
    assert.ok(k in c, `field ${k}`);
  }
  // rankScore wins over score when both are present
  const x = { ...art('Apple earnings beat estimates on iPhone sales', { id: 'x' }), rankScore: 10, score: 99 };
  const y = { ...art('Apple earnings: iPhone sales beat estimates', { id: 'y', source: 'CNBC Markets' }), rankScore: 20, score: 1 };
  assert.equal(clusterArticles([x, y], 'finance', { now: NOW })[0].articleIds[0], 'y');
});

test('cluster id derives from the earliest member and is stable as members arrive', () => {
  const a = art('Federal Reserve cuts rates by 50 basis points in surprise move', { hoursAgo: 5, id: 'e1' });
  const b = art('Federal Reserve stuns markets: rate cut of 50 basis points announced', { hoursAgo: 3, id: 'e2', source: 'MarketWatch' });
  const solo = clusterArticles([a], 'finance', { now: NOW })[0];
  const pair = clusterArticles([a, b], 'finance', { now: NOW })[0];
  assert.equal(solo.id, pair.id);
  assert.notEqual(clusterVersion(solo), clusterVersion(pair));
  assert.ok(clusterSummary(pair).breadth >= 1);
});

test('titleTokenSet agrees across aliases and spellings', () => {
  const a = titleTokenSet('Kiev defence ministry says Russian forces advance');
  const b = titleTokenSet('Kyiv defense ministry: Russia army advances');
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  assert.ok(shared >= 4, `shared ${shared}`);
});

/* ------------------------------ syndication & breadth ------------------------------ */

test('syndicated copies of one wire story count once toward breadth', () => {
  const wire = 'Russian drone attack on Ukrainian train station kills at least 14, officials say';
  const arts = [
    art(wire, { source: 'Reuters', id: 'w1', hoursAgo: 5 }),
    art(wire, { source: 'Investing.com', id: 'w2', hoursAgo: 4.5 }),
    art(`${wire} - Yahoo News`, { source: 'Yahoo News', id: 'w3', hoursAgo: 4 }),
    art('At least 14 people killed in attack on Ukraine train station', { source: 'Al Jazeera', id: 'w4', hoursAgo: 4 }),
  ];
  const [c] = clusterArticles(arts, 'geopolitics', { now: NOW });
  assert.equal(c.size, 4);
  assert.deepEqual(new Set(c.syndicated), new Set(['w2', 'w3']));
  assert.equal(c.breadth, 2, 'Reuters + Al Jazeera are the independent tellings');
});

test('breadth counts distinct outlets, not feeds or articles', () => {
  const arts = [
    art('Tesla recalls 400,000 vehicles over steering defect', { source: 'BBC World', id: 'b1' }),
    art('Tesla recall: NHTSA says Model Y steering part may fail', { source: 'BBC News', id: 'b2' }),
    art('Tesla issues massive recall for faulty power steering', { source: 'MarketWatch', id: 'b3' }),
  ];
  const [c] = clusterArticles(arts, 'finance', { now: NOW });
  assert.equal(c.size, 3);
  assert.equal(c.breadth, 2, 'BBC World and BBC News are one publisher');
});

test('breadthBonus: 0 for <= 1, monotonic, saturating at <= 12', () => {
  assert.equal(breadthBonus(0), 0);
  assert.equal(breadthBonus(1), 0);
  assert.equal(breadthBonus(undefined), 0);
  let prev = 0;
  for (let b = 2; b <= 60; b++) {
    const v = breadthBonus(b);
    assert.ok(v >= prev, `monotonic at ${b}`);
    assert.ok(v <= 12, `cap at ${b}`);
    prev = v;
  }
  assert.ok(breadthBonus(2) > 2 && breadthBonus(2) < 4);
  assert.equal(breadthBonus(1000), 12);
});
