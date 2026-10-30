/**
 * Shared vocabulary for both scoring pipelines.
 *
 * Recall fixes live here: demonyms and plurals, US/UK/USA, capitals and
 * territories, case-insensitive organisations and leaders (acronyms stay
 * case-sensitive so "who" and "un" never match), context-gated ambiguous
 * names (Georgia, Jordan, Chile, Turkey) and the Indian market lexicon.
 *
 * Everything is compiled once at module load. Matching returns canonical
 * keys, so "Russian", "Russians" and "Russia" are one entity.
 */

import { distinctSpans } from './spans.mjs';

const L = '\\p{L}';
const wrap = (alt) => `(?<!${L}|\\d)(?:${alt})(?!${L}|\\d)`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');

/** Build { re, map } for a `{ key: [variants] }` table. Longest variants win. */
function lexicon(table, flags) {
  const map = new Map();
  const originals = [];
  for (const [key, variants] of Object.entries(table)) {
    for (const v of variants) {
      map.set(norm(v), key);
      originals.push(v);
    }
  }
  // The pattern keeps the original spelling so case-sensitive tables really are.
  const alts = originals
    .sort((a, b) => b.length - a.length)
    .map((v) => esc(v.replace(/’/g, "'")).replace(/'/g, "['’]"));
  return { re: new RegExp(wrap(alts.join('|')), flags), map };
}

/* ------------------------------ Countries ------------------------------ */

const COUNTRIES = {
  russia: ['Russia', 'Russian', 'Russians', 'Moscow', 'Russia’s'],
  china: ['China', 'Chinese', 'Beijing', 'PRC'],
  india: ['India', 'Indian', 'Indians', 'New Delhi', 'Delhi', 'Mumbai'],
  ukraine: ['Ukraine', 'Ukrainian', 'Ukrainians', 'Kyiv', 'Kiev', 'Donbas', 'Donbass', 'Crimea'],
  israel: ['Israel', 'Israeli', 'Israelis', 'Jerusalem', 'Tel Aviv'],
  iran: ['Iran', 'Iranian', 'Iranians', 'Tehran'],
  iraq: ['Iraq', 'Iraqi', 'Iraqis', 'Baghdad'],
  syria: ['Syria', 'Syrian', 'Syrians', 'Damascus'],
  yemen: ['Yemen', 'Yemeni', 'Yemenis'],
  palestine: ['Gaza', 'Palestine', 'Palestinian', 'Palestinians', 'West Bank', 'Rafah', 'Ramallah'],
  lebanon: ['Lebanon', 'Lebanese', 'Beirut'],
  egypt: ['Egypt', 'Egyptian', 'Egyptians', 'Cairo'],
  turkey: ['Turkiye', 'Türkiye', 'Turkish', 'Ankara'],
  saudi: ['Saudi Arabia', 'Saudi', 'Saudis', 'Riyadh'],
  uae: ['UAE', 'United Arab Emirates', 'Emirati', 'Emiratis', 'Abu Dhabi', 'Dubai'],
  qatar: ['Qatar', 'Qatari', 'Qataris', 'Doha'],
  kuwait: ['Kuwait', 'Kuwaiti'],
  oman: ['Oman', 'Omani'],
  bahrain: ['Bahrain', 'Bahraini'],
  afghanistan: ['Afghanistan', 'Afghan', 'Afghans', 'Kabul'],
  pakistan: ['Pakistan', 'Pakistani', 'Pakistanis', 'Islamabad'],
  bangladesh: ['Bangladesh', 'Bangladeshi', 'Dhaka'],
  srilanka: ['Sri Lanka', 'Sri Lankan', 'Colombo'],
  nepal: ['Nepal', 'Nepali', 'Nepalese', 'Kathmandu'],
  bhutan: ['Bhutan'],
  maldives: ['Maldives', 'Maldivian'],
  vietnam: ['Vietnam', 'Vietnamese', 'Hanoi'],
  taiwan: ['Taiwan', 'Taiwanese', 'Taipei'],
  thailand: ['Thailand', 'Thai', 'Bangkok'],
  indonesia: ['Indonesia', 'Indonesian', 'Indonesians', 'Jakarta'],
  malaysia: ['Malaysia', 'Malaysian', 'Malaysians', 'Kuala Lumpur'],
  singapore: ['Singapore', 'Singaporean'],
  philippines: ['Philippines', 'Philippine', 'Filipino', 'Filipinos', 'Manila'],
  japan: ['Japan', 'Japanese', 'Tokyo'],
  northkorea: ['North Korea', 'North Korean', 'Pyongyang', 'DPRK'],
  southkorea: ['South Korea', 'South Korean', 'Seoul'],
  korea: ['Korea', 'Korean', 'Koreans'],
  myanmar: ['Myanmar', 'Burma', 'Burmese'],
  laos: ['Laos', 'Laotian'],
  cambodia: ['Cambodia', 'Cambodian', 'Phnom Penh'],
  mongolia: ['Mongolia', 'Mongolian'],
  hongkong: ['Hong Kong', 'Hongkong'],
  tibet: ['Tibet', 'Tibetan', 'Xinjiang'],
  kashmir: ['Kashmir', 'Kashmiri'],
  kazakhstan: ['Kazakhstan', 'Kazakh'],
  uzbekistan: ['Uzbekistan', 'Uzbek'],
  armenia: ['Armenia', 'Armenian', 'Armenians', 'Yerevan'],
  azerbaijan: ['Azerbaijan', 'Azerbaijani', 'Baku'],
  belarus: ['Belarus', 'Belarusian', 'Minsk'],
  poland: ['Poland', 'Polish', 'Warsaw'],
  germany: ['Germany', 'German', 'Germans', 'Berlin'],
  france: ['France', 'French', 'Paris'],
  uk: ['Britain', 'British', 'Briton', 'Britons', 'United Kingdom', 'UK', 'U.K.', 'London'],
  us: ['United States', 'America', 'American', 'Americans', 'USA', 'US', 'U.S.', 'U.S.A.'],
  canada: ['Canada', 'Canadian', 'Canadians', 'Ottawa'],
  mexico: ['Mexico', 'Mexican', 'Mexicans'],
  brazil: ['Brazil', 'Brazilian', 'Brazilians', 'Brasilia'],
  argentina: ['Argentina', 'Argentine', 'Argentinian', 'Argentinians', 'Buenos Aires'],
  colombia: ['Colombia', 'Colombian', 'Colombians', 'Bogota'],
  venezuela: ['Venezuela', 'Venezuelan', 'Venezuelans', 'Caracas'],
  peru: ['Peru', 'Peruvian', 'Peruvians', 'Lima'],
  ecuador: ['Ecuador', 'Ecuadorian'],
  bolivia: ['Bolivia', 'Bolivian'],
  cuba: ['Cuba', 'Cuban', 'Cubans', 'Havana'],
  haiti: ['Haiti', 'Haitian', 'Haitians'],
  panama: ['Panama', 'Panamanian'],
  elsalvador: ['El Salvador', 'Salvadoran'],
  honduras: ['Honduras', 'Honduran'],
  guatemala: ['Guatemala', 'Guatemalan'],
  nicaragua: ['Nicaragua', 'Nicaraguan'],
  paraguay: ['Paraguay', 'Paraguayan'],
  uruguay: ['Uruguay', 'Uruguayan'],
  nigeria: ['Nigeria', 'Nigerian', 'Nigerians', 'Abuja', 'Lagos'],
  kenya: ['Kenya', 'Kenyan', 'Kenyans', 'Nairobi'],
  ethiopia: ['Ethiopia', 'Ethiopian', 'Ethiopians', 'Tigray', 'Addis Ababa'],
  sudan: ['Sudan', 'Sudanese', 'Khartoum', 'Darfur'],
  southsudan: ['South Sudan'],
  somalia: ['Somalia', 'Somali', 'Somalis', 'Mogadishu'],
  libya: ['Libya', 'Libyan', 'Libyans', 'Tripoli'],
  algeria: ['Algeria', 'Algerian', 'Algiers'],
  morocco: ['Morocco', 'Moroccan', 'Rabat'],
  tunisia: ['Tunisia', 'Tunisian'],
  ghana: ['Ghana', 'Ghanaian'],
  senegal: ['Senegal', 'Senegalese'],
  mali: ['Mali', 'Malian'],
  congo: ['Congo', 'Congolese', 'Kinshasa'],
  rwanda: ['Rwanda', 'Rwandan'],
  uganda: ['Uganda', 'Ugandan'],
  tanzania: ['Tanzania', 'Tanzanian'],
  zimbabwe: ['Zimbabwe', 'Zimbabwean'],
  angola: ['Angola', 'Angolan'],
  mozambique: ['Mozambique', 'Mozambican'],
  southafrica: ['South Africa', 'South African', 'South Africans', 'Pretoria'],
  australia: ['Australia', 'Australian', 'Australians', 'Canberra'],
  newzealand: ['New Zealand', 'New Zealander', 'Wellington'],
  italy: ['Italy', 'Italian', 'Italians', 'Rome'],
  spain: ['Spain', 'Spanish', 'Madrid'],
  portugal: ['Portugal', 'Portuguese', 'Lisbon'],
  netherlands: ['Netherlands', 'Dutch', 'Holland'],
  belgium: ['Belgium', 'Belgian', 'Belgians'],
  switzerland: ['Switzerland', 'Swiss'],
  sweden: ['Sweden', 'Swedish', 'Stockholm'],
  norway: ['Norway', 'Norwegian', 'Oslo'],
  finland: ['Finland', 'Finnish', 'Helsinki'],
  denmark: ['Denmark', 'Danish', 'Copenhagen'],
  ireland: ['Ireland', 'Irish', 'Dublin'],
  greece: ['Greece', 'Greek', 'Greeks', 'Athens'],
  hungary: ['Hungary', 'Hungarian', 'Budapest'],
  romania: ['Romania', 'Romanian'],
  serbia: ['Serbia', 'Serbian', 'Belgrade'],
  kosovo: ['Kosovo'],
  croatia: ['Croatia', 'Croatian'],
  slovenia: ['Slovenia', 'Slovenian'],
  czechia: ['Czechia', 'Czech Republic', 'Czech', 'Prague'],
  slovakia: ['Slovakia', 'Slovak'],
  bulgaria: ['Bulgaria', 'Bulgarian'],
  austria: ['Austria', 'Austrian', 'Vienna'],
  estonia: ['Estonia', 'Estonian'],
  latvia: ['Latvia', 'Latvian'],
  lithuania: ['Lithuania', 'Lithuanian'],
  moldova: ['Moldova', 'Moldovan'],
  cyprus: ['Cyprus', 'Cypriot'],
  malta: ['Malta', 'Maltese'],
  iceland: ['Iceland', 'Icelandic'],
  greenland: ['Greenland'],
  // regions that behave like geopolitical actors in headlines
  middleeast: ['Middle East', 'Gulf states', 'Persian Gulf', 'Levant'],
  africa: ['Africa', 'African', 'Africans', 'Sahel'],
  europe: ['Europe', 'European', 'Europeans', 'Brussels'],
  asia: ['Southeast Asia', 'Asia-Pacific', 'Indo-Pacific', 'South Asia'],
  latam: ['Latin America', 'Latin American', 'Caribbean'],
};

// Case-sensitive tokens: short acronyms that collide with ordinary words.
const COUNTRY_ACRONYMS = new Set(['uae', 'prc', 'dprk', 'uk', 'u.k.', 'usa', 'us', 'u.s.', 'u.s.a.']);
const countryAll = lexicon(COUNTRIES, 'giu');
// Words that are also ordinary nouns/verbs/names in lowercase: count only when capitalised.
const CAPITAL_ONLY = new Set(['polish', 'danish', 'dutch', 'greek', 'french', 'irish', 'swiss', 'thai', 'czech', 'spanish', 'holland', 'mali', 'lima', 'rome', 'doha', 'wellington', 'paris', 'london', 'athens', 'vance', 'marcos', 'abbas', 'fico', 'tusk', 'merz', 'lula', 'sisi', 'warsh', 'carney', 'rubio', 'assad', 'fatah']);
// Dotted forms (U.S., U.K.) cannot use the letter-boundary wrapper's trailing dot safely; match them explicitly.
const DOTTED = /(?<![\p{L}\d])(U\.S\.A?\.?|U\.K\.)(?![\p{L}\d])/gu;

// Ambiguous names that count only with supporting context.
const AMBIGUOUS = {
  georgia: {
    words: new Set(['georgia', 'georgian', 'georgians']),
    key: 'georgia',
    cue: /\b(Tbilisi|Caucasus|Abkhazia|South Ossetia|Georgian Dream|Kobakhidze|Kavelashvili|Ivanishvili|Saakashvili|Zourabichvili|Batumi|Black Sea)\b/,
  },
  jordan: {
    words: new Set(['jordan', 'jordanian', 'jordanians']),
    key: 'jordan',
    cue: /\b(Amman|Hashemite|King Abdullah|Aqaba|Queen Rania|West Bank|Gaza|Israel\w*|Syria\w*|Iraq\w*|Saudi\w*|Palestin\w+|Arab\w*|Middle East)\b/,
    alwaysWords: new Set(['jordanian', 'jordanians']),
  },
  chile: {
    words: new Set(['chile']),
    key: 'chile',
    needsCapital: true,
    notBefore: /^\s+(pepper|peppers|relleno|verde|powder|oil|con carne|sauce|crisp|paste|flakes)\b/i,
  },
  turkey: {
    words: new Set(['turkey']),
    key: 'turkey',
    needsCapital: true,
    notBefore: /^\s+(breast|leg|legs|sandwich|dinner|farm|farms|farmers|bacon|trot|vulture|burger|slices?)\b/i,
    notAfter: /(thanksgiving|roast|frozen|wild|smoked|deli|christmas)\s+$/i,
  },
};
// Names that are only country-like with those guards: remove from the open lexicon above (not listed there).
// The ambiguous words are matched by their own regex.
const AMBIG_RE = /(?<![\p{L}\d])(Georgians?|Georgia|Jordanians?|Jordan|Chile|Chilean|Chileans|Turkey)(?![\p{L}\d])/giu;

const USUK_CASE = /(?<![\p{L}\d.])(US|UK)(?![\p{L}\d])/gu;

/**
 * Canonical geopolitical entities in `text` (countries, capitals, regions).
 * @returns {Set<string>}
 */
export function findPlaces(text) {
  const out = new Set();
  if (!text) return out;
  // "US"/"UK" are matched case-sensitively below; everything else case-insensitively.
  for (const m of text.matchAll(countryAll.re)) {
    const raw = m[0];
    const k = norm(raw);
    if (COUNTRY_ACRONYMS.has(k) && raw !== raw.toUpperCase()) continue; // "us", "uk", "uae" lowercase prose
    if (CAPITAL_ONLY.has(k) && raw[0] !== raw[0].toUpperCase()) continue;
    out.add(countryAll.map.get(k));
  }
  for (const m of text.matchAll(DOTTED)) out.add(m[1].startsWith('U.K') ? 'uk' : 'us');
  for (const m of text.matchAll(AMBIG_RE)) {
    const raw = m[0];
    const k = raw.toLowerCase();
    if (k === 'chilean' || k === 'chileans') { out.add('chile'); continue; }
    const rule = Object.values(AMBIGUOUS).find((r) => r.words.has(k));
    if (!rule) continue;
    if (rule.alwaysWords?.has(k)) { out.add(rule.key); continue; }
    if (rule.needsCapital && raw[0] !== raw[0].toUpperCase()) continue;
    const after = text.slice(m.index + raw.length);
    const before = text.slice(0, m.index);
    if (rule.notBefore && rule.notBefore.test(after)) continue;
    if (rule.notAfter && rule.notAfter.test(before)) continue;
    if (rule.cue && !rule.cue.test(text)) continue;
    out.add(rule.key);
  }
  return out;
}

/* ------------------------- Organisations & leaders ---------------------- */

const ORG_CASELESS = {
  un: ['United Nations', 'Security Council', 'UN Security Council'],
  eu: ['European Union', 'European Commission', 'European Parliament', 'European Council'],
  nato: ['NATO'],
  imf: ['International Monetary Fund'],
  worldbank: ['World Bank'],
  wto: ['World Trade Organization', 'World Trade Organisation'],
  opec: ['OPEC', 'OPEC+'],
  asean: ['ASEAN'],
  au: ['African Union'],
  brics: ['BRICS'],
  icc: ['International Criminal Court'],
  icj: ['International Court of Justice'],
  who: ['World Health Organization', 'World Health Organisation'],
  kremlin: ['Kremlin'],
  pentagon: ['Pentagon'],
  whitehouse: ['White House'],
  statedept: ['State Department', 'State Dept'],
  downing: ['Downing Street'],
  elysee: ['Elysee', 'Élysée'],
  bundestag: ['Bundestag'],
  politburo: ['Politburo'],
  duma: ['Duma'],
  knesset: ['Knesset'],
  hezbollah: ['Hezbollah'],
  hamas: ['Hamas'],
  houthi: ['Houthi', 'Houthis'],
  taliban: ['Taliban'],
  wagner: ['Wagner Group'],
  fatah: ['Fatah'],
  mossad: ['Mossad'],
  irgc: ['Revolutionary Guard', 'Revolutionary Guards', 'IRGC'],
  loksabha: ['Lok Sabha', 'Rajya Sabha', 'Parliament of India'],
  centralbank: [],
};
// Case-sensitive acronyms (collide with words when lowercased).
const ORG_ACRONYMS = {
  un: ['UN'], eu: ['EU'], imf: ['IMF'], who: ['WHO'], wto: ['WTO'], icc: ['ICC'], icj: ['ICJ'],
  g7: ['G7'], g20: ['G20'], osce: ['OSCE'], unsc: ['UNSC'], unhcr: ['UNHCR'], unicef: ['UNICEF'],
  unesco: ['UNESCO'], iaea: ['IAEA'], idf: ['IDF'], pla: ['PLA'], cia: ['CIA'], fbi: ['FBI'],
  au: ['AU'], sco: ['SCO'],
};
const orgCaseless = lexicon(Object.fromEntries(Object.entries(ORG_CASELESS).filter(([, v]) => v.length)), 'giu');
const orgAcr = lexicon(ORG_ACRONYMS, 'gu');

const LEADERS = {
  trump: ['Trump'], putin: ['Putin'], xi: ['Xi Jinping'], modi: ['Modi'], netanyahu: ['Netanyahu'],
  zelensky: ['Zelensky', 'Zelenskyy', 'Zelenskiy', 'Zelenskyi'], macron: ['Macron'], starmer: ['Starmer'],
  merz: ['Merz'], meloni: ['Meloni'], erdogan: ['Erdogan', 'Erdoğan'], khamenei: ['Khamenei'],
  pezeshkian: ['Pezeshkian'], lula: ['Lula'], milei: ['Milei'], sheinbaum: ['Sheinbaum'],
  carney: ['Carney'], albanese: ['Albanese'], takaichi: ['Takaichi'], ishiba: ['Ishiba'],
  kimjongun: ['Kim Jong Un', 'Kim Jong-un'], lavrov: ['Lavrov'], rubio: ['Rubio'], hegseth: ['Hegseth'],
  vance: ['Vance'], orban: ['Orban', 'Orbán'], fico: ['Fico'], tusk: ['Tusk'], abbas: ['Abbas'],
  sisi: ['el-Sisi', 'Sisi'], mbs: ['bin Salman'], ramaphosa: ['Ramaphosa'], tinubu: ['Tinubu'],
  prabowo: ['Prabowo'], marcos: ['Marcos'], maduro: ['Maduro'], bolsonaro: ['Bolsonaro'],
  biden: ['Biden'], sunak: ['Sunak'], scholz: ['Scholz'], jaishankar: ['Jaishankar'],
  sharif: ['Shehbaz Sharif'], yunus: ['Muhammad Yunus'], assad: ['Assad'], sinwar: ['Sinwar'],
  warsh: ['Warsh'], bessent: ['Bessent'],
};
const leaderLex = lexicon(LEADERS, 'giu');
// "Xi" alone is only a leader when capitalised and followed by a title cue.
const XI_ALONE = /(?<![\p{L}\d])Xi(?=\s+(?:Jinping|said|says|told|met|meets|vows|warns|calls|urges|signs|visits|will|has|and)|['’]s)(?![\p{L}\d])/gu;

/** Canonical organisations and leaders in `text`. */
export function findActors(text) {
  const out = new Set();
  if (!text) return out;
  for (const m of text.matchAll(orgCaseless.re)) out.add(orgCaseless.map.get(norm(m[0])));
  for (const m of text.matchAll(orgAcr.re)) out.add(orgAcr.map.get(norm(m[0])));
  for (const m of text.matchAll(leaderLex.re)) {
    if (CAPITAL_ONLY.has(norm(m[0])) && m[0][0] !== m[0][0].toUpperCase()) continue;
    out.add(leaderLex.map.get(norm(m[0])));
  }
  if (XI_ALONE.test(text)) out.add('xi');
  XI_ALONE.lastIndex = 0;
  return out;
}

/* ------------------------------- Statistics ----------------------------- */

export const STAT_PATTERNS = [
  /[$€£¥₹]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:trillion|tn|billion|bn|million|mn|thousand|crore|lakh|cr|k)\b)?/giu,
  /\b\d[\d,]*(?:\.\d+)?\s?(?:trillion|billion|million|crore|lakh)\b/giu,
  /\b\d+(?:\.\d+)?\s?%/g,
  /\b(?:19|20)\d{2}\b/g,
  /\b\d{1,3}(?:,\d{3})+\b/g,
  /\b\d{3,}\b/g,
];

/** Distinct numeric/currency/percentage tokens (each figure counted once). */
export function findStats(text) {
  return distinctSpans(text, STAT_PATTERNS);
}

/* --------------------------- Event / topical terms ---------------------- */

export const GEO_EVENTS = /\b(sanction(?:s|ed|ing)?|cease-?fires?|truce|treat(?:y|ies)|invad(?:e|es|ed|ing)|invasion|coup|summit|diplomat(?:ic|s|ically)?|ambassador|missiles?|airstrikes?|air\s+strikes?|embass(?:y|ies)|unrest|protest(?:s|ers|ing)?|alliance|negotiat(?:e|ed|es|ing|ion|ions)|tariffs?|troops?|blockade|militias?|referendum|extradit(?:e|ed|ion)|deport(?:ed|s|ation|ations)?|refugees?|annex(?:ed|ation)?|nuclear|regime|resolution|disputes?|hostilit(?:y|ies)|airspace|drones?|strikes?|offensive|bombard(?:ed|ment)|shell(?:ing|ed)|hostages?|prisoners?|peace\s+(?:talks?|deal|plan|process)|war|wars|warship|navy|naval|army|military|insurgen(?:t|ts|cy)|rebels?|civil\s+war|genocide|famine|humanitarian|border|migrants?|asylum|espionage|spy|spies|assassinat(?:e|ed|ion)|intelligence|election|elections|vote|voters|poll|polls|ballots?|parliament|coalition|government|minister|president|premier|chancellor|sovereign(?:ty)?|nationalis[mt]|autocra(?:cy|t)|dissident|crackdown|purges?|expel(?:led|s)?|expulsions?|arms|weapons|defen[cs]e|security\s+council|veto)\b/giu;

export const CROSS_MARKET = /\b(oil|gas|lng|crude|wheat|grain|currency|dollar|ruble|rouble|yuan|euro|shekel|rial|lira|peso|rupee|tariffs?|trade\s+war|trade\s+deal|supply\s+chains?|commodit(?:y|ies)|exports?|imports?|embargo|energy\s+(?:prices?|costs?|crisis)|sanctions?|shipping|semiconductors?|chips?|rare\s+earths?|inflation|currency)\b/giu;

export const SUBJECTIVE_ADJ = /\b(shocking|stunning|incredible|unbelievable|staggering|devastating|alarming|terrifying|heartbreaking|astonishing|outrageous|horrific|catastrophic|explosive|extraordinary|remarkable|astounding|scandalous|ridiculous|absurd|dreadful|horrendous|dire|grim|bombshell)\b/giu;

/** All distinct matches of a /g regex, lowercased. */
export function distinctMatches(text, re) {
  const out = new Set();
  if (!text) return out;
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) out.add(m[0].toLowerCase().replace(/\s+/g, ' '));
  return out;
}

