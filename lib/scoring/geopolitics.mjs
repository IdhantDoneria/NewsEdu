/**
 * Geopolitics 10-layer scoring pipeline.
 *
 * `calculateGeopoliticalScore(articleData)` returns an integer strictly in
 * [0,100]. It is a pure function — no I/O, no side effects — so it can be
 * called from any layer of the app (ingestion, re-ranking, unit tests).
 *
 * Expected `articleData` shape (all fields are optional; missing ones degrade
 * to neutral defaults instead of throwing):
 *   {
 *     title:       string,
 *     summary:     string,
 *     link:        string,   // used for hostname → trusted-domain lookup
 *     publishedAt: number,   // unix milliseconds
 *     source:      { name, trust (0-20), authority (0-10) },
 *   }
 *
 * Layer index → responsibility (matches spec exactly):
 *   L1  Source Credibility Baseline            — sets initial 0-100 running
 *   L2  Fact Extraction & Verification         — +factMatchRate × 0.2
 *   L3  Temporal Relevance Decay               — −0.5 per hour elapsed
 *   L4  Sentiment & Bias Neutralization        — −subjectivityPenalty
 *   L5  Information Density Index              — +densityBonus
 *   L6  Network Impact Analysis                — +citationBonus
 *   L7  Geopolitical Event Detection Matrix    — +eventRelevance × 0.1
 *   L8  Cross-Market Impact Evaluation         — +crossMarketAdjustment
 *   L9  Clickbait & Sensationalism Filter      — −clickbaitPenalty
 *   L10 Final Normalized Triangulation         — clampInt(running, 0, 100)
 */

import {
  clampInt,
  hostname,
  wordCount,
  safeText,
  countMatches,
  safeLayer,
} from './utils.mjs';
import { GEOPOLITICS_TRUSTED_DOMAINS } from './domains.mjs';

/* ----------------------------- Regex vocabulary ----------------------------- */
/* Compiled once at module load — reused across every scored article.          */

// Countries and territories — a representative worldwide sample. The pipeline
// scores presence, not completeness, so full ISO coverage isn't required.
const GEO_COUNTRIES = /\b(Russia|China|India|Ukraine|Israel|Iran|Iraq|Syria|Yemen|Gaza|Palestine|Lebanon|Egypt|Turkey|Turkiye|Saudi\s+Arabia|UAE|Qatar|Kuwait|Jordan|Afghanistan|Pakistan|Bangladesh|Vietnam|Taiwan|Thailand|Indonesia|Malaysia|Singapore|Philippines|Japan|Korea|Myanmar|Laos|Cambodia|Mongolia|Kazakhstan|Uzbekistan|Georgia|Armenia|Azerbaijan|Belarus|Poland|Germany|France|Britain|United\s+Kingdom|United\s+States|America|Canada|Mexico|Brazil|Argentina|Chile|Colombia|Venezuela|Peru|Ecuador|Bolivia|Cuba|Haiti|Nigeria|Kenya|Ethiopia|Sudan|Somalia|Libya|Algeria|Morocco|Tunisia|Ghana|Senegal|Congo|Rwanda|Uganda|Tanzania|Zimbabwe|Angola|Mozambique|Australia|New\s+Zealand|Italy|Spain|Portugal|Netherlands|Belgium|Switzerland|Sweden|Norway|Finland|Denmark|Ireland|Greece|Hungary|Romania|Serbia|Croatia|Slovenia|Czechia|Slovakia|Bulgaria|Austria|Estonia|Latvia|Lithuania|Cyprus|Malta|Iceland)\b/gi;

// Multilateral organisations and centres of power
const GEO_ORGS = /\b(UN|United\s+Nations|NATO|EU|European\s+Union|IMF|World\s+Bank|WHO|WTO|OPEC|ASEAN|African\s+Union|BRICS|G7|G20|OSCE|ICC|ICJ|UNSC|UNHCR|UNICEF|UNESCO|Kremlin|Pentagon|White\s+House|State\s+Department|Downing\s+Street|Elysee|Bundestag|Politburo|Duma|Knesset|IDF|PLA|Hezbollah|Hamas|Houthi|Taliban|Wagner)\b/g;

// Named heads-of-state / senior officials whose actions materially move policy
const GEO_LEADERS = /\b(Trump|Putin|Xi|Biden|Modi|Netanyahu|Zelensky|Zelenskyy|Macron|Merkel|Scholz|Starmer|Sunak|Erdogan|Erdoğan|Khamenei|Raisi|Pezeshkian|Lula|Milei|Sheinbaum|Trudeau|Meloni|Orban|Orbán)\b/g;

