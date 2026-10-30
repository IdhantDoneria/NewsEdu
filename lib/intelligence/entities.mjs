/**
 * Deterministic entity extraction shared by clustering, topics, and the
 * intelligence fallback builder. Purpose-built for headlines and RSS
 * summaries: a curated vocabulary of geopolitical, financial and Indian
 * actors with alias tables (demonyms, transliterations, acronyms), plus a
 * capitalised-phrase heuristic for companies and people the vocabulary
 * doesn't know. No AI involved — this must be stable, fast and free.
 *
 * The canonicaliser is the single source of truth for "which name is this":
 * clustering rewrites headline text through `normalizeText` so that
 * "Kiev"/"Kyiv", "Zelenskiy"/"Zelensky", "Peking"/"Beijing", "Russian forces"/
 * "Russia army" and "Reserve Bank of India"/"RBI" agree before any matching.
 */

import { foldAccents } from '../text.mjs';

/* --------------------------------- vocabulary --------------------------------- */

// [canonical, kind, surface forms...]. The capitalised canonical is always a
// surface form (UPPERCASE for acronyms); list demonyms, transliterations and
// alternate names explicitly. Surfaces are matched case-sensitively on
// accent-folded text (all-caps sentences are matched case-insensitively).
const ACRONYMS = new Set([
  'un', 'eu', 'nato', 'imf', 'wto', 'who', 'opec', 'asean', 'brics', 'g7', 'g20', 'icc', 'icj', 'idf',
  'ecb', 'sec', 'tsmc', 'uae', 'rbi', 'sebi', 'nse', 'bse', 'sbi', 'tcs', 'bjp', 'isro', 'drdo', 'isis',
  'pboc', 'boj', 'boe', 'rsf', 'fbi', 'cia', 'nsa', 'doj', 'ftc', 'fcc', 'fda', 'epa', 'nasa', 'nhtsa',
  'bis', 'cbn', 'aap', 'lic', 'hdfc', 'icici', 'upi', 'fii', 'dii', 'fpi', 'pla', 'dprk', 'aukus', 'ofac',
]);

