/**
 * The single outlet table. Both editions, every code path.
 *
 * Each outlet is keyed by registrable domain (subdomains resolve upwards, so
 * `rss.nytimes.com` and `news.crunchbase.com` hit their parents) and by
 * display-name alias (so an article with no usable link still lands on the
 * same row). A hand-reviewed reliability TIER is a prior, not a verdict:
 *
 *   1  wires, primary sources, regulators and central banks
 *   2  papers of record and major newsrooms
 *   3  solid specialist, regional or trade desks
 *   4  aggregators, contributor networks, state-run wires, mixed quality
 *   5  user-generated or promotional platforms
 *
 * Bias labels are deliberately NOT used. Unknown outlets fall back to the
 * feed registry's `trust` (0-20) only, shrunk into a narrow band so an
 * unvetted feed can never out-rank a reviewed one.
 *
 * The outlet layer is deliberately small: it spans OUTLET_BAND (about 12
 * points) so outlet identity can never decide an order that content and
 * recency should decide.
 */

import { hostname } from './utils.mjs';

export const TIER_RELIABILITY = Object.freeze({ 1: 92, 2: 82, 3: 72, 4: 58, 5: 42 });

// reliability 70 maps to the neutral base; every 4 reliability points = 1 score point.
const BASE = 45;
const PIVOT = 70;
const SLOPE = 0.25;

// Unknown outlets: trust (0-20) x 4, clamped to the tier-3..tier-4 corridor.
const UNKNOWN_MIN = 50;
const UNKNOWN_MAX = 72;
const UNKNOWN_DEFAULT = 58;

const baselineFor = (reliability) => BASE + (reliability - PIVOT) * SLOPE;

/** Hard bounds of the outlet layer, for tests and documentation. */
export const OUTLET_BAND = Object.freeze({
  min: baselineFor(TIER_RELIABILITY[5]),
  max: baselineFor(TIER_RELIABILITY[1]),
});

