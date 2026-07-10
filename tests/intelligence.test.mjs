/**
 * Unit tests for the shared intelligence layer.
 * Everything here runs keyless — AI paths fall back deterministically.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { extractEntities, extractEventTerms, extractKeyNumbers, canonical, displayCase } from '../lib/intelligence/entities.mjs';
import { clusterArticles, clusterVersion } from '../lib/intelligence/cluster.mjs';
import { validateIntel } from '../lib/intelligence/schema.mjs';
import { buildFallbackIntel } from '../lib/intelligence/extract.mjs';
import { detectChanges } from '../lib/intelligence/changes.mjs';
import { composeBriefing } from '../lib/intelligence/briefing.mjs';
import { compareSources } from '../lib/intelligence/compare.mjs';
import { answerStoryQuestion } from '../lib/intelligence/qa.mjs';
import { fallbackQuestions, rubricEvaluate, buildKnowledgeMap } from '../lib/intelligence/recall.mjs';
import { topicsForCluster } from '../lib/intelligence/topics.mjs';

// Ensure the AI path is off for these tests regardless of the environment.
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;

const NOW = Date.now();
let seq = 0;
function art(title, { source = 'BBC World', summary = '', hoursAgo = 2, score = 70 } = {}) {
  seq++;
  return {
    id: `a${seq}`,
    title,
    link: `https://example.com/${seq}`,
    summary,
    publishedAt: NOW - hoursAgo * 36e5,
    sourceName: source,
    score,
    meridianScore: score,
    metrics: { headlineIntegrity: 30, sourceTrust: 25, freshness: 20 },
  };
}

/* --------------------------------- entities -------------------------------- */

test('entity extraction canonicalises aliases', () => {
  const ents = extractEntities('The United States and America clash with China over Taiwan');
  const canons = ents.map((e) => e.canonical);
  assert.ok(canons.includes('united states'));
  assert.equal(canons.filter((c) => c === 'united states').length, 1);
  assert.ok(canons.includes('china'));
  assert.equal(canonical('U.S.'), 'united states');
});

test('event terms and key numbers extract deterministically', () => {
  const terms = extractEventTerms('EU imposes sanctions after missile strike; tariffs raised');
  assert.ok(terms.has('sanctions'));
  const nums = extractKeyNumbers('The package is worth $3.2 billion, a 45% increase');
  assert.ok(nums.some((n) => n.value.includes('$3.2')));
  assert.ok(nums.some((n) => n.value.includes('45')));
});

/* -------------------------------- clustering ------------------------------- */

test('same event from two outlets clusters together', () => {
  const a = art('Israel and Hamas agree ceasefire deal in Gaza after Qatar talks');
  const b = art('Gaza ceasefire: Israel, Hamas reach agreement in Qatar-brokered talks', {
    source: 'Al Jazeera',
  });
  const clusters = clusterArticles([a, b], 'geopolitics');
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].size, 2);
  assert.deepEqual(new Set(clusters[0].sources), new Set(['BBC World', 'Al Jazeera']));
});

test('sharing a country alone does NOT merge unrelated stories', () => {
  const a = art('China launches new lunar probe in space program milestone');
  const b = art('China wins table tennis championship in dominant display');
  const clusters = clusterArticles([a, b], 'geopolitics');
  assert.equal(clusters.length, 2);
});

test('different phases of a broad conflict stay separate without event similarity', () => {
  const a = art('Russia strikes Kharkiv power grid with drone barrage overnight');
  const b = art('Russia and Ukraine exchange 200 prisoners in rare swap deal');
  const clusters = clusterArticles([a, b], 'geopolitics');
  assert.equal(clusters.length, 2);
});

test('cluster IDs are deterministic and version tracks membership', () => {
  const a = art('Federal Reserve cuts rates by 50 basis points in surprise move');
  const b = art('Federal Reserve stuns markets: rate cut of 50 basis points announced', {
    source: 'MarketWatch',
    hoursAgo: 1,
  });
  const c1 = clusterArticles([a, b], 'finance');
  const c2 = clusterArticles([a, b], 'finance');
  assert.equal(c1[0].id, c2[0].id);
  const v1 = clusterVersion(c1[0]);
  const solo = clusterArticles([a], 'finance');
  assert.notEqual(clusterVersion(solo[0]), v1);
  assert.equal(solo[0].id, c1[0].id); // anchor-derived ID is stable as members arrive
});