const ENTRIES = [
  // ---- countries & places (demonyms and alternate names included) ----
  ['russia', 'country', 'Russian', 'Russians', 'Russia\'s', 'Moscow'],
  ['ukraine', 'country', 'Ukrainian', 'Ukrainians', 'Ukraine\'s'],
  ['israel', 'country', 'Israeli', 'Israelis', 'Israel\'s', 'Tel Aviv', 'Jerusalem'],
  ['iran', 'country', 'Iranian', 'Iranians', 'Tehran'],
  ['iraq', 'country', 'Iraqi', 'Iraqis'],
  ['syria', 'country', 'Syrian', 'Syrians'],
  ['yemen', 'country', 'Yemeni', 'Yemenis'],
  ['gaza', 'country', 'Gazan', 'Gazans', 'Gaza Strip', 'Rafah', 'Khan Younis'],
  ['palestine', 'country', 'Palestinian', 'Palestinians', 'West Bank'],
  ['lebanon', 'country', 'Lebanese'],
  ['egypt', 'country', 'Egyptian', 'Egyptians'],
  ['turkey', 'country', 'Turkish', 'Turkiye', 'Turkei'],
  ['saudi arabia', 'country', 'Saudi', 'Saudis', 'Saudi Arabian', 'Riyadh'],
  ['uae', 'country', 'UAE', 'Emirati', 'Emiratis', 'United Arab Emirates', 'Abu Dhabi', 'Dubai'],
  ['qatar', 'country', 'Qatari', 'Qataris', 'Doha'],
  ['kuwait', 'country', 'Kuwaiti'],
  ['oman', 'country', 'Omani', 'Muscat'],
  ['bahrain', 'country', 'Bahraini'],
  ['jordan', 'country', 'Jordanian', 'Jordanians', 'Amman'],
  ['afghanistan', 'country', 'Afghan', 'Afghans', 'Kabul'],
  ['pakistan', 'country', 'Pakistani', 'Pakistanis', 'Islamabad'],
  ['bangladesh', 'country', 'Bangladeshi', 'Bangladeshis', 'Dhaka'],
  ['india', 'country', 'Indian', 'Indians', 'New Delhi', 'Delhi', 'India\'s'],
  ['sri lanka', 'country', 'Sri Lankan', 'Colombo', 'Ceylon'],
  ['nepal', 'country', 'Nepali', 'Nepalese', 'Kathmandu'],
  ['china', 'country', 'Chinese', 'PRC', 'China\'s'],
  ['hong kong', 'country', 'Hong Konger', 'Hongkong'],
  ['taiwan', 'country', 'Taiwanese', 'Taipei'],
  ['japan', 'country', 'Japanese', 'Tokyo'],
  ['north korea', 'country', 'North Korean', 'North Koreans', 'Pyongyang', 'DPRK'],
  ['south korea', 'country', 'South Korean', 'South Koreans', 'Seoul'],
  ['korea', 'country', 'Korean', 'Koreans'],
  ['vietnam', 'country', 'Vietnamese', 'Hanoi'],
  ['thailand', 'country', 'Thai', 'Bangkok'],
  ['indonesia', 'country', 'Indonesian', 'Indonesians', 'Jakarta'],
  ['malaysia', 'country', 'Malaysian', 'Kuala Lumpur'],
  ['singapore', 'country', 'Singaporean'],
  ['philippines', 'country', 'Philippine', 'Filipino', 'Filipinos', 'Manila'],
  ['myanmar', 'country', 'Burma', 'Burmese', 'Myanmar\'s', 'Rangoon', 'Yangon'],
  ['cambodia', 'country', 'Cambodian'],
  ['kazakhstan', 'country', 'Kazakh', 'Kazakhstani'],
  ['uzbekistan', 'country', 'Uzbek'],
  ['georgia', 'country', 'Georgian', 'Georgians', 'Tbilisi'],
  ['armenia', 'country', 'Armenian', 'Armenians', 'Yerevan'],
  ['azerbaijan', 'country', 'Azerbaijani', 'Baku'],
  ['belarus', 'country', 'Belarusian', 'Minsk'],
  ['moldova', 'country', 'Moldovan', 'Chisinau'],
  ['poland', 'country', 'Polish', 'Warsaw'],
  ['germany', 'country', 'German', 'Germans', 'Berlin'],
  ['france', 'country', 'French', 'Paris'],
  ['britain', 'country', 'UK', 'U.K.', 'United Kingdom', 'Great Britain', 'British', 'Briton', 'Britons', 'London', 'Britain\'s'],
  ['united states', 'country', 'US', 'U.S.', 'USA', 'U.S.A.', 'America', 'American', 'Americans', 'United States of America', 'Washington'],
  ['canada', 'country', 'Canadian', 'Canadians', 'Ottawa'],
  ['mexico', 'country', 'Mexican', 'Mexicans'],
  ['brazil', 'country', 'Brazilian', 'Brazilians', 'Brasilia'],
  ['argentina', 'country', 'Argentine', 'Argentinian', 'Argentines'],
  ['chile', 'country', 'Chilean'],
  ['colombia', 'country', 'Colombian'],
  ['venezuela', 'country', 'Venezuelan', 'Venezuelans', 'Caracas'],
  ['peru', 'country', 'Peruvian'],
  ['ecuador', 'country', 'Ecuadorian'],
  ['bolivia', 'country', 'Bolivian'],
  ['cuba', 'country', 'Cuban', 'Cubans', 'Havana'],
  ['haiti', 'country', 'Haitian', 'Haitians'],
  ['jamaica', 'country', 'Jamaican', 'Jamaicans'],
  ['nigeria', 'country', 'Nigerian', 'Nigerians', 'Abuja', 'Lagos'],
  ['kenya', 'country', 'Kenyan', 'Kenyans', 'Nairobi'],
  ['ethiopia', 'country', 'Ethiopian', 'Ethiopians', 'Addis Ababa', 'Tigray'],
  ['eritrea', 'country', 'Eritrean'],
  ['sudan', 'country', 'Sudanese', 'Khartoum', 'Darfur'],
  ['south sudan', 'country', 'South Sudanese'],
  ['somalia', 'country', 'Somali', 'Somalis'],
  ['libya', 'country', 'Libyan', 'Libyans', 'Tripoli'],
  ['algeria', 'country', 'Algerian'],
  ['morocco', 'country', 'Moroccan'],
  ['tunisia', 'country', 'Tunisian'],
  ['ghana', 'country', 'Ghanaian'],
  ['congo', 'country', 'Congolese', 'DR Congo', 'DRC'],
  ['rwanda', 'country', 'Rwandan'],
  ['uganda', 'country', 'Ugandan'],
  ['tanzania', 'country', 'Tanzanian'],
  ['zimbabwe', 'country', 'Zimbabwean'],
  ['south africa', 'country', 'South African', 'South Africans', 'Pretoria'],
  ['australia', 'country', 'Australian', 'Australians', 'Aussie', 'Canberra'],
  ['new zealand', 'country', 'New Zealander', 'Kiwi'],
  ['italy', 'country', 'Italian', 'Italians', 'Rome'],
  ['spain', 'country', 'Spanish', 'Spaniards', 'Madrid'],
  ['portugal', 'country', 'Portuguese', 'Lisbon'],
  ['netherlands', 'country', 'Dutch', 'Holland'],
  ['belgium', 'country', 'Belgian'],
  ['switzerland', 'country', 'Swiss'],
  ['sweden', 'country', 'Swedish', 'Stockholm'],
  ['norway', 'country', 'Norwegian'],
  ['finland', 'country', 'Finnish', 'Helsinki'],
  ['denmark', 'country', 'Danish', 'Copenhagen'],
  ['ireland', 'country', 'Irish', 'Dublin'],
  ['greece', 'country', 'Greek', 'Athens'],
  ['hungary', 'country', 'Hungarian', 'Budapest'],
  ['romania', 'country', 'Romanian'],
  ['serbia', 'country', 'Serbian', 'Belgrade'],
  ['croatia', 'country', 'Croatian'],
  ['austria', 'country', 'Austrian', 'Vienna'],
  ['cyprus', 'country', 'Cypriot'],
  ['iceland', 'country', 'Icelandic'],
  ['kyiv', 'country', 'Kiev', 'Kyiv'],
  ['beijing', 'country', 'Beijing', 'Peking'],
  ['crimea', 'country', 'Crimean'],
  ['kashmir', 'country', 'Kashmiri'],
  // ---- places that are not countries but anchor events ----
  ['mumbai', 'country', 'Bombay', 'Mumbaikars'],
  ['kolkata', 'country', 'Calcutta'],
  ['chennai', 'country', 'Madras'],
  ['bengaluru', 'country', 'Bangalore', 'Bengaluru'],
  // ---- people ----
  ['trump', 'person', 'Donald Trump', 'President Trump', 'Trump\'s'],
  ['putin', 'person', 'Vladimir Putin'],
  ['biden', 'person', 'Joe Biden'],
  ['xi', 'person', 'Xi Jinping', 'Xi'],
  ['modi', 'person', 'Narendra Modi', 'Prime Minister Modi'],
  ['netanyahu', 'person', 'Benjamin Netanyahu', 'Binyamin Netanyahu', 'Bibi'],
  ['zelensky', 'person', 'Zelenskiy', 'Zelenskyy', 'Zelenskyi', 'Zelenski', 'Volodymyr Zelensky', 'Volodymyr Zelenskyy', 'Volodymyr Zelenskiy'],
  ['gaddafi', 'person', 'Qaddafi', 'Kadhafi', 'Khadafy', 'Qadhafi', 'Kaddafi', 'Gadhafi', 'Gaddafi\'s', 'Qaddafi\'s'],
  ['macron', 'person', 'Emmanuel Macron'],
  ['scholz', 'person', 'Olaf Scholz'],
  ['merz', 'person', 'Friedrich Merz'],
  ['starmer', 'person', 'Keir Starmer'],
  ['erdogan', 'person', 'Recep Tayyip Erdogan', 'Erdogan\'s'],
  ['khamenei', 'person', 'Ali Khamenei', 'Khamenei\'s'],
  ['lula', 'person', 'Lula da Silva'],
  ['bolsonaro', 'person', 'Jair Bolsonaro', 'Flavio Bolsonaro'],
  ['milei', 'person', 'Javier Milei'],
  ['sheinbaum', 'person', 'Claudia Sheinbaum'],
  ['carney', 'person', 'Mark Carney'],
  ['meloni', 'person', 'Giorgia Meloni'],
  ['orban', 'person', 'Viktor Orban'],
  ['powell', 'person', 'Jerome Powell', 'Jay Powell'],
  ['warsh', 'person', 'Kevin Warsh'],
  ['lagarde', 'person', 'Christine Lagarde'],
  ['bessent', 'person', 'Scott Bessent'],
  ['vance', 'person', 'JD Vance', 'J.D. Vance'],
  ['rubio', 'person', 'Marco Rubio'],
  ['musk', 'person', 'Elon Musk'],
  ['altman', 'person', 'Sam Altman'],
  ['assad', 'person', 'Bashar al-Assad', 'Bashar Assad'],
  ['maduro', 'person', 'Nicolas Maduro'],
  ['kim jong un', 'person', 'Kim Jong-un', 'Kim Jong Un', 'Kim Jong-Un'],
  ['lavrov', 'person', 'Sergei Lavrov'],
  ['malhotra', 'person', 'Sanjay Malhotra'],
  ['sitharaman', 'person', 'Nirmala Sitharaman'],
  ['rahul gandhi', 'person', 'Rahul Gandhi'],
  ['abbas', 'person', 'Mahmoud Abbas'],
  ['sisi', 'person', 'el-Sisi', 'al-Sisi'],
  ['mohammed bin salman', 'person', 'Mohammed bin Salman', 'Mohammad bin Salman', 'MBS', 'Saudi crown prince'],
  // ---- organisations & institutions ----
  ['un', 'organization', 'UN', 'U.N.', 'United Nations', 'UN Security Council', 'Security Council'],
  ['nato', 'organization', 'NATO'],
  ['eu', 'organization', 'EU', 'E.U.', 'European Union', 'Brussels', 'European Commission'],
  ['imf', 'organization', 'IMF', 'International Monetary Fund'],
  ['world bank', 'organization', 'World Bank'],
  ['who', 'organization', 'WHO', 'World Health Organization'],
  ['wto', 'organization', 'WTO', 'World Trade Organization'],
  ['opec', 'organization', 'OPEC', 'OPEC+'],
  ['asean', 'organization', 'ASEAN'],
  ['african union', 'organization', 'African Union'],
  ['brics', 'organization', 'BRICS'],
  ['g7', 'organization', 'G7', 'G-7'],
  ['g20', 'organization', 'G20', 'G-20'],
  ['icc', 'organization', 'ICC', 'International Criminal Court'],
  ['icj', 'organization', 'ICJ', 'International Court of Justice'],
  ['kremlin', 'organization', 'Kremlin'],
  ['pentagon', 'organization', 'Pentagon'],
  ['white house', 'organization', 'White House'],
  ['state department', 'organization', 'State Department', 'State Dept.'],
  ['downing street', 'organization', 'Downing Street'],
  ['knesset', 'organization', 'Knesset'],
  ['idf', 'organization', 'IDF', 'Israel Defense Forces', 'Israeli military'],
  ['hezbollah', 'organization', 'Hizbollah', 'Hizbullah', 'Hezbollah'],
  ['hamas', 'organization', 'Hamas'],
  ['houthi', 'organization', 'Houthis', 'Huthi', 'Huthis', 'Houthi'],
  ['taliban', 'organization', 'Taliban'],
  ['isis', 'organization', 'ISIS', 'ISIL', 'Daesh', 'Islamic State'],
  ['rsf', 'organization', 'RSF', 'Rapid Support Forces'],
  ['fed', 'organization', 'Fed', 'Federal Reserve', 'the Fed'],
  ['ecb', 'organization', 'ECB', 'European Central Bank'],
  ['bank of england', 'organization', 'Bank of England', 'BoE', 'BOE'],
  ['bank of japan', 'organization', 'Bank of Japan', 'BoJ', 'BOJ'],
  ['pboc', 'organization', 'PBOC', 'People\'s Bank of China'],
  ['sec', 'organization', 'SEC', 'Securities and Exchange Commission'],
  ['supreme court', 'organization', 'Supreme Court'],
  ['congress', 'organization', 'Congress'],
  ['senate', 'organization', 'Senate'],
  ['parliament', 'organization', 'Parliament'],
  ['washington post', 'organization', 'Washington Post'],
  ['openai', 'organization', 'OpenAI'],
  ['anthropic', 'organization', 'Anthropic'],
  ['google', 'organization', 'Google', 'Alphabet'],
  ['microsoft', 'organization', 'Microsoft'],
  ['apple', 'organization', 'Apple'],
  ['amazon', 'organization', 'Amazon'],
  ['meta', 'organization', 'Meta', 'Facebook'],
  ['nvidia', 'organization', 'Nvidia', 'NVIDIA'],
  ['tesla', 'organization', 'Tesla'],
  ['tsmc', 'organization', 'TSMC'],
  ['intel', 'organization', 'Intel'],
  ['boeing', 'organization', 'Boeing'],
  ['airbus', 'organization', 'Airbus'],
  ['goldman sachs', 'organization', 'Goldman Sachs', 'Goldman'],
  ['jpmorgan', 'organization', 'JPMorgan', 'JP Morgan', 'JPMorgan Chase'],
  ['general motors', 'organization', 'General Motors', 'GM'],
  // ---- India ----
  ['rbi', 'organization', 'RBI', 'Reserve Bank of India'],
  ['sebi', 'organization', 'SEBI', 'Sebi', 'Securities and Exchange Board of India'],
  ['sensex', 'organization', 'Sensex', 'BSE Sensex', 'S&P BSE Sensex'],
  ['nifty', 'organization', 'Nifty', 'Nifty 50', 'Nifty50', 'NSE Nifty'],
  ['nse', 'organization', 'NSE', 'National Stock Exchange'],
  ['bse', 'organization', 'BSE', 'Bombay Stock Exchange'],
  ['lok sabha', 'organization', 'Lok Sabha'],
  ['rajya sabha', 'organization', 'Rajya Sabha'],
  ['bjp', 'organization', 'BJP', 'Bharatiya Janata Party'],
  ['congress party', 'organization', 'Congress party', 'Indian National Congress'],
  ['reliance', 'organization', 'Reliance', 'Reliance Industries'],
  ['adani', 'organization', 'Adani', 'Adani Group'],
  ['tata', 'organization', 'Tata', 'Tata Group'],
  ['tcs', 'organization', 'TCS', 'Tata Consultancy Services'],
  ['infosys', 'organization', 'Infosys'],
  ['hdfc bank', 'organization', 'HDFC Bank', 'HDFC'],
  ['icici bank', 'organization', 'ICICI Bank', 'ICICI'],
  ['sbi', 'organization', 'SBI', 'State Bank of India'],
  ['isro', 'organization', 'ISRO'],
  ['niti aayog', 'organization', 'NITI Aayog'],
  ['fii', 'organization', 'FII', 'FIIs', 'FPI', 'FPIs', 'foreign institutional investors'],
];

