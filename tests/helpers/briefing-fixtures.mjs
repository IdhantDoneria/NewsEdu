/** Cluster factory shared by the briefing tests. */
import { extractEntities, extractEventTerms } from '../../lib/intelligence/entities.mjs';
import { topicsForCluster } from '../../lib/intelligence/topics.mjs';

export const NOW = 1793298911469;
const H = 36e5;
let seq = 0;

export function mkCluster(title, { score = 60, sources = ['BBC World'], hoursAgo = 3, id, edition = 'geopolitics', breadth, topics, extraArticles = [] } = {}) {
  seq++;
  const a = {
    id: `a${seq}`,
    title,
    summary: '',
    link: `https://example.com/${seq}`,
    publishedAt: NOW - hoursAgo * H,
    sourceName: sources[0],
    score,
  };
  const articles = [a, ...extraArticles];
  const c = {
    id: id || `c${seq}`,
    edition,
    title,
    entities: extractEntities(title).map((e) => e.canonical),
    eventTerms: [...extractEventTerms(title)],
    articles,
    articleIds: articles.map((x) => x.id),
    sources,
    size: Math.max(sources.length, articles.length),
    score,
    earliestAt: a.publishedAt,
    latestAt: a.publishedAt,
  };
  if (breadth != null) c.breadth = breadth;
  c.topics = topics || topicsForCluster(c);
  return c;
}

/** A varied pool of distinct stories across topics. */
export function mkPool() {
  return [
    mkCluster('Israel strikes Gaza as ceasefire talks stall in Cairo', { score: 95, sources: ['BBC World', 'NYT World', 'Al Jazeera'] }),
    mkCluster('Iran warns of response after Israeli airstrikes on Tehran', { score: 92, sources: ['BBC World', 'NYT World'] }),
    mkCluster('Houthis fire missiles at shipping in Red Sea, US navy responds', { score: 88, sources: ['NYT World', 'France 24'] }),
    mkCluster('Lebanon braces for Hezbollah retaliation as troops mass at border', { score: 84 }),
    mkCluster('Russian drones hit Kharkiv power grid, Ukraine appeals for air defence', { score: 90, sources: ['BBC World', 'France 24'] }),
    mkCluster('Fed holds rates steady as inflation cools, Treasury yields fall', { score: 86, edition: 'finance', sources: ['CNBC Markets', 'MarketWatch'] }),
    mkCluster('Nvidia earnings beat estimates on AI data centre demand', { score: 83, edition: 'finance', sources: ['CNBC Markets', 'MarketWatch'] }),
    mkCluster('Bitcoin tops record as stablecoin bill clears Senate committee', { score: 70, edition: 'finance' }),
    mkCluster('Startup raises $200 million Series C for AI chips', { score: 66, edition: 'finance' }),
    mkCluster('Brazil election runoff tightens as Lula leads Bolsonaro in polls', { score: 80, sources: ['NYT World', 'BBC World'] }),
    mkCluster('Nigeria protests over fuel prices turn deadly in Lagos', { score: 72 }),
    mkCluster('China unveils export controls on rare earths in trade dispute', { score: 85, sources: ['NYT World', 'BBC World'] }),
    mkCluster('India central bank cuts repo rate as rupee steadies', { score: 62, edition: 'finance' }),
    mkCluster('Measles outbreak spreads as WHO urges vaccination drive', { score: 64 }),
    mkCluster('Supreme Court agrees to hear birthright citizenship case', { score: 78, sources: ['NYT World', 'BBC World'] }),
    mkCluster('EU leaders agree 2040 emissions target after marathon talks', { score: 74 }),
  ];
}

export function shuffle(list, seed = 1) {
  const a = [...list];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function intelWatching(clusters) {
  return new Map(
    clusters.map((c) => [c.id, { intel: { watchNext: [{ text: `Decision due on ${c.title.slice(0, 20)}`, classification: 'FORECAST' }] } }])
  );
}

export const allIds = (b) => [...b.essential, ...b.developing, ...b.understand].map((i) => i.clusterId);