/* [tier, [domains], [name aliases]] */
const ROWS = [
  // Tier 1: wires, primary sources, regulators, central banks, intergovernmental
  [1, ['reuters.com'], ['Reuters']],
  [1, ['apnews.com'], ['AP', 'Associated Press', 'AP News']],
  [1, ['afp.com'], ['AFP']],
  [1, ['bloomberg.com'], ['Bloomberg']],
  [1, ['sec.gov'], ['SEC']],
  [1, ['cftc.gov'], ['CFTC']],
  [1, ['federalreserve.gov'], ['Federal Reserve', 'The Fed']],
  [1, ['treasury.gov'], ['US Treasury']],
  [1, ['fdic.gov'], ['FDIC']],
  [1, ['finra.org'], ['FINRA']],
  [1, ['ecb.europa.eu'], ['ECB', 'European Central Bank']],
  [1, ['esma.europa.eu'], ['ESMA']],
  [1, ['bankofengland.co.uk'], ['Bank of England']],
  [1, ['boj.or.jp'], ['Bank of Japan']],
  [1, ['bis.org'], ['BIS']],
  [1, ['imf.org'], ['IMF']],
  [1, ['worldbank.org'], ['World Bank']],
  [1, ['oecd.org'], ['OECD']],
  [1, ['sebi.gov.in'], ['SEBI']],
  [1, ['rbi.org.in'], ['RBI', 'Reserve Bank of India']],
  [1, ['un.org', 'news.un.org'], ['UN News', 'United Nations']],
  [1, ['nato.int'], ['NATO']],
  [1, ['europa.eu'], ['European Union', 'EU']],

  // Tier 2: papers of record and major newsrooms
  [2, ['bbc.co.uk', 'bbc.com', 'bbci.co.uk'], ['BBC', 'BBC World', 'BBC News']],
  [2, ['nytimes.com'], ['NYT', 'NYT World', 'New York Times', 'The New York Times']],
  [2, ['ft.com'], ['Financial Times', 'FT']],
  [2, ['wsj.com'], ['WSJ', 'Wall Street Journal', 'The Wall Street Journal']],
  [2, ['washingtonpost.com'], ['Washington Post', 'The Washington Post']],
  [2, ['economist.com'], ['The Economist', 'Economist']],
  [2, ['theguardian.com'], ['The Guardian', 'The Guardian World', 'Guardian']],
  [2, ['aljazeera.com'], ['Al Jazeera', 'Al Jazeera English']],
  [2, ['dw.com'], ['Deutsche Welle', 'DW']],
  [2, ['france24.com'], ['France 24']],
  [2, ['lemonde.fr'], ['Le Monde']],
  [2, ['npr.org'], ['NPR']],
  [2, ['pbs.org'], ['PBS', 'PBS NewsHour']],
  [2, ['cnbc.com'], ['CNBC', 'CNBC Markets']],
  [2, ['marketwatch.com', 'dowjones.io'], ['MarketWatch']],
  [2, ['barrons.com'], ["Barron's", 'Barrons']],
  [2, ['foreignpolicy.com'], ['Foreign Policy']],
  [2, ['foreignaffairs.com'], ['Foreign Affairs']],
  [2, ['politico.com', 'politico.eu'], ['Politico']],
  [2, ['axios.com'], ['Axios']],
  [2, ['cnn.com'], ['CNN']],
  [2, ['cbsnews.com'], ['CBS News']],
  [2, ['nbcnews.com'], ['NBC News']],
  [2, ['abcnews.go.com'], ['ABC News']],
  [2, ['abc.net.au'], ['ABC Australia', 'ABC News Australia']],
  [2, ['cbc.ca'], ['CBC', 'CBC News']],
  [2, ['telegraph.co.uk'], ['The Telegraph', 'Telegraph']],
  [2, ['news.sky.com'], ['Sky News']],
  [2, ['asia.nikkei.com', 'nikkei.com'], ['Nikkei Asia', 'Nikkei']],
  [2, ['scmp.com'], ['SCMP', 'South China Morning Post']],
  [2, ['thehindu.com'], ['The Hindu']],
  [2, ['indianexpress.com'], ['The Indian Express', 'Indian Express']],
  [2, ['straitstimes.com'], ['The Straits Times', 'Straits Times']],
  [2, ['channelnewsasia.com'], ['CNA', 'Channel NewsAsia']],
  [2, ['japantimes.co.jp'], ['The Japan Times', 'Japan Times']],
  [2, ['haaretz.com'], ['Haaretz']],
  [2, ['timesofisrael.com'], ['The Times of Israel', 'Times of Israel']],
  [2, ['kyivindependent.com'], ['The Kyiv Independent', 'Kyiv Independent']],
  [2, ['livemint.com'], ['Mint', 'Livemint', 'LiveMint']],
  [2, ['economictimes.indiatimes.com'], ['The Economic Times', 'Economic Times']],
  [2, ['business-standard.com'], ['Business Standard']],
  [2, ['ptinews.com'], ['PTI', 'Press Trust of India']],
  [2, ['cfr.org'], ['CFR', 'Council on Foreign Relations']],
  [2, ['chathamhouse.org'], ['Chatham House']],

  // Tier 3: solid specialist, regional and trade desks
  [3, ['techcrunch.com'], ['TechCrunch', 'TechCrunch Venture']],
  [3, ['crunchbase.com'], ['Crunchbase', 'Crunchbase News']],
  [3, ['sifted.eu'], ['Sifted']],
  [3, ['pitchbook.com'], ['PitchBook']],
  [3, ['fortune.com'], ['Fortune']],
  [3, ['businessinsider.com'], ['Business Insider']],
  [3, ['nasdaq.com'], ['Nasdaq']],
  [3, ['nyse.com'], ['NYSE']],
  [3, ['foxbusiness.com'], ['Fox Business', 'Fox Business Markets']],
  [3, ['foxnews.com'], ['Fox News']],
  [3, ['finance.yahoo.com'], ['Yahoo Finance']],
  [3, ['atlanticcouncil.org'], ['Atlantic Council']],
  [3, ['thediplomat.com'], ['The Diplomat']],
  [3, ['euronews.com'], ['Euronews']],
  [3, ['moneycontrol.com'], ['Moneycontrol']],
  [3, ['ndtv.com'], ['NDTV']],
  [3, ['hindustantimes.com'], ['Hindustan Times']],
  [3, ['timesofindia.indiatimes.com'], ['The Times of India', 'Times of India']],
  [3, ['thehindubusinessline.com'], ['BusinessLine', 'The Hindu BusinessLine']],
  [3, ['africanews.com'], ['Africanews']],
  [3, ['allafrica.com'], ['allAfrica']],
  [3, ['mercopress.com'], ['MercoPress']],
  [3, ['batimes.com.ar'], ['Buenos Aires Times']],
  [3, ['middleeasteye.net'], ['Middle East Eye']],
  [3, ['rappler.com'], ['Rappler']],
  [3, ['themoscowtimes.com'], ['The Moscow Times', 'Moscow Times']],
  [3, ['aa.com.tr'], ['Anadolu', 'Anadolu Agency']],

  // Tier 4: aggregators, contributor networks, state-run wires, mixed quality
  [4, ['yahoo.com'], ['Yahoo', 'Yahoo News']],
  [4, ['seekingalpha.com'], ['Seeking Alpha']],
  [4, ['investing.com'], ['Investing.com']],
  [4, ['benzinga.com'], ['Benzinga']],
  [4, ['fool.com'], ['The Motley Fool', 'Motley Fool']],
  [4, ['thestreet.com'], ['TheStreet']],
  [4, ['forbes.com'], ['Forbes']],
  [4, ['finnhub.io'], ['Finnhub Wire', 'Finnhub']],
  [4, ['tass.com'], ['TASS']],
  [4, ['globaltimes.cn'], ['Global Times']],
  [4, ['xinhuanet.com', 'news.cn'], ['Xinhua']],
  [4, ['dailymail.co.uk'], ['Daily Mail']],
  [4, ['nypost.com'], ['New York Post', 'NY Post']],

  // Tier 5: user-generated or promotional platforms
  [5, ['reddit.com'], ['Reddit']],
  [5, ['medium.com'], ['Medium']],
  [5, ['substack.com'], ['Substack']],
  [5, ['x.com', 'twitter.com'], ['X', 'Twitter']],
  [5, ['youtube.com'], ['YouTube']],
  [5, ['buzzfeed.com'], ['BuzzFeed', 'Buzzfeed']],
  [5, ['zerohedge.com'], ['ZeroHedge']],
  [5, ['rt.com'], ['RT', 'Russia Today']],
  [5, ['presstv.ir'], ['Press TV']],
];

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** @type {Map<string,{key:string,tier:number}>} */
const BY_DOMAIN = new Map();
/** @type {Map<string,{key:string,tier:number}>} */
const BY_NAME = new Map();