// City ids that keep their own canonical (so Kiev/Kyiv, Peking/Beijing and
// Bombay/Mumbai agree) but belong to a country for conflict/actor purposes.
export const PLACE_PARENT = new Map([
  ['kyiv', 'ukraine'], ['beijing', 'china'], ['mumbai', 'india'], ['kolkata', 'india'],
  ['chennai', 'india'], ['bengaluru', 'india'], ['crimea', 'ukraine'], ['kashmir', 'india'],
]);

// Leaders stand, weakly, for their country in matching ("Carney" ~ Canada).
export const PERSON_COUNTRY = new Map([
  ['putin', 'russia'], ['lavrov', 'russia'], ['zelensky', 'ukraine'], ['xi', 'china'], ['modi', 'india'],
  ['malhotra', 'india'], ['sitharaman', 'india'], ['netanyahu', 'israel'], ['macron', 'france'],
  ['scholz', 'germany'], ['merz', 'germany'], ['starmer', 'britain'], ['erdogan', 'turkey'],
  ['khamenei', 'iran'], ['lula', 'brazil'], ['bolsonaro', 'brazil'], ['milei', 'argentina'],
  ['sheinbaum', 'mexico'], ['carney', 'canada'], ['meloni', 'italy'], ['orban', 'hungary'],
  ['assad', 'syria'], ['maduro', 'venezuela'], ['kim jong un', 'north korea'], ['gaddafi', 'libya'],
  ['powell', 'fed'], ['warsh', 'fed'], ['lagarde', 'ecb'], ['bessent', 'united states'],
  ['mohammed bin salman', 'saudi arabia'],
]);

