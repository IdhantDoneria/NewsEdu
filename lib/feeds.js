/**
 * Feed registry for The Meridian Brief.
 *
 * Every source is free to consume — standard public RSS/Atom feeds, no API
 * key required. Each source carries:
 *
 *   trust      0–20  baseline editorial reliability of the outlet
 *   authority  0–10  topical authority for the edition it appears under
 *                    (a markets desk knows markets; a world desk knows wars)
 *   region     home region of the outlet (see REGIONS) — drives the regional
 *                    share stat and lets us audit geographic balance
 *
 * trust/authority are the registry fallback; the scoring layer's domain table
 * (lib/scoring) takes precedence for hosts it knows. Treat them as priors, not
 * as bias labels.
 *
 * Optional per-source fields:
 *   altUrls      fallback feed URLs tried in order when `url` fails
 *   maxItems     keep at most this many (newest-first) items from the feed
 *   wire         true for news agencies (at least one per edition)
 *   stripSource  outlet name to strip from a trailing " - Name" in titles
 *                (Google News RSS bakes the publisher into every headline)
 *   noSummary    the feed's description is not article text (Google News
 *                puts a link list there) so it is discarded
 *
 * Feeds fail independently and non-fatally: a dead or blocked feed is reported
 * in the payload's `feeds` status list and the rest of the brief is unaffected.
 *
 * Optional paid-tier upgrade: if FINNHUB_API_KEY is set in the environment,
 * Finnhub's free-tier market news endpoint is merged into the finance
 * edition (60 calls/min free). The app works fully without it.
 */

export const REGIONS = [
  'north-america',
  'europe',
  'middle-east',
  'asia-pacific',
  'india',
  'south-asia',
  'africa',
  'latin-america',
  'global',
];

const GOOGLE_NEWS = (q) =>
  `https://news.google.com/rss/search?q=${q}+when:1d&hl=en-US&gl=US&ceid=US:en`;