/* --------------------------- Finance instruments ------------------------ */

export const CASHTAG = /\$[A-Z]{1,5}\b/g;
export const EXCHANGE_TICKER = /\((?:NYSE|NASDAQ|LSE|TSX|HKEX|SSE|SZSE|BSE|NSE|JPX|ASX|TSE|SGX)\s?:\s?[A-Z0-9.&-]{1,12}\)/g;
// "Apple (AAPL)" style; common non-ticker acronyms are excluded.
export const PAREN_TICKER = /\(([A-Z]{2,5})\)/g;
const NOT_TICKERS = new Set(['US', 'UK', 'EU', 'UN', 'AI', 'CEO', 'CFO', 'IPO', 'ETF', 'GDP', 'CPI', 'PPI', 'FOMC', 'SEC', 'FED', 'ECB', 'RBI', 'IMF', 'OPEC', 'NATO', 'USA', 'UAE', 'LLC', 'INC', 'PLC', 'ESG', 'FAQ', 'PDF', 'PMI', 'EPS', 'AGM', 'M&A', 'QE', 'QT', 'SIP', 'FII', 'DII', 'FPI']);

export const CURRENCY_PAIRS = /\b(?:USD|EUR|JPY|GBP|CNY|AUD|CHF|CAD|INR|NZD)\s?\/\s?(?:USD|EUR|JPY|GBP|CNY|AUD|CHF|CAD|INR|NZD)\b/g;

