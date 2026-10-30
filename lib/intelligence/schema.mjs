/**
 * Schema validation for AI-generated intelligence objects.
 *
 * Every structured model output passes through here before persistence or
 * rendering. The validator is strict about shape and enums but forgiving
 * about extra fields (they're stripped). Citations that don't reference a
 * real article in the cluster are removed; claims left with no surviving
 * citation are downgraded from FACT to ANALYSIS so the UI never presents
 * ungrounded text as fact.
 *
 * Quote grounding: when the cluster's articles are passed, every FACT and
 * PARTY CLAIM must also carry a short verbatim `quote` that is found in a
 * cited article (title + summary) and whose numbers cover the statement's
 * numbers (grounding.mjs). Citations that fail this are removed and the claim
 * is downgraded. The result carries `grounding: { supported, total, rate }`.
 */

import { groundClaim, groundingStat, numbersIn } from './grounding.mjs';

export const CLASSIFICATIONS = ['FACT', 'PARTY CLAIM', 'ANALYSIS', 'SCENARIO', 'UNCERTAINTY'];
export const UNCERTAINTY_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

function str(v, max = 2000) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function arr(v, max) {
  return Array.isArray(v) ? v.slice(0, max) : [];
}

function classification(v, fallback = 'ANALYSIS') {
  const up = String(v || '').toUpperCase().replace(/_/g, ' ').trim();
  return CLASSIFICATIONS.includes(up) ? up : fallback;
}

function citations(v, validIds) {
  return arr(v, 6)
    .map((c) => String(c?.id ?? c))
    .filter((c) => validIds.has(c));
}

/**
 * A classified statement with provenance.
 * `ctx` = { validIds, articles: Map(id -> article) | null, tally: {supported, total} }.
 */
function statement(v, ctx, fallbackClass = 'ANALYSIS') {
  const { validIds, articles, tally } = ctx;
  const text = str(v?.text ?? v, 1200);
  if (!text) return null;
  let cites = citations(v?.citations, validIds);
  let cls = classification(v?.classification, fallbackClass);
  let quote = '';

  if (articles && (cls === 'FACT' || cls === 'PARTY CLAIM')) {
    const q = str(v?.quote, 400);
    // Prefer the cited articles; if the quote only appears in another article
    // of the same story, the claim is attributed to the article that has it.
    let evidence = cites.map((id) => ({ id, article: articles.get(id), quote: q }));
    let verdict = groundClaim(text, evidence);
    if (verdict.verified.length === 0 && q) {
      evidence = [...articles.entries()].map(([id, article]) => ({ id, article, quote: q }));
      verdict = groundClaim(text, evidence);
    }
    tally.total++;
    if (verdict.supported) {
      tally.supported++;
      cites = [...new Set(verdict.verified.map((e) => e.id))].slice(0, 6);
      quote = q.slice(0, 200);
    } else {
      cites = []; // unsupported citations are not shown
    }
  }

  // Facts must be grounded; ungrounded "facts" are demoted.
  if (cls === 'FACT' && cites.length === 0) cls = 'ANALYSIS';
  if (articles && cls === 'PARTY CLAIM' && cites.length === 0) cls = 'ANALYSIS';
  return { text, classification: cls, citations: cites, ...(quote ? { quote } : {}) };
}

/** A key number is kept only if its digits appear in a cited (or any) article. */
function keyNumber(n, ctx) {
  const value = str(n?.value, 60);
  const label = str(n?.label, 200);
  if (!value || !label) return null;
  let cites = citations(n?.citations, ctx.validIds);
  if (ctx.articles) {
    const digits = numbersIn(value);
    const covers = (id) => {
      const a = ctx.articles.get(id);
      if (!a) return false;
      const have = numbersIn(`${a.title} ${a.summary || ''}`);
      return [...digits].every((d) => have.has(d));
    };
    if (digits.size > 0) {
      cites = cites.filter(covers);
      if (cites.length === 0) {
        const found = [...ctx.articles.keys()].find(covers);
        if (!found) return null; // a number no article contains
        cites = [found];
      }
    }
  }
  return { value, label, citations: cites };
}

