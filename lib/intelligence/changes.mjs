/**
 * Material-change detection ("What Changed").
 *
 * The client keeps a per-followed-story snapshot ({ articleIds, lastSeenAt })
 * in localStorage. This module diffs that snapshot against the current
 * cluster and keeps only *material* developments. Duplicate retellings and
 * low-information updates are suppressed deterministically.
 *
 * Materiality:
 *  - a STRONG signal is an unambiguous development phrased as an event (a
 *    ruling, a signed deal, a rate decision, a resignation, a strike on a
 *    place). Every pattern is a verb-plus-object phrase, never a bare word:
 *    "fired tear gas", "workers strike a deal", "heart attack", "rules out",
 *    "market correction" and "ruling party" are not developments.
 *  - everything else ("interest-only" items) needs at least two independent
 *    weak signals: new key figures, a new major actor, a weak development
 *    verb. A hedged headline ("weighs", "could", "sources say") counts a
 *    strong signal as only one weak signal.
 *  - explainers, opinion, live blogs, previews and reaction roundups are never
 *    developments.
 *
 * Newness: an article is new when the reader has not seen it and it *arrived*
 * after they last looked. Arrival is its first-seen time when known (late-
 * indexed articles are published before the reader's last visit but indexed
 * after it), else its publication time. See noteFirstSeen.
 */

import { extractEntities, extractKeyNumbers, displayCase } from './entities.mjs';

const W = '(?:\\w+\\s+)'; // one word

