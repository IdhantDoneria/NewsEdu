/**
 * Scope and usage control for everything that can cost a model call.
 *
 * The assistant covers news, geopolitics, economics, markets and the business
 * of the stories in the brief. It is not a general chatbot, so requests are
 * sorted BEFORE any model is called:
 *
 *   - injection / jailbreak attempts, off-topic work (code, creative writing,
 *     homework, personal advice, role-play, translation) -> refused with a
 *     canned reply, no model call;
 *   - greetings and "who are you" -> canned reply, no model call;
 *   - clearly about news or markets -> proceeds;
 *   - anything else -> proceeds, but the model is told the scope and must flag
 *     `inScope: false`, which also ends in a refusal.
 *
 * Repeated off-topic requests from one client earn a temporary block, and daily
 * budgets cap model calls and web searches per client (and web searches
 * globally), through the shared counters in lib/store/kv.mjs.
 */

import { kvIncr, kvGet } from '../store/kv.mjs';
import { clientId } from './ratelimit.mjs';

/* ------------------------------ classification ----------------------------- */

const INJECTION =
  /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(previous|prior|above|earlier|all|your|these|system)\b.{0,30}\b(instructions?|rules?|prompts?|guidelines?|restrictions?)\b|\b(reveal|show|print|repeat|leak)\b.{0,30}\b(system|hidden|initial|your)\b.{0,15}\b(prompt|instructions?)\b|\bjailbreak\b|\bDAN mode\b|\bdeveloper mode\b|\byou are now\b|\bpretend (to be|you are|you're)\b|\bact as (a|an|if)\b|\brole-?play\b/i;

const GREETING = /^\s*(hi|hello|hey|yo|hola|namaste|good (morning|afternoon|evening)|thanks?|thank you|thx|ok(ay)?|cool|nice|great|bye|goodbye)[\s!.,?]*$/i;
const ABOUT_BOT = /\b(who are you|what are you|are you (chat\s*gpt|gpt|claude|gemini|an? (ai|bot|robot))|what('s| is) your name|how are you|what can you do|what do you do|how do you work)\b/i;

const OFF_TOPIC = [
  ['code', /\b(python|javascript|typescript|java|c\+\+|c#|golang|rust|php|ruby|sql|html|css|react|node\.?js|django|flask|bash|shell script|leetcode|stack ?overflow|compile|debug|syntax error|algorithm|code|coding|program(ming)?|script|function|api key|github|git (commit|push|merge))\b/i],
  ['creative', /\b(write|compose|generate|create|draft|make up)\b.{0,40}\b(poem|poetry|song|lyrics|story|fiction|essay|joke|rap|haiku|limerick|speech|toast|caption|bio|cover letter|resume|email|letter|tweet|linkedin post|slogan|script)\b|\btell me a (joke|story|riddle)\b/i],
  ['homework', /\b(solve|integrate|differentiate|derivative of|simplify the expression|prove that|theorem|homework|assignment|worksheet|quadratic|calculus|trigonometry|chemistry|physics problem|balance the equation)\b/i],
  ['personal', /\b(my (girlfriend|boyfriend|wife|husband|crush|ex|partner|boss|therapist)|dating|relationship advice|break ?up|recipe|workout|diet plan|weight loss|skincare|horoscope|zodiac|astrology|tarot|symptoms?|diagnos\w+|medication|dosage|pregnan\w+|lawsuit advice|baby names?|travel itinerary|things to do in|best restaurants?|(best|top) (movies?|songs?|albums?|games?|shows?|series)|movie recommendations?|netflix|video games?|gaming|fantasy football)\b/i],
  ['translate', /\b(translate|translation of|how do you say)\b.{0,60}\b(in|to|into)\b.{0,20}\b(spanish|french|german|hindi|chinese|japanese|arabic|russian|portuguese|italian|korean)\b/i],
  ['trivia', /\b(play a game|let'?s play|20 questions|trivia|riddle|knock knock|would you rather|rate my|roast me|compliment me)\b/i],
];

// A cue that the question is about news, policy, business or markets.
const NEWS_CUE =
  /\b(news|headlines?|story|stories|report(ed|s|ing)?|breaking|latest|today|yesterday|this week|update|developments?|war|conflict|ceasefire|strikes?|attacks?|military|troops|missiles?|sanctions?|tariffs?|trade|treaty|diplomat\w*|summit|embassy|nato|un|united nations|government|minister|president|prime minister|parliament|congress|senate|election|vote|poll|coalition|protest|policy|law|bill|court|ruling|regulat\w*|central bank|fed|rbi|ecb|boj|interest rates?|rates?|inflation|gdp|economy|economic|recession|jobs|unemployment|budget|deficit|debt|stocks?|shares?|equit\w*|markets?|index|sensex|nifty|nasdaq|dow|s&p|bond|yields?|oil|crude|gas|gold|currency|rupee|dollar|yen|euro|yuan|crypto\w*|bitcoin|earnings|revenue|profit|ipo|merger|acquisition|bankruptcy|layoffs?|supply chain|energy|opec|china|russia|ukraine|israel|gaza|iran|india|pakistan|taiwan|korea|japan|europe|eu|usa?|america\w*|middle east|africa|latin america|brazil|mexico|saudi|turkey|syria|yemen|houthi|hamas|hezbollah|kremlin|white house|pentagon|geopolit\w*|why does (it|this) matter|what (happened|is happening|does it mean)|implications?|impact|affect|outlook)\b/i;

const MAX_SHORT_FOLLOWUP_WORDS = 7;

/**
 * @param {string} text  the reader's message
 * @param {{history?: Array<{role:string,text:string}>, storyScoped?: boolean}} [opts]
 * @returns {{verdict:'in'|'out'|'unclear'|'canned', category:string}}
 */
export function classifyRequest(text, { history = [], storyScoped = false } = {}) {
  const t = String(text || '').trim();
  if (!t) return { verdict: 'out', category: 'empty' };

  if (INJECTION.test(t)) return { verdict: 'out', category: 'injection' };
  if (GREETING.test(t)) return { verdict: 'canned', category: 'greeting' };
  if (ABOUT_BOT.test(t)) return { verdict: 'canned', category: 'about' };

  const cue = NEWS_CUE.test(t);
  for (const [category, re] of OFF_TOPIC) {
    if (!re.test(t)) continue;
    // "code" / "script" etc. next to a clear news cue can still be news ("the new
    // AI regulation code"); only the strongest off-topic categories override a cue.
    if (cue && (category === 'code' || category === 'personal')) continue;
    return { verdict: 'out', category };
  }

  if (cue || storyScoped) return { verdict: 'in', category: 'news' };

  // A short follow-up in a thread that was already about the news ("and why?").
  const words = t.split(/\s+/).length;
  const priorUser = [...history].reverse().find((h) => h?.role === 'user');
  if (priorUser && words <= MAX_SHORT_FOLLOWUP_WORDS && NEWS_CUE.test(priorUser.text || '')) {
    return { verdict: 'in', category: 'followup' };
  }
  return { verdict: 'unclear', category: 'unclear' };
}

/** Typed consent to a web search ("yes, search the web", "go ahead and google it"). */
export function isWebSearchConsent(text) {
  const t = String(text || '').trim();
  if (t.length > 80) return false;
  return /^(yes|yeah|yep|sure|ok(ay)?|please|go ahead|do it)?[\s,.!]*((please\s+)?(do a |run a |try a )?(web ?search|search (the )?(web|internet|online)( for (it|that|this))?|google (it|that|this)|look (it|that|this) up( online)?|check online|search online))[\s.!]*$/i.test(t);
}

/** The reply for a request that is not answered, with starter questions. */
export function refusalFor(category) {
  const lead =
    category === 'injection'
      ? 'I can’t change how I work, but I can help with the news.'
      : category === 'greeting'
      ? 'Hello. I’m the Meridian Brief’s news assistant.'
      : category === 'about'
      ? 'I’m the Meridian Brief’s news assistant. I answer questions from today’s ranked coverage of geopolitics, finance and markets, and explain what the news could mean for markets.'
      : 'That’s outside what I cover. I help with news, geopolitics, the economy and markets.';
  return {
    answer: `${lead} Try asking about a story in the brief, what is moving markets, or what a development could mean for oil, rates or your market.`,
    followUps: ['What are the top stories right now?', 'What is moving markets today?', 'What could this mean for oil prices?'],
  };
}

/* --------------------------------- budgets --------------------------------- */

const DAY = 24 * 3600;
const HOUR = 3600;

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

/** Limits; override with env vars on Vercel without a deploy of code. */
export function limits() {
  return {
    chatPerDay: num(process.env.CHAT_DAILY_LIMIT, 150),
    webPerDay: num(process.env.WEB_SEARCH_DAILY_LIMIT, 8),
    webGlobalPerDay: num(process.env.WEB_SEARCH_DAILY_CAP, 250),
    strikesPerHour: num(process.env.OFFTOPIC_STRIKES_PER_HOUR, 6),
  };
}

const dayKey = (now) => new Date(now).toISOString().slice(0, 10);
const hourKey = (now) => Math.floor(now / 3_600_000);

/** Count one off-topic request; true once the client has earned a temporary block. */
export async function recordStrike(headers, now = Date.now()) {
  const id = clientId(headers);
  const n = Number(await kvIncr(`scope:strike:${id}:${hourKey(now)}`, { ttlSec: 2 * HOUR })) || 0;
  return n >= limits().strikesPerHour;
}

async function isBlocked(headers, now) {
  const id = clientId(headers);
  const n = Number(await kvGet(`scope:strike:${id}:${hourKey(now)}`)) || 0;
  return n >= limits().strikesPerHour;
}

/**
 * Charge one model-backed chat answer to the client's daily budget.
 * @returns {Promise<{ok:boolean, reason?:string, message?:string, remaining:number}>}
 */
export async function chargeChat(headers, now = Date.now()) {
  const { chatPerDay } = limits();
  if (await isBlocked(headers, now)) {
    return { ok: false, reason: 'blocked', remaining: 0, message: 'Too many off-topic requests. Chat is paused for a while; the news itself is still all on the page.' };
  }
  const id = clientId(headers);
  const n = Number(await kvIncr(`budget:chat:${id}:${dayKey(now)}`, { ttlSec: DAY + HOUR })) || 0;
  if (n > chatPerDay) {
    return { ok: false, reason: 'daily-limit', remaining: 0, message: 'You’ve reached today’s question limit. It resets at midnight UTC.' };
  }
  return { ok: true, remaining: Math.max(0, chatPerDay - n) };
}

/** Charge one web search to the client's daily budget and to the global cap. */
export async function chargeWebSearch(headers, now = Date.now()) {
  const { webPerDay, webGlobalPerDay } = limits();
  const id = clientId(headers);
  const day = dayKey(now);
  const mine = Number(await kvIncr(`budget:web:${id}:${day}`, { ttlSec: DAY + HOUR })) || 0;
  if (mine > webPerDay) {
    return { ok: false, reason: 'daily-limit', remaining: 0, message: `Web search is limited to ${webPerDay} per day to keep the service available. It resets at midnight UTC.` };
  }
  const all = Number(await kvIncr(`budget:web:all:${day}`, { ttlSec: DAY + HOUR })) || 0;
  if (all > webGlobalPerDay) {
    return { ok: false, reason: 'global-cap', remaining: 0, message: 'Web search has reached its daily capacity for everyone. Try again tomorrow, or open the source links in the answer.' };
  }
  return { ok: true, remaining: Math.max(0, webPerDay - mine) };
}

/** Searches the client has left today (read-only, for the button label). */
export async function webSearchesLeft(headers, now = Date.now()) {
  const { webPerDay } = limits();
  const used = Number(await kvGet(`budget:web:${clientId(headers)}:${dayKey(now)}`)) || 0;
  return Math.max(0, webPerDay - used);
}
