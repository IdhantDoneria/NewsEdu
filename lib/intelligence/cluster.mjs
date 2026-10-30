/**
 * Deterministic event clustering.
 *
 * Groups the scored article pool into story clusters — articles covering the
 * same underlying development. Design constraints (from the product spec):
 *
 *   - no duplicate clusters for the same event;
 *   - no merging of unrelated stories that merely share a country or person;
 *   - no merging of different phases of a broad conflict without meaningful
 *     event similarity;
 *   - membership requires a DISTINGUISHING shared term (a rare name, a
 *     specific noun, a figure) — shared actors such as "Iran", "Russia" or
 *     "Trump" are evidence but never enough on their own.
 *
 * How it works
 *   1. Inputs are sorted by (publishedAt, id) first, so the output cannot
 *      depend on input order (the permutation test shuffles and compares).
 *   2. Headlines (plus a lightly weighted summary) are canonicalised —
 *      aliases and transliterations ("Kiev"/"Kyiv"), demonyms ("Russian" ->
 *      Russia), US/UK spellings, synonyms ("accord" -> deal), and figures
 *      ("$85 billion" = "85bn") — then turned into TF-IDF vectors over
 *      words, adjacent-word pairs and entity ids, with IDF taken from the
 *      batch itself. Actors and filler event verbs are down-weighted.
 *   3. Candidate links are article pairs inside a 48 h window whose cosine
 *      similarity clears a threshold, that share distinguishing evidence and
 *      do not name conflicting places (Georgia the country vs the US state
 *      resolve to different ids; Iran vs Japan earthquakes conflict).
 *   4. Links are applied strongest-first (union-find) but a merge also has to
 *      keep the clusters' AVERAGE pairwise similarity above a floor and stay
 *      under a size cap, which stops chains of loosely related stories.
 *
 * Cluster IDs: `c` + hash of the earliest member's link, so they are
 * reproducible across serverless instances. They are NOT stable under
 * membership drift (if the earliest member ages out the id changes);
 * lib/intelligence/identity.mjs reconciles ids against the previous run so
 * follows and bookmarks survive that.
 */

import {
  extractEntities,
  extractEventTerms,
  normalizeText,
  canonOfToken,
  entityKind,
  placesConflict,
  FREQUENT_ACTORS,
  PLACE_PARENT,
} from './entities.mjs';
import { normalizeTitleKey, wordShingles, jaccard, outletKey } from '../text.mjs';

/* --------------------------------- tunables --------------------------------- */

export const CLUSTER_PARAMS = {
  windowMs: 48 * 36e5, // two articles must be published within this of each other
  spanMs: 96 * 36e5, // and a whole cluster may not span more than this
  edgeSim: 0.3, // minimum cosine similarity for a link
  avgSim: 0.1, // floor for a merge's average pairwise similarity
  maxSize: 25, // size cap per cluster
  syndicationJaccard: 0.6, // 3-word-shingle Jaccard above which a title is a copy
  freqDfFloor: 4, // a term in >= max(floor, share*N) articles is not distinguishing
  freqDfShare: 0.08,
};

/* --------------------------------- text model --------------------------------- */

const STOP_RAW = `
about above after again against amid among around because before being below between both could does doing down during each even every
from further have having here herself himself into itself just like many might more most much must near never next only other ours over
same should since some such than that their theirs them then there these they this those through under until upon very were what when
where which while whom whose will with within without would your yours also been once off onto per via vs
the and for are but not you all any can had her was one our out day get has him his how man new now old see two way who boy did its let
put say she too use may yet nor top big
says said say told tells tell according reportedly reports report sources source latest live watch video photos analysis opinion explained
explainer know knows known need needs back make makes made take takes took come comes came goes going gone want wants think thinks
today tonight week weeks month months year years time times still another others
what's here's that's it's
news update updates breaking exclusive
`;

