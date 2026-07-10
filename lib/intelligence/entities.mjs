/**
 * Deterministic entity extraction shared by clustering, topics, and the
 * intelligence fallback builder. Purpose-built for headlines and RSS
 * summaries: a curated vocabulary of geopolitical actors plus a
 * capitalised-phrase heuristic for companies and people the vocabulary
 * doesn't know. No AI involved — this must be stable, fast and free.
 */

const COUNTRY_LIST = [
  'Russia', 'China', 'India', 'Ukraine', 'Israel', 'Iran', 'Iraq', 'Syria',
  'Yemen', 'Gaza', 'Palestine', 'Lebanon', 'Egypt', 'Turkey', 'Saudi Arabia',
  'UAE', 'Qatar', 'Kuwait', 'Jordan', 'Afghanistan', 'Pakistan', 'Bangladesh',
  'Vietnam', 'Taiwan', 'Thailand', 'Indonesia', 'Malaysia', 'Singapore',
  'Philippines', 'Japan', 'North Korea', 'South Korea', 'Korea', 'Myanmar',
  'Kazakhstan', 'Georgia', 'Armenia', 'Azerbaijan', 'Belarus', 'Poland',
  'Germany', 'France', 'Britain', 'United Kingdom', 'United States', 'America',
  'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Colombia', 'Venezuela',
  'Peru', 'Cuba', 'Haiti', 'Nigeria', 'Kenya', 'Ethiopia', 'Sudan', 'Somalia',
  'Libya', 'Algeria', 'Morocco', 'Tunisia', 'Ghana', 'Congo', 'Rwanda',
  'Uganda', 'Tanzania', 'Zimbabwe', 'Australia', 'New Zealand', 'Italy',
  'Spain', 'Portugal', 'Netherlands', 'Belgium', 'Switzerland', 'Sweden',
  'Norway', 'Finland', 'Denmark', 'Ireland', 'Greece', 'Hungary', 'Romania',
  'Serbia', 'Croatia', 'Austria', 'Cyprus', 'Iceland',
];

const ORG_LIST = [
  'UN', 'United Nations', 'NATO', 'EU', 'European Union', 'IMF', 'World Bank',
  'WHO', 'WTO', 'OPEC', 'ASEAN', 'African Union', 'BRICS', 'G7', 'G20', 'ICC',
  'ICJ', 'Kremlin', 'Pentagon', 'White House', 'State Department',
  'Downing Street', 'Knesset', 'IDF', 'Hezbollah', 'Hamas', 'Houthi',
  'Taliban', 'Federal Reserve', 'Fed', 'ECB', 'Bank of England',
  'Bank of Japan', 'SEC', 'Supreme Court', 'Congress', 'Senate', 'Parliament',
  'OpenAI', 'Google', 'Microsoft', 'Apple', 'Amazon', 'Meta', 'Nvidia',
  'Tesla', 'TSMC', 'Intel', 'Boeing', 'Airbus', 'Goldman Sachs', 'JPMorgan',
];

const LEADER_LIST = [
  'Trump', 'Putin', 'Xi Jinping', 'Xi', 'Biden', 'Modi', 'Netanyahu',
  'Zelensky', 'Zelenskyy', 'Macron', 'Scholz', 'Starmer', 'Erdogan',
  'Khamenei', 'Lula', 'Milei', 'Sheinbaum', 'Carney', 'Meloni', 'Orban',
  'Powell', 'Lagarde', 'Musk', 'Altman',
];

// Canonical aliases so "United States", "America" and "US" cluster together.
const ALIASES = new Map([
  ['america', 'united states'],
  ['us', 'united states'],
  ['u.s.', 'united states'],
  ['uk', 'britain'],
  ['united kingdom', 'britain'],
  ['zelenskyy', 'zelensky'],
  ['xi jinping', 'xi'],
  ['united nations', 'un'],
  ['european union', 'eu'],
  ['federal reserve', 'fed'],
  ['türkiye', 'turkey'],
  ['turkiye', 'turkey'],
]);

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const KNOWN_ENTITY_RE = new RegExp(
  '\\b(' +
    [...COUNTRY_LIST, ...ORG_LIST, ...LEADER_LIST, 'Türkiye', 'Turkiye', 'US', 'U\\.S\\.', 'UK']
      .map(esc)
      .sort((a, b) => b.length - a.length)
      .join('|') +
    ')\\b',
  'g'
);

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

export function canonical(name) {
  const lower = String(name).toLowerCase().replace(/\s+/g, ' ').trim();
  return ALIASES.get(lower) || lower;
}

/**
 * Extract a canonicalised entity list from a text blob.
 * Returns [{ name, canonical, kind }] deduped by canonical form,
 * ordered by first occurrence.
 */
/**
 * True when most capitalised words in a string are adjacent to another
 * capitalised word — i.e. it reads as Title Case ("Edvisorly Raises Series A
 * To Fix The Messy College Transfer Process With AI") rather than ordinary
 * sentence case with occasional proper nouns. The capitalised-phrase
 * heuristic below is meaningless on Title Case text: every word matches, so
 * it just chops the sentence into arbitrary 1-3 word windows.
 */
function looksTitleCased(str) {
  const words = str.match(/[A-Za-z][a-zA-Z'&.-]*/g) || [];
  if (words.length < 4) return false;
  const capWords = words.filter((w) => /^[A-Z]/.test(w));
  return capWords.length / words.length > 0.6;
}

export function extractEntities(text) {
  const seen = new Map(); // canonical -> { name, canonical, kind }
  const src = String(text || '');

  for (const m of src.matchAll(KNOWN_ENTITY_RE)) {
    const raw = m[1];
    const canon = canonical(raw);
    if (!seen.has(canon)) {
      const kind = COUNTRY_LIST.some((c) => canonical(c) === canon)
        ? 'country'
        : LEADER_LIST.some((l) => canonical(l) === canon)
          ? 'person'
          : 'organization';
      seen.set(canon, { name: raw, canonical: canon, kind });
    }
  }

  // Run the capitalised-phrase heuristic per sentence so one Title Case
  // headline doesn't suppress it for an accompanying sentence-case summary.
  // Colons act as sentence boundaries too — "Spain: Deadly wildfire roars…"
  // otherwise treats "Deadly" as mid-sentence rather than clause-initial.
  for (const sentence of src.split(/(?<=[.!?:])\s+/)) {
    if (looksTitleCased(sentence)) continue;
    for (const m of sentence.matchAll(CAP_PHRASE_RE)) {
      const phrase = m[1].trim();
      const words = phrase.split(/\s+/);
      const canon = canonical(phrase);
      if (seen.has(canon)) continue;
      // Single sentence-initial words are too noisy to trust.
      if (words.length === 1 && (m.index === 0 || CAP_STOPWORDS.has(canon))) continue;
      if (words.every((w) => CAP_STOPWORDS.has(w.toLowerCase()))) continue;
      if (words.length === 1 && phrase.length < 4) continue;
      seen.set(canon, { name: phrase, canonical: canon, kind: 'other' });
    }
  }

  return [...seen.values()];
}

/** Title-case a canonical (lowercase) entity string without mangling
 * possessives/contractions — capitalises after start/whitespace/hyphen only,
 * never after an apostrophe ("iran's" → "Iran's", not "Iran'S"). */
export function displayCase(str) {
  return String(str).replace(/(^|[\s-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

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