// Statistical anchors — currencies, magnitudes, percentages, years
const GEO_STATS = /\$\d[\d,.\s]*(?:bn|billion|mn|million|k|thousand|trillion|tn)?\b|\b\d+(?:\.\d+)?%|\b(?:19|20)\d{2}\b|\b\d{3,}\b/g;

// Subjective / emotive language that signals opinion over fact
const SUBJECTIVE_ADJ = /\b(shocking|stunning|incredible|unbelievable|staggering|devastating|alarming|terrifying|heartbreaking|jaw.dropping|mind.blowing|astonishing|outrageous|horrific|catastrophic|explosive|extraordinary|remarkable|astounding|scandalous|ridiculous|absurd|dreadful|horrendous|dire|grim|bombshell)\b/gi;

// Concrete geopolitical event vocabulary
const GEO_EVENTS = /\b(sanction(?:s|ed|ing)?|ceasefire|treaty|treaties|invade(?:s|d)?|invasion|coup|summit|diplomat(?:ic|s|ically)?|missile|airstrike|embassy|unrest|protest(?:s|ers|ing)?|alliance|negotiat(?:e|ed|ing|ion|ions)|tariff(?:s|ed)?|troops?|blockade|militia|referendum|extradit(?:e|ed|ion)|deported?|refugees?|annex(?:ed|ation)?|nuclear|regime|resolution|dispute|hostilities|airspace|drone|strike)\b/gi;

// Cross-border macro / commodity impact vocabulary
const CROSS_MARKET = /\b(oil|gas|crude|wheat|grain|currency|dollar|ruble|yuan|euro|shekel|rial|lira|peso|tariff|trade\s+war|supply\s+chain|commodit(?:y|ies)|export(?:s|ing)?|import(?:s|ing)?|embargo|energy\s+prices?|sanction(?:s|ed|ing)?)\b/gi;

// Clickbait tells (identical to the site's editorial cut policy)
const CLICKBAIT_PHRASES = [
  "you won't believe",
  'you wont believe',
  "here's why",
  "here's what",
  'this is why',
  'what happened next',
  'will shock you',
  'jaw-dropping',
  'mind-blowing',
  'goes viral',
  'the real reason',
  'you need to know',
  'one weird trick',
  'doctors hate',
  'best of',
  'ranked:',
  'quiz:',
];

/* ------------------------ Layer implementations (pure) ---------------------- */

// L1
function sourceCredibilityBaseline(articleData) {
  const host = hostname(articleData?.link);
  if (host && GEOPOLITICS_TRUSTED_DOMAINS[host] != null) {
    return GEOPOLITICS_TRUSTED_DOMAINS[host];
  }
  const s = articleData?.source;
  if (s && Number.isFinite(s.trust) && Number.isFinite(s.authority)) {
    // Editorial trust (0-20) contributes up to 60, topical authority (0-10)
    // contributes up to 40. Sum caps at 100.
    return Math.max(0, Math.min(100, s.trust * 3 + s.authority * 4));
  }
  return 45; // conservative neutral baseline for unknown outlets
}

// L2 — Fact Match Rate is 0-100; caller multiplies by 0.2.
function factMatchRate(text) {
  const hits =
    countMatches(text, GEO_COUNTRIES) +
    countMatches(text, GEO_ORGS) +
    countMatches(text, GEO_LEADERS) +
    countMatches(text, GEO_STATS);
  // 20 entity/stat hits saturates the rate at 100.
  return Math.min(100, hits * 5);
}

// L3 — pure age in hours × 0.5. Negative delta applied by caller.
function temporalDecayPenalty(articleData) {
  const ts = articleData?.publishedAt;
  if (!Number.isFinite(ts)) return 0;
  const hoursOld = Math.max(0, (Date.now() - ts) / 3_600_000);
  return hoursOld * 0.5;
}

// L4 — Subjectivity Penalty in raw points to subtract.
function subjectivityPenalty(text) {
  const subjective = countMatches(text, SUBJECTIVE_ADJ);
  const exclaim = countMatches(text, /!/g);
  // Each subjective adjective costs 3 pts; each exclamation costs 2.
  return Math.min(30, subjective * 3 + exclaim * 2);
}