// Development types, each with a why-it-matters template. `re` is
// case-insensitive; `cs` (optional) is case-sensitive.
const MATERIAL_SIGNALS = [
  {
    type: 'De-escalation',
    why: 'A pause or end to hostilities changes the trajectory of the conflict.',
    re: new RegExp(
      `\\b(?:(?:agree[sd]?|announce[sd]?|declare[sd]?|reach(?:es|ed)?|sign(?:s|ed)?|extend(?:s|ed)?|brokers?|brokered)\\s+${W}{0,3}(?:ceasefire|cease-fire|truce|armistice|peace (?:deal|agreement|accord))|(?:ceasefire|cease-fire|truce)\\s+(?:agreed|announced|takes? effect|begins|extended|holds|signed)|(?:hostages?|prisoners?)\\s+(?:freed|released)|\\breleases?\\s+${W}{0,2}(?:tanker|ship|prisoners?|hostages?|detainees?|journalist)\\b|prisoner (?:swap|exchange)|peace (?:deal|agreement|accord) (?:signed|reached))\\b`,
      'i'
    ),
  },
  {
    type: 'Escalation',
    why: 'New military action changes the risk picture for everyone involved.',
    re: new RegExp(
      [
        `\\b(?:air|drone|missile|rocket|artillery|retaliatory|military|naval|israeli|russian|ukrainian|american|iranian)\\s+strikes?\\b`,
        `\\bstrikes?\\s+(?:hit|hits|kill|kills|killed|target\\w*|on\\s+${W}{0,2}(?:city|town|base|capital|port|village|camp|hospital|school|depot|refinery|airbase|convoy|border))`,
        `\\b(?:launch(?:es|ed)?|fires?|fired)\\s+${W}{0,2}(?:missiles?|rockets?|drones?)\\b`,
        `\\b(?:missiles?|rockets?|drones?)\\s+(?:hit|hits|strike|struck|slam\\w*|land|launched|fired|downed|intercepted|kill\\w*)\\b`,
        `\\b(?:armed|terror\\w*|drone|missile|rocket|suicide|surprise|deadly|major|large-scale|coordinated|military|cyber|rebel|militant|gun)\\s+attacks?\\b`,
        `\\battacks?\\s+(?:kills?|killed|leaves?|on\\s+(?:a |an |the )?${W}{0,2}(?:base|convoy|embassy|city|capital|port|village|camp|hospital|school|market|station|airport|pipeline|refinery|troops|forces|civilians|border))`,
        `\\b(?:launch\\w*|begins?|began|full-scale|ground|military|land|amphibious)\\s+(?:an?\\s+)?invasion\\b|\\binvasion\\s+(?:begins|force|troops|forces)\\b|\\binvade[sd]\\b`,
        `\\b(?:ground|military|major|new|renewed|large-scale|spring|summer|counter)[ -]offensive\\b|\\blaunch\\w*\\s+(?:an?\\s+)?offensive\\b`,
        `\\bescalat(?:e|es|ed|ing|ion)\\b`,
        `\\b(?:ceasefire|cease-fire|truce)\\s+(?:collapses?|breaks?\\s*down|violated|shattered|ends)\\b`,
        `\\bexplosions?\\s+(?:rocks?|hits?|kills?|injures?|near)\\b|\\b(?:after|following|amid)\\s+(?:an?\\s+)?(?:explosion|blast)\\b|\\bblast\\s+kills\\b|\\bexplodes\\b|\\bshelling\\b|\\bcoup\\b`,
      ].join('|'),
      'i'
    ),
  },
  {
    type: 'Policy action',
    why: 'Coercive economic measures reshape incentives for the targeted parties.',
    re: new RegExp(
      `\\b(?:(?:impose[sd]?|lift(?:s|ed)?|extend(?:s|ed)?|tighten(?:s|ed)?|announce[sd]?|adopt(?:s|ed)?|new|fresh|eases?|expand(?:s|ed)?)\\s+${W}{0,3}(?:sanctions?|embargo|export controls?|tariffs?)|(?:sanctions|embargo|export controls|tariffs)\\s+(?:imposed|lifted|extended|take effect|announced|eased|tighten\\w*)|blacklists?\\s+\\w+)\\b`,
      'i'
    ),
  },
  {
    type: 'Court ruling',
    why: 'A legal decision converts a dispute into enforceable fact.',
    re: new RegExp(
      [
        `\\b(?:court|judge|justices?|tribunal|jury)\\s+${W}{0,2}(?:rules?|ruled|orders?|ordered|blocks?|blocked|upholds?|upheld|strikes? down|struck down|overturns?|overturned|dismisses|dismissed|rejects?|rejected|convicts?|convicted|acquits?|acquitted|sentences?|sentenced|jails?|jailed|fines?|fined|approves?|clears?)\\b`,
        `\\b(?:rules?|ruled)\\s+(?:that|against|in favou?r)\\b`,
        `\\b(?:a|the|its|landmark)\\s+ruling\\b|\\bruling\\s+(?:on|that|against)\\b`,
        `\\bverdict\\b|\\bconvicted\\b|\\bacquitted\\b|\\bsentenced\\b|\\bindicted\\b|\\bindictment\\b`,
        `\\bpleaded?\\s+(?:not\\s+)?guilty\\b|\\bjailed\\s+(?:for|over)\\b`,
      ].join('|'),
      'i'
    ),
  },
  {
    type: 'Agreement / legislation',
    why: 'A formal commitment replaces speculation about intentions.',
    re: new RegExp(
      [
        `\\bsign(?:s|ed)?\\s+${W}{0,2}(?:deal|agreement|accord|treaty|bill|law|pact|memorandum)\\b`,
        `\\b(?:bill|law|legislation|budget|package|treaty|resolution|measure|merger|acquisition|takeover|deal|plan)\\s+(?:passes|passed|approved|adopted|enacted|ratified|clears|cleared|signed)\\b`,
        `\\b(?:passes|passed|approves?|approved|adopts?|adopted|enacts?|enacted|ratif\\w+|clears)\\s+${W}{0,3}(?:bill|law|legislation|budget|treaty|resolution|package|measure)\\b`,
        `\\bsigned into law\\b|\\bratif(?:y|ies|ied|ication)\\b`,
        `\\breach(?:es|ed)?\\s+${W}{0,2}(?:deal|agreement|accord|compromise)\\b|\\b(?:deal|agreement|accord)\\s+(?:reached|signed)\\b`,
        `\\bagree[sd]?\\s+(?:to|on)\\s+${W}{0,3}(?:deal|terms|framework|plan)\\b`,
        `\\bagree[sd]?\\s+to\\s+(?:withdraw|pull|halt|end|stop|suspend|resume|release|extend|cut|lift|ban|allow|reopen)\\b`,
      ].join('|'),
      'i'
    ),
  },
  {
    type: 'Negotiation shift',
    why: 'Movement at the table changes the odds of resolution.',
    re: /\b(?:talks?\s+(?:collapse[sd]?|break(?:s)?\s*down|broke down|stall(?:s|ed)?|resume[sd]?|suspend\w*|fail\w*)|(?:collapse|breakdown|failure|suspension|resumption) of (?:the )?(?:\w+\s+)?talks|walks?\s*out|walked out|negotiat\w+\s+(?:collapse\w*|break\w*|resume\w*|stall\w*))\b/i,
  },
  {
    type: 'Economic data / policy',
    why: 'Macro releases move markets and constrain policy options.',
    re: new RegExp(
      [
        `\\b(?:cuts?|hikes?|raises?|lowers?|holds?|keeps?|slash(?:es)?|leaves?)\\s+${W}{0,2}(?:interest )?rates?\\b(?!\\s+of\\b)`,
        `\\brates?\\s+(?:cut|hike|decision|rise)\\b|\\brates?\\s+(?:unchanged|on hold|steady|held)\\b`,
        `\\b(?:inflation|cpi|gdp|unemployment|jobs?|payrolls?|retail sales|growth|economy|trade deficit|exports|imports)\\s+${W}{0,2}(?:rises?|rose|falls?|fell|jumps?|jumped|slows?|slowed|accelerates?|accelerated|shrinks?|shrank|contracts?|contracted|climbs?|climbed|drops?|dropped|adds?|added|cools?|cooled|eases|rebounds?|surges?|stalls?|grew|grows)\\b`,
        `\\b(?:inflation|gdp|unemployment)\\s+(?:data|report|figures)\\b|\\bjobs report\\b`,
      ].join('|'),
      'i'
    ),
  },
  {
    type: 'Corporate action',
    why: 'A binding corporate move changes the competitive landscape.',
    re: new RegExp(
      [
        `\\bagrees?\\s+to\\s+(?:acquire|buy|sell|merge)\\b`,
        `\\b(?:agrees?|agreed|announces?|announced|completes?|completed|clinch(?:es)?|seals?)\\s+${W}{0,3}(?:acquisition|merger|takeover|buyout)\\b`,
        `\\bbankrupt\\w*|\\bchapter 11\\b|\\binsolven\\w+|\\bbailout\\b|\\bbank (?:fails|collapses)\\b`,
        `\\blays? off\\s+(?:\\d|thousands|hundreds)|\\blayoffs?\\b|\\bjob cuts\\b|\\bcuts? [\\d,]+ jobs\\b`,
        `\\bfiles? for (?:an )?ipo\\b|\\bipo (?:filing|priced|pricing|debut)\\b|\\bgoes? public\\b|\\bprices? (?:its )?ipo\\b`,
        `\\b(?:profit|revenue|earnings|sales|forecast|guidance|outlook)\\s+(?:warning|slumps?|plunges?|tumbles?)\\b|\\bslashes?\\s+${W}{0,2}(?:forecast|guidance|outlook)\\b|\\bcuts?\\s+${W}{0,2}(?:forecast|guidance|outlook)\\b|\\b(?:beats?|misses?)\\s+${W}{0,2}(?:estimates|expectations|forecasts)\\b`,
        `\\b(?:raises?|raised|secures?|secured|closes|closed)\\s+(?:[$£€]|us\\$)\\s?\\d[\\d.,]*\\s?(?:k|m|mn|bn|b|million|billion|trillion)\\b`,
        `\\brecalls?\\s+[\\d,]+\\b`,
      ].join('|'),
      'i'
    ),
    // "Chipmaker Foo acquires Bar for $9bn": a capitalised object and a price.
    cs: /\b(?:acquires|acquired|buys|bought)\s+[A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3}\b.{0,40}?(?:[$£€]\s?\d|billion|million)/,
  },
  {
    type: 'Leadership change',
    why: 'Who holds the seat shapes what happens next.',
    re: new RegExp(
      [
        `\\bresign(?:s|ed|ation)?\\b|\\bsteps?\\s+down\\b|\\bstepped\\s+down\\b|\\bousted\\b|\\bsacked\\b|\\bdismissed\\s+(?:as|from)\\b`,
        `\\b(?:fires?|fired|sacks?|dismisses|ousts?)\\s+(?:its |the |their |his |her )?(?:\\w+\\s+)?(?:ceo|chief|director|manager|coach|minister|secretary|head|chairman|chair|governor|commissioner|president|prime minister|chancellor|general|ambassador)\\b`,
        `\\bappoints?\\s+\\w|\\bappointed\\s+(?:as|new)\\b|\\bnames?\\s+${W}{0,3}(?:as )?(?:new )?(?:ceo|chief|minister|head|chair|governor|successor)\\b`,
        `\\bsworn\\s+in\\b|\\b(?:is|was|been|gets?|becomes?)\\s+elected\\b|\\belected\\s+(?:as\\s+)?(?:president|prime minister|leader|speaker|governor|mayor|chair)\\b`,
        `\\bwins?\\s+(?:the\\s+)?(?:presidential |general |parliamentary |runoff |run-off )?(?:election|vote|race|majority)\\b|\\bconcedes\\b|\\bconcedes? defeat\\b`,
        `\\bconfirms?\\s+${W}{0,2}(?:as\\s+)?(?:new )?${W}?(?:secretary|minister|nominee|justice|judge|director|governor|ambassador)\\b`,
        `\\b(?:government|coalition|cabinet)\\s+(?:collapses?|falls?|resigns?)\\b|\\bno-confidence\\b|\\bcabinet reshuffle\\b`,
        `\\barrest(?:s|ed)\\b|\\bcharged with\\b|\\bindicts?\\b`,
      ].join('|'),
      'i'
    ),
  },
  {
    type: 'Market reaction',
    why: 'Prices are how the market votes on the development.',
    re: new RegExp(
      [
        `\\b(?:stocks?|shares|markets?|index|dow|nasdaq|s&p|bitcoin|crypto|oil|gold|yields?|bonds?|dollar|currency|sensex|nifty|brent)\\b.{0,40}\\b(?:surge\\w*|plunge\\w*|crash\\w*|rall(?:y|ies|ied)|tumbl\\w*|soar\\w*|slump\\w*|sell-?off|jump\\w*|sink\\w*|slide\\w*)`,
        `\\brecord (?:high|low)\\b`,
        `\\bsell-?off\\b`,
      ].join('|'),
      'i'
    ),
  },
  {
    type: 'Correction',
    why: 'A factual correction changes what was previously believed.',
    re: /\b(?:issues? (?:a )?correction|retract(?:s|ed|ion)|walks? back)\b/i,
  },
  {
    type: 'Casualties / emergency',
    why: 'The human and physical toll changes how serious the event is.',
    re: new RegExp(
      [
        `\\b(?:death toll|toll)\\s+(?:rises?|climbs?|reaches?|hits?|jumps?|now)\\b`,
        `\\b(?:kills?|killed)\\s+(?:at least\\s+)?\\d`,
        `\\b\\d[\\d,]*\\s+(?:dead|killed|people killed)\\b|\\bdead\\s+(?:in|after)\\b`,
        `\\blandfall\\b|\\bevacuat\\w+\\s+(?:\\d|thousands|hundreds)|\\b(?:thousands|hundreds|\\d[\\d,]*)\\s+(?:evacuated|displaced|homeless)\\b`,
        `\\bstate of emergency\\b|\\bdeclares?\\s+(?:a\\s+)?(?:famine|emergency|disaster)\\b|\\bmartial law\\b|\\bcurfew\\b`,
        `\\bearthquake\\s+(?:strikes|hits|kills)\\b|\\bplane crash\\b|\\bcrash(?:es)?\\s+kills?\\b|\\bwildfire\\s+(?:forces|destroys)\\b|\\bdam (?:collapse|breach)\\b`,
      ].join('|'),
      'i'
    ),
  },
  {
    type: 'Labour action',
    why: 'Industrial action changes service, supply and bargaining power.',
    re: new RegExp(
      [
        `\\b(?:workers|pilots|nurses|doctors|teachers|unions?|staff|drivers|miners|dockworkers)\\s+${W}{0,2}(?:walk(?:s|ed)?\\s*out|go(?:es)?\\s+on\\s+strike|went\\s+on\\s+strike|launch\\w*\\s+(?:a\\s+)?strike)\\b`,
        `\\bstrike\\s+(?:begins|ends|enters|called off|suspended)\\b`,
        `\\b(?:end|ends|ended|calls? off|suspends?)\\s+(?:the\\s+)?strike\\b`,
        `\\bwalkout\\b|\\block-?out\\b`,
      ].join('|'),
      'i'
    ),
  },
  {
    type: 'Territorial change',
    why: 'Control of ground decides who can act next.',
    re: new RegExp(
      `\\b(?:seize[sd]?|captur\\w+|takes? control of|retakes?|retook|recaptur\\w+)\\s+(?:the\\s+)?${W}{0,2}(?:city|town|capital|port|base|province|district|border|airport|village)\\b`,
      'i'
    ),
  },
  {
    type: 'Fiscal policy',
    why: 'Tax and spending choices redistribute costs and set the policy agenda.',
    re: new RegExp(
      `\\b(?:raises?|cuts?|scraps?|freezes?|introduces?|imposes?|abolishes?|unveils?|announces?|slashes?)\\s+${W}{0,3}(?:tax|taxes|levy|duty|duties|subsid\\w+|budget)\\b`,
      'i'
    ),
  },
  {
    type: 'Policy change',
    why: 'Reversing or delaying a plan changes what everyone has to prepare for.',
    re: new RegExp(
      `\\b(?:scraps?|drops?|shelves|abandons?|reverses?|cancels?|postpones?|delays?)\\s+${W}{0,3}(?:plan\\w*|reform|policy|increase|rise|law|rule|ban|programme|project|launch)\\b`,
      'i'
    ),
  },
  {
    type: 'Disruption',
    why: 'A closure or outage changes what people and supply chains can rely on.',
    re: new RegExp(
      [
        `\\b(?:plant|reactor|airport|port|border|canal|pipeline|mine|factory|refinery|bridge|road|highway|strait|school)s?\\s+(?:shut|closed|reopens?|reopened|halted|suspended|evacuated)\\b`,
        `\\b(?:shut|closes?|reopens?|halts?|suspends?)\\s+${W}{0,2}(?:plant|reactor|airport|port|border|canal|pipeline|mine|factory|refinery|bridge|strait)\\b`,
        `\\b(?:frees|refloats?)\\s+${W}{0,2}ship\\b|\\b(?:canal|port|strait)\\s+reopens\\b`,
      ].join('|'),
      'i'
    ),
  },
  {
    type: 'Milestone',
    why: 'A completed step moves the project from plan to fact.',
    re: new RegExp(
      `\\blaunch(?:es|ed)?\\s+${W}{0,2}(?:crew|rocket|satellite|mission|probe|spacecraft|astronauts?)\\b|\\b(?:docks?|docked|splashes? down)\\b`,
      'i'
    ),
  },
  {
    type: 'Regulatory action',
    why: 'A regulator\'s decision sets the rules the parties now have to live under.',
    re: new RegExp(
      [
        `\\b(?:regulators?|commission|authority|watchdog|fda|sec|ftc|doj|agency)\\s+${W}{0,2}(?:fines?|sues?|bans?|blocks?|approves?|clears?|rejects?|orders?)\\b`,
        `\\b(?:fda|ema)\\s+approv\\w+|\\bfined\\s+[$£€]|\\bfines?\\s+\\w+(?:\\s+\\w+)?\\s+[$£€]\\d`,
      ].join('|'),
      'i'
    ),
  },
  {
    type: 'Security incident',
    why: 'A breach or attack on systems changes exposure and trust.',
    re: /\b(?:cyber-?attack|ransomware|data breach|hackers?\s+(?:breach|steal|stole|hit|hits|attack)|hacked)\b/i,
  },
];