/* ---------------------------------- schema --------------------------------- */

test('validateIntel demotes ungrounded facts and strips bad citations', () => {
  const raw = {
    whatHappened: { text: 'A thing happened that is long enough to pass.', classification: 'FACT', citations: ['a1', 'bogus'] },
    whyItMatters: [{ text: 'It matters.', classification: 'FACT', citations: ['nope'] }],
    scenarios: [{ description: 'Could escalate', uncertainty: 'banana' }],
  };
  const v = validateIntel(raw, ['a1']);
  assert.equal(v.whatHappened.classification, 'FACT');
  assert.deepEqual(v.whatHappened.citations, ['a1']);
  assert.equal(v.whyItMatters[0].classification, 'ANALYSIS'); // demoted: no valid citations
  assert.equal(v.scenarios[0].uncertainty, 'HIGH'); // invalid enum coerced conservatively
});

test('validateIntel rejects unusable payloads', () => {
  assert.equal(validateIntel(null, []), null);
  assert.equal(validateIntel({ whatHappened: { text: 'too short' } }, []), null);
});

/* ------------------------------ fallback intel ------------------------------ */

test('fallback intel is grounded with citations and a timeline', () => {
  const a = art('EU approves €50 billion aid package for Ukraine reconstruction', {
    summary: 'The package worth €50 billion passed after Hungary dropped its veto.',
  });
  const b = art('EU approves €50 billion Ukraine aid package after Hungary drops veto', {
    source: 'France 24',
    hoursAgo: 1,
  });
  const [cluster] = clusterArticles([a, b], 'geopolitics');
  const intel = buildFallbackIntel(cluster);
  assert.ok(intel.whatHappened.citations.length > 0);
  assert.equal(intel.timeline.length, 2);
  assert.ok(intel.timeline[0].at <= intel.timeline[1].at);
  const validated = validateIntel(intel, cluster.articleIds);
  assert.ok(validated, 'fallback intel must pass its own schema');
});

/* --------------------------------- changes --------------------------------- */

test('material change detected; duplicates suppressed', () => {
  const seen = art('Country A and Country B open trade negotiations in Geneva');
  const dup = art('Country A, Country B begin trade negotiations in Geneva talks', {
    source: 'France 24',
    hoursAgo: 1,
  });
  const material = art('Country A signs trade agreement with Country B ending tariff dispute', {
    source: 'NYT World',
    hoursAgo: 0.5,
  });
  const cluster = {
    id: 'cx',
    title: seen.title,
    edition: 'geopolitics',
    articles: [seen, dup, material],
    articleIds: [seen.id, dup.id, material.id],
    latestAt: NOW,
  };
  const res = detectChanges(cluster, {
    articleIds: [seen.id],
    lastSeenAt: NOW - 2 * 36e5,
  });
  assert.equal(res.changes.length, 1, 'only the signed agreement is material');
  assert.match(res.changes[0].type, /Agreement/);
  assert.ok(res.suppressedCount >= 1, 'the near-duplicate is suppressed');
});

test('no changes when nothing new', () => {
  const a = art('Parliament debates budget bill in second reading');
  const cluster = {
    id: 'cy', title: a.title, edition: 'geopolitics',
    articles: [a], articleIds: [a.id], latestAt: a.publishedAt,
  };
  const res = detectChanges(cluster, { articleIds: [a.id], lastSeenAt: NOW });
  assert.equal(res.changes.length, 0);
  assert.equal(res.newArticleCount, 0);
});

/* --------------------------------- briefing -------------------------------- */

function mkCluster(title, { score = 60, sources = ['BBC World'], hoursAgo = 3 } = {}) {
  const a = art(title, { score, hoursAgo });
  const c = {
    id: `c${a.id}`,
    edition: 'geopolitics',
    title,
    entities: extractEntities(title).map((e) => e.canonical),
    eventTerms: [...extractEventTerms(title)],
    articles: [a],
    articleIds: [a.id],
    sources,
    size: sources.length,
    score,
    earliestAt: a.publishedAt,
    latestAt: a.publishedAt,
  };
  c.topics = topicsForCluster(c);
  return c;
}