// Event verbs and nouns so common that sharing one says nothing about "same event".
const GENERIC_RAW = `
deal talks strike kill hold cut hike acquire raise earnings rate win drop rise stock bank
lead leads face faces set sets plan plans move moves call calls urge urges warn warns vow vows seek seeks push pushes hit hits
government official officials minister president leader leaders party force forces police military troop troops soldier soldiers
people woman child children family country nation city state states public group
record highest lowest biggest largest first last second third massive huge key major
war peace crisis conflict tension tensions security defense budget trade economy economic market markets growth investor investors
price prices sale sales company firm business industry sector
meeting meet meets visit visits summit agree agrees announce announces launch launches open opens reach reaches
join joins back backs show shows
fight fights clash clashes violence attack
case cases claim claims charge charges
rally
`;

const KEEP_SHORT = new Set(['ai', 'ev', 'tv', 'pm', 'un', 'eu', 'uk', 'us', '5g', '4g']);

const UKUS = new Map(Object.entries({
  defence: 'defense', offence: 'offense', licence: 'license', centre: 'center', centres: 'centers', programme: 'program',
  programmes: 'programs', labour: 'labor', colour: 'color', favour: 'favor', honour: 'honor', neighbour: 'neighbor',
  neighbours: 'neighbors', behaviour: 'behavior', harbour: 'harbor', tyre: 'tire', tyres: 'tires', grey: 'gray',
  jewellery: 'jewelry', theatre: 'theater', metre: 'meter', litre: 'liter', fibre: 'fiber', catalogue: 'catalog',
  dialogue: 'dialog', analyse: 'analyze', analysed: 'analyzed', cancelled: 'canceled', cancelling: 'canceling',
  travelled: 'traveled', travelling: 'traveling', modelling: 'modeling', fuelled: 'fueled', jailed: 'jailed',
  judgement: 'judgment', ageing: 'aging', plough: 'plow', sceptical: 'skeptical', whilst: 'while', mum: 'mom',
  paediatric: 'pediatric', maths: 'math', aluminium: 'aluminum', storey: 'story', lorry: 'truck', petrol: 'gasoline',
  gaol: 'jail', 'per-cent': 'percent',
}));

// Concept groups: surface words that all stand for one idea. Keys are stemmed
// at load, so inflections need not be listed.
const CONCEPT_GROUPS = {
  deal: ['deal', 'agreement', 'accord', 'pact', 'treaty'],
  ceasefire: ['ceasefire', 'truce'],
  kill: ['kill', 'dead', 'death', 'die', 'deadly', 'fatal', 'fatalities', 'toll', 'perish', 'slain', 'killing'],
  strike: ['strike', 'airstrike', 'attack', 'assault', 'raid', 'bombardment', 'bombing', 'barrage', 'shelling', 'offensive'],
  power: ['power', 'electricity', 'blackout', 'outage', 'grid'],
  quake: ['earthquake', 'quake', 'tremor', 'temblor'],
  protest: ['protest', 'protester', 'demonstration', 'demonstrator', 'rally'],
  talks: ['talks', 'talk', 'negotiation', 'negotiate', 'negotiator', 'discussion'],
  rate: ['rate', 'rates'],
  hold: ['hold', 'steady', 'unchanged', 'pause', 'maintain'],
  cut: ['cut', 'lower', 'reduce', 'trim', 'slash'],
  hike: ['hike', 'lift', 'increase'],
  acquire: ['acquire', 'acquisition', 'buy', 'bought', 'purchase', 'takeover', 'merger', 'merge'],
  raise: ['raise', 'secure', 'nab', 'funding', 'round', 'series', 'valuation', 'financing', 'startup'],
  earnings: ['earnings', 'results', 'profit', 'revenue', 'quarter', 'quarterly'],
  sentence: ['sentence', 'jail', 'imprison', 'prison'],
  flee: ['flee', 'fled', 'fleeing', 'escape'],
  resign: ['resign', 'resignation', 'quit'],
  win: ['win', 'won', 'victory', 'triumph'],
  drop: ['drop', 'fall', 'plunge', 'plummet', 'tumble', 'slump', 'slide', 'tank', 'selloff', 'sell-off'],
  rise: ['rise', 'jump', 'surge', 'soar', 'climb', 'gain'],
  fire: ['fire', 'blaze', 'wildfire'],
  storm: ['storm', 'hurricane', 'typhoon', 'cyclone'],
  rain: ['rain', 'downpour', 'monsoon', 'deluge', 'flood', 'flooding'],
  tariff: ['tariff', 'duty', 'levy'],
  oil: ['oil', 'crude', 'brent', 'petroleum'],
  chip: ['chip', 'semiconductor', 'chipmaker'],
  stock: ['stock', 'share', 'equities', 'equity'],
  lawsuit: ['lawsuit', 'sue', 'litigation'],
  fine: ['fine', 'penalty', 'penalise', 'penalize'],
  hostage: ['hostage', 'captive'],
  capital: ['capital'],
};