const FIN_INSTRUMENT_TABLE = {
  wti: ['WTI'], brent: ['Brent'], crude: ['crude oil', 'crude'], natgas: ['natural gas'],
  gold: ['gold'], silver: ['silver'], copper: ['copper'], platinum: ['platinum'], palladium: ['palladium'],
  corn: ['corn'], soybean: ['soybean', 'soybeans'], wheat: ['wheat'], cocoa: ['cocoa'], coffee: ['coffee'],
  bitcoin: ['Bitcoin', 'BTC'], ether: ['Ethereum', 'Ether', 'ETH'], crypto: ['crypto', 'cryptocurrency', 'stablecoin', 'stablecoins'],
  sp500: ['S&P 500', 'S&P500', 'S&P'], dow: ['Dow Jones', 'the Dow', 'Dow'], nasdaq: ['Nasdaq Composite', 'Nasdaq 100'],
  russell: ['Russell 2000'], ftse: ['FTSE 100', 'FTSE'], dax: ['DAX'], nikkei: ['Nikkei'], hangseng: ['Hang Seng'],
  stoxx: ['Stoxx 600', 'STOXX'], sensex: ['Sensex'], nifty: ['Nifty 50', 'Nifty Bank', 'Bank Nifty', 'Nifty'],
  rupee: ['rupee', 'rupees', 'INR'], dollar: ['US dollar', 'dollar index', 'USD'], euro: ['EUR'], yen: ['yen', 'JPY'], pound: ['sterling', 'GBP'],
  yuan: ['yuan', 'renminbi', 'CNY'], treasuries: ['Treasury yields', 'Treasury yield', 'Treasuries', '10-year Treasury', 'bond yields', 'bond yield'],
  dalal: ['Dalal Street'],
};
export const INSTRUMENTS = lexicon(FIN_INSTRUMENT_TABLE, 'giu');
// Case-sensitive instrument codes that collide with words when lowercased.
const CODE_ONLY = new Set(['wti', 'btc', 'eth', 'inr', 'usd', 'eur', 'jpy', 'gbp', 'cny', 'dax', 'stoxx', 'dow']);

