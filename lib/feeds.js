/**
 * Feed registry for The Meridian Brief.
 *
 * Every source is free to consume — standard public RSS/Atom feeds, no API
 * key required. Each source carries two numbers used by the scoring
 * algorithm (see lib/score.js):
 *
 *   trust      0–20  baseline editorial reliability of the outlet
 *   authority  0–10  topical authority for the edition it appears under
 *                    (a markets desk knows markets; a world desk knows wars)
 *
 * Optional paid-tier upgrade: if FINNHUB_API_KEY is set in the environment,
 * Finnhub's free-tier market news endpoint is merged into the finance
 * edition (60 calls/min free). The app works fully without it.
 */

export const EDITIONS = {
  geopolitics: [
    {
      name: 'BBC World',
      url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
      trust: 19,
      authority: 8,
    },
    {
      name: 'Al Jazeera',
      url: 'https://www.aljazeera.com/xml/rss/all.xml',
      trust: 16,
      authority: 8,
    },
    {
      name: 'France 24',
      url: 'https://www.france24.com/en/rss',
      trust: 16,
      authority: 7,
    },
    {
      name: 'Foreign Policy',
      url: 'https://foreignpolicy.com/feed/',
      trust: 17,
      authority: 10,
    },
    {
      name: 'The Guardian World',
      url: 'https://www.theguardian.com/world/rss',
      trust: 17,
      authority: 7,
    },
    {
      name: 'NYT World',
      url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
      trust: 19,
      authority: 8,
    },
    {
      name: 'Deutsche Welle',
      url: 'https://rss.dw.com/rdf/rss-en-world',
      trust: 16,
      authority: 7,
    },
  ],

  finance: [
    {
      // Startup funding rounds & venture capital
      name: 'TechCrunch Venture',
      url: 'https://techcrunch.com/category/venture/feed/',
      trust: 15,
      authority: 9,
    },
    {
      // The reference desk for fundings, M&A and unicorn rounds
      name: 'Crunchbase News',
      url: 'https://news.crunchbase.com/feed/',
      trust: 16,
      authority: 10,
    },
    {
      // Key stock-market movers (Dow Jones newsroom)
      name: 'MarketWatch',
      url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
      trust: 17,
      authority: 10,
    },
    {
      name: 'CNBC Markets',
      url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
      trust: 16,
      authority: 9,
    },
    {
      name: 'Yahoo Finance',
      url: 'https://finance.yahoo.com/news/rssindex',
      trust: 13,
      authority: 7,
    },
    {
      name: 'Fortune',
      url: 'https://fortune.com/feed/',
      trust: 15,
      authority: 7,
    },
    {
      // European startup ecosystem coverage — keeps the feed global
      name: 'Sifted',
      url: 'https://sifted.eu/feed',
      trust: 14,
      authority: 8,
    },
    {
      name: 'Investing.com',
      url: 'https://www.investing.com/rss/news.rss',
      trust: 12,
      authority: 7,
    },
    {
      name: 'Fox Business Markets',
      url: 'https://moxie.foxbusiness.com/google-publisher/markets.xml',
      trust: 12,
      authority: 6,
    },
  ],
};

export const FINNHUB_ENDPOINT = 'https://finnhub.io/api/v1/news?category=general';
