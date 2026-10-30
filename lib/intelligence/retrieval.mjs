/**
 * BM25 retrieval over the current article pool.
 *
 * Replaces the old lexical set-overlap ranker: term weights come from IDF over
 * the pool, scores are length-normalised, title matches count triple (BM25F
 * style), tokenisation is Unicode-aware (accents folded for Latin scripts, CJK
 * bigrams, Devanagari/Arabic kept intact) and a small multilingual glossary
 * plus the shared market aliases bridge non-English and index-name questions
 * to the English wire. Ties break on recency, then rank score.
 *
 * Nothing is padded silently: articles that were added without matching the
 * question carry `lowRelevance: true` so the prompt and the UI can say so.
 */

import { marketAliasTerms } from './marketsctx.mjs';

export const MAX_SOURCES = 10;
export const MIN_SOURCES = 6;

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 3;
// Share of the best achievable score a document needs to count as a match.
const MIN_MATCH = 0.1;
// Below this best-match share the whole result is flagged low-relevance.
const LOW_BEST = 0.18;

/* -------------------------------- vocabulary ------------------------------- */

const STOP_EN = new Set(
  (
    'what when where which who whom whose why how about does did this that these those will with from have has had been they ' +
    'their could would should there tell explain give please know any the and for are was were you your can into than then some ' +
    'more most also its it is of to in on at by an as be or if so do not no but just really very much many tell show want like ' +
    'need get got let me my our we he she him her his them been being am i'
  ).split(' ')
);

// Function words of the most common question languages (folded, lower-case).
const STOP_FOREIGN = new Set(
  (
    // es / pt / it
    'el la los las lo un una unos unas de del al que qué como cómo cual cuál por para con sin sobre entre es son fue ha han hay en y o pero se su sus mi tu ' +
    'o a os as um uma uns umas do da dos das no na nos nas em eh pelo pela pelos pelas com sem sobre entre foi ser sao são tem tinha mais e ' +
    'il gli le di che è un uno una dei delle degli nel nella per con su tra fra sono ha hanno cosa come perché ' +
    // fr
    'le la les des du un une et est sont dans sur avec pour par que qui quoi quel quelle quels quelles ce cet cette ces au aux ' +
    // de
    'der die das den dem des ein eine einen einem und ist sind hat haben mit von zu im am auf für über wie was wer wo warum nicht ' +
    // hinglish / hindi function words
    'aaj kya hai hain ka ki ke kaise kaisa kaun kab kahan kyun mein me ko se par ne tha thi the aur ya bhi ' +
    'है हैं का की के में से को पर और या यह वह क्या कैसे कब कहां क्यों'
  )
    .split(/\s+/)
    .map((w) => fold(w))
);

// Words that make a question broad ("what's the top news today?").
const GENERIC_WORDS = new Set(
  (
    'top biggest main major latest headline headlines summary summarize summarise overview today tonight now happening going news brief ' +
    'recap watch trending important stories story update updates developments right currently week morning evening ' +
    // multilingual
    'noticias titulares hoy actualidad actualites nachrichten heute notizie oggi noticia manchetes hoje actualite ' +
    'खबर खबरें समाचार आज ニュース 新闻 新聞 今日 今天 أخبار اليوم'
  )
    .split(/\s+/)
    .map((w) => stem(fold(w)))
);

/* ------------------------------ cross-lingual glossary --------------------- */

