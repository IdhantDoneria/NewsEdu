/**
 * Sentence-level grounding of a chat answer (item 21).
 *
 * The model answers with [S#] markers and, for every marker, a verbatim quote
 * in `claims`. Each cited sentence is kept only when a quote is found in the
 * cited article and the sentence's numbers appear in the evidence. See
 * grounding.mjs for the primitives.
 */

import { groundClaim, numbersIn } from './grounding.mjs';

const MARKER = /\[\s*S\d+(?:\s*[,;]\s*S\d+)*\s*\]/gi;
// Sentence boundary: after . ! ? (and any trailing markers) before a capital/digit/bullet.
// Not after a single capital initial ("U.S. stocks"), and never before a marker.
const SPLIT_SENTENCES =
  /(?<!\b\p{Lu}\.)(?<=[.!?](?:\s*\[\s*S\d+(?:\s*[,;]\s*S\d+)*\s*\])*)\s+(?!\[\s*S\d)(?=[\p{Lu}\p{N}"“‘(\-•*])/u;

/** Clean `claims` from the model: [{ref:"S2", quote:"..."}] -> Map("2" -> [quote, ...]). */
export function parseClaims(claims) {
  const byRef = new Map();
  if (!Array.isArray(claims)) return byRef;
  for (const c of claims.slice(0, 40)) {
    const m = /S?\s*(\d{1,2})/i.exec(String(c?.ref ?? c?.source ?? ''));
    const quote = typeof c?.quote === 'string' ? c.quote.slice(0, 400) : '';
    if (!m || !quote) continue;
    const list = byRef.get(m[1]) || [];
    list.push(quote);
    byRef.set(m[1], list);
  }
  return byRef;
}

/**
 * Verify a model answer sentence by sentence.
 *
 * - A sentence carrying [S#] markers survives only if at least one cited source
 *   has a verbatim quote and every number in the sentence appears in a
 *   verified quote or its article. Markers whose quote failed are removed.
 * - A sentence with numbers but no markers (unless the answer declares
 *   background knowledge) must find each number somewhere in the sources.
 * - Everything else (hedges, "the articles do not cover this") is untouched.
 *
 * @param {string} answer          model text with [S#] markers
 * @param {Map<string,string[]>} claims  from parseClaims
 * @param {object[]} sources       the retrieved articles, S1 = sources[0]
 * @param {{background?:boolean, extraNumbers?:Iterable<string>}} opts
 * @returns {{text:string, supported:number, total:number, quotes:Map<number,string>}}
 *  `quotes` maps a source index (1-based) to the quote that verified it.
 */
export function groundAnswer(answer, claims, sources, { background = false, extraNumbers = [] } = {}) {
  const allNumbers = new Set(extraNumbers);
  for (const a of sources) for (const n of numbersIn(`${a.title} ${a.summary || ''}`)) allNumbers.add(n);

  const quotes = new Map();
  let supported = 0;
  let total = 0;
  const lines = [];

  for (const line of String(answer || '').split('\n')) {
    const prefix = /^\s*(?:[-*•]|\d+[.)])\s+/.exec(line)?.[0] || '';
    const body = line.slice(prefix.length);
    const kept = [];

    for (const sentence of body.split(SPLIT_SENTENCES)) {
      const markers = [...sentence.matchAll(MARKER)];
      const refs = [
        ...new Set(markers.flatMap((m) => [...m[0].matchAll(/S(\d+)/gi)].map((r) => Number(r[1])))),
      ].filter((n) => n >= 1 && n <= sources.length);
      const plain = sentence.replace(MARKER, ' ');

      if (markers.length === 0) {
        // Uncited. Only numbers can be checked; background knowledge is exempt.
        const nums = [...numbersIn(plain)];
        if (nums.length === 0 || background) {
          if (plain.trim()) kept.push(sentence.trim());
          continue;
        }
        total++;
        if (nums.every((n) => allNumbers.has(n))) {
          supported++;
          kept.push(sentence.trim());
        }
        continue;
      }

      total++;
      const evidence = [];
      for (const r of refs) {
        for (const quote of claims.get(String(r)) || []) {
          evidence.push({ r, article: sources[r - 1], quote });
        }
      }
      const verdict = groundClaim(plain, evidence);
      const goodRefs = [...new Set(verdict.verified.map((e) => e.r))];
      if (!verdict.supported || goodRefs.length === 0) continue; // dropped

      supported++;
      for (const e of verdict.verified) if (!quotes.has(e.r)) quotes.set(e.r, e.quote.trim().slice(0, 200));
      // Rewrite the markers to the verified refs only.
      let first = true;
      const rewritten = sentence.replace(MARKER, () => {
        if (!first) return '';
        first = false;
        return ` ${goodRefs.map((r) => `[S${r}]`).join('')}`;
      });
      kept.push(rewritten.replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim());
    }

    if (kept.length) lines.push(`${prefix}${kept.join(' ')}`);
  }

  return { text: lines.join('\n').trim(), supported, total, quotes };
}
