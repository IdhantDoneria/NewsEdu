/**
 * Safe, cosmetic-only text normalization for wire headlines.
 *
 * This deliberately does NOT re-case headlines (sentence case vs Title
 * Case). Wire copy mixes both styles across outlets, but forcing one would
 * require guessing which words are proper nouns/acronyms — get it wrong and
 * "US launches strikes" becomes "Us launches strikes" or "NATO" becomes
 * "Nato", which is a worse credibility problem than inconsistent casing.
 *
 * What IS safe to normalize: the underlying characters are cosmetic
 * variants with no semantic difference — straight vs curly quotes,
 * duplicate whitespace from feed markup, stray control characters.
 */

const STRAIGHT_TO_CURLY = [
  // Order matters: opening vs closing quote depends on adjacent characters.
  [/(^|[\s(\[{—-])"/g, '$1“'], // opening double quote
  [/"/g, '”'], // remaining double quotes are closing
  [/(^|[\s(\[{—-])'/g, '$1‘'], // opening single quote
  [/'/g, '’'], // remaining singles are closing/apostrophes
];

/**
 * Normalize quote/apostrophe characters to a single consistent (curly)
 * style, collapse whitespace, and trim. Safe to call on any headline/title
 * string; never changes word casing or content.
 */
export function normalizeHeadline(title) {
  if (!title || typeof title !== 'string') return '';
  let out = title;
  for (const [pattern, replacement] of STRAIGHT_TO_CURLY) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Strip a trailing " - Source Name" (or " – Source Name" / em dash) suffix
 * from a headline when it exactly matches the article's own extracted
 * source — the common Google News RSS title format. Without this, the
 * source appears twice: once baked into the title, once in the byline
 * directly underneath it.
 */
export function stripTrailingSource(title, sourceName) {
  if (!title || !sourceName) return title || '';
  const escaped = sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\s*[-–—]\\s*${escaped}\\s*$`, 'i');
  return title.replace(pattern, '').trim();
}

/* ------------------------- matching helpers (clustering) ------------------------- */

/** Strip accents (NFKD) and unify quote/dash variants for matching. */
export function foldAccents(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/ß/g, 'ss');
}

/**
 * Normalised comparison key for a headline: accents folded, lowercase, any
 * trailing " - Source" / " | Source" tag removed, punctuation dropped. Two
 * outlets republishing one wire story usually differ only in such decoration.
 */
export function normalizeTitleKey(title) {
  let t = foldAccents(title).toLowerCase();
  t = t.replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/, '');
  return t
    .replace(/&amp;/g, ' and ')
    .replace(/[^a-z0-9$%.\s]/g, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Set of k-word shingles of a normalised key; short titles yield one shingle. */
export function wordShingles(key, k = 3) {
  const words = String(key || '').split(' ').filter(Boolean);
  const out = new Set();
  if (words.length === 0) return out;
  if (words.length <= k) {
    out.add(words.join(' '));
    return out;
  }
  for (let i = 0; i + k <= words.length; i++) out.add(words.slice(i, i + k).join(' '));
  return out;
}

/** Jaccard similarity of two Sets (0 when either is empty). */
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// Section suffixes that split one outlet into several feeds ("BBC World",
// "CNBC Markets"); stripped so one publisher counts once toward breadth.
const OUTLET_SECTION =
  /\b(world|news|markets?|business|venture|politics|top stories|europe|asia|us|technology|tech|economy|finance|latest|headlines|international)\b/g;
const OUTLET_ALIAS = new Map([
  ['nyt', 'new york times'],
  ['ny times', 'new york times'],
  ['wsj', 'wall street journal'],
  ['wapo', 'washington post'],
  ['al jazeera english', 'al jazeera'],
]);

/** Stable publisher key for an outlet name: "BBC World" -> "bbc". */
export function outletKey(name) {
  let k = foldAccents(name).toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9.\s]/g, ' ');
  const stripped = k.replace(OUTLET_SECTION, ' ').replace(/\s+/g, ' ').trim();
  k = stripped || k.replace(/\s+/g, ' ').trim();
  return OUTLET_ALIAS.get(k) || k;
}