// Folded foreign term -> English search terms. Deliberately small: the topics a
// news chat actually sees. Latin entries match tokens; entries in other scripts
// match as substrings of the raw question.
const GLOSSARY = {
  // countries and regions
  rusia: 'russia', russie: 'russia', russland: 'russia', russa: 'russia', russo: 'russia',
  ucrania: 'ukraine', ucraina: 'ukraine',
  chine: 'china', cina: 'china',
  japon: 'japan', japao: 'japan', giappone: 'japan',
  alemania: 'germany', allemagne: 'germany', deutschland: 'germany', alemanha: 'germany', germania: 'germany',
  francia: 'france', frankreich: 'france', franca: 'france',
  inde: 'india', indien: 'india', bharat: 'india',
  brasil: 'brazil', bresil: 'brazil', brasilien: 'brazil', brasile: 'brazil',
  espana: 'spain', espagne: 'spain', spanien: 'spain', spagna: 'spain',
  turquia: 'turkey turkiye', turquie: 'turkey turkiye', turkei: 'turkey turkiye', turchia: 'turkey turkiye',
  etiopia: 'ethiopia', ethiopie: 'ethiopia', athiopien: 'ethiopia',
  mexique: 'mexico', mexiko: 'mexico', messico: 'mexico',
  irlanda: 'ireland', irlande: 'ireland', irland: 'ireland',
  finlandia: 'finland', finlande: 'finland', finnland: 'finland',
  cisjordania: 'west bank', cisjordanie: 'west bank', westjordanland: 'west bank',
  eeuu: 'usa', grossbritannien: 'britain uk', großbritannien: 'britain uk', bretagne: 'britain',
  emiratos: 'emirates uae', emirats: 'emirates uae', arabia: 'saudi arabia', saudita: 'saudi', saoudite: 'saudi', arabie: 'arabia',
  catar: 'qatar', paquistan: 'pakistan', paquistao: 'pakistan', iemen: 'yemen',
  // economy and markets
  petroleo: 'oil', petrole: 'oil', erdol: 'oil', petrolio: 'oil', oleo: 'oil', crudo: 'crude', brut: 'crude', rohol: 'crude',
  inflacion: 'inflation', inflacao: 'inflation', inflazione: 'inflation',
  tasa: 'rate', tasas: 'rate', taux: 'rate', taxa: 'rate', tassi: 'rate', tasso: 'rate',
  interes: 'interest', intereses: 'interest', interet: 'interest', interets: 'interest', zinsen: 'interest rate', zins: 'interest rate',
  leitzins: 'interest rate', juros: 'interest', interesse: 'interest',
  banco: 'bank', banque: 'bank', banca: 'bank', zentralbank: 'central bank', central: 'central', centrale: 'central',
  acciones: 'stocks shares', bolsa: 'stock market', bourse: 'stock market', borse: 'stock market', aktien: 'stocks shares',
  acoes: 'stocks shares', azioni: 'stocks shares', mercado: 'market', marche: 'market', markt: 'market', mercato: 'market',
  dolar: 'dollar', rupia: 'rupee', roupie: 'rupee', rupaya: 'rupee',
  presupuesto: 'budget', haushalt: 'budget', orcamento: 'budget', bilancio: 'budget',
  adquisicion: 'acquisition', ubernahme: 'acquisition takeover', adquisicao: 'acquisition',
  financiacion: 'funding', financement: 'funding', finanzierung: 'funding', financiamento: 'funding', ronda: 'round',
  impuestos: 'tax taxes', impots: 'tax taxes', steuern: 'tax taxes', impostos: 'tax taxes', aranceles: 'tariffs', tarifs: 'tariffs', zolle: 'tariffs', tarifas: 'tariffs',
  deuda: 'debt', dette: 'debt', schulden: 'debt', divida: 'debt', rendimientos: 'yields', rendements: 'yields',
  // politics and conflict
  guerra: 'war', guerre: 'war', krieg: 'war',
  fuego: 'fire', cese: 'cease', cessez: 'cease', feu: 'fire', waffenstillstand: 'ceasefire', waffenruhe: 'ceasefire truce',
  tregua: 'truce', treve: 'truce', cessar: 'cease', fogo: 'fire', cessate: 'cease', fuoco: 'fire',
  eleccion: 'election', elecciones: 'election', elections: 'election', wahl: 'election', wahlen: 'election',
  eleicao: 'election', eleicoes: 'election', elezioni: 'election', elezione: 'election', chunav: 'election',
  gobierno: 'government', gouvernement: 'government', regierung: 'government', governo: 'government', sarkar: 'government',
  sanciones: 'sanctions', sanktionen: 'sanctions', sancoes: 'sanctions', sanzioni: 'sanctions',
  acuerdo: 'deal agreement', accord: 'deal agreement', abkommen: 'deal agreement', acordo: 'deal agreement', accordo: 'deal agreement',
  cumbre: 'summit', sommet: 'summit', gipfel: 'summit', cupula: 'summit', vertice: 'summit',
  huelga: 'strike', greve: 'strike', streik: 'strike', sciopero: 'strike',
  primer: 'prime', premier: 'prime', ministro: 'minister', ministre: 'minister', ministerprasident: 'prime minister',
  presidente: 'president', tropas: 'troops', troupes: 'troops', truppen: 'troops', soldados: 'soldiers',
  ataque: 'attack', attaque: 'attack', angriff: 'attack', attacco: 'attack', dron: 'drone', drohne: 'drone',
  misiles: 'missile', raketen: 'missile',
  // events
  terremoto: 'earthquake', tremblement: 'earthquake', erdbeben: 'earthquake',
  accidente: 'accident crash', unfall: 'accident crash', acidente: 'accident crash', incidente: 'accident crash',
  tren: 'train', zug: 'train', trem: 'train', treno: 'train',
  muertos: 'killed dead', morts: 'killed dead', tote: 'killed dead', mortos: 'killed dead', morti: 'killed dead', muertes: 'killed dead',
  mar: 'sea', rojo: 'red', rouge: 'red', rotes: 'red', meer: 'sea', mer: 'sea', vermelho: 'red', rosso: 'red',
  fuga: 'flee fled escape', huida: 'flee fled escape', huir: 'flee fled', fuite: 'flee fled escape',
  // hinglish
  yuddh: 'war', mehngai: 'inflation', tel: 'oil', bazaar: 'market', bazar: 'market',
  // non-Latin scripts (substring match on the raw question)
  तेल: 'oil', युद्ध: 'war', चुनाव: 'election', महंगाई: 'inflation', मुद्रास्फीति: 'inflation', शेयर: 'shares stocks', बाजार: 'market',
  सेंसेक्स: 'sensex', निफ्टी: 'nifty', रुपया: 'rupee', भारत: 'india', रूस: 'russia', यूक्रेन: 'ukraine', इज़राइल: 'israel', इजराइल: 'israel',
  ईरान: 'iran', चीन: 'china', अमेरिका: 'america us', ब्याज: 'interest', बैंक: 'bank', सरकार: 'government', ट्रेन: 'train', हमला: 'attack',
  गाजा: 'gaza', युद्धविराम: 'ceasefire', ट्रंप: 'trump', मोदी: 'modi', पाकिस्तान: 'pakistan',
  石油: 'oil', 战争: 'war', 戰爭: 'war', 选举: 'election', 選挙: 'election', 通货膨胀: 'inflation', 通胀: 'inflation', 利率: 'interest rate',
  股市: 'stock market', 中国: 'china', 中國: 'china', 俄罗斯: 'russia', 乌克兰: 'ukraine', 以色列: 'israel', 伊朗: 'iran', 美国: 'us america',
  日本: 'japan', 印度: 'india', 加沙: 'gaza', 央行: 'central bank', 停火: 'ceasefire', 特朗普: 'trump', 习近平: 'xi jinping', 台湾: 'taiwan',
  インフレ: 'inflation', 金利: 'interest rate', 株: 'stock', ロシア: 'russia', ウクライナ: 'ukraine', イスラエル: 'israel', イラン: 'iran',
  アメリカ: 'us america', 停戦: 'ceasefire', 首相: 'prime minister', 日経: 'nikkei', 為替: 'currency',
  النفط: 'oil', حرب: 'war', انتخابات: 'election', تضخم: 'inflation', روسيا: 'russia', أوكرانيا: 'ukraine', إسرائيل: 'israel', إيران: 'iran',
  غزة: 'gaza', الصين: 'china', الفائدة: 'interest rate', 'وقف إطلاق': 'ceasefire',
};