// Names that are not themselves distinguishing: nearly every story in an
// edition mentions one. Clustering treats these as weak, "actor" evidence.
export const FREQUENT_ACTORS = new Set([
  'iran', 'russia', 'ukraine', 'israel', 'china', 'united states', 'trump', 'putin', 'gaza', 'hamas',
  'nato', 'un', 'eu', 'fed', 'britain', 'biden', 'netanyahu', 'xi', 'zelensky', 'palestine', 'lebanon',
  'syria', 'pakistan', 'north korea', 'south korea', 'japan', 'germany', 'france',
  'saudi arabia', 'uae', 'turkey', 'egypt', 'white house', 'pentagon', 'kremlin', 'congress', 'senate',
]);

const CENTRAL_BANKS = new Set(['fed', 'ecb', 'bank of england', 'bank of japan', 'pboc', 'rbi']);
const COMPANIES = new Set([
  'openai', 'anthropic', 'google', 'microsoft', 'apple', 'amazon', 'meta', 'nvidia', 'tesla', 'tsmc', 'intel',
  'boeing', 'airbus', 'goldman sachs', 'jpmorgan', 'general motors', 'reliance', 'adani', 'tata', 'tcs',
  'infosys', 'hdfc bank', 'icici bank', 'sbi',
]);

/** True for a company or central bank: a name that, alone, is weak evidence of one event. */
export function isCompanyOrBank(canon) {
  return COMPANIES.has(canon) || CENTRAL_BANKS.has(canon);
}