function stemRaw(w) {
  let t = w;
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && t.endsWith('ied')) return `${t.slice(0, -3)}y`;
  if (t.length > 5 && t.endsWith('sses')) t = t.slice(0, -2);
  else if (t.length > 4 && /(?:ches|shes|xes|zes|sses)$/.test(t)) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith('s') && !/(?:ss|us|is)$/.test(t)) t = t.slice(0, -1);
  if (t.length > 5 && t.endsWith('ing')) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith('ed')) t = t.slice(0, -2);
  if (t.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(t) && !/(?:ll|ss|zz)$/.test(t)) t = t.slice(0, -1);
  if (t.length > 3 && t.endsWith('e')) t = t.slice(0, -1);
  return t;
}

const CONCEPT = new Map();
for (const [concept, words] of Object.entries(CONCEPT_GROUPS)) {
  for (const w of words) CONCEPT.set(stemRaw(w), concept);
}

function rawToken(w) {
  const base = UKUS.get(w) || w;
  const us = base.replace(/^([a-z]{3,}?)is(e|ed|es|ing|ation|ations)$/, '$1iz$2');
  const st = stemRaw(us);
  return CONCEPT.get(st) || st;
}

const STOP = new Set(STOP_RAW.split(/\s+/).filter(Boolean));
const STOP_STEMS = new Set([...STOP].map(rawToken));
const GENERIC = new Set(GENERIC_RAW.split(/\s+/).filter(Boolean).map(rawToken));
// Concepts that denote very common event types are generic too.
for (const c of ['deal', 'talks', 'strike', 'kill', 'hold', 'cut', 'hike', 'acquire', 'raise', 'earnings', 'rate', 'win', 'drop', 'rise', 'stock']) {
  GENERIC.add(c);
}

const SPELL_NUM = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12, k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9, tn: 1e12 };

/** Replace figures with canonical tokens: "$85 billion", "85bn" -> "#85000000000". */
function foldNumbers(text) {
  return text
    .replace(/(?:[$€£¥]|\b(?:usd|eur|gbp|inr|rs\.?|₹)\s?)?\s?(\d[\d,]*(?:\.\d+)?)\s?(%|percent|per cent|trillion|billion|million|thousand|tn|bn|mn|k|m|b)?(?![a-z0-9])/gi,
      (all, num, unit) => {
        const v = parseFloat(num.replace(/,/g, ''));
        if (!Number.isFinite(v)) return ' ';
        const u = (unit || '').toLowerCase();
        if (u === '%' || u === 'percent' || u === 'per cent') return ` #${num.replace(/,/g, '').replace('.', 'p')}pct `;
        const mult = SPELL_NUM[u] || 1;
        const val = v * mult;
        // Years and bare small numbers carry no event signal.
        if (!u && ((val >= 1900 && val <= 2100) || val < 10)) return ' ';
        return ` #${String(Number(val.toPrecision(12))).replace('.', 'p').replace('+', '')} `;
      })
    .replace(/(\d)(st|nd|rd|th)\b/g, ' ');
}

/**
 * Ordered content tokens of a text, in segments (bigrams never span
 * punctuation). Each token: { t, cls } with cls in num | actor | generic | content.
 */