const LATIN_ONLY = /^[\p{Script=Latin}\p{N}]+$/u;
const GLOSSARY_LATIN = new Map();
const GLOSSARY_RAW = []; // [key, english] for non-Latin keys
for (const [k, v] of Object.entries(GLOSSARY)) {
  const key = k;
  if (LATIN_ONLY.test(fold(key))) GLOSSARY_LATIN.set(fold(key), v);
  else GLOSSARY_RAW.push([key, v]);
}

/* -------------------------------- tokenising ------------------------------- */

/** Lower-case, NFKC, and (for Latin words only) diacritics folded. */
function fold(word) {
  const w = String(word).normalize('NFKC').toLowerCase();
  return /^[\p{Script=Latin}\p{N}\p{M}'’-]+$/u.test(w) ? w.normalize('NFD').replace(/\p{M}/gu, '') : w;
}

/** Light English-oriented stemmer (plural, -ed, -ing, trailing e). */
function stem(w) {
  if (!/^[a-z]{4,}$/.test(w)) return w;
  let s = w;
  if (s.endsWith('ies') && s.length > 4) s = `${s.slice(0, -3)}y`;
  else if (s.endsWith('sses')) s = s.slice(0, -2);
  else if (s.endsWith('s') && !/(ss|us|is)$/.test(s) && s.length > 3) s = s.slice(0, -1);
  if (s.endsWith('ing') && s.length > 6) s = s.slice(0, -3);
  else if (s.endsWith('ed') && s.length > 5) s = s.slice(0, -2);
  if (s.endsWith('e') && s.length > 4) s = s.slice(0, -1);
  if (/([bdgklmnprt])\1$/.test(s) && s.length > 4) s = s.slice(0, -1);
  return s;
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const WORD_RE = /[\p{L}\p{M}]+(?:[-‐‑][\p{L}\p{M}]+)*(?:['’]s)?|\p{N}+(?:[.,]\p{N}+)*/gu;

function pushWord(raw, out) {
  const w = fold(raw).replace(/['’]s$/, '').replace(/['’]/g, '');
  if (!w) return;
  if (CJK.test(w)) {
    // No spaces in CJK text: index overlapping character bigrams (and lone characters).
    const chars = [...w];
    if (chars.length === 1) out.push(w);
    for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
    return;
  }
  if (/[-‐‑]/.test(w)) {
    const parts = w.split(/[-‐‑]/).filter(Boolean);
    for (const p of parts) pushWord(p, out);
    pushWord(parts.join(''), out); // cease-fire -> ceasefire
    return;
  }
  out.push(w);
}

/** Raw folded tokens (no stop-word removal, no stemming). */
function rawTokens(text) {
  const s = String(text || '')
    .normalize('NFKC')
    .replace(/s&p\s*500/gi, 'sp500')
    .replace(/s&p/gi, 'snp')
    .replace(/\bu\.s\.?a?\.?(?=\W|$)/gi, 'usa')
    .replace(/\bUSA?\b/g, 'usa')
    .replace(/\b(?:united states|estados unidos|[ée]tats[- ]unis|vereinigten staaten|stati uniti|eeuu|ee\.uu\.?)\b/gi, 'usa')
    .replace(/\b(?:reino unido|royaume[- ]uni|vereinigtes k[öo]nigreich|regno unito)\b/gi, 'uk')
    .replace(/\bu\.k\.?(?=\W|$)/gi, 'uk')
    .replace(/\bunited kingdom\b/gi, 'uk');
  const out = [];
  for (const m of s.matchAll(WORD_RE)) pushWord(m[0], out);
  return out;
}

/** Index tokens for a document: folded, stemmed, English stop-words removed. */
export function tokenize(text) {
  return rawTokens(text)
    .filter((w) => !STOP_EN.has(w) && !(w.length < 2 && !/\p{N}/u.test(w)))
    .map((w) => stem(w));
}

/* --------------------------------- querying -------------------------------- */

/**
 * Weighted query terms for a question: its own content words (1.0), glossary
 * translations (0.9) and shared market aliases (0.5).
 */
export function queryTerms(question, priorUserText = '') {
  const raw = rawTokens(question);
  const lower = String(question || '').normalize('NFKC');
  const nonLatin = /[\p{L}]/u.test(lower) && /[^\p{Script=Latin}\p{N}\p{P}\p{S}\p{Z}\p{M}\p{C}]/u.test(lower);
  const foreignHits = raw.filter((w) => STOP_FOREIGN.has(w) && !STOP_EN.has(w)).length;
  const englishHits = raw.filter((w) => STOP_EN.has(w)).length;
  const nonEnglish = nonLatin || (foreignHits > 0 && foreignHits >= englishHits);

  const terms = new Map();
  const add = (t, w) => {
    if (!t || terms.get(t) >= w) return;
    terms.set(t, w);
  };

  const addFrom = (tokensIn, question_) => {
    for (const w of tokensIn) {
      const g = GLOSSARY_LATIN.get(w);
      if (g) for (const e of g.split(' ')) add(stem(e), 0.9);
      if (STOP_EN.has(w) || STOP_FOREIGN.has(w)) continue;
      if (w.length < 2 && !/\p{N}/u.test(w)) continue;
      add(stem(w), 1);
    }
    for (const [key, english] of GLOSSARY_RAW) {
      if (String(question_).includes(key)) for (const e of english.split(' ')) add(stem(e), 0.9);
    }
  };

  addFrom(raw, lower);
  // Names written in non-Latin scripts stay as bigrams; glossary hits are added above.

  // A short follow-up ("why?") borrows from the previous user turn.
  const contentCount = [...terms.keys()].filter((t) => !GENERIC_WORDS.has(t)).length;
  if (contentCount < 2 && priorUserText) {
    const prior = rawTokens(priorUserText);
    const before = new Set(terms.keys());
    addFrom(prior, String(priorUserText));
    for (const t of terms.keys()) if (!before.has(t)) terms.set(t, Math.min(terms.get(t), 0.8));
  }

  for (const a of marketAliasTerms(question)) {
    for (const t of tokenize(a)) add(t, 0.5);
  }

  const content = [...terms.keys()].filter((t) => !GENERIC_WORDS.has(t));
  return { terms, nonEnglish, broad: content.length === 0 };
}

/* ----------------------------------- BM25 ---------------------------------- */

function termFreq(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

function buildIndex(pool) {
  const docs = pool.map((a) => {
    const title = tokenize(a.title);
    const body = tokenize(a.summary);
    return { tfT: termFreq(title), tfB: termFreq(body), len: TITLE_WEIGHT * title.length + body.length };
  });
  const df = new Map();
  for (const d of docs) {
    const seen = new Set([...d.tfT.keys(), ...d.tfB.keys()]);
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  const avgLen = docs.reduce((n, d) => n + d.len, 0) / Math.max(1, docs.length) || 1;
  return { docs, df, avgLen, N: docs.length };
}

const idf = (df, N) => Math.log(1 + (N - df + 0.5) / (df + 0.5));

/**
 * Score every article for a question.
 * Returns [{ i, bm25, share }] where `share` is the fraction of the best
 * achievable score (every query term present and saturated) in 0..1, so
 * relevance can be judged independently of corpus size and question length.
 */
export function scoreBm25(pool, qt) {
  const { docs, df, avgLen, N } = buildIndex(pool);
  const terms = [...qt.terms.entries()];

  // Denominator: foreign words we cannot translate say nothing about relevance.
  let max = 0;
  for (const [t, w] of terms) {
    const known = df.get(t) > 0;
    if (!known && qt.nonEnglish) continue;
    max += w * idf(df.get(t) || 0, N) * (K1 + 1);
  }

  return docs.map((d, i) => {
    let s = 0;
    const norm = K1 * (1 - B + (B * d.len) / avgLen);
    for (const [t, w] of terms) {
      const f = TITLE_WEIGHT * (d.tfT.get(t) || 0) + (d.tfB.get(t) || 0);
      if (!f) continue;
      s += w * idf(df.get(t) || 0, N) * ((f * (K1 + 1)) / (f + norm));
    }
    return { i, bm25: s, share: max > 0 ? Math.min(1, s / max) : 0 };
  });
}

/**
 * Rank articles for a question.
 * @returns {{sources: object[], meta: {matched:number, lowRelevance:boolean, broad:boolean, nonEnglish:boolean, best:number}}}
 *  `sources` holds up to MAX_SOURCES articles; ones added only as context are
 *  copies flagged `lowRelevance: true`.
 */
export function retrieve(articles, question, { focusClusterId, priorUserText = '', maxSources = MAX_SOURCES, minSources = MIN_SOURCES } = {}) {
  const pool = Array.isArray(articles) ? articles : [];
  const meta = { matched: 0, lowRelevance: false, broad: false, nonEnglish: false, best: 0 };
  if (pool.length === 0) return { sources: [], meta };

  const qt = queryTerms(question, priorUserText);
  meta.broad = qt.broad;
  meta.nonEnglish = qt.nonEnglish;

  const scored = scoreBm25(pool, qt).map((s) => ({
    ...s,
    a: pool[s.i],
    focused: Boolean(focusClusterId && pool[s.i].clusterId === focusClusterId),
  }));

  const time = (a) => (Number.isFinite(+a.publishedAt) ? +a.publishedAt : 0);
  const byRelevance = (x, y) =>
    Number(y.focused) - Number(x.focused) ||
    y.bm25 - x.bm25 ||
    time(y.a) - time(x.a) ||
    (y.a.score || 0) - (x.a.score || 0);
  const byRank = (x, y) => (y.a.score || 0) - (x.a.score || 0) || time(y.a) - time(x.a);

  const matched = scored.filter((s) => (!qt.broad && s.share >= MIN_MATCH) || s.focused).sort(byRelevance);
  meta.matched = matched.length;
  meta.best = matched.length ? Math.round(Math.max(...matched.map((m) => m.share)) * 100) / 100 : 0;

  const picked = matched.slice(0, maxSources).map((s) => s.a);
  const seen = new Set(picked.map((a) => a.id));
  const top = scored.filter((s) => !seen.has(s.a.id)).sort(byRank);

  if (qt.broad) {
    // "What's the top news?" is answered by the top-ranked stories themselves.
    for (const s of top) {
      if (picked.length >= maxSources) break;
      picked.push(s.a);
    }
    return { sources: picked, meta };
  }

  const out = [...picked];
  if (out.length < minSources) {
    for (const s of top) {
      if (out.length >= minSources) break;
      out.push({ ...s.a, lowRelevance: true });
    }
  }
  const strong = matched.filter((m) => m.share >= LOW_BEST || m.focused).length;
  meta.lowRelevance = strong === 0;
  return { sources: out, meta };
}
