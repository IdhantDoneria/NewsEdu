/**
 * Controlled topic taxonomy for interests and topic-follows.
 *
 * There is no free-text topic creation — users pick from this list, so no
 * uncontrolled duplicate labels can appear. Matching is deterministic
 * (regex over cluster title + entities), shared by briefing ranking and
 * topic-follow filtering.
 */

export const TOPICS = [
  { id: 'us-politics', label: 'US Politics', kind: 'country', re: /\b(united states|america|washington|white house|congress|senate|trump|biden)\b/i },
  { id: 'china', label: 'China', kind: 'country', re: /\b(china|beijing|xi jinping|\bxi\b|taiwan strait)\b/i },
  { id: 'russia-ukraine', label: 'Russia & Ukraine', kind: 'conflict', re: /\b(russia|ukraine|kyiv|moscow|kremlin|putin|zelensky)\b/i },
  { id: 'middle-east', label: 'Middle East', kind: 'region', re: /\b(israel|gaza|palestine|iran|lebanon|hezbollah|hamas|houthi|yemen|syria|saudi arabia|netanyahu)\b/i },
  { id: 'europe', label: 'Europe & EU', kind: 'region', re: /\b(europe|european union|\beu\b|brussels|germany|france|britain|nato)\b/i },
  { id: 'india', label: 'India', kind: 'country', re: /\b(india|delhi|modi)\b/i },
  { id: 'africa', label: 'Africa', kind: 'region', re: /\b(africa|nigeria|kenya|ethiopia|sudan|congo|sahel)\b/i },
  { id: 'latin-america', label: 'Latin America', kind: 'region', re: /\b(brazil|mexico|argentina|venezuela|colombia|chile|lula|milei|sheinbaum)\b/i },
  { id: 'trade-tariffs', label: 'Trade & Tariffs', kind: 'policy', re: /\b(tariff|trade deal|trade war|export controls?|sanction|embargo|wto)\b/i },
  { id: 'defense-security', label: 'Defense & Security', kind: 'policy', re: /\b(military|missile|drone|nuclear|troops|airstrike|defense|nato|ceasefire|war\b)\b/i },
  { id: 'energy', label: 'Energy & Climate', kind: 'industry', re: /\b(oil|gas|crude|opec|energy|climate|renewable|solar|emissions)\b/i },
  { id: 'ai-technology', label: 'AI & Technology', kind: 'technology', re: /\b(\bai\b|artificial intelligence|openai|chip|semiconductor|nvidia|software|cyber|tech\b|silicon valley)\b/i },
  { id: 'markets-macro', label: 'Markets & Macro', kind: 'economic', re: /\b(stocks?|markets?|fed|federal reserve|inflation|rates?|bond|gdp|recession|dollar|treasury)\b/i },
  { id: 'venture-startups', label: 'Venture & Startups', kind: 'economic', re: /\b(startup|venture|funding|raises?|series [a-e]|seed round|vc\b|unicorn|ipo)\b/i },
  { id: 'crypto', label: 'Crypto', kind: 'technology', re: /\b(bitcoin|crypto|ethereum|blockchain|stablecoin)\b/i },
  { id: 'corporate', label: 'Corporate & M&A', kind: 'economic', re: /\b(merger|acquisition|acquires?|earnings|ceo|layoffs?|bankruptcy|antitrust)\b/i },
  { id: 'health', label: 'Global Health', kind: 'policy', re: /\b(who\b|outbreak|pandemic|vaccine|health)\b/i },
  { id: 'courts-law', label: 'Courts & Law', kind: 'policy', re: /\b(court|ruling|verdict|indict|lawsuit|trial|judge|legislation|supreme court)\b/i },
];

const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

export function topicById(id) {
  return TOPIC_BY_ID.get(id) || null;
}

/** Topic IDs matching a cluster (title + entities + event terms). */
export function topicsForCluster(cluster) {
  const text = `${cluster.title} ${cluster.entities.join(' ')} ${(cluster.eventTerms || []).join(' ')}`;
  return TOPICS.filter((t) => t.re.test(text)).map((t) => t.id);
}
