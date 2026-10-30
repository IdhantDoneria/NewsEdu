/**
 * Distinct-token matching: run several /g patterns over one text, drop any
 * match that overlaps a longer one, and de-duplicate by lowercased text.
 * `$6.14` matched by both a currency and a decimal pattern is one token.
 */

/** @returns {string[]} distinct non-overlapping matches (lowercased, whitespace-collapsed) */
export function distinctSpans(text, patterns) {
  if (!text) return [];
  const spans = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      if (m[0]) spans.push([m.index, m.index + m[0].length, m[0]]);
    }
  }
  // Longest first at equal start so the wider token wins an overlap.
  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const kept = [];
  let end = -1;
  for (const s of spans) {
    if (s[0] >= end) {
      kept.push(s);
      end = s[1];
    } else if (s[1] > end) {
      // Partial overlap that extends past the kept span: keep the longer of the two.
      const last = kept[kept.length - 1];
      if (s[1] - s[0] > last[1] - last[0]) {
        kept[kept.length - 1] = s;
        end = s[1];
      }
    }
  }
  const seen = new Set();
  const out = [];
  for (const [, , t] of kept) {
    const k = t.toLowerCase().replace(/\s+/g, ' ');
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
