/**
 * Market-impact analysis for the chat.
 *
 * When a reader asks what a piece of news means for markets ("how does this
 * affect oil?", "what will the Sensex do?", "should I be worried?"), the chat
 * adds three things to the usual article retrieval:
 *   1. live cross-asset prices (oil, gold, FX, yields, volatility, indices),
 *      pinned as citable sources so any number the answer quotes is verified;
 *   2. news from BOTH editions, since geopolitics moves markets;
 *   3. a structured scenario analysis (direction, size bucket, confidence,
 *      what to watch) that is validated here before it reaches the UI.
 * Pure functions; fetching lives in lib/markets.mjs.
 */

import { safeText } from './promptsafe.mjs';
import { numbersIn } from './grounding.mjs';

/** Assets the chat can price. `terms` decide when an asset is relevant to a question. */
export const ASSETS = [
  { key: 'brent', symbol: 'BZ=F', name: 'Brent crude', terms: /\b(oil|crude|brent|opec|petrol|gasoline|energy|hormuz|refiner\w*|shipping|tanker)\b/i },
  { key: 'wti', symbol: 'CL=F', name: 'WTI crude', terms: /\b(wti)\b/i },
  { key: 'gold', symbol: 'GC=F', name: 'Gold', terms: /\b(gold|safe[- ]haven|bullion|war|conflict|escalat\w*|sanctions?)\b/i },
  { key: 'usdinr', symbol: 'INR=X', name: 'USD/INR', terms: /\b(rupee|inr|india\w*|sensex|nifty|rbi|fii|fpi)\b/i },
  { key: 'dxy', symbol: 'DX-Y.NYB', name: 'US dollar index', terms: /\b(dollar|dxy|usd|currency|currencies|forex|fx|emerging)\b/i },
  { key: 'us10y', symbol: '^TNX', name: 'US 10-year yield', terms: /\b(yield|yields|treasur\w*|bond|bonds|fed|rate|rates|inflation|cpi|powell|fomc)\b/i },
  { key: 'vix', symbol: '^VIX', name: 'VIX volatility index', terms: /\b(vix|volatil\w*|fear|panic|risk|selloff|sell-off|crash)\b/i },
  { key: 'spx', symbol: '^GSPC', name: 'S&P 500', terms: /\b(s&p|wall street|us stocks?|us equities|american)\b/i },
  { key: 'ndx', symbol: '^IXIC', name: 'Nasdaq Composite', terms: /\b(nasdaq|tech|ai|chip\w*|semiconductor\w*|nvidia)\b/i },
  { key: 'btc', symbol: 'BTC-USD', name: 'Bitcoin', terms: /\b(bitcoin|btc|crypto\w*)\b/i },
];

// Always shown for a generic impact question: the cross-asset dashboard.
const CORE = ['spx', 'us10y', 'dxy', 'brent', 'gold', 'vix'];
const MAX_ASSETS = 6;

const IMPACT_INTENT = new RegExp(
  [
    '\\b(impact|implications?|affect\\w*|effects?|influence|fallout|spillover|knock[- ]on|ripple)\\b',
    '\\b(what (will|would|could|might|does it mean|happens?)|how (will|would|could|might)|where (is|are|will|would|do)\\b.*\\b(going|headed)|going to)\\b',
    '\\b(outlook|forecast|predict\\w*|expect\\w*|scenario\\w*|bullish|bearish|rally|crash|sell[- ]?off|correction|upside|downside)\\b',
    '\\b(buy|sell|hold|invest\\w*|position\\w*|hedge|hedging|exposure|portfolio|safe|worried|worry|should i|good time|stay invested|exit)\\b',
    '\\b(mean for|means for|matter for|bad for|good for|hurt|boost|benefit|winners?|losers?|risk to)\\b',
  ].join('|'),
  'i'
);

/** Is the reader asking what news means for markets or positioning? */
export function isImpactQuestion(text) {
  return IMPACT_INTENT.test(String(text || ''));
}

const MARKET_CUE =
  /\b(markets?|stocks?|shares?|equit\w*|index|indices|sensex|nifty|nasdaq|dow|s&p|invest\w*|portfolio|etfs?|mutual funds?|ipo|prices?|oil|crude|gold|rupee|dollar|currenc\w*|forex|yields?|bonds?|rates?|inflation|economy|economic|trade|tariffs?|sanctions?|commodit\w*|crypto\w*|bitcoin|earnings|sector|rally|crash|sell-?off)\b/i;

