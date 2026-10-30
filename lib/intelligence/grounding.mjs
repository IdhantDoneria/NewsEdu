/**
 * Deterministic citation grounding.
 *
 * A model citing "[S2]" only proves it named a source, not that the source says
 * what the sentence claims. So every cited claim must come with a short
 * verbatim quote, and a citation survives only if
 *   (1) the normalised quote is a substring of that article (title + summary), and
 *   (2) every number in the claim appears in the quote or in that article.
 * No model is involved in the check; it is plain string matching.
 */

import { safeText } from './promptsafe.mjs';

const MIN_QUOTE_CHARS = 10;

/**
 * Comparison form of a text: entity-decoded, NFKC, lower-cased, diacritics
 * folded for Latin, punctuation and quote styles removed, spaces collapsed.
 */
export function normalizeForMatch(text) {
  const s = safeText(text, 20000)
    .replace(/[‹›]/g, ' ')
    .normalize('NFKC')
    .toLowerCase();
  return s
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => (/^[\p{Script=Latin}\p{N}\p{M}]+$/u.test(w) ? w.normalize('NFD').replace(/\p{M}/gu, '') : w))
    .join(' ');
}

/** The text a model could have quoted from: title + summary. */
export function articleCorpus(article) {
  return normalizeForMatch(`${article?.title || ''}. ${article?.summary || ''}`);
}

/** Split a quote on ellipses; every fragment must itself occur verbatim. */
function quoteFragments(quote) {
  return String(quote || '')
    .split(/\.{3}|…|\[\s*\.{3}\s*\]|\[…\]/)
    .map(normalizeForMatch)
    .filter(Boolean);
}

/** Is `quote` a verbatim (normalised) excerpt of `article`? */
export function quoteInArticle(quote, article, corpus = articleCorpus(article)) {
  const frags = quoteFragments(quote);
  if (frags.length === 0) return false;
  if (frags.join(' ').length < MIN_QUOTE_CHARS) return false;
  // Fragments shorter than a word or two are ellipsis debris, not evidence.
  const real = frags.filter((f) => f.length >= 4);
  if (real.length === 0) return false;
  return real.every((f) => corpus.includes(f));
}

/** Numbers in a text, normalised ("1,200" -> "1200", "3.40" -> "3.4"). */
export function numbersIn(text) {
  const out = new Set();
  const s = safeText(text, 20000).replace(/(\d)[,  ](?=\d{3}\b)/g, '$1');
  for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) {
    out.add(m[0].includes('.') ? String(Number(m[0])) : m[0].replace(/^0+(?=\d)/, ''));
  }
  return out;
}

/**
 * Check one claim against its cited articles.
 * @param {string} claim  the statement/sentence (numbers are checked)
 * @param {Array<{article:object, quote:string}>} evidence  one per cited source
 * @returns {{supported:boolean, verified:Array<{article:object, quote:string}>, reason?:string}}
 */
export function groundClaim(claim, evidence) {
  const verified = [];
  for (const e of evidence || []) {
    if (e?.article && quoteInArticle(e.quote, e.article)) verified.push(e);
  }
  if (verified.length === 0) return { supported: false, verified, reason: 'quote-not-found' };

  const have = new Set();
  for (const e of verified) {
    for (const n of numbersIn(e.quote)) have.add(n);
    for (const n of numbersIn(`${e.article.title} ${e.article.summary || ''}`)) have.add(n);
  }
  for (const n of numbersIn(claim)) {
    if (!have.has(n)) return { supported: false, verified, reason: `number-unsupported:${n}` };
  }
  return { supported: true, verified };
}

/** Summarise {supported,total} with a rate, for responses and telemetry. */
export function groundingStat(supported, total) {
  return { supported, total, rate: total ? Math.round((supported / total) * 100) / 100 : 1 };
}
