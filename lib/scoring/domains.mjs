/**
 * Trusted-domain databases used by Layer 1 of each pipeline.
 *
 * The maps are keyed by bare hostname (`www.` stripped). Values are the
 * initial baseline scores on the 0-100 scale.
 *
 * BASELINE DESIGN NOTE
 * ────────────────────
 * Baselines are deliberately calibrated so that a well-sourced article's
 * bonuses (L2/L5/L6/L7 can each contribute 10-20 pts) can push it toward
 * — but not through — the 100 ceiling. If every top-tier outlet started at
 * 90+, every breaking-news article would saturate at 100 and the L10 clamp
 * would collapse the ranking. Values here + typical bonus stack should
 * produce a spread in the 60-99 range across the daily feed.
 *
 * These are curated defaults — they should be tuned over time from real
 * performance data. For any domain we don't recognise, the pipeline falls
 * back to the source object's `trust`/`authority` numbers (from lib/feeds.js).
 */

export const GEOPOLITICS_TRUSTED_DOMAINS = Object.freeze({
  // Wire services & global desks with strong foreign-affairs coverage
  'reuters.com': 78,
  'apnews.com': 78,
  'bbc.co.uk': 74,
  'bbc.com': 74,
  'nytimes.com': 74,
  'ft.com': 72,
  'wsj.com': 70,
  'washingtonpost.com': 70,
  'economist.com': 72,
  'foreignpolicy.com': 70,
  'foreignaffairs.com': 70,
  'theguardian.com': 66,
  'lemonde.fr': 66,
  'aljazeera.com': 64,
  'dw.com': 62,
  'france24.com': 62,
  'npr.org': 64,
  'politico.com': 60,
  'axios.com': 58,
  'atlanticcouncil.org': 66,
  'cfr.org': 68,
  'chathamhouse.org': 68,
  'un.org': 72,
  'nato.int': 72,
  'europa.eu': 70,
});

export const FINANCE_TRUSTED_DOMAINS = Object.freeze({
  // Regulators & central banks — the highest-signal primary sources
  'sec.gov': 100,
  'cftc.gov': 98,
  'federalreserve.gov': 100,
  'treasury.gov': 96,
  'ecb.europa.eu': 98,
  'bankofengland.co.uk': 96,
  'boj.or.jp': 96,
  'finra.org': 92,
  'fdic.gov': 94,
  'oecd.org': 90,
  'imf.org': 94,
  'worldbank.org': 90,

  // Institutional research desks & wire services
  'bloomberg.com': 92,
  'reuters.com': 92,
  'ft.com': 90,
  'wsj.com': 90,
  'economist.com': 88,
  'barrons.com': 84,

  // Markets desks
  'marketwatch.com': 82,
  'cnbc.com': 78,
  'seekingalpha.com': 70,
  'nasdaq.com': 82,
  'nyse.com': 82,

  // Venture / private-market intelligence
  'news.crunchbase.com': 78,
  'crunchbase.com': 78,
  'pitchbook.com': 84,
  'sifted.eu': 72,
  'techcrunch.com': 68,

  // General finance media (lower weighted)
  'finance.yahoo.com': 68,
  'yahoo.com': 62,
  'fortune.com': 70,
  'investing.com': 66,
  'foxbusiness.com': 62,
  'businessinsider.com': 60,
});