/**
 * Should the chat run the market-impact analysis? Needs impact intent, and in
 * the geopolitics edition also a market cue, so "who will win the election?"
 * stays a news question while "how will the strikes affect oil?" does not.
 */
export function wantsMarketImpact(text, edition = 'geopolitics') {
  if (!isImpactQuestion(text)) return false;
  return edition !== 'geopolitics' || MARKET_CUE.test(String(text || ''));
}

/** Is the reader asking for a decision ("should I buy...")? Used to allow a stated lean. */
export function asksForDecision(text) {
  return /\b(should i|shall i|do i (buy|sell|hold|exit)|is it (a )?(good|bad|safe) (time|idea)|buy or sell|worth (buying|selling)|stay invested|book profits?)\b/i.test(String(text || ''));
}

/**
 * Which assets to price for a question: the ones it names, then the core
 * dashboard, capped. Text from the recent thread helps ("and gold?").
 */
export function pickAssets(question, { priorText = '', max = MAX_ASSETS } = {}) {
  const q = `${question} ${priorText}`;
  const named = ASSETS.filter((a) => a.terms.test(q)).map((a) => a.key);
  const keys = [...new Set([...named, ...CORE])].slice(0, max);
  return keys.map((k) => ASSETS.find((a) => a.key === k));
}

const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (n, d = 2) => `${n >= 0 ? '+' : '-'}${fmt(Math.abs(n), d)}`;

/** A live quote as a pinned, citable source (same shape as marketSources items). */
export function assetSource(asset, quote, now = Date.now()) {
  if (!quote || !Number.isFinite(quote.price)) return null;
  const fiveDay = Number.isFinite(quote.change5dPercent)
    ? `, ${signed(quote.change5dPercent)}% over the past five sessions`
    : '';
  // A quote from a closed market is the last session's move, not today's.
  const when = now - (quote.asOf || now) < 18 * 36e5 ? 'today' : 'last session';
  return {
    id: `mkt-x-${asset.key}`,
    title: `${asset.name}: ${fmt(quote.price)} (${signed(quote.changePercent)}% ${when})`,
    summary:
      `${asset.name} last traded at ${fmt(quote.price)}${quote.currency ? ` ${quote.currency}` : ''}, ` +
      `${quote.changePercent >= 0 ? 'up' : 'down'} ${fmt(Math.abs(quote.changePercent))}% from the previous close${fiveDay}, ` +
      `as of ${new Date(quote.asOf || now).toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
    link: `https://finance.yahoo.com/quote/${encodeURIComponent(quote.symbol || asset.symbol)}`,
    sourceName: 'Yahoo Finance',
    publishedAt: quote.asOf || now,
    ageHours: 0,
    score: 98,
    clusterId: null,
  };
}

/** The strip of live numbers shown with the analysis (plain data, no model involved). */
export function marketDataStrip(pairs) {
  return pairs
    .filter(([, q]) => q && Number.isFinite(q.price))
    .map(([asset, q]) => ({
      key: asset.key,
      name: asset.name,
      price: q.price,
      changePercent: Number.isFinite(q.changePercent) ? Math.round(q.changePercent * 100) / 100 : null,
      change5dPercent: Number.isFinite(q.change5dPercent) ? Math.round(q.change5dPercent * 100) / 100 : null,
      asOf: q.asOf || null,
    }));
}

/** Prompt rules appended in impact mode. */
export function impactRules({ decision = false } = {}) {
  return `- IMPACT MODE: the reader wants to know what the news means for markets. Do the analysis yourself rather than only listing headlines:
  1. In "answer": 2-4 short sentences. First what happened (cited facts), then the transmission channel (how it reaches prices: e.g. oil supply -> inflation expectations -> yields -> equities), then the net lean. Then one sentence on what would change the view.
  2. Use the live prices (items from Yahoo Finance) as the baseline: say where each relevant asset trades and how it has already moved, so the reader can judge whether the news is priced in.
  3. Fill "analysis" (below). Give a clear lean even when uncertain: "mixed" or "unclear" is allowed only when the evidence genuinely points both ways. Never refuse to analyse.
  4. Reasoning that goes beyond the articles (typical market sensitivities, historical precedent, how a channel works) is allowed but must be stated as analysis ("typically", "tends to", "would likely"), set "usedBackgroundKnowledge": true, and carry no invented numbers. Do not state price targets, probabilities or percentage forecasts; use the size buckets instead.
  5. Say what is already priced in versus what is new, and name one or two concrete risks to the view.${
    decision
      ? '\n  6. The reader asked what to do. State a conditional lean in plain words ("On this evidence the balance of risk favours X; that changes if Y"), the main risk, and that position size and time horizon are theirs to judge. Do not refuse, and do not claim certainty.'
      : '\n  6. Do not tell the reader to buy or sell unless they ask; describe the likely direction and the risks.'
  }
- The analysis is scenario reasoning from the cited news and live prices, not financial advice. Do not add a disclaimer to "answer"; the app shows one.`;
}