export const INDIA_VENUES = /(?<![\p{L}\d])(BSE|NSE|Dalal\s+Street)(?![\p{L}\d])/gu;

/** Distinct instruments in `text` (tickers, pairs, commodities, indices, FX, crypto), as canonical keys. */
export function findInstruments(text) {
  const out = new Set();
  if (!text) return out;
  for (const t of text.match(CASHTAG) || []) out.add(`t:${t.toUpperCase()}`);
  for (const t of text.match(EXCHANGE_TICKER) || []) out.add(`t:${t.replace(/^\(.*?:\s?/, '').replace(/\)$/, '').toUpperCase()}`);
  for (const m of text.matchAll(PAREN_TICKER)) if (!NOT_TICKERS.has(m[1])) out.add(`t:${m[1]}`);
  for (const t of text.match(CURRENCY_PAIRS) || []) out.add(`p:${t.replace(/\s/g, '').toUpperCase()}`);
  // A pair like USD/INR is one instrument; do not also count its legs.
  const rest = text.replace(CURRENCY_PAIRS, ' ');
  for (const m of rest.matchAll(INSTRUMENTS.re)) {
    const raw = m[0];
    const k = norm(raw);
    if (CODE_ONLY.has(k) && raw !== raw.toUpperCase()) continue;
    if (k === 'dow' && !/\b(Dow Jones|Dow)\b/.test(raw)) continue;
    out.add(INSTRUMENTS.map.get(k));
  }
  for (const m of text.matchAll(INDIA_VENUES)) out.add(`in:${m[0].toLowerCase().replace(/\s+/g, '')}`);
  return out;
}