export const EDITIONS = {
  geopolitics: [
    // --- Wires ---------------------------------------------------------
    {
      name: 'Reuters',
      url: GOOGLE_NEWS('site:reuters.com+world'),
      trust: 19,
      authority: 9,
      region: 'global',
      wire: true,
      stripSource: 'Reuters',
      noSummary: true,
      maxItems: 25,
    },
    {
      name: 'AP News',
      url: GOOGLE_NEWS('site:apnews.com'),
      trust: 19,
      authority: 9,
      region: 'global',
      wire: true,
      stripSource: 'AP News',
      noSummary: true,
      maxItems: 25,
    },
    {
      name: 'UPI World',
      url: 'https://rss.upi.com/news/world_news.rss',
      trust: 13,
      authority: 6,
      region: 'north-america',
      wire: true,
      maxItems: 20,
    },

    // --- North America / Europe / Middle East --------------------------
    {
      name: 'BBC World',
      url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
      trust: 19,
      authority: 8,
      region: 'europe',
    },
    {
      name: 'Al Jazeera',
      url: 'https://www.aljazeera.com/xml/rss/all.xml',
      trust: 16,
      authority: 8,
      region: 'middle-east',
    },
    {
      name: 'France 24',
      url: 'https://www.france24.com/en/rss',
      trust: 16,
      authority: 7,
      region: 'europe',
    },
    {
      name: 'Foreign Policy',
      url: 'https://foreignpolicy.com/feed/',
      trust: 17,
      authority: 10,
      region: 'north-america',
    },
    {
      // The bare /world/rss URL was found failing in the audit; the regional
      // desk feeds are the fallbacks.
      name: 'The Guardian World',
      url: 'https://www.theguardian.com/world/rss',
      altUrls: [
        'https://www.theguardian.com/world/rss.xml',
        'https://www.theguardian.com/world/europe-news/rss',
      ],
      trust: 17,
      authority: 7,
      region: 'europe',
    },
    {
      name: 'NYT World',
      url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
      trust: 19,
      authority: 8,
      region: 'north-america',
    },
    {
      name: 'Deutsche Welle',
      url: 'https://rss.dw.com/rdf/rss-en-world',
      trust: 16,
      authority: 7,
      region: 'europe',
    },

    // --- India / South Asia --------------------------------------------
    {
      name: 'The Hindu',
      url: 'https://www.thehindu.com/news/international/feeder/default.rss',
      trust: 17,
      authority: 8,
      region: 'india',
      maxItems: 25,
    },
    {
      name: 'Hindustan Times World',
      url: 'https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml',
      trust: 14,
      authority: 6,
      region: 'india',
      maxItems: 25,
    },
    {
      name: 'Indian Express World',
      url: 'https://indianexpress.com/section/world/feed/',
      trust: 15,
      authority: 6,
      region: 'india',
      maxItems: 25,
    },
    {
      name: 'Dawn',
      url: 'https://www.dawn.com/feeds/home',
      trust: 15,
      authority: 7,
      region: 'south-asia',
      maxItems: 25,
    },

    // --- Asia-Pacific --------------------------------------------------
    {
      name: 'South China Morning Post',
      url: 'https://www.scmp.com/rss/91/feed',
      altUrls: ['https://www.scmp.com/rss/5/feed'],
      trust: 15,
      authority: 8,
      region: 'asia-pacific',
      maxItems: 25,
    },
    {
      name: 'Channel NewsAsia',
      url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511',
      altUrls: ['https://www.straitstimes.com/news/asia/rss.xml'],
      trust: 16,
      authority: 7,
      region: 'asia-pacific',
      maxItems: 25,
    },
    {
      // (Nikkei Asia's feed carries no dates, so it cannot be ranked.)
      name: 'The Japan Times',
      url: 'https://www.japantimes.co.jp/feed/',
      trust: 16,
      authority: 6,
      region: 'asia-pacific',
      maxItems: 20,
    },
    {
      name: 'The Diplomat',
      url: 'https://thediplomat.com/feed/',
      trust: 15,
      authority: 10,
      region: 'asia-pacific',
      maxItems: 20,
    },
    {
      name: 'ABC News Australia',
      url: 'https://www.abc.net.au/news/feed/2942460/rss.xml',
      trust: 17,
      authority: 6,
      region: 'asia-pacific',
      maxItems: 20,
    },

    // --- Africa --------------------------------------------------------
    {
      name: 'Africanews',
      url: 'https://www.africanews.com/feed/rss',
      trust: 14,
      authority: 7,
      region: 'africa',
      maxItems: 25,
    },
    {
      name: 'Daily Maverick',
      url: 'https://www.dailymaverick.co.za/dmrss/',
      trust: 15,
      authority: 6,
      region: 'africa',
      maxItems: 20,
    },
    {
      name: 'Premium Times',
      url: 'https://www.premiumtimesng.com/feed',
      trust: 13,
      authority: 5,
      region: 'africa',
      maxItems: 15,
    },

    // --- Latin America -------------------------------------------------
    {
      name: 'Buenos Aires Times',
      url: 'https://www.batimes.com.ar/feed',
      trust: 13,
      authority: 6,
      region: 'latin-america',
      maxItems: 20,
    },
    {
      name: 'MercoPress',
      url: 'https://en.mercopress.com/rss',
      altUrls: ['https://en.mercopress.com/rss/'],
      trust: 12,
      authority: 6,
      region: 'latin-america',
      maxItems: 15,
    },
    {
      name: 'Mexico News Daily',
      url: 'https://mexiconewsdaily.com/feed/',
      trust: 13,
      authority: 5,
      region: 'latin-america',
      maxItems: 10,
    },
  ],

  finance: [
    // --- Wires ---------------------------------------------------------
    {
      name: 'Bloomberg Markets',
      url: 'https://feeds.bloomberg.com/markets/news.rss',
      trust: 18,
      authority: 10,
      region: 'north-america',
      wire: true,
      maxItems: 20,
    },
    {
      name: 'Reuters Business',
      url: GOOGLE_NEWS('site:reuters.com+markets'),
      trust: 19,
      authority: 9,
      region: 'global',
      wire: true,
      stripSource: 'Reuters',
      noSummary: true,
      maxItems: 25,
    },
    {
      name: 'UPI Business',
      url: 'https://rss.upi.com/news/business_news.rss',
      trust: 13,
      authority: 6,
      region: 'north-america',
      wire: true,
      maxItems: 15,
    },

    // --- North America / Europe ----------------------------------------
    {
      // Startup funding rounds & venture capital
      name: 'TechCrunch Venture',
      url: 'https://techcrunch.com/category/venture/feed/',
      trust: 15,
      authority: 9,
      region: 'north-america',
    },
    {
      // The reference desk for fundings, M&A and unicorn rounds
      name: 'Crunchbase News',
      url: 'https://news.crunchbase.com/feed/',
      trust: 16,
      authority: 10,
      region: 'north-america',
    },
    {
      // Key stock-market movers (Dow Jones newsroom)
      name: 'MarketWatch',
      url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
      altUrls: ['https://feeds.content.dowjones.io/public/rss/mw_marketpulse'],
      trust: 17,
      authority: 10,
      region: 'north-america',
    },
    {
      name: 'CNBC Markets',
      url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
      altUrls: [
        'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362',
      ],
      trust: 16,
      authority: 9,
      region: 'north-america',
    },
    {
      // finance.yahoo.com/news/rssindex returned 404/429 in the audit; the
      // news.yahoo.com finance feed is the fallback.
      name: 'Yahoo Finance',
      url: 'https://finance.yahoo.com/news/rssindex',
      altUrls: ['https://finance.yahoo.com/rss/', 'https://news.yahoo.com/rss/finance'],
      trust: 13,
      authority: 7,
      region: 'north-america',
      maxItems: 25,
    },
    {
      name: 'Fortune',
      url: 'https://fortune.com/feed/',
      trust: 15,
      authority: 7,
      region: 'north-america',
    },
    {
      name: 'Investing.com',
      url: 'https://www.investing.com/rss/news.rss',
      trust: 12,
      authority: 7,
      region: 'global',
    },
    {
      // The moxie.foxbusiness.com markets feed was unreachable in the audit.
      name: 'Fox Business Markets',
      url: 'https://moxie.foxbusiness.com/google-publisher/markets.xml',
      altUrls: [
        'https://feeds.foxbusiness.com/foxbusiness/latest',
        'https://moxie.foxbusiness.com/google-publisher/latest.xml',
      ],
      trust: 12,
      authority: 6,
      region: 'north-america',
      maxItems: 20,
    },
    {
      // European startup ecosystem coverage — keeps the feed global
      name: 'Sifted',
      url: 'https://sifted.eu/feed',
      trust: 14,
      authority: 8,
      region: 'europe',
    },
    {
      name: 'BBC Business',
      url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
      trust: 19,
      authority: 7,
      region: 'europe',
      maxItems: 25,
    },

    // --- India ---------------------------------------------------------
    {
      name: 'Economic Times Markets',
      url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
      altUrls: ['https://economictimes.indiatimes.com/rssfeedstopstories.cms'],
      trust: 15,
      authority: 9,
      region: 'india',
      maxItems: 25,
    },
    {
      name: 'Mint Markets',
      url: 'https://www.livemint.com/rss/markets',
      altUrls: ['https://www.livemint.com/rss/companies'],
      trust: 15,
      authority: 9,
      region: 'india',
      maxItems: 25,
    },
    {
      name: 'Moneycontrol',
      url: 'https://www.moneycontrol.com/rss/business.xml',
      altUrls: ['https://www.moneycontrol.com/rss/MCtopnews.xml'],
      trust: 14,
      authority: 8,
      region: 'india',
      maxItems: 20,
    },
    {
      name: 'The Hindu BusinessLine',
      url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss',
      altUrls: ['https://www.thehindubusinessline.com/feeder/default.rss'],
      trust: 16,
      authority: 9,
      region: 'india',
      maxItems: 20,
    },
    {
      name: 'Hindustan Times Business',
      url: 'https://www.hindustantimes.com/feeds/rss/business/rssfeed.xml',
      trust: 14,
      authority: 6,
      region: 'india',
      maxItems: 15,
    },

    // --- Asia-Pacific --------------------------------------------------
    {
      name: 'SCMP Business',
      url: 'https://www.scmp.com/rss/92/feed',
      altUrls: ['https://www.scmp.com/rss/318421/feed'],
      trust: 15,
      authority: 8,
      region: 'asia-pacific',
      maxItems: 25,
    },
    {
      name: 'Channel NewsAsia Business',
      url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6936',
      altUrls: ['https://www.straitstimes.com/news/business/rss.xml'],
      trust: 16,
      authority: 8,
      region: 'asia-pacific',
      maxItems: 20,
    },
    {
      name: 'ABC News Australia Business',
      url: 'https://www.abc.net.au/news/feed/51120/rss.xml',
      trust: 17,
      authority: 7,
      region: 'asia-pacific',
      maxItems: 15,
    },

    // --- Africa --------------------------------------------------------
    {
      name: 'Moneyweb',
      url: 'https://www.moneyweb.co.za/feed/',
      trust: 14,
      authority: 8,
      region: 'africa',
      maxItems: 10,
    },
    {
      name: 'Nairametrics',
      url: 'https://nairametrics.com/feed/',
      trust: 12,
      authority: 7,
      region: 'africa',
      maxItems: 15,
    },
    {
      name: 'TechCabal',
      url: 'https://techcabal.com/feed/',
      trust: 13,
      authority: 7,
      region: 'africa',
      maxItems: 10,
    },

    // --- Latin America -------------------------------------------------
    {
      name: 'LatamList',
      url: 'https://latamlist.com/feed/',
      trust: 12,
      authority: 7,
      region: 'latin-america',
      maxItems: 10,
    },
    {
      name: 'The Rio Times',
      url: 'https://www.riotimesonline.com/feed/',
      trust: 11,
      authority: 5,
      region: 'latin-america',
      maxItems: 10,
    },
  ],
};

export const FINNHUB_ENDPOINT = 'https://finnhub.io/api/v1/news?category=general';

/** Region tag for a source name in an edition (null when unknown, e.g. Finnhub). */
export function regionOf(edition, sourceName) {
  return EDITIONS[edition]?.find((s) => s.name === sourceName)?.region ?? null;
}