// Pairs of place entities that are part of one theatre: never "conflicting".
const RELATED_PLACES = [
  ['israel', 'gaza'], ['israel', 'palestine'], ['gaza', 'palestine'], ['israel', 'lebanon'],
  ['china', 'hong kong'], ['china', 'taiwan'], ['north korea', 'south korea'], ['korea', 'north korea'],
  ['korea', 'south korea'], ['russia', 'ukraine'], ['saudi arabia', 'uae'], ['iran', 'israel'],
  ['uae', 'qatar'], ['sudan', 'south sudan'],
  ['uae', 'yemen'], ['saudi arabia', 'yemen'], ['egypt', 'gaza'], ['qatar', 'gaza'],
  ['jordan', 'palestine'], ['jordan', 'israel'], ['syria', 'israel'], ['syria', 'turkey'],
  ['britain', 'ireland'],
];
const RELATED = new Set(RELATED_PLACES.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));

/* ------------------------------ alias machinery ------------------------------ */

const CANON_KIND = new Map(); // canonical -> kind
const SURFACE = new Map(); // folded surface -> canonical
const ALL_SURFACES = [];

function addSurface(surface, canon) {
  const key = foldAccents(surface);
  if (!SURFACE.has(key)) {
    SURFACE.set(key, canon);
    ALL_SURFACES.push(key);
  }
}

for (const [canon, kind, ...surfaces] of ENTRIES) {
  const target = canon;
  if (!CANON_KIND.has(target)) CANON_KIND.set(target, kind);
  const base = ACRONYMS.has(canon) ? canon.toUpperCase() : canon.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  addSurface(base, target);
  for (const s of surfaces) addSurface(s, target);
}
// Alias lookups also accept lowercase transliterations that appear mid-sentence.
const LOWER_OK = new Set(['kiev', 'peking', 'bombay', 'calcutta', 'madras', 'bangalore', 'burma', 'qaddafi', 'gaddafi', 'kadhafi', 'zelenskiy', 'zelenskyy', 'sensex', 'nifty', 'sebi']);

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SURFACES_SORTED = [...new Set(ALL_SURFACES)].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
const SURFACE_ALT = SURFACES_SORTED.map(esc).join('|');
const EDGE_L = "(?<![A-Za-z0-9'\\u2019])";
const EDGE_R = '(?![A-Za-z0-9])';
const KNOWN_RE = new RegExp(`${EDGE_L}(${SURFACE_ALT})${EDGE_R}`, 'g');
const KNOWN_RE_I = new RegExp(`${EDGE_L}(${SURFACE_ALT})${EDGE_R}`, 'gi');
const SURFACE_LOWER = new Map([...SURFACE].map(([k, v]) => [k.toLowerCase(), v]));
const LOWER_RE = new RegExp(`${EDGE_L}(${[...LOWER_OK].join('|')})${EDGE_R}`, 'g');