function tokenize(text, context) {
  let s = normalizeText(text, context).toLowerCase();
  s = s
    .replace(/cease-?\s?fire/g, 'ceasefire')
    .replace(/ukrainian capital|capital of ukraine/g, ' kyiv ')
    .replace(/['’]s\b/g, '')
    .replace(/&amp;/g, ' and ');
  s = foldNumbers(s);
  const segments = s.split(/[.,;:!?()[\]"“”—–|/]+|\s-\s|\s-$|^-\s/);
  const out = [];
  for (const seg of segments) {
    const toks = [];
    for (const w of seg.match(/#[0-9a-z]+|[a-z][a-z0-9]*(?:'[a-z]+)?/g) || []) {
      if (w.startsWith('#')) {
        toks.push({ t: w, cls: 'num' });
        continue;
      }
      const word = w.replace(/'.*$/, '');
      const canon = canonOfToken(word);
      if (canon) {
        const parent = PLACE_PARENT.get(canon);
        toks.push({ t: word, cls: 'actor', canon, parent: parent ? parent.replace(/[^a-z0-9]/g, '') : null });
        continue;
      }
      if (word.length < 3 && !KEEP_SHORT.has(word)) continue;
      if (STOP.has(word)) continue;
      const t = rawToken(word);
      if (STOP_STEMS.has(t) || t.length < 2) continue;
      toks.push({ t, cls: GENERIC.has(t) ? 'generic' : 'content' });
    }
    out.push(toks);
  }
  return out;
}

function hashId(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* ---------------------------------- features ---------------------------------- */

const SUMMARY_FACTOR = 0.35;

function addFeature(map, key, cls, factor, inTitle) {
  const cur = map.get(key);
  if (!cur) {
    map.set(key, { cls, f: factor, title: inTitle });
  } else {
    if (factor > cur.f) cur.f = factor;
    if (inTitle) cur.title = true;
  }
}

function textFeatures(map, segments, inTitle, scale) {
  for (const toks of segments) {
    for (let i = 0; i < toks.length; i++) {
      const a = toks[i];
      addFeature(map, a.t, a.cls, scale, inTitle);
      // A city also counts, weakly, as its country ("Kyiv" -> Ukraine).
      if (a.parent) addFeature(map, a.parent, 'actor', 0.5 * scale, inTitle);
      // Adjacent-word pairs: only if they carry something other than filler.
      const b = toks[i + 1];
      if (b) {
        const informative = (x) => x.cls === 'content' || x.cls === 'num';
        if (informative(a) || informative(b)) {
          const cls = informative(a) && informative(b) ? 'bigram' : 'bigram-weak';
          addFeature(map, `${a.t}_${b.t}`, cls, (cls === 'bigram' ? 1 : 0.5) * scale, inTitle);
        }
      }
    }
  }
}

function articleFeatures(article) {
  const title = String(article.title || '');
  const summary = String(article.summary || '');
  const context = `${title}. ${summary}`;
  const map = new Map();
  textFeatures(map, tokenize(title, context), true, 1);
  if (summary) textFeatures(map, tokenize(summary, context), false, SUMMARY_FACTOR);
  const entities = extractEntities(context);
  const titleEntities = new Set(extractEntities(title, context).map((e) => e.canonical));
  return {
    article,
    map,
    entities,
    entitySet: new Set(entities.map((e) => e.canonical)),
    titleEntities,
    eventTerms: extractEventTerms(context),
    time: 0,
    syndKey: normalizeTitleKey(title),
  };
}

const CLASS_FACTOR = { content: 1, num: 1, bigram: 1.15, 'bigram-weak': 0.5, generic: 0.4, actor: 0.8 };

/* ---------------------------- order-invariant sorting ---------------------------- */

function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortKey(a, b) {
  const ta = Number.isFinite(a.publishedAt) ? a.publishedAt : Infinity;
  const tb = Number.isFinite(b.publishedAt) ? b.publishedAt : Infinity;
  return ta - tb || cmpStr(String(a.id), String(b.id)) || cmpStr(String(a.link || ''), String(b.link || '')) || cmpStr(String(a.title || ''), String(b.title || ''));
}

const rankOf = (a) => {
  const r = a.rankScore ?? a.score ?? a.finalCurationScore ?? 0;
  return Number.isFinite(r) ? r : 0;
};
const bestFirst = (a, b) => rankOf(b) - rankOf(a) || sortKey(a, b);

/* -------------------------------- link scoring -------------------------------- */

class Corpus {
  constructor(feats) {
    const n = feats.length;
    this.n = n;
    const df = new Map();
    for (const f of feats) for (const k of f.map.keys()) df.set(k, (df.get(k) || 0) + 1);
    this.df = df;
    const freqCut = Math.max(CLUSTER_PARAMS.freqDfFloor, CLUSTER_PARAMS.freqDfShare * n);
    this.freqCut = freqCut;
    // Per-doc weighted vectors.
    this.vecs = feats.map((f) => {
      const v = new Map();
      let norm2 = 0;
      for (const [k, info] of f.map) {
        const d = df.get(k);
        const idf = Math.log(1 + (n + 1) / (d + 0.5));
        const w = idf * info.f * CLASS_FACTOR[this.effClass(k, info.cls)];
        v.set(k, w);
        norm2 += w * w;
      }
      return { v, norm: Math.sqrt(norm2) || 1 };
    });
  }

  /** Effective class: a term shared by many articles in this batch is filler. */
  effClass(key, cls) {
    if (cls === 'actor') {
      const canon = canonOfToken(key);
      if (canon && (FREQUENT_ACTORS.has(canon) || (this.df.get(key) || 0) >= this.freqCut)) return 'generic';
      return 'actor';
    }
    if ((cls === 'content' || cls === 'bigram') && (this.df.get(key) || 0) >= this.freqCut) return 'generic';
    return cls;
  }
}

function buildSims(feats, corpus) {
  // Inverted index -> sparse dot products.
  const post = new Map();
  feats.forEach((f, i) => {
    for (const k of f.map.keys()) {
      let arr = post.get(k);
      if (!arr) post.set(k, (arr = []));
      arr.push(i);
    }
  });
  const dots = new Map(); // i*n+j (i<j) -> dot
  const n = feats.length;
  for (const [k, docs] of post) {
    if (docs.length < 2) continue;
    for (let a = 0; a < docs.length; a++) {
      const wa = corpus.vecs[docs[a]].v.get(k);
      for (let b = a + 1; b < docs.length; b++) {
        const key = docs[a] * n + docs[b];
        dots.set(key, (dots.get(key) || 0) + wa * corpus.vecs[docs[b]].v.get(k));
      }
    }
  }
  const sims = new Map();
  for (const [key, dot] of dots) {
    const i = Math.floor(key / n);
    const j = key % n;
    sims.set(key, dot / (corpus.vecs[i].norm * corpus.vecs[j].norm));
  }
  return sims;
}

/**
 * Does the pair share DISTINGUISHING evidence? Counted over features that sit
 * in one article's title and appear anywhere in the other.
 */
function hasDistinguishingEvidence(fa, fb, corpus) {
  let content = 0;
  let nums = 0;
  let bigrams = 0;
  let rareActors = 0;
  let freqActors = 0;
  let generics = 0;
  const [small, big] = fa.map.size <= fb.map.size ? [fa, fb] : [fb, fa];
  for (const [k, info] of small.map) {
    const other = big.map.get(k);
    if (!other) continue;
    if (!info.title && !other.title) continue;
    const cls = corpus.effClass(k, info.cls);
    if (cls === 'content') content++;
    else if (cls === 'num') nums++;
    else if (cls === 'bigram') bigrams++;
    else if (cls === 'actor') rareActors++;
    else if (info.cls === 'actor') freqActors++;
    else if (cls === 'generic' && info.cls === 'generic') generics++;
  }
  if (content >= 1 || bigrams >= 1) return true;
  if (nums >= 1 && (rareActors >= 1 || generics >= 1 || freqActors >= 1)) return true;
  if (rareActors >= 2) return true;
  if (rareActors >= 1 && (generics >= 1 || freqActors >= 2)) return true;
  return false;
}

/* --------------------------------- clustering --------------------------------- */

function prepare(articles, opts = {}) {
  const input = [...(articles || [])].sort(sortKey);
  const finite = input.map((a) => a.publishedAt).filter(Number.isFinite);
  const batchNow = Number.isFinite(opts.now) ? opts.now : finite.length ? Math.max(...finite) : 0;
  const items = input.map((a) => {
    const f = articleFeatures(a);
    f.time = Number.isFinite(a.publishedAt) ? Math.min(a.publishedAt, batchNow + 36e5) : batchNow;
    return f;
  });
  const n = items.length;
  if (n === 0) return { items, corpus: null, sims: new Map(), n };
  const corpus = new Corpus(items);
  return { items, corpus, sims: buildSims(items, corpus), n };
}

/**
 * Pairwise diagnostics over one batch: `explain(idA, idB)` says why two
 * articles do or do not link. Used by tuning scripts and tests.
 */
export function analyzeBatch(articles, opts = {}) {
  const { items, corpus, sims, n } = prepare(articles, opts);
  const index = new Map(items.map((f, i) => [f.article.id, i]));
  return {
    explain(idA, idB) {
      const i = index.get(idA);
      const j = index.get(idB);
      const [lo, hi] = i < j ? [i, j] : [j, i];
      const sim = sims.get(lo * n + hi) || 0;
      const shared = [];
      for (const [k, info] of items[i].map) {
        const o = items[j].map.get(k);
        if (o) shared.push(`${k}:${corpus.effClass(k, info.cls)}${info.title || o.title ? '' : '(sum)'}`);
      }
      return {
        sim: +sim.toFixed(3),
        timeOk: Math.abs(items[i].time - items[j].time) <= CLUSTER_PARAMS.windowMs,
        conflict: placesConflict(items[i].titleEntities, items[j].titleEntities),
        evidence: hasDistinguishingEvidence(items[i], items[j], corpus),
        shared,
      };
    },
  };
}

/**
 * Cluster a scored article list (as produced by lib/ingest.js). Pure and
 * order-invariant: shuffling `articles` changes neither membership nor ids.
 * Returns clusters sorted by lead-article rank (best first), then id.
 *
 * @param {object[]} articles
 * @param {string} edition
 * @param {{ now?: number }} [opts] `now` bounds future-dated articles and
 *   stands in for missing publish times.
 */
export function clusterArticles(articles, edition, opts = {}) {
  const { items, corpus, sims, n } = prepare(articles, opts);
  if (n === 0) return [];
  const P = CLUSTER_PARAMS;

  // Candidate edges, strongest first with a total, input-independent order.
  const edges = [];
  for (const [key, sim] of sims) {
    if (sim < P.edgeSim) continue;
    const i = Math.floor(key / n);
    const j = key % n;
    if (Math.abs(items[i].time - items[j].time) > P.windowMs) continue;
    if (placesConflict(items[i].titleEntities, items[j].titleEntities)) continue;
    if (!hasDistinguishingEvidence(items[i], items[j], corpus)) continue;
    edges.push({ i, j, sim: Math.round(sim * 1e9) });
  }
  edges.sort((a, b) => b.sim - a.sim || a.i - b.i || a.j - b.j);

  const parent = Array.from({ length: n }, (_, i) => i);
  const members = Array.from({ length: n }, (_, i) => [i]);
  const span = items.map((it) => [it.time, it.time]);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  const simOf = (i, j) => (i < j ? sims.get(i * n + j) : sims.get(j * n + i)) || 0;

  for (const e of edges) {
    const ra = find(e.i);
    const rb = find(e.j);
    if (ra === rb) continue;
    const ma = members[ra];
    const mb = members[rb];
    if (ma.length + mb.length > P.maxSize) continue;
    const lo = Math.min(span[ra][0], span[rb][0]);
    const hi = Math.max(span[ra][1], span[rb][1]);
    if (hi - lo > P.spanMs) continue;
    // Average-link guard against chaining loosely related stories.
    if (ma.length * mb.length > 1) {
      let sum = 0;
      for (const x of ma) for (const y of mb) sum += simOf(x, y);
      if (sum / (ma.length * mb.length) < P.avgSim) continue;
    }
    const [keep, drop] = ra < rb ? [ra, rb] : [rb, ra];
    parent[drop] = keep;
    members[keep] = ma.concat(mb);
    members[drop] = [];
    span[keep] = [lo, hi];
  }

  const groups = [];
  for (let i = 0; i < n; i++) if (find(i) === i) groups.push(members[i].map((x) => items[x]));
  return groups
    .map((g) => finalizeCluster(g, edition))
    .sort((a, b) => b.leadRank - a.leadRank || cmpStr(a.id, b.id))
    .map(({ leadRank, ...c }) => c);
}

/* ---------------------------- syndication / breadth ---------------------------- */

/**
 * Split a cluster's articles into independent tellings and syndicated copies.
 * Two articles are copies when their normalised titles are near-identical
 * (Jaccard on 3-word shingles). In each copy group the earliest article (the
 * original publisher) is independent; the rest are syndicated.
 */
function syndication(items) {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  const sh = items.map((it) => wordShingles(it.syndKey, 3));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (items[i].syndKey && items[i].syndKey === items[j].syndKey) {
        parent[find(j)] = find(i);
        continue;
      }
      if (sh[i].size >= 3 && sh[j].size >= 3 && jaccard(sh[i], sh[j]) >= CLUSTER_PARAMS.syndicationJaccard) {
        parent[find(j)] = find(i);
      }
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  const syndicated = new Set();
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    const ordered = [...idxs].sort((x, y) => sortKey(items[x].article, items[y].article));
    for (const k of ordered.slice(1)) syndicated.add(items[k].article.id);
  }
  return syndicated;
}

const outletOf = (a) => outletKey(a.sourceName || a.source?.name || a.source || '');

/**
 * Points added to a story's lead article rank for independent coverage:
 * 0 for one outlet, then a log curve that saturates at 12.
 */
export function breadthBonus(breadth) {
  const b = Number(breadth);
  if (!Number.isFinite(b) || b <= 1) return 0;
  return Math.round(Math.min(12, 4.6 * Math.log(b)) * 10) / 10;
}

function finalizeCluster(group, edition) {
  const articles = group.map((g) => g.article).sort(bestFirst);
  const byId = new Map(group.map((g) => [g.article, g]));
  const ordered = articles.map((a) => byId.get(a));
  const anchor = [...articles].sort(sortKey)[0];
  const top = articles[0];
  const sources = [...new Set(articles.map((a) => a.sourceName))];

  const syndicatedSet = syndication(ordered);
  const independent = articles.filter((a) => !syndicatedSet.has(a.id));
  const breadth = new Set(independent.map(outletOf)).size || 1;

  // Entity list ordered by how many member articles mention each entity —
  // the shared story subject floats to the top.
  const counts = new Map();
  for (const m of ordered) {
    for (const e of m.entities) counts.set(e.canonical, (counts.get(e.canonical) || 0) + 1);
  }
  const entities = [...counts.entries()]
    .map(([e, c], idx) => ({ e, c, idx }))
    .sort((a, b) => b.c - a.c || a.idx - b.idx)
    .map(({ e }) => e)
    .slice(0, 10);

  const eventTerms = new Set();
  for (const m of ordered) for (const t of m.eventTerms) eventTerms.add(t);

  const times = group.map((g) => g.article.publishedAt).filter(Number.isFinite);
  return {
    id: `c${hashId(String(anchor.link || anchor.id))}`,
    edition,
    title: top.title,
    entities,
    eventTerms: [...eventTerms].slice(0, 12),
    articleIds: articles.map((a) => a.id),
    articles,
    sources,
    size: articles.length,
    score: top.score ?? top.finalCurationScore ?? 0,
    earliestAt: times.length ? Math.min(...times) : 0,
    latestAt: times.length ? Math.max(...times) : 0,
    breadth,
    syndicated: articles.filter((a) => syndicatedSet.has(a.id)).map((a) => a.id),
    leadRank: rankOf(top),
  };
}

/** Compact summary of a cluster, safe to ship in list payloads. */
export function clusterSummary(cluster) {
  return {
    id: cluster.id,
    edition: cluster.edition,
    title: cluster.title,
    entities: cluster.entities,
    articleIds: cluster.articleIds,
    sources: cluster.sources,
    size: cluster.size,
    score: cluster.score,
    earliestAt: cluster.earliestAt,
    latestAt: cluster.latestAt,
    breadth: cluster.breadth,
    aliases: cluster.aliases,
  };
}

/** Normalised significant-token set for a title — shared with briefing dedup. */
export function titleTokenSet(text) {
  const out = new Set();
  for (const seg of tokenize(String(text || ''), String(text || ''))) {
    for (const t of seg) out.add(t.t);
  }
  return out;
}

/** Stable content-version hash for a cluster (changes when membership changes). */
export function clusterVersion(cluster) {
  return hashId([...cluster.articleIds].sort().join('|'));
}