/* ------------------------------ Finance terms --------------------------- */

export const CURRENCY_FIGURE = /[$€£¥₹]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:bn|billion|mn|million|k|thousand|trillion|tn|crore|lakh|cr|m|b)\b)?/giu;
export const PERCENT_FIGURE = /\b\d+(?:\.\d+)?\s?%/g;
export const BASIS_POINTS = /\b\d+(?:\.\d+)?\s*(?:bps|bp|basis\s+points?)\b/gi;
export const LARGE_MAGNITUDE = /\b\d+(?:\.\d+)?\s*(?:million|billion|trillion|crore|lakh)\b/gi;
export const DECIMAL_NUMBER = /\b\d+\.\d+\b/g;
export const FIN_FIGURES = [CURRENCY_FIGURE, PERCENT_FIGURE, BASIS_POINTS, LARGE_MAGNITUDE, DECIMAL_NUMBER];

export const VOLATILITY_LANG = /\b(plung(?:e|es|ed|ing)|crash(?:es|ed|ing)?|soar(?:s|ed|ing)?|skyrocket(?:s|ed|ing)?|collaps(?:e|es|ed|ing)|panic|meltdown|bubble|rout|capitulat(?:e|ed|ion)|blowout|carnage|freefall|free-fall|nosedive|nose-dive|plummet(?:s|ed|ing)?|tumbl(?:e|es|ed|ing)|slump(?:s|ed|ing)?|tank(?:s|ed|ing)?|bloodbath|wipeout|implod(?:e|es|ed|ing)|sell-?off)\b/giu;

