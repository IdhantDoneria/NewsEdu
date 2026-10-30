/**
 * Client-side search across the current ranked stories.
 *
 * Query syntax: words are ANDed, "quoted phrases" match exactly, and a leading
 * minus excludes a term (-sports). Matching is word-start based, so "tariff"
 * finds "tariffs" but "art" does not find "party".
 */

import { TOPICS, topicsForText } from '../intelligence/topics.mjs';

export const AGE_OPTIONS = [
  { value: 0, label: 'Any time' },
  { value: 6, label: 'Last 6 hours' },
  { value: 24, label: 'Last 24 hours' },
  { value: 72, label: 'Last 3 days' },
];

export function parseQuery(q) {
  const must = [];
  const not = [];
  const src = String(q || '').slice(0, 200);
  const re = /(-?)"([^"]+)"|(-?)(\S+)/g;
  let m;
  while ((m = re.exec(src))) {
    const neg = (m[1] || m[3]) === '-';
    const term = (m[2] || m[4] || '').toLowerCase().trim();
    if (term.length < 2) continue;
    (neg ? not : must).push(term);
  }
  return { must: must.slice(0, 8), not: not.slice(0, 8) };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function has(text, term) {
  return new RegExp(`(?<![\\w])${escapeRe(term)}`, 'i').test(text);
}

export function topicsFor(article) {
  return topicsForText(`${article.title || ''} ${article.summary || ''}`);
}

/**
 * @param {Array} articles  each with `edition` set by the caller
 * @param {object} f  { query, edition ('all'|...), source, topic, maxAgeHours, sort }
 */
export function searchArticles(articles, f = {}) {
  const { must, not } = parseQuery(f.query);
  const out = [];
  for (const a of articles || []) {
    if (f.edition && f.edition !== 'all' && a.edition !== f.edition) continue;
    if (f.source && a.sourceName !== f.source) continue;
    if (f.maxAgeHours && (Number(a.ageHours) || 0) > f.maxAgeHours) continue;
    if (f.topic && !topicsFor(a).includes(f.topic)) continue;

    const title = a.title || '';
    const body = a.summary || '';
    const text = `${title} ${body}`;
    if (not.some((t) => has(text, t))) continue;
    let relevance = 0;
    let ok = true;
    for (const t of must) {
      const inTitle = has(title, t);
      const inBody = has(body, t);
      if (!inTitle && !inBody) {
        ok = false;
        break;
      }
      relevance += inTitle ? 3 : 1;
    }
    if (!ok) continue;
    out.push({ a, relevance: relevance + (Number(a.score) || 0) / 100 });
  }

  const sort = f.sort || (must.length ? 'relevance' : 'score');
  const cmp = {
    relevance: (x, y) => y.relevance - x.relevance,
    score: (x, y) => (y.a.score || 0) - (x.a.score || 0),
    newest: (x, y) => (y.a.publishedAt || 0) - (x.a.publishedAt || 0),
  }[sort];
  return out.sort(cmp).map((x) => x.a);
}

/** Short human label for a saved search. */
export function describeSearch(f) {
  const parts = [];
  if (f.query?.trim()) parts.push(f.query.trim());
  const topic = TOPICS.find((t) => t.id === f.topic);
  if (topic) parts.push(topic.label);
  if (f.source) parts.push(f.source);
  if (f.edition && f.edition !== 'all') parts.push(f.edition === 'finance' ? 'Finance' : 'Geopolitics');
  if (f.maxAgeHours) parts.push(`${f.maxAgeHours}h`);
  return parts.join(' · ') || 'All stories';
}
