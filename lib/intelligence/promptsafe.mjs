/**
 * Prompt-injection hygiene shared by every model prompt.
 *
 * Feed text is untrusted. Two classic bypasses are closed here:
 *   1. Entity-encoded markup (`&lt;/article&gt;`) is decoded BEFORE tags are
 *      stripped, so it cannot survive as a live tag after a later decode.
 *   2. Whatever angle brackets remain are escaped, so no article, question or
 *      memory text can open or close a prompt fence (`</article><question>`).
 * Attribute values are quote-escaped for the same reason.
 */

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', copy: '©', reg: '®', euro: '€',
  pound: '£', yen: '¥', rupee: '₹', laquo: '«', raquo: '»', middot: '·', bull: '•',
};

function codePoint(n) {
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
    ? String.fromCodePoint(n)
    : ' ';
}

/** One pass of HTML entity decoding (named + numeric). */
export function decodeEntities(str) {
  return String(str ?? '')
    .replace(/&#x([0-9a-f]{1,6});?/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d{1,7});?/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&([a-z]{2,8});/gi, (m, name) => NAMED[name.toLowerCase()] ?? m);
}

// Invisible / bidi-control characters used to smuggle or disguise instructions.
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/**
 * Decode-then-strip: entities are decoded (twice, so `&amp;lt;` also resolves)
 * before tags are removed. Returns plain text with no markup left.
 */
export function stripMarkup(str) {
  let s = String(str ?? '').replace(INVISIBLE, ' ');
  for (let i = 0; i < 2; i++) {
    const next = decodeEntities(s);
    if (next === s) break;
    s = next;
  }
  return s
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/?[a-z!][^>]*>/gi, ' ');
}

/** Escape what is left so it can never form a tag, and defuse code fences. */
function escapeBrackets(s) {
  return s.replace(/</g, '‹').replace(/>/g, '›').replace(/`{3,}/g, "'''");
}

/**
 * Untrusted feed/article text -> prompt-safe single-line text.
 * decode entities -> strip tags -> escape `<` `>` -> collapse whitespace -> cap.
 */
export function safeText(value, max = 600) {
  return escapeBrackets(stripMarkup(value)).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Free text from the reader (question, history, memory): same hygiene, but
 * bracket characters become spaces instead of lookalikes. */
export function safeUserText(value, max = 500) {
  // Same order as feed text: decode first, then strip tags, then drop leftover brackets.
  return stripMarkup(value)
    .replace(/[<>]/g, ' ').replace(/`{3,}/g, "'''").replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Value for an XML-style attribute inside a prompt fence. */
export function safeAttr(value, max = 80) {
  return safeText(value, max).replace(/["'&]/g, ' ').replace(/\s+/g, ' ').trim();
}