/* ----------------------------- ambiguous names ----------------------------- */

const GEORGIA_US = /\b(atlanta|savannah|macon|augusta|senate|republicans?|democrat\w*|gop|governor|gov\.|kemp|raffensperger|ossoff|warnock|peach state|congressional|county|fulton|georgia tech|legislature|statehouse|lawmakers|redistrict\w*|voters? in georgia)\b/i;
const GEORGIA_COUNTRY = /\b(tbilisi|batumi|georgian dream|kobakhidze|ivanishvili|zourabichvili|south ossetia|abkhazia|caucasus|black sea|saakashvili|georgian|ex-soviet|former soviet)\b/i;
const JORDAN_PERSON = /\b(michael jordan|air jordan|jordan (?:love|peele|chiles|belfort|spieth|henderson|pickford|walker|hicks|poole|brand)|jordan, (?:the )?(?:nba|bulls))\b/i;

/** Resolve a matched surface to a canonical id, using whole-text context for ambiguous names. */
function resolve(canon, context) {
  if (canon === 'georgia') {
    if (GEORGIA_US.test(context) && !GEORGIA_COUNTRY.test(context)) return 'georgia (us)';
    return 'georgia';
  }
  if (canon === 'jordan' && JORDAN_PERSON.test(context)) return 'jordan (person)';
  return canon;
}

/* -------------------------------- canonical -------------------------------- */

export function canonical(name) {
  const lower = foldAccents(String(name)).replace(/\s+/g, ' ').trim();
  const hit = SURFACE.get(lower) || SURFACE_LOWER.get(lower.toLowerCase());
  if (hit) return hit;
  const l = lower.toLowerCase();
  // "u.s." style punctuation variants
  const bare = l.replace(/\./g, '');
  return SURFACE_LOWER.get(bare) || l;
}

/** Kind of a canonical id: country | person | organization | other. */
export function entityKind(canon) {
  if (canon === 'georgia (us)') return 'country';
  if (canon === 'jordan (person)') return 'person';
  return CANON_KIND.get(canon) || 'other';
}

/** Country/place ids of a set of canonicals, with metonyms already folded. */
export function placeIds(canons) {
  const out = new Set();
  for (const c of canons) if (entityKind(c) === 'country') out.add(c);
  return out;
}

/**
 * True when two entity-id sets name irreconcilably different places: each
 * has at least one place besides the United States, they share none, and no
 * pair is part of one theatre (Israel/Gaza, Russia/Ukraine, ...). "US" is
 * ignored because it is mentioned incidentally in so many stories.
 */
export function placesConflict(a, b) {
  const up = (set) => [...new Set([...placeIds(set)].map((p) => PLACE_PARENT.get(p) || p))].filter((p) => p !== 'united states');
  const pa = up(a);
  const pb = up(b);
  const linked = (x, others) => others.some((y) => x === y || RELATED.has(`${x}|${y}`));
  if (pa.length && pb.length) {
    // Disjoint places, or each side names a place the other never touches
    // (India-Pakistan vs Pakistan-Afghanistan).
    if (!pa.some((x) => linked(x, pb))) return true;
    if (pa.some((x) => !linked(x, pb)) && pb.some((y) => !linked(y, pa))) return true;
  }
  // Central banks and companies are "places" of their own: a Fed story is
  // not an ECB story, an Nvidia story is not a Microsoft story.
  for (const group of [CENTRAL_BANKS, COMPANIES]) {
    const ga = [...a].filter((x) => group.has(x));
    const gb = [...b].filter((x) => group.has(x));
    if (ga.length && gb.length && !ga.some((x) => gb.includes(x))) return true;
  }
  return false;
}

const ALLCAPS_SENTENCE = (s) => {
  const letters = s.replace(/[^A-Za-z]/g, '');
  return letters.length >= 8 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.85;
};

/** Match known entities in a sentence. Returns [{ index, end, raw, canon }]. */
function matchKnown(sentence, context) {
  const folded = foldAccents(sentence);
  const allCaps = ALLCAPS_SENTENCE(folded);
  const out = [];
  const re = allCaps ? KNOWN_RE_I : KNOWN_RE;
  re.lastIndex = 0;
  for (const m of folded.matchAll(re)) {
    const raw = m[1];
    const canon = allCaps ? SURFACE_LOWER.get(raw.toLowerCase()) : SURFACE.get(raw);
    if (!canon) continue;
    out.push({ index: m.index, end: m.index + raw.length, raw, canon: resolve(canon, context) });
  }
  // Lowercase-tolerant transliterations ("fleeing kiev").
  if (!allCaps) {
    LOWER_RE.lastIndex = 0;
    for (const m of folded.matchAll(LOWER_RE)) {
      const canon = SURFACE_LOWER.get(m[1]);
      if (canon && !out.some((o) => m.index >= o.index && m.index < o.end)) {
        out.push({ index: m.index, end: m.index + m[1].length, raw: m[1], canon: resolve(canon, context) });
      }
    }
    out.sort((a, b) => a.index - b.index);
  }
  return out;
}