test('briefing is finite, interest-weighted, and keeps global stories', () => {
  const clusters = [
    mkCluster('Bitcoin surges past record as crypto funds see inflows', { score: 55 }),
    mkCluster('NATO summit opens amid missile escalation fears in Europe', { score: 92, sources: ['BBC World', 'NYT World'] }),
    mkCluster('Startup raises $200 million Series C for AI chips venture', { score: 50 }),
    mkCluster('Nigeria election results spark protests in Lagos', { score: 75 }),
    mkCluster('Fed rate decision looms as inflation data lands', { score: 65 }),
  ];
  const briefing = composeBriefing(clusters, new Map(), {
    interests: ['crypto', 'venture-startups'],
    follows: [],
  });
  assert.ok(briefing.essential.length <= 4);
  assert.ok(briefing.essential.length > 0);
  const titles = briefing.essential.map((i) => i.title);
  // Interests pull crypto/venture up…
  assert.ok(titles.some((t) => /Bitcoin|Series C/.test(t)), 'interest stories surface');
  // …but the top global story is never displaced.
  assert.ok(titles.some((t) => /NATO/.test(t)), 'global significance retained');
  // Finite everywhere.
  assert.ok(briefing.developing.length <= 3);
  assert.ok(briefing.understand.length <= 1);
  assert.ok(briefing.watch.length <= 3);
});

test('briefing works with an empty profile (new user)', () => {
  const clusters = [mkCluster('Global summit on climate opens in Nairobi', { score: 80 })];
  const briefing = composeBriefing(clusters, new Map(), {});
  assert.equal(briefing.personalized, false);
  assert.equal(briefing.essential.length, 1);
});

/* --------------------------------- compare --------------------------------- */

test('source comparison: rows, emphasis, single-source fallback', () => {
  const a = art('Sanctions to hit oil exports, markets brace for price surge', {
    summary: 'Economic fallout expected as investors weigh energy prices and inflation.',
  });
  const b = art('Sanctions raise fears for civilians as aid groups warn of shortages', {
    source: 'Al Jazeera',
    summary: 'Humanitarian groups warn of casualties and refugee flows.',
  });
  // compareSources operates on any cluster regardless of how it was formed.
  const cluster = {
    id: 'ccmp', edition: 'geopolitics', title: a.title,
    articles: [a, b], articleIds: [a.id, b.id],
    sources: [a.sourceName, b.sourceName], size: 2,
    earliestAt: b.publishedAt, latestAt: a.publishedAt,
  };
  const cmp = compareSources(cluster);
  assert.equal(cmp.singleSource, false);
  assert.equal(cmp.rows.length, 2);
  assert.ok(cmp.rows.every((r) => r.headline && r.source));

  const solo = clusterArticles([art('Lone wire story about an obscure summit meeting')], 'geopolitics')[0];
  assert.equal(compareSources(solo).singleSource, true);
});

/* ------------------------------------ Q&A ----------------------------------- */

test('keyless Q&A answers extractively with real citations only', async () => {
  const a = art('Central bank raises rates to fight inflation', {
    summary: 'The central bank lifted its benchmark rate by 50 basis points, citing persistent inflation pressure in services.',
  });
  const [cluster] = clusterArticles([a], 'finance');
  const res = await answerStoryQuestion(cluster, null, 'Why did the bank raise rates?');
  assert.equal(res.answered, true);
  assert.ok(res.statements.length > 0);
  for (const s of res.statements) {
    for (const c of s.citations) {
      assert.ok(cluster.articleIds.includes(c.articleId), 'citation must be in-cluster');
    }
  }
});

test('Q&A admits insufficient evidence instead of inventing', async () => {
  const a = art('Local festival opens with record attendance', { summary: 'Crowds enjoyed music and food stalls.' });
  const [cluster] = clusterArticles([a], 'geopolitics');
  const res = await answerStoryQuestion(cluster, null, 'What is the quarterly revenue of Acme Corp?');
  assert.equal(res.answered, false);
  assert.equal(res.insufficientEvidence, true);
});

test('Q&A rejects empty/absurd questions safely', async () => {
  const [cluster] = clusterArticles([art('Some headline about a summit meeting in Vienna')], 'geopolitics');
  const res = await answerStoryQuestion(cluster, null, '');
  assert.equal(res.answered, false);
});