export const MACRO = /\b(Fed|FOMC|inflation|CPI|PPI|WPI|GDP|IIP|PMI|unemployment|jobs\s+report|payrolls?|rate\s+(?:hike|hikes|cut|cuts|decision|pause)|interest\s+rates?|repo\s+rate|yield\s+curve|treasur(?:y|ies)(?:\s+yields?)?|bond\s+yields?|monetary\s+policy|fiscal\s+(?:policy|deficit)|quantitative\s+easing|QE\d?|tapering|recession|stagflation|central\s+bank|ECB|BoJ|BoE|RBI|PBoC|RBA|SNB|budget|deficit|tariffs?)\b/giu;

export const INSTITUTIONAL = /\b(block\s+(?:trades?|deals?)|bulk\s+deals?|open\s+interest|hedge\s+funds?|mutual\s+funds?|ETF\s+(?:flows?|inflows?|outflows?)|13F|insider\s+(?:buying|selling)|dark\s+pools?|whales?|institutional\s+(?:ownership|investors?)|prime\s+broker(?:age)?|FIIs?|DIIs?|FPIs?|foreign\s+(?:institutional|portfolio)\s+investors?|sovereign\s+wealth|pension\s+funds?|SIP\s+inflows?|short\s+interest|net\s+(?:buyers?|sellers?))\b/giu;

export const FUNDAMENTAL = /\b(DCF|discounted\s+cash\s+flow|WACC|weighted\s+average\s+cost\s+of\s+capital|EBITDA|EPS|earnings\s+per\s+share|P\/E|price-to-earnings|P\/B|book\s+value|free\s+cash\s+flow|terminal\s+value|ROE|ROIC|ROA|net\s+margin|operating\s+margin|revenue\s+growth|gross\s+margin|dividend\s+yield|debt\s+to\s+equity|current\s+ratio|net\s+profit|operating\s+profit|PAT|order\s+book|guidance|valuation)\b/giu;

// Pump-and-dump / hype vocabulary.
export const SPECULATION = new RegExp(
  [
    'to\\s+the\\s+moon', 'will\\s+explode', 'guaranteed\\s+(?:profits?|returns?|gains?|winners?)', 'hot\\s+stocks?',
    'next\\s+(?:Tesla|Nvidia|Amazon|Apple|Bitcoin|GameStop|Google|Microsoft)', 'penny\\s+stocks?', 'micro-?caps?\\s+(?:gems?|rockets?)',
    'rocket(?:ing|s)?', '🚀', 'moonshots?', 'YOLO', 'meme\\s+stocks?', 'pump(?:\\s+and\\s+|\\s*&\\s*|-and-|\\s*n\\s*)dump',
    'pump(?:ed|ing)?\\s+(?:up\\s+)?(?:the\\s+)?(?:stock|shares?|coins?|tokens?)', 'pumped\\s+up', '(?:10|50|100|1000)x', 'going\\s+parabolic', 'parabolic',
    'get\\s+rich(?:\\s+quick)?', 'easy\\s+money', "(?:can't|cannot|can not)\\s+lose", 'risk-free', 'diamond\\s+hands', 'multi-?baggers?',
    '(?:100|200|500|1000)%\\s+(?:returns?|gains?|profits?)', 'once-in-a-lifetime', 'act\\s+now', 'hot\\s+tips?', 'insider\\s+tips?', 'secret\\s+stocks?', 'hidden\\s+gems?',
    'make\\s+you\\s+(?:a\\s+)?millionaires?', 'turn\\s+\\$\\d[\\d,]*\\s+into', 'shill(?:ing|ed|s)?', 'buy\\s+now\\s+before', 'before\\s+it[’\\x27]?s\\s+too\\s+late', 'next\\s+big\\s+thing',
  ].join('|'),
  'giu'
);