/* ----------------------------- capitalised phrases ----------------------------- */

// Capitalised phrases (1–3 words) that look like proper nouns — catches
// companies, places and people outside the curated vocabulary. Sentence-first
// words are noisy, so we only accept phrases not at position 0 or that
// contain 2+ words.
const CAP_PHRASE_RE = /\b([A-Z][a-zA-Z'&.-]+(?:\s+[A-Z][a-zA-Z'&.-]+){0,2})\b/g;

const CAP_STOPWORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'of', 'for', 'to', 'and', 'as', 'but',
  'why', 'how', 'what', 'when', 'where', 'who', 'new', 'top', 'live', 'update',
  'updates', 'breaking', 'exclusive', 'analysis', 'opinion', 'report', 'watch',
  'video', 'photos', 'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december', 'monday',
  'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'here',
  'this', 'that', 'these', 'those', 'after', 'before', 'amid', 'over', 'under',
  'inside', 'behind', 'stocks', 'markets', 'market', 'news', 'world', 'today',
]);

/**
 * True when most capitalised words in a string are adjacent to another
 * capitalised word — i.e. it reads as Title Case ("Edvisorly Raises Series A
 * To Fix The Messy College Transfer Process With AI") rather than ordinary
 * sentence case with occasional proper nouns. The capitalised-phrase
 * heuristic is meaningless on Title Case text: every word matches, so it
 * just chops the sentence into arbitrary 1-3 word windows.
 */