function materialSignal(text) {
  for (const s of MATERIAL_SIGNALS) {
    if (s.re.test(text) || (s.cs && s.cs.test(text))) return s;
  }
  return null;
}

// Weak development verbs: they count toward the two-signal rule only.
const WEAK_VERB_RE =
  /\b(?:announces?|announced|confirms?|confirmed|unveils?|unveiled|launches|launched|agrees?|agreed|orders?|ordered|bans?|banned|approves?|approved|rejects?|rejected|halts?|halted|suspends?|suspended|lifts?|lifted|reveals?|revealed|discloses?|disclosed|warns|vows?|threatens?)\b/i;

// Not developments: explainers, opinion, live blogs, previews, roundups.
const NON_DEVELOPMENT_RE =
  /^\s*(?:opinion|analysis|explainer|editorial|column|profile|review|podcast|newsletter|watch|listen|photos?|in pictures|quiz|how to|how do|how does|why|what to expect|what we know|what you need to know|\d+\s+(?:things|ways|tips|key|reasons)|five\b|ten\b|live updates?)\b|:\s*(?:what we know|explained|live updates?|a guide)\b|\b(?:explainer|explained|live updates?|live blog|as it happened|week in pictures|in pictures|world leaders react|markets? react|reaction[s]? (?:to|roundup)|what to expect|what we know)\b|\btips for\b|\bby the numbers\b|\bpreview\b/i;