/** JSON schema line for the prompt in impact mode. */
export const ANALYSIS_SCHEMA =
  '"analysis": {"stance": "bullish|bearish|mixed|neutral", "horizon": "intraday|days|weeks|months", "confidence": "low|medium|high", "assets": [{"name": "Brent crude", "direction": "up|down|flat|mixed", "size": "small|moderate|large", "confidence": "low|medium|high", "why": "one short sentence"}], "pricedIn": "one short sentence", "watch": ["2-3 concrete things that would change the view"], "risks": ["1-2 risks to this view"]}';

const STANCES = ['bullish', 'bearish', 'mixed', 'neutral'];
const HORIZONS = ['intraday', 'days', 'weeks', 'months'];
const LEVELS = ['low', 'medium', 'high'];
const DIRECTIONS = ['up', 'down', 'flat', 'mixed'];
const SIZES = ['small', 'moderate', 'large'];

const pick = (v, allowed, dflt) => {
  const s = String(v || '').toLowerCase().trim();
  return allowed.includes(s) ? s : dflt;
};

/**
 * Validate the model's analysis object. Enumerations are forced to known
 * values, text is stripped and bounded, and any sentence containing a number
 * that appears in neither the sources nor the question is dropped, so the
 * card cannot carry an invented price target.
 *
 * @param {*} raw  model output
 * @param {Array} sources  sources shown to the model
 * @param {Iterable<string>} [extraNumbers]  numbers from the question/thread
 * @returns {object|null} null when there is nothing usable
 */
export function sanitizeAnalysis(raw, sources = [], extraNumbers = []) {
  if (!raw || typeof raw !== 'object') return null;

  const known = new Set(extraNumbers);
  for (const s of sources) for (const n of numbersIn(`${s.title} ${s.summary || ''}`)) known.add(n);
  known.add(String(new Date().getFullYear()));

  // Small integers are ordinary words ("two risks", "10-year") unless they carry a unit.
  const unitless = (n, text) =>
    /^\d+$/.test(n) &&
    Number(n) <= 10 &&
    !new RegExp(`(?:[$€£₹]\\s?${n}\\b|\\b${n}\\s?(?:%|percent|bps?|basis|billion|million|trillion|bn|mn|x)(?![\\w]))`, 'i').test(text);
  const grounded = (text) => [...numbersIn(text)].every((n) => known.has(n) || unitless(n, text));
  const clean = (v, max) => {
    const t = safeText(v, max).replace(/\[\s*S?\d+[^\]]*\]/gi, '').replace(/\s+/g, ' ').trim();
    return t && grounded(t) ? t : '';
  };

  const assets = (Array.isArray(raw.assets) ? raw.assets : [])
    .slice(0, 6)
    .map((a) => ({
      name: safeText(a?.name, 40).trim(),
      direction: pick(a?.direction, DIRECTIONS, ''),
      size: pick(a?.size, SIZES, 'small'),
      confidence: pick(a?.confidence, LEVELS, 'low'),
      why: clean(a?.why, 200),
    }))
    .filter((a) => a.name && a.direction && a.why);

  const list = (v, n, max) =>
    (Array.isArray(v) ? v : []).slice(0, n).map((x) => clean(x, max)).filter(Boolean);

  const out = {
    stance: pick(raw.stance, STANCES, 'mixed'),
    horizon: pick(raw.horizon, HORIZONS, 'days'),
    confidence: pick(raw.confidence, LEVELS, 'low'),
    assets,
    pricedIn: clean(raw.pricedIn, 220),
    watch: list(raw.watch, 3, 160),
    risks: list(raw.risks, 2, 160),
  };
  if (assets.length === 0 && !out.pricedIn && out.watch.length === 0 && out.risks.length === 0) return null;
  return out;
}