// Regulatory vocabulary, split by evidential strength.
export const FILING_FORMS = /\b(10-K|10-Q|8-K|S-1|F-1|20-F|6-K|13F|13D|13G|Form\s+4|Form\s+10-K|Form\s+8-K|proxy\s+statement|prospectus|DRHP|RHP|IPO\s+filing|S-1\s+filing|SEC\s+filings?|(?:files?|filed|filing)\s+(?:a\s+|its\s+|an\s+)?(?:\w+\s+){0,2}(?:with|to)\s+(?:the\s+)?(?:SEC|Securities\s+and\s+Exchange\s+Commission|SEBI|exchange)|filings?\s+show|regulatory\s+filings?|annual\s+report|exchange\s+filing)\b/giu;
export const REGULATOR_WORDS = /\b(SEC|RBI|CFTC|FINRA|MiFID|ESMA|FCA|OCC|FDIC|SEBI|Basel\s+III?|Dodd.Frank|Sarbanes.Oxley|filing|filings|disclosure|disclosures|regulators?|compliance)\b/gu;

/* ------------------------------ Topic gates ----------------------------- */

// Politics/security words that make a headline geopolitical even without a named place.
export const GEO_TOPIC_EXTRA = /\b(prime\s+minister|foreign\s+(?:minister|ministry|policy|affairs)|elections?|parliament|ministry|cabinet|diplomacy|geopolitic\w*|human\s+rights|war|wars|military|troops|peace\s+talks?|ceasefire|cease-fire|sanctions?|nuclear|border|migration|immigration|intelligence|treaty)\b/giu;

// Strong finance vocabulary for the finance topic gate (headline-level).
export const FIN_TOPIC = new RegExp(
  [
    'stocks?', 'shares?', 'shareholders?', 'equit(?:y|ies)', 'markets?', 'wall\\s+street', 'nasdaq', 'nyse', 'dow', 's&p', 'sensex', 'nifty', 'indices', 'index', 'futures',
    'bonds?', 'yields?', 'treasur(?:y|ies)', 'rates?', 'fed', 'fomc', 'ecb', 'rbi', 'sebi', 'central\\s+bank', 'inflation', 'cpi', 'gdp', 'economy', 'economic', 'economists?', 'recession',
    'tariffs?', 'trade', 'oil', 'crude', 'gold', 'silver', 'copper', 'commodit(?:y|ies)', 'currency', 'currencies', 'dollar', 'euro', 'yen', 'rupee', 'forex', 'fx',
    'crypto\\w*', 'bitcoin', 'ether(?:eum)?', 'etfs?', 'funds?', 'funding', 'funded', 'fundrais\\w+', 'venture', 'vc', 'startups?', 'series\\s+[a-e]', 'seed', 'raises?', 'raised', 'rounds?',
    'valuations?', 'valued', 'unicorns?', 'ipos?', 'listing', 'spacs?', 'acqui\\w+', 'merger', 'mergers', 'buyouts?', 'deals?', 'earnings', 'revenues?', 'profits?', 'losses', 'margins?',
    'guidance', 'forecasts?', 'dividends?', 'buybacks?', 'banks?', 'banking', 'lenders?', 'loans?', 'credit', 'debt', 'deficit', 'budget', 'taxes', 'tax', 'invest\\w*', 'capital',
    'portfolios?', 'assets?', 'hedge', 'analysts?', 'price\\s+target', 'downgrades?', 'upgrades?', 'bankrupt\\w*', 'layoffs?', 'cash', 'billions?', 'millions?', 'trillions?', 'fintech',
    'insur\\w+', 'pensions?', 'real\\s+estate', 'mortgages?', 'sec', 'founders?', 'chief\\s+executive', 'regulators?', 'filings?', 'ceo', 'cfo', 'antitrust', 'fines?', 'settle\\w*', 'privacy', 'chips?', 'semiconductors?',
    'ai\\s+(?:spending|capex|boom|bubble)', 'data\\s+centers?', 'cloud', 'prices?', 'pricing', 'sales', 'tech', 'bessent', 'warsh', 'powell', 'lagarde', 'crore', 'lakh',
  ].join('|').replace(/^/, '(?<![\\p{L}\\d])(?:') + ')(?![\\p{L}\\d])',
  'giu'
);
const FIN_TOPIC_SYMBOLS = /\d\s?%|\$[A-Z]{1,5}\b/u;

function hasMatch(re, text) {
  re.lastIndex = 0;
  const hit = re.test(text);
  re.lastIndex = 0;
  return hit;
}

export function financeTopicHit(text) {
  if (!text) return false;
  return (
    hasMatch(FIN_TOPIC, text) || FIN_TOPIC_SYMBOLS.test(text) || hasMatch(FILING_FORMS, text) ||
    hasMatch(FUNDAMENTAL, text) || hasMatch(MACRO, text) || hasMatch(INSTITUTIONAL, text) ||
    findInstruments(text).size > 0
  );
}