// L5 — Density = hard-data hits / word count → converted to a capped bonus.
function informationDensityBonus(text) {
  const words = wordCount(text);
  if (words < 5) return 0; // too short to compute a meaningful ratio
  const hard =
    countMatches(text, GEO_COUNTRIES) +
    countMatches(text, GEO_ORGS) +
    countMatches(text, GEO_LEADERS) +
    countMatches(text, GEO_STATS);
  const ratio = hard / words;
  // Density Bonus: 60 × ratio, capped at 15 pts.
  return Math.min(15, ratio * 60);
}

// L6 — Proxies the "trackback / external references" signal using the source's
// topical authority (0-10, from lib/feeds.js). This keeps the layer well-defined
// even when we don't have real trackback data from the wire.
function citationBonus(articleData) {
  const authority = articleData?.source?.authority;
  if (!Number.isFinite(authority)) return 0;
  return Math.min(15, Math.max(0, authority) * 1.5);
}

// L7 — Event relevance 0-100; caller multiplies by 0.1.
function geopoliticsRelevance(text) {
  const hits = countMatches(text, GEO_EVENTS);
  return Math.min(100, hits * 10);
}

// L8 — Cross-border trade / commodity impact; small secondary weight.
function crossMarketAdjustment(text) {
  const hits = countMatches(text, CROSS_MARKET);
  if (hits === 0) return 0;
  return Math.min(8, 2 + hits); // saturates at +8
}

// L9 — Clickbait & headline/body discrepancy penalty.
function clickbaitPenalty(articleData) {
  const title = typeof articleData?.title === 'string' ? articleData.title : '';
  const body = typeof articleData?.summary === 'string' ? articleData.summary : '';
  if (!title) return 0;
  const tLower = title.toLowerCase();
  const bLower = body.toLowerCase();
  let penalty = 0;

  for (const phrase of CLICKBAIT_PHRASES) if (tLower.includes(phrase)) penalty += 8;
  if (title.trimEnd().endsWith('?')) penalty += 5; // Betteridge's law
  penalty += 3 * countMatches(title, /!/g);
  if (/\.\.\.$|…$/.test(title.trimEnd())) penalty += 4;
  const shouting = countMatches(title, /\b[A-Z]{4,}\b/g);
  if (shouting >= 2) penalty += 6;

  // Headline/body discrepancy: sensational body language absent from the headline
  const bodyClickbait = CLICKBAIT_PHRASES.filter((p) => bLower.includes(p)).length;
  const titleClickbait = CLICKBAIT_PHRASES.filter((p) => tLower.includes(p)).length;
  if (bodyClickbait > titleClickbait + 1) penalty += 4;

  return Math.min(50, penalty);
}

/* --------------------------------- Pipeline --------------------------------- */

/**
 * Public entry point. Runs the 10-layer pipeline and returns a clean integer.
 * Every layer is wrapped in `safeLayer` so a bad regex or a corrupt input
 * cannot crash the pipeline — the running total keeps moving forward.
 */
export function calculateGeopoliticalScore(articleData) {
  if (!articleData || typeof articleData !== 'object') return 0;
  const text = safeText(articleData);

  // L1 — initialise running total from the source credibility baseline.
  let running = safeLayer(() => sourceCredibilityBaseline(articleData), 45);

  // L2 — Fact Match Rate × 0.2 (bonus)
  running += safeLayer(() => factMatchRate(text) * 0.2);

  // L3 — Temporal Relevance Decay (penalty)
  running -= safeLayer(() => temporalDecayPenalty(articleData));

  // L4 — Sentiment & Bias Neutralisation (penalty)
  running -= safeLayer(() => subjectivityPenalty(text));

  // L5 — Information Density Bonus
  running += safeLayer(() => informationDensityBonus(text));

  // L6 — Network Impact / Citation Bonus
  running += safeLayer(() => citationBonus(articleData));

  // L7 — Geopolitical Event Relevance × 0.1 (bonus)
  running += safeLayer(() => geopoliticsRelevance(text) * 0.1);

  // L8 — Cross-Market Impact (secondary adjustment)
  running += safeLayer(() => crossMarketAdjustment(text));

  // L9 — Clickbait / Sensationalism (penalty)
  running -= safeLayer(() => clickbaitPenalty(articleData));

  // L10 — Final Normalised Triangulation
  return clampInt(running, 0, 100);
}

/* -------------- Internals exported for unit tests only ---------------------- */
export const __test__ = {
  sourceCredibilityBaseline,
  factMatchRate,
  temporalDecayPenalty,
  subjectivityPenalty,
  informationDensityBonus,
  citationBonus,
  geopoliticsRelevance,
  crossMarketAdjustment,
  clickbaitPenalty,
};