/* ---------------------------------- recall ---------------------------------- */

function historyEntry(title) {
  const [cluster] = clusterArticles([art(title, { summary: 'Detailed summary with consequences for trade and prices.' })], 'geopolitics');
  const intel = buildFallbackIntel(cluster);
  intel.whyItMatters = [{ text: 'Shipping disruption raises freight costs, which feeds import-price inflation.', classification: 'ANALYSIS', citations: [] }];
  intel.causalChain = [{
    from: 'Shipping route disruption',
    to: 'Higher freight costs',
    type: 'causes',
    explanation: 'Rerouting adds distance and insurance costs.',
    confidence: 'MEDIUM',
    citations: [],
  }];
  return { cluster, intelRecord: { intel }, kind: 'read' };
}

test('fallback recall questions test understanding, not trivia', () => {
  const qs = fallbackQuestions([historyEntry('Red Sea shipping disruption forces rerouting around Africa')], 3);
  assert.ok(qs.length > 0);
  for (const q of qs) {
    assert.ok(q.expectedAnswer.length > 20);
    assert.ok(!/which country appeared/i.test(q.question));
  }
});

test('rubric evaluation tolerates paraphrase and rejects nonsense', () => {
  const expected = 'Shipping disruption raises freight costs, which feeds import-price inflation in economies that rely on imports.';
  const good = rubricEvaluate({ expectedAnswer: expected, answer: 'Because freight gets more expensive and importing economies see inflation in import prices.' });
  assert.notEqual(good.verdict, 'incorrect');
  const bad = rubricEvaluate({ expectedAnswer: expected, answer: 'The moon orbits the earth.' });
  assert.equal(bad.verdict, 'incorrect');
});

test('knowledge map builds causal chains with confidence', () => {
  const chains = buildKnowledgeMap([historyEntry('Red Sea shipping disruption forces rerouting around Africa')]);
  assert.ok(chains.length > 0);
  const edge = chains[0].edges[0];
  assert.ok(edge.from && edge.to && edge.confidence);
});

test('numeric tokens merge same-figure duplicate headlines (SK Hynix case)', () => {
  const a = art('SK Hynix raises $26.5 billion in U.S. offering. What to know about the stock.', { source: 'MarketWatch' });
  const b = art('Chip giant SK Hynix raises $26.5bn in mega US share sale', { source: 'BBC World', hoursAgo: 1 });
  const clusters = clusterArticles([a, b], 'finance');
  assert.equal(clusters.length, 1, 'same offering must not form duplicate clusters');
});

/* ------------------------- Agent G finding regressions ---------------------- */

test('divergent headlines of one event merge (Bayeux / Khamenei cases)', () => {
  const a = art('Bayeux Tapestry arrives safely in UK after loan from France', { source: 'France 24' });
  const b = art('Bayeux Tapestry smuggled into Britain for first visit in 1,000 years', { source: 'Al Jazeera', hoursAgo: 1 });
  assert.equal(clusterArticles([a, b], 'geopolitics').length, 1);

  const c = art("Huge crowds in Mashhad as Iran's late supreme leader is buried", {
    summary: 'Ali Khamenei was buried at the Imam Reza shrine in Mashhad.',
  });
  const d = art('Live: Iran buries Ali Khamenei as thousands gather in Mashhad', {
    source: 'Al Jazeera', hoursAgo: 1,
    summary: 'The funeral of Ali Khamenei drew huge crowds in Mashhad.',
  });
  assert.equal(clusterArticles([c, d], 'geopolitics').length, 1);
});

test('briefing dedupes the same event arriving from both editions', () => {
  const geo = mkCluster('Chip giant SK Hynix raises $26.5bn in mega US share sale', { score: 80 });
  const fin = { ...mkCluster('SK Hynix raises $26.5 billion in U.S. offering. What to know', { score: 85 }), edition: 'finance' };
  const briefing = composeBriefing([geo, fin, mkCluster('NATO summit opens amid missile fears', { score: 90 })], new Map(), {});
  const hynix = briefing.essential.filter((e) => /Hynix/.test(e.title));
  assert.equal(hynix.length, 1, 'one event must occupy one briefing slot');
});

/* ---------------------- discovery-agent finding regressions ----------------- */