export function geoTopicHit(text) {
  if (!text) return false;
  if (findPlaces(text).size || findActors(text).size) return true;
  GEO_TOPIC_EXTRA.lastIndex = 0;
  const a = GEO_TOPIC_EXTRA.test(text);
  GEO_TOPIC_EXTRA.lastIndex = 0;
  if (a) return true;
  GEO_EVENTS.lastIndex = 0;
  const b = GEO_EVENTS.test(text);
  GEO_EVENTS.lastIndex = 0;
  return b;
}

/* ------------------------------ Soft news ------------------------------- */

const SPORTS = /\b(football|soccer|cricket|nba|nfl|nhl|mlb|tennis|golf|rugby|basketball|baseball|hockey|olympics?|olympian|paralympic\w*|world\s+cup|premier\s+league|champions\s+league|grand\s+slam|wimbledon|super\s+bowl|playoffs?|formula\s+1|f1|marathon\s+(?:runner|race)|half-marathon|running\s+race|wickets?|innings|test\s+match|west\s+indies|(?:hits?|scores?|slams?|smashes)\s+(?:a\s+)?(?:century|ton|fifty)|ipl|touchdown|quarterback|goalkeeper|midfielder|striker|transfer\s+window|tournament|championship|medal(?:s|ist)?|hat-?trick)\b/giu;
const ENTERTAINMENT = /\b(celebrity|celebrities|hollywood|bollywood|movie|movies|film|actor|actress|album|singer|song|concert|kardashian|oscars?|grammys?|emmys?|box\s+office|netflix\s+series|tv\s+series|reality\s+show|red\s+carpet|royal\s+family|horoscope|recipe|recipes|travel\s+guide|vacation|wedding|fashion\s+week|influencer|viral\s+video)\b/giu;
const HOWTO = /^\s*(?:how\s+(?:to|do\s+i|do\s+you|can\s+you|should\s+you|much\s+(?:should|do|money))|what\s+to\s+(?:do|expect|watch|know|buy|ask)|why\s+you\s+(?:should|need|shouldn't|must)|\d+\s+(?:best|top|things|ways|reasons|stocks|tips|lessons|charts|mistakes|signs|questions|steps|rules|habits|apps|cities|places)\b|top\s+\d+|the\s+\d+\s+(?:best|top|biggest)|best\s+.{3,40}\s+(?:to\s+buy|of\s+20\d\d)|(?:a\s+|the\s+)?(?:beginner'?s\s+|ultimate\s+|complete\s+)?guide\s+to|everything\s+you\s+need\s+to\s+know|here\s+are\s+(?:the\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|things\s+to\s+(?:know|watch|do)|tips\s+(?:for|to|on)|checklist|quiz\b|explained:|review:)/i;
const PERSONAL_FINANCE = /\b(401\(?k\)?|IRAs?\b|roth|social\s+security|credit\s+cards?|credit\s+scores?|savings\s+accounts?|high-yield\s+savings|retire(?:ment|e|es|d|ing)?|(?:my|our)\s+(?:wife|husband|mother|father|spouse|parents|church|family|kids?|financial\s+advisor)|should\s+I\b|can\s+I\b|I(?:'|’)m\s+\d+|we\s+have\s+a|financial\s+advisors?|side\s+hustles?|student\s+loans?|tax\s+refunds?|tax\s+brackets?|rent\s+or\s+buy|emergency\s+fund|inheritance|estate\s+planning|life\s+savings|budgeting|your\s+(?:money|savings|retirement|paycheck|wallet|mortgage|taxes|credit)|cost-of-living\s+adjustment|medicare\s+(?:premiums?|advantage)|SIP\s+(?:vs|or)|best\s+(?:fd|mutual\s+fund)\s+for)\b/giu;
const INDEX_WRAP = /(?:stock\s+market\s+today|stocks?\s+(?:close|end|finish|rally|fall|slip|rise|gain|drop|climb|slide|edge|open)\b|(?:dow|s&p\s*500|nasdaq|sensex|nifty)(?:\s+\w+){0,3}\s+(?:close|ends?|falls?|slips?|rises?|gains?|drops?|climbs?|slides?|edges?|opens?|jumps?|surges?)|stocks\s+making\s+the\s+biggest\s+moves|\bpre-?market\b|before\s+the\s+bell|market\s+wrap|market\s+(?:live|today|open|update)|futures\s+(?:rise|fall|slip|edge|point|dip|climb)|biggest\s+(?:movers|moves)|stocks\s+to\s+(?:watch|buy)|top\s+stock\s+picks|live\s+updates?:?\s+(?:stocks?|dow|markets?)|opening\s+bell|closing\s+bell|what\s+to\s+watch\s+in\s+markets?|stock\s+picks)/i;

// Service journalism that is not anchored at the start of the headline.
const SERVICE = /\b(?:these|the\s+best|top)\s+(?:[\w-]+\s+){0,2}(?:stocks|funds|etfs)\b|\blooking\s+for\s+(?:income|yield)\b/i;

function firstMatch(text, re) {
  re.lastIndex = 0;
  const m = re.exec(text);
  re.lastIndex = 0;
  return m ? m[0] : null;
}

/**
 * Soft-news / service-journalism classification of a headline (+ lead).
 * Returns the matched categories; the pipelines turn them into penalties.
 * @returns {{ howto:boolean, personal:boolean, sports:boolean, entertainment:boolean, indexWrap:boolean }}
 */
export function classifySoftNews(title, summary = '') {
  const t = String(title || '');
  const lead = `${t} ${String(summary || '').slice(0, 160)}`;
  return {
    howto: HOWTO.test(t) || SERVICE.test(t),
    personal: !!firstMatch(t, PERSONAL_FINANCE) || (!!firstMatch(lead, PERSONAL_FINANCE) && /^\s*['‘“"]|\?\s*$/.test(t)),
    sports: !!firstMatch(t, SPORTS),
    entertainment: !!firstMatch(t, ENTERTAINMENT),
    indexWrap: INDEX_WRAP.test(t),
  };
}
