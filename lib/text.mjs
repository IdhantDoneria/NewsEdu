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