for (const [tier, domains, names] of ROWS) {
  const row = { key: domains[0], tier };
  for (const d of domains) BY_DOMAIN.set(d, row);
  for (const n of names) BY_NAME.set(normName(n), row);
}

/** Every outlet row as `{ key, tier, reliability, baseline }` (for tests and tooling). */
export function listOutlets() {
  const seen = new Set();
  const out = [];
  for (const row of BY_DOMAIN.values()) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    const reliability = TIER_RELIABILITY[row.tier];
    out.push({ key: row.key, tier: row.tier, reliability, baseline: baselineFor(reliability) });
  }
  return out;
}

/** Walk `a.b.example.com` -> `b.example.com` -> `example.com` through a Map lookup (no object keys). */
function lookupHost(host) {
  let h = host;
  while (h) {
    const hit = BY_DOMAIN.get(h);
    if (hit) return hit;
    const i = h.indexOf('.');
    if (i < 0) break;
    h = h.slice(i + 1);
  }
  return null;
}

/**
 * Resolve an article to its outlet: link host first, then source name aliases,
 * then (unknown outlet) a trust-derived prior. Never throws.
 * @returns {{ key:string|null, tier:number|null, reliability:number, known:boolean, via:'domain'|'name'|'trust'|'default' }}
 */
export function resolveOutlet(article) {
  let host = '';
  let names = [];
  let trust;
  try { host = hostname(article?.link); } catch { host = ''; }
  try {
    names = [article?.source?.name, article?.sourceName, article?.source?.sourceName];
    trust = article?.source?.trust;
  } catch { names = []; trust = undefined; }

  const byHost = host ? lookupHost(host) : null;
  if (byHost) return found(byHost, 'domain');
  for (const n of names) {
    if (typeof n !== 'string') continue;
    const byName = BY_NAME.get(normName(n));
    if (byName) return found(byName, 'name');
  }
  if (Number.isFinite(trust)) {
    const reliability = Math.max(UNKNOWN_MIN, Math.min(UNKNOWN_MAX, trust * 4));
    return { key: null, tier: null, reliability, known: false, via: 'trust' };
  }
  return { key: null, tier: null, reliability: UNKNOWN_DEFAULT, known: false, via: 'default' };
}

function found(row, via) {
  return { key: row.key, tier: row.tier, reliability: TIER_RELIABILITY[row.tier], known: true, via };
}

/** The outlet layer's points for an article: identical wherever the article is scored. */
export function outletBaseline(article) {
  return baselineFor(resolveOutlet(article).reliability);
}

/** Hosts whose own releases are primary regulatory/central-bank sources (used by the finance regulatory layer). */
export function isRegulatorHost(link) {
  const host = hostname(link);
  const row = host ? lookupHost(host) : null;
  return !!row && row.tier === 1 && REGULATOR_KEYS.has(row.key);
}

const REGULATOR_KEYS = new Set([
  'sec.gov', 'cftc.gov', 'federalreserve.gov', 'treasury.gov', 'fdic.gov', 'finra.org',
  'ecb.europa.eu', 'esma.europa.eu', 'bankofengland.co.uk', 'boj.or.jp', 'bis.org',
  'sebi.gov.in', 'rbi.org.in',
]);
