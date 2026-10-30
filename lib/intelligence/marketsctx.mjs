/**
 * Markets context for the chat.
 *
 * The Markets tab is fed by its own sources (per-country Google News headlines
 * and a live index price), not by the ranked article pool the chat searches.
 * This module decides when a question is about a market and turns that market
 * data into pinned sources the chat can cite. Pure functions; fetching lives
 * in lib/markets.mjs.
 */

export const MARKET_KEYS = [
  'US', 'China', 'Japan', 'India', 'UK', 'France', 'Canada', 'Germany',
  'Taiwan', 'South Korea', 'Saudi Arabia', 'Switzerland', 'Australia',
];

const ALIASES = {
  India: /\b(india|indian|sensex|nifty|bse|nse|dalal street|rupee|mumbai)\b/i,
  US: /\b(wall street|s&p|dow jones|dow|nasdaq|u\.?s\.? (stocks?|markets?|shares|equities|economy)|american (stocks?|markets?))\b/i,
  China: /\b(china|chinese|shanghai|shenzhen)\b/i,
  Japan: /\b(japan|japanese|nikkei|tokyo)\b/i,
  UK: /\b(uk|u\.k\.|britain|british|ftse|london)\b/i,
  France: /\b(france|french|cac|paris)\b/i,
  Canada: /\b(canada|canadian|tsx|toronto)\b/i,
  Germany: /\b(germany|german|dax|frankfurt)\b/i,
  Taiwan: /\b(taiwan|taiwanese|taiex|taipei)\b/i,
  'South Korea': /\b(korea|korean|kospi|seoul)\b/i,
  'Saudi Arabia': /\b(saudi|tadawul|riyadh)\b/i,
  Switzerland: /\b(swiss|switzerland|smi|zurich)\b/i,
  Australia: /\b(australia|australian|asx|sydney)\b/i,
};

/**
 * Plain alias terms per market (lower-case), shared with chat retrieval so a
 * question about "the Sensex" also reaches stories that only say "India".
 */
export const MARKET_ALIAS_TERMS = {
  India: ['india', 'indian', 'sensex', 'nifty', 'bse', 'nse', 'dalal street', 'rupee', 'mumbai', 'rbi', 'sebi'],
  US: ['wall street', 's&p', 'dow jones', 'dow', 'nasdaq', 'american', 'treasury', 'fed'],
  China: ['china', 'chinese', 'shanghai', 'shenzhen', 'beijing', 'yuan'],
  Japan: ['japan', 'japanese', 'nikkei', 'tokyo', 'yen'],
  UK: ['uk', 'britain', 'british', 'ftse', 'london', 'sterling'],
  France: ['france', 'french', 'cac', 'paris'],
  Canada: ['canada', 'canadian', 'tsx', 'toronto'],
  Germany: ['germany', 'german', 'dax', 'frankfurt'],
  Taiwan: ['taiwan', 'taiwanese', 'taiex', 'taipei'],
  'South Korea': ['korea', 'korean', 'kospi', 'seoul'],
  'Saudi Arabia': ['saudi', 'tadawul', 'riyadh'],
  Switzerland: ['swiss', 'switzerland', 'smi', 'zurich'],
  Australia: ['australia', 'australian', 'asx', 'sydney'],
};

/** Extra search terms for the markets a question names (empty when it names none). */
export function marketAliasTerms(text) {
  const q = String(text || '');
  const out = [];
  for (const key of MARKET_KEYS) {
    if (ALIASES[key].test(q)) out.push(...MARKET_ALIAS_TERMS[key]);
  }
  return out;
}

// A country alone ("India-China border talks") is not a markets question.
const MARKET_INTENT = new RegExp(
  [
    '\\b(market|markets|stock|stocks|share|shares|index|indices|equity|equities|trading|traded|invest\\w*|bourse|bull|bear|selloff|sell-off|ipo|rall(y|ies|ying|ied))\\b',
    // Index and exchange names are market intent on their own.
    '\\b(sensex|nifty|nikkei|ftse|cac|dax|tsx|taiex|kospi|tadawul|asx|nasdaq|dow jones|wall street)\\b',
    's&p',
  ].join('|'),
  'i'
);

export const MAX_MARKETS = 2;

export function isMarketKey(key) {
  return MARKET_KEYS.includes(key);
}

/**
 * Markets a question refers to, in priority order. `defaultMarket` (the market
 * selected on the Markets tab) applies when the question names none.
 */
export function detectMarkets(text, { defaultMarket = null, force = false } = {}) {
  const q = String(text || '');
  let named = [];
  if (force || MARKET_INTENT.test(q)) {
    // In the order the question mentions them.
    named = MARKET_KEYS.map((key) => ({ key, at: q.search(ALIASES[key]) }))
      .filter((m) => m.at >= 0)
      .sort((a, b) => a.at - b.at)
      .map((m) => m.key);
  }
  const out = named.length ? named : defaultMarket && isMarketKey(defaultMarket) ? [defaultMarket] : [];
  return out.slice(0, MAX_MARKETS);
}

const slug = (k) => k.toLowerCase().replace(/\s+/g, '-');

function fmt(n, d = 2) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/**
 * Pinned sources for one market, shaped like ranked articles so the chat's
 * retrieval, prompt and citation validation treat them the same way.
 */
export function marketSources(
  marketKey,
  { articles = [], snapshot = null },
  now = Date.now(),
  { maxHeadlines = 8 } = {}
) {
  const out = [];

  if (snapshot && Number.isFinite(snapshot.price)) {
    const up = snapshot.change >= 0;
    out.push({
      id: `mkt-${slug(marketKey)}-index`,
      title: `${snapshot.name}: ${fmt(snapshot.price)} (${up ? '+' : ''}${fmt(snapshot.changePercent)}%)`,
      summary:
        `${snapshot.name} last traded at ${fmt(snapshot.price)}${snapshot.currency ? ` ${snapshot.currency}` : ''}, ` +
        `${up ? 'up' : 'down'} ${fmt(Math.abs(snapshot.change))} points (${fmt(Math.abs(snapshot.changePercent))}%) ` +
        `from the previous close, as of ${new Date(snapshot.asOf || now).toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
      link: `https://finance.yahoo.com/quote/${encodeURIComponent(snapshot.symbol || '')}`,
      sourceName: 'Yahoo Finance',
      publishedAt: snapshot.asOf || now,
      ageHours: 0,
      score: 99,
      clusterId: null,
    });
  }

  articles.slice(0, maxHeadlines).forEach((a, i) => {
    const t = Date.parse(a.publishedAt);
    const published = Number.isFinite(t) ? t : now;
    out.push({
      id: `mkt-${slug(marketKey)}-${i}`,
      title: a.title,
      summary: `${marketKey} market headline.`,
      link: a.link,
      sourceName: a.source || 'Google News',
      publishedAt: published,
      ageHours: Math.max(0, (now - published) / 36e5),
      score: 90 - i,
      clusterId: null,
    });
  });

  return out;
}