/**
 * Validate and sanitise a full intelligence object.
 * Returns the clean object, or null if the payload is unusable
 * (no factual core at all).
 *
 * @param {object} raw
 * @param {string[]} articleIds  ids of the cluster's articles
 * @param {object[]} [articles]  the cluster's articles; enables quote grounding
 */
export function validateIntel(raw, articleIds, articles) {
  if (!raw || typeof raw !== 'object') return null;
  const validIds = new Set((articleIds || []).map(String));
  const ctx = {
    validIds,
    articles: Array.isArray(articles) && articles.length ? new Map(articles.map((a) => [String(a.id), a])) : null,
    tally: { supported: 0, total: 0 },
  };

  const whatHappened = statement(raw.whatHappened, ctx, 'FACT');
  if (!whatHappened || whatHappened.text.length < 20) return null;

  const out = {
    whatHappened,
    whyItMatters: arr(raw.whyItMatters, 4)
      .map((s) => statement(s, ctx, 'ANALYSIS'))
      .filter(Boolean),
    background: arr(raw.background, 4)
      .map((s) => statement(s, ctx, 'FACT'))
      .filter(Boolean),
    keyActors: arr(raw.keyActors, 8)
      .map((a) => ({
        name: str(a?.name, 120),
        kind: str(a?.kind, 40) || 'actor',
        role: str(a?.role, 300),
      }))
      .filter((a) => a.name),
    stakeholders: arr(raw.stakeholders, 6)
      .map((s) => ({
        actor: str(s?.actor, 120),
        wants: str(s?.wants, 400),
        publiclyClaims: str(s?.publiclyClaims, 400),
        opposes: str(s?.opposes, 400),
        mayCompromiseOn: str(s?.mayCompromiseOn, 400),
        // "wants/opposes/compromise" are inferred strategy → ANALYSIS;
        // publiclyClaims is by definition a PARTY CLAIM. The UI renders both
        // labels; this field records the inferred-position classification.
        classification: 'ANALYSIS',
      }))
      .filter((s) => s.actor && (s.wants || s.publiclyClaims)),
    disagreements: arr(raw.disagreements, 5)
      .map((s) => statement(s, ctx, 'ANALYSIS'))
      .filter(Boolean),
    keyNumbers: arr(raw.keyNumbers, 8)
      .map((n) => keyNumber(n, ctx))
      .filter(Boolean),
    timeline: arr(raw.timeline, 12)
      .map((t) => ({
        at: Number.isFinite(t?.at) ? t.at : Date.parse(t?.at) || null,
        text: str(t?.text, 300),
        citations: citations(t?.citations, validIds),
      }))
      .filter((t) => t.text)
      .sort((a, b) => (a.at || 0) - (b.at || 0)),
    scenarios: arr(raw.scenarios, 4)
      .map((s) => ({
        description: str(s?.description, 500),
        signals: arr(s?.signals, 4).map((x) => str(x, 300)).filter(Boolean),
        counterSignals: arr(s?.counterSignals, 4).map((x) => str(x, 300)).filter(Boolean),
        uncertainty: UNCERTAINTY_LEVELS.includes(String(s?.uncertainty || '').toUpperCase())
          ? String(s.uncertainty).toUpperCase()
          : 'HIGH',
        classification: 'SCENARIO',
      }))
      .filter((s) => s.description),
    causalChain: arr(raw.causalChain, 8)
      .map((e) => ({
        from: str(e?.from, 200),
        to: str(e?.to, 200),
        type: str(e?.type, 60) || 'leads-to',
        explanation: str(e?.explanation, 400),
        confidence: UNCERTAINTY_LEVELS.includes(String(e?.confidence || '').toUpperCase())
          ? String(e.confidence).toUpperCase()
          : 'MEDIUM',
        citations: citations(e?.citations, validIds),
      }))
      .filter((e) => e.from && e.to),
    watchNext: arr(raw.watchNext, 4)
      .map((s) => statement(s, ctx, 'ANALYSIS'))
      .filter(Boolean),
  };

  if (ctx.articles) out.grounding = groundingStat(ctx.tally.supported, ctx.tally.total);
  return out;
}
