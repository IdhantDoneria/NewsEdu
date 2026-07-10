/**
 * Material-change detection ("What Changed").
 *
 * The client keeps a per-followed-story snapshot ({ articleIds, lastSeenAt })
 * in localStorage — there is no server-side user state. This module diffs
 * that snapshot against the current cluster and keeps only *material*
 * developments: new articles carrying strong event signals, new key numbers,
 * or new actors. Duplicate retellings and low-information updates are
 * suppressed deterministically.
 */

import { extractEntities, extractEventTerms, extractKeyNumbers, displayCase } from './entities.mjs';

// Development types that count as material, with a why-it-matters template.
const MATERIAL_SIGNALS = [
  { re: /\b(ceasefire|truce|peace deal|armistice)\b/i, type: 'De-escalation', why: 'A pause or end to hostilities changes the trajectory of the conflict.' },
  { re: /\b(escalat\w*|airstrike\w*|missile\w*|invasion|offensive|attack\w*|strike\w*|explosion|drone\w*)\b/i, type: 'Escalation', why: 'New military action changes the risk picture for everyone involved.' },
  { re: /\b(sanction\w*|embargo|export controls?|blacklist\w*)\b/i, type: 'Policy action', why: 'Coercive economic measures reshape incentives for the targeted parties.' },
  { re: /\b(rul(?:es|ed|ing)|verdict|court|indict\w*|convict\w*|acquit\w*|sentenc\w*)\b/i, type: 'Court ruling', why: 'A legal decision converts a dispute into enforceable fact.' },
  { re: /\b(sign(?:s|ed)?\s+(?:\w+\s+){0,2}(?:deal|agreement|accord|treaty|bill|law)|legislation|passes\s+(?:bill|law)|enact\w*)\b/i, type: 'Agreement / legislation', why: 'A formal commitment replaces speculation about intentions.' },
  { re: /\b(talks?\s+(?:collapse|break|resume|stall)|negotiat\w*\s+(?:progress|breakdown|resume)|walk(?:s|ed)?\s+out)\b/i, type: 'Negotiation shift', why: 'Movement at the table changes the odds of resolution.' },
  { re: /\b(rate\s+(?:cut|hike|decision)|inflation\s+(?:data|report|falls|rises)|gdp|jobs\s+report|unemployment)\b/i, type: 'Economic data / policy', why: 'Macro releases move markets and constrain policy options.' },
  { re: /\b(acquir\w*|merger|buys?\s|takeover|ipo|bankrupt\w*|default\w*|lays?\s+off|layoffs?)\b/i, type: 'Corporate action', why: 'A binding corporate move changes the competitive landscape.' },
  { re: /\b(resign\w*|fired|ousted|appoint\w*|elected|sworn in|succeed\w*)\b/i, type: 'Leadership change', why: 'Who holds the seat shapes what happens next.' },
  { re: /\b(surge\w*|plunge\w*|crash\w*|rall(?:y|ies)|record high|record low|sell-?off)\b/i, type: 'Market reaction', why: 'Prices are how the market votes on the development.' },
  { re: /\b(correct(?:s|ed|ion)|retract\w*|clarif\w*)\b/i, type: 'Correction', why: 'A factual correction changes what was previously believed.' },
];

function materialSignal(text) {
  for (const s of MATERIAL_SIGNALS) {
    if (s.re.test(text)) return s;
  }
  return null;
}

const STOP = new Set(['about', 'after', 'says', 'said', 'with', 'from', 'over', 'this', 'that', 'will']);
function tokens(text) {
  return new Set(
    (String(text).toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).filter((w) => !STOP.has(w))
  );
}

/**
 * Diff one cluster against a client snapshot.
 * Returns { clusterId, changes: [card], newArticleCount, suppressedCount }.
 * Each card: { what, why, type, at, replaces, classification, citations }.
 */
export function detectChanges(cluster, snapshot) {
  const seenIds = new Set(snapshot?.articleIds || []);
  const lastSeenAt = Number(snapshot?.lastSeenAt) || 0;

  const knownArticles = cluster.articles.filter((a) => seenIds.has(a.id));
  const newArticles = cluster.articles
    .filter((a) => !seenIds.has(a.id) && a.publishedAt > lastSeenAt)
    .sort((a, b) => a.publishedAt - b.publishedAt);

  // Baseline knowledge: tokens and numbers the user has already seen.
  const seenTokens = new Set();
  const seenNumbers = new Set();
  const seenEntities = new Set();
  for (const a of knownArticles) {
    const text = `${a.title}. ${a.summary || ''}`;
    for (const t of tokens(a.title)) seenTokens.add(t);
    for (const n of extractKeyNumbers(text)) seenNumbers.add(n.value);
    for (const e of extractEntities(text)) seenEntities.add(e.canonical);
  }

  const changes = [];
  let suppressed = 0;
  const emittedTokens = [];

  for (const a of newArticles) {
    const text = `${a.title}. ${a.summary || ''}`;
    const titleToks = tokens(a.title);

    // Suppress near-duplicates of already-seen coverage or of an already
    // emitted change card.
    const dupOfSeen = shared(titleToks, seenTokens) >= 4;
    const dupOfEmitted = emittedTokens.some((et) => shared(titleToks, et) >= 3);
    if (dupOfSeen || dupOfEmitted) {
      suppressed++;
      continue;
    }

    const signal = materialSignal(text);
    const numbers = extractKeyNumbers(text).filter((n) => !seenNumbers.has(n.value));
    const actors = extractEntities(text).filter((e) => !seenEntities.has(e.canonical));

    // Material = a recognised development type, or substantive new numbers,
    // or a genuinely new major actor entering the story.
    const isMaterial =
      Boolean(signal) || numbers.length >= 2 || (actors.length >= 2 && titleToks.size >= 4);
    if (!isMaterial) {
      suppressed++;
      continue;
    }

    const newActorNames = actors.slice(0, 3).map((e) => displayCase(e.canonical));
    changes.push({
      what: a.title,
      detail: (a.summary || '').slice(0, 280),
      why:
        signal?.why ||
        (numbers.length
          ? 'New concrete figures update the factual picture.'
          : `${newActorNames.join(', ')} ${newActorNames.length === 1 ? 'has' : 'have'} entered the story.`),
      type: signal?.type || (numbers.length ? 'New data' : `New actor: ${newActorNames[0] || ''}`),
      at: a.publishedAt,
      source: a.sourceName,
      replaces: knownArticles.length
        ? `Updates coverage you last saw ${new Date(lastSeenAt || knownArticles[0].publishedAt).toISOString().slice(0, 10)}`
        : 'First development since you followed this story',
      classification: 'FACT',
      citations: [a.id],
      link: a.link,
    });
    emittedTokens.push(titleToks);
    for (const t of titleToks) seenTokens.add(t);
    for (const n of extractKeyNumbers(text)) seenNumbers.add(n.value);
    for (const e of extractEntities(text)) seenEntities.add(e.canonical);
  }

  return {
    clusterId: cluster.id,
    title: cluster.title,
    edition: cluster.edition,
    changes: changes.slice(0, 5),
    newArticleCount: newArticles.length,
    suppressedCount: suppressed,
    latestAt: cluster.latestAt,
  };
}

function shared(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}