function looksTitleCased(str) {
  const words = str.match(/[A-Za-z][a-zA-Z'&.-]*/g) || [];
  if (words.length < 4) return false;
  const capWords = words.filter((w) => /^[A-Z]/.test(w));
  return capWords.length / words.length > 0.6;
}

/** Accent-folded sentence with vocabulary entities blanked out, so the
 * capitalised-phrase heuristic cannot re-extract their pieces ("Reserve Bank"). */
function maskKnown(sentence, context) {
  let folded = foldAccents(sentence);
  for (const h of matchKnown(sentence, context)) {
    folded = folded.slice(0, h.index) + ' '.repeat(h.end - h.index) + folded.slice(h.end);
  }
  return folded;
}

function phraseCandidates(sentence, { skipInitial = true } = {}) {
  const out = [];
  for (const m of sentence.matchAll(CAP_PHRASE_RE)) {
    const phrase = m[1].trim();
    const words = phrase.split(/\s+/);
    const canon = canonical(phrase);
    if (words.length === 1 && ((skipInitial && m.index === 0) || CAP_STOPWORDS.has(canon))) continue;
    if (words.every((w) => CAP_STOPWORDS.has(w.toLowerCase()))) continue;
    if (words.length === 1 && phrase.length < 4) continue;
    out.push({ phrase, canon, index: m.index });
  }
  return out;
}

/**
 * Extract a canonicalised entity list from a text blob.
 * Returns [{ name, canonical, kind }] deduped by canonical form,
 * ordered by first occurrence.
 */
export function extractEntities(text, context) {
  const seen = new Map(); // canonical -> { name, canonical, kind }
  const src = String(text || '');
  const ctx = context === undefined ? src : String(context);
  const sentences = src.split(/(?<=[.!?:])\s+/);

  // Vocabulary hits per sentence (so all-caps headlines are matched
  // case-insensitively without loosening ordinary sentences).
  for (const sentence of sentences) {
    for (const m of matchKnown(sentence, ctx)) {
      if (!seen.has(m.canon)) seen.set(m.canon, { name: m.raw, canonical: m.canon, kind: entityKind(m.canon) });
    }
  }

  // Run the capitalised-phrase heuristic per sentence so one Title Case
  // headline doesn't suppress it for an accompanying sentence-case summary.
  // Colons act as sentence boundaries too — "Spain: Deadly wildfire roars…"
  // otherwise treats "Deadly" as mid-sentence rather than clause-initial.
  const titleCased = [];
  for (const sentence of sentences) {
    if (ALLCAPS_SENTENCE(sentence)) continue;
    if (looksTitleCased(sentence)) {
      titleCased.push(sentence);
      continue;
    }
    for (const c of phraseCandidates(maskKnown(sentence, ctx))) {
      if (seen.has(c.canon)) continue;
      seen.set(c.canon, { name: c.phrase, canonical: c.canon, kind: 'other' });
    }
  }

  // Title Case defeats the heuristic, so fall back to the rest of the text:
  // a capitalised run in a Title Case headline is accepted only when a
  // sentence-case sentence (typically the summary) attests it mid-sentence.
  if (titleCased.length) {
    const attested = new Set();
    for (const sentence of sentences) {
      if (titleCased.includes(sentence) || ALLCAPS_SENTENCE(sentence)) continue;
      for (const c of phraseCandidates(maskKnown(sentence, ctx), { skipInitial: true })) attested.add(c.canon);
    }
    if (attested.size) {
      for (const sentence of titleCased) {
        for (const c of phraseCandidates(maskKnown(sentence, ctx), { skipInitial: false })) {
          if (seen.has(c.canon)) continue;
          if (attested.has(c.canon)) seen.set(c.canon, { name: c.phrase, canonical: c.canon, kind: 'other' });
        }
      }
    }
  }

  return [...seen.values()];
}

/**
 * Rewrite text so every vocabulary entity mention becomes one canonical
 * letters-only token ("Kiev" -> "kyiv", "Russian forces" -> "russia forces",
 * "United States" / "U.S." / "America" -> "unitedstates"). Accents are
 * folded. Used by clustering so aliases agree before tokenisation.
 */
export function normalizeText(text, context) {
  const src = String(text || '');
  const ctx = context === undefined ? src : String(context);
  const sentences = src.split(/(?<=[.!?:])\s+/);
  const out = [];
  for (const sentence of sentences) {
    const folded = foldAccents(sentence);
    const hits = matchKnown(sentence, ctx);
    let pos = 0;
    let acc = '';
    for (const h of hits) {
      if (h.index < pos) continue;
      acc += folded.slice(pos, h.index) + ' ' + entityToken(h.canon) + ' ';
      pos = h.end;
    }
    out.push(acc + folded.slice(pos));
  }
  return out.join(' ');
}

/** Letters-only token for a canonical entity id ("united states" -> "unitedstates"). */
export function entityToken(canon) {
  return canon.replace(/[^a-z0-9]/g, '');
}

/** Reverse lookup: letters-only entity token -> canonical id (or undefined). */
const TOKEN_TO_CANON = new Map();
for (const c of CANON_KIND.keys()) TOKEN_TO_CANON.set(entityToken(c), c);
TOKEN_TO_CANON.set('georgiaus', 'georgia (us)');
TOKEN_TO_CANON.set('jordanperson', 'jordan (person)');
export function canonOfToken(token) {
  return TOKEN_TO_CANON.get(token);
}

/** Title-case a canonical (lowercase) entity string without mangling
 * possessives/contractions — capitalises after start/whitespace/hyphen only,
 * never after an apostrophe ("iran's" → "Iran's", not "Iran'S"). Known
 * acronyms stay upper-case ("nato" → "NATO", "rbi" → "RBI"). */
export function displayCase(str) {
  const s = String(str);
  if (ACRONYMS.has(s)) return s.toUpperCase();
  const special = DISPLAY_OVERRIDES.get(s);
  if (special) return special;
  return s.replace(/(^|[\s-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

const DISPLAY_OVERRIDES = new Map([
  ['openai', 'OpenAI'], ['jpmorgan', 'JPMorgan'], ['united states', 'United States'],
  ['georgia (us)', 'Georgia (US)'], ['jordan (person)', 'Jordan'], ['fed', 'Fed'],
  ['bank of england', 'Bank of England'], ['bank of japan', 'Bank of Japan'],
]);

/**
 * Event-type vocabulary. Overlap in event terms is what separates
 * "two stories about the same country" from "two stories about the same
 * development" — clustering requires it alongside entity overlap.
 */
const EVENT_TERMS_RE =
  /\b(sanction\w*|ceasefire|truce|treaty|invasion|invade\w*|strike\w*|airstrike\w*|missile\w*|coup|summit|election\w*|vote\w*|ruling|court|verdict|indict\w*|legislation|bill|law|tariff\w*|trade\s+deal|negotiat\w*|talks|agreement|accord|resign\w*|appoint\w*|nominat\w*|acqui\w*|merger|merge\w*|ipo|funding|raises?|raised|layoff\w*|bankrupt\w*|default|rate\s+(?:cut|hike|decision)|inflation|gdp|earnings|profit\w*|loss\w*|crash|surge\w*|plunge\w*|rally|protest\w*|evacuat\w*|earthquake|hurricane|flood\w*|outbreak|hostage\w*|prisoner\w*|blockade|embargo|annex\w*|referendum|impeach\w*|assassinat\w*|explosion|attack\w*|drone\w*|nuclear|espionage|cyberattack|hack\w*|data\s+breach)\b/gi;

export function extractEventTerms(text) {
  const set = new Set();
  for (const m of String(text || '').matchAll(EVENT_TERMS_RE)) {
    set.add(m[1].toLowerCase().replace(/\s+/g, ' '));
  }
  return set;
}

/** Key numeric facts (money, percentages, large counts) with surrounding label. */
export function extractKeyNumbers(text) {
  const out = [];
  const src = String(text || '');
  const NUM_RE =
    /((?:[A-Za-z][\w-]*\s+){0,4})((?:\$|€|£|¥)\s?\d[\d,.]*\s*(?:trillion|billion|million|bn|mn|tn|k)?|\d+(?:\.\d+)?\s*(?:%|percent)|\d[\d,]{3,})((?:\s+[A-Za-z][\w-]*){0,3})/g;
  for (const m of src.matchAll(NUM_RE)) {
    const value = m[2].trim();
    const label = `${m[1] || ''}${value}${m[3] || ''}`.replace(/\s+/g, ' ').trim();
    // Skip bare years and tiny fragments.
    if (/^(19|20)\d{2}$/.test(value)) continue;
    out.push({ value, label });
    if (out.length >= 8) break;
  }
  return out;
}