// Hedged/speculative phrasing: the event has not happened.
const HEDGE_RE =
  /\?|\b(?:could|may|might|considering|weighs?|mulls?|eyes?|expected to|set to|poised to|plans? to|seeks? to|hopes?|rumou?rs?|reportedly|sources say|according to sources|no breakthrough|talks continue|urge[sd]?|calls? for|called for|demands?|petition|debates?|considers?|discusses?|looms?|awaits?|ahead of|whether|will|would|should|if)\b/i;

const STOP = new Set(['about', 'after', 'says', 'said', 'with', 'from', 'over', 'this', 'that', 'will', 'what', 'have', 'been']);
function tokens(text) {
  return new Set(
    (String(text).toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).filter((w) => !STOP.has(w))
  );
}

function shared(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

/* ------------------------------- first seen -------------------------------- */

// article id -> first time this process saw it (only recorded for articles
// recent enough that "late-indexed" is plausible; older ones keep their
// publication time so a restart cannot make a stale article look new).
const FIRST_SEEN_WINDOW_MS = 12 * 36e5;
const FIRST_SEEN_MAX = 4000;
const g = globalThis;
if (!g.__meridianFirstSeen) g.__meridianFirstSeen = new Map();
const firstSeen = g.__meridianFirstSeen;

/** Record when articles were first indexed. Call on every request that reads clusters. */
export function noteFirstSeen(articles, now = Date.now()) {
  for (const a of articles || []) {
    if (!a?.id || firstSeen.has(a.id)) continue;
    if (now - (Number(a.publishedAt) || 0) > FIRST_SEEN_WINDOW_MS) continue;
    firstSeen.set(a.id, now);
  }
  if (firstSeen.size > FIRST_SEEN_MAX) {
    for (const k of [...firstSeen.keys()].slice(0, firstSeen.size - FIRST_SEEN_MAX)) firstSeen.delete(k);
  }
}

export function noteClustersFirstSeen(clusters, now = Date.now()) {
  for (const c of clusters || []) noteFirstSeen(c.articles, now);
}

/** When the article arrived: explicit firstSeenAt, tracked first sight, else publication time. */
export function arrivalTime(article, tracker = firstSeen) {
  return Number(article.firstSeenAt) || tracker.get(article.id) || Number(article.publishedAt) || 0;
}

/**
 * Diff one cluster against a client snapshot.
 * Returns { clusterId, changes: [card], newArticleCount, suppressedCount }.
 * Each card: { what, why, type, at, replaces, classification, citations }.
 * opts.firstSeen: Map<articleId, ts> overriding the process tracker (tests).
 */
export function detectChanges(cluster, snapshot, opts = {}) {
  const tracker = opts.firstSeen || firstSeen;
  const seenIds = new Set(snapshot?.articleIds || []);
  const lastSeenAt = Number(snapshot?.lastSeenAt) || 0;

  const knownArticles = cluster.articles.filter((a) => seenIds.has(a.id));
  const newArticles = cluster.articles
    .filter((a) => !seenIds.has(a.id) && arrivalTime(a, tracker) > lastSeenAt)
    .sort((a, b) => a.publishedAt - b.publishedAt || (a.id < b.id ? -1 : 1));

  // Baseline knowledge: tokens and numbers the user has already seen.
  const seenTokens = new Set();
  const seenNumbers = new Set();
  const seenEntities = new Set();
  const seenSignalTypes = new Set();
  for (const a of knownArticles) {
    const text = `${a.title}. ${a.summary || ''}`;
    const known = materialSignal(a.title);
    if (known && !HEDGE_RE.test(a.title)) seenSignalTypes.add(known.type);
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
    // Signals are read from the headline; the summary only supplies figures
    // and actors. A trigger word buried in a summary sentence is background.
    const signal = materialSignal(a.title) || null;

    // Token overlap with coverage already seen means a retelling, unless the
    // headline reports a kind of development the reader has not seen yet
    // ("talks open" -> "talks end in ceasefire" shares most words).
    const overlap = shared(titleToks, seenTokens);
    const looksSeen = overlap >= 4 || (titleToks.size >= 4 && overlap / titleToks.size >= 0.7);
    const sameKindSeen = signal && seenSignalTypes.has(signal.type) && overlap >= 2;
    const dupOfSeen = (looksSeen && !(signal && !seenSignalTypes.has(signal.type))) || sameKindSeen;
    const dupOfEmitted = emittedTokens.some((et) => shared(titleToks, et) >= 3);
    if (dupOfSeen || dupOfEmitted || NON_DEVELOPMENT_RE.test(a.title)) {
      suppressed++;
      continue;
    }

    const numbers = extractKeyNumbers(text).filter((n) => !seenNumbers.has(n.value));
    // Actors come from the headline: summaries name wires and pollsters ("a Reuters poll") that are not new players.
    const actors = extractEntities(a.title).filter((e) => !seenEntities.has(e.canonical));
    const hedged = HEDGE_RE.test(a.title);

    const weak =
      (signal && hedged ? 1 : 0) +
      (numbers.length >= 1 ? 1 : 0) +
      (actors.length >= 1 && titleToks.size >= 4 ? 1 : 0) +
      (WEAK_VERB_RE.test(a.title) ? 1 : 0);
    const isMaterial = (signal && !hedged) || weak >= 2;
    if (!isMaterial) {
      suppressed++;
      continue;
    }

    const newActorNames = actors.slice(0, 3).map((e) => displayCase(e.canonical));
    const useSignal = signal && !hedged;
    changes.push({
      what: a.title,
      detail: (a.summary || '').slice(0, 280),
      why:
        (useSignal && signal.why) ||
        (numbers.length
          ? 'New concrete figures update the factual picture.'
          : newActorNames.length
            ? `${newActorNames.join(', ')} ${newActorNames.length === 1 ? 'has' : 'have'} entered the story.`
            : 'A new development in a story you follow.'),
      type:
        (useSignal && signal.type) ||
        (numbers.length ? 'New data' : newActorNames[0] ? `New actor: ${newActorNames[0]}` : 'Development'),
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
    if (signal && !hedged) seenSignalTypes.add(signal.type);
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