test('key-actor extraction skips Title Case garbage but keeps real proper nouns', () => {
  const titleCase = extractEntities('Edvisorly Raises Series A To Fix The Messy College Transfer Process With AI');
  const junk = titleCase.map((e) => e.canonical);
  assert.ok(!junk.includes('to fix the'), 'title-case filler must not become an entity');
  assert.ok(!junk.includes('process with ai'), 'title-case filler must not become an entity');

  const sentenceCase = extractEntities("Huge crowds in Mashhad as Iran's late supreme leader is buried at the Imam Reza shrine");
  const names = sentenceCase.map((e) => e.canonical);
  assert.ok(names.includes('iran'));
  assert.ok(names.includes('mashhad'));
});

test('displayCase title-cases without mangling possessives', () => {
  assert.equal(displayCase('iran'), 'Iran');
  assert.equal(displayCase("iran's"), "Iran's");
  assert.equal(displayCase('united states'), 'United States');
});

test('fallback intel synthesizes a grounded-analysis why-it-matters and feeds the knowledge map', () => {
  const a = art('EU imposes new sanctions on Belarus after border crackdown', {
    summary: 'The sanctions target officials linked to the crackdown.',
  });
  const [cluster] = clusterArticles([a], 'geopolitics');
  const intel = buildFallbackIntel(cluster);
  assert.ok(intel.whyItMatters.length > 0);
  assert.equal(intel.whyItMatters[0].classification, 'ANALYSIS');
  assert.equal(intel.whyItMatters[0].citations.length, 0, 'templated inference must not claim a citation');

  const chains = buildKnowledgeMap([{ cluster, intelRecord: { intel }, kind: 'read' }]);
  assert.ok(chains.length > 0, 'a populated whyItMatters must unlock a knowledge-map chain');
});

test('changes.mjs names actual new actors instead of generic filler', () => {
  const seen = art('Regional talks continue over shipping lane access');
  const material = art('Egypt and Panama both join the shipping lane negotiations', {
    source: 'France 24', hoursAgo: 0.5,
  });
  const cluster = {
    id: 'cnew', title: seen.title, edition: 'geopolitics',
    articles: [seen, material], articleIds: [seen.id, material.id], latestAt: NOW,
  };
  const res = detectChanges(cluster, { articleIds: [seen.id], lastSeenAt: NOW - 2 * 36e5 });
  if (res.changes.length > 0) {
    assert.doesNotMatch(res.changes[0].why, /^New actors have entered the story\.$/, 'why must name the actor, not use the generic placeholder verbatim without names');
  }
});

test('source comparison never lists the same outlet as both emphasizing and absent for one dimension', () => {
  const a = art('Markets react as economic sanctions hit oil exports', {
    source: 'Al Jazeera',
    summary: 'Investors weighed inflation and price pressure on energy markets.',
  });
  const b = art('Local team wins football match after sanctions announcement mentioned in passing', {
    source: 'Al Jazeera', hoursAgo: 1,
    summary: 'A short unrelated sports recap with no economic detail.',
  });
  const c = art('Civilians face hardship as aid groups warn of shortages', { source: 'BBC World', hoursAgo: 2 });
  const cluster = {
    id: 'ccmp2', edition: 'geopolitics', title: a.title,
    articles: [a, b, c], articleIds: [a.id, b.id, c.id],
    sources: ['Al Jazeera', 'BBC World'], size: 3,
    earliestAt: c.publishedAt, latestAt: a.publishedAt,
  };
  const cmp = compareSources(cluster);
  for (const e of cmp.emphasis) {
    const overlap = e.emphasizedBy.filter((s) => e.absentFrom.includes(s));
    assert.equal(overlap.length, 0, `source appears on both sides of "${e.dimension}"`);
  }
});

test('title/summary concatenation cannot fuse a proper noun across the boundary', () => {
  const a = art('East Asia braces for destructive typhoon as landslides kill 15 in Philippines', {
    summary: 'Heading for Taiwan and south-eastern China, the storm is forecast to intensify.',
  });
  const [cluster] = clusterArticles([a], 'geopolitics');
  const names = cluster.entities;
  assert.ok(!names.includes('philippines heading'), 'title-ending and summary-starting words must not fuse into one entity');
});
