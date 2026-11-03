import { NextResponse } from 'next/server';
import { getEditionBrief } from '@/lib/ingest';
import { answerChat } from '@/lib/intelligence/chat.mjs';
import { readJsonBounded } from '@/lib/intelligence/http.mjs';
import { cacheKey, withCache } from '@/lib/intelligence/chatcache.mjs';
import { cleanIncomingMemory } from '@/lib/intelligence/memory.mjs';
import { detectMarkets, isMarketKey, marketSources } from '@/lib/intelligence/marketsctx.mjs';
import { rateLimit } from '@/lib/intelligence/ratelimit.mjs';
import { getMarketContext, getAssetQuotes } from '@/lib/markets.mjs';
import { wantsMarketImpact, asksForDecision, pickAssets, assetSource, marketDataStrip } from '@/lib/intelligence/impact.mjs';
import { hasGeminiKey } from '@/lib/intelligence/ai.mjs';
import { hasOpenRouterKey } from '@/lib/intelligence/openrouter.mjs';
import { recordEvent } from '@/lib/telemetry.mjs';
import {
  classifyRequest,
  isWebSearchConsent,
  refusalFor,
  recordStrike,
  chargeChat,
  chargeWebSearch,
  webSearchesLeft,
} from '@/lib/intelligence/scope.mjs';
import { searchWeb, webSearchEnabled, webOffer, webChatReply } from '@/lib/intelligence/websearch.mjs';
import { retrieveSources, cleanHistory } from '@/lib/intelligence/chat.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45; // chat chain deadline is 25 s; the rest is retrieval and market data

// Each request can cost a model call: 20 per minute per client address. The
// address comes from headers the client cannot set (see ratelimit.mjs) and the
// counter is shared across instances when KV is configured.
const LIMIT = { scope: 'chat', limit: 20, windowSec: 60 };

/** Which providers are configured (booleans only; never the keys). */
export async function GET() {
  return NextResponse.json({ gemini: hasGeminiKey(), openrouter: hasOpenRouterKey() });
}

/** One telemetry event per answer; never the question or answer text. */
function track(result, { edition, cached, ms, sources }) {
  recordEvent('chat', {
    provider: result.provider,
    model: result.model || null,
    ms,
    modelMs: result.modelMs ?? null,
    cached,
    sources,
    citations: result.citations?.length || 0,
    dropped: result.dropped || 0,
    // telemetry keeps primitives only, so the {supported,total} pair is flattened
    groundingSupported: result.grounding?.supported ?? null,
    groundingTotal: result.grounding?.total ?? null,
    lowRelevance: Boolean(result.lowRelevance),
    impact: Boolean(result.analysis),
    notice: result.notice ? String(result.notice).slice(0, 80) : null,
    edition,
  });
}

/** Site-wide news chat, grounded in the current edition's ranked articles. */
export async function POST(request) {
  const t0 = Date.now();
  const limit = await rateLimit(request.headers, LIMIT);
  if (limit.limited) {
    return NextResponse.json(
      { error: 'rate-limited', message: 'Too many questions. Wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    );
  }

  const read = await readJsonBounded(request, 16 * 1024);
  if (read.error) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = read.body || {};

  if (typeof body.message !== 'string' || body.message.trim().length < 2) {
    return NextResponse.json(
      { error: 'bad-request', message: 'Ask a fuller question.' },
      { status: 400 }
    );
  }

  const history = cleanHistory(body.history);
  const lastUser = [...history].reverse().find((t) => t.role === 'user')?.text || '';

  // A web search only ever runs on the reader's say-so: the button sends
  // `webSearch: true` with the original question, or they type "search the web".
  const typedConsent = isWebSearchConsent(body.message);
  const wantsWeb = body.webSearch === true || typedConsent;
  const question = typedConsent && lastUser ? lastUser : body.message;
  if (typedConsent && !lastUser) {
    return NextResponse.json({ answer: 'Ask a question first, then I can search the web for it.', citations: [], followUps: [], provider: 'none' });
  }

  // Sort the request BEFORE any model is called: off-topic and injection
  // attempts get a canned reply and a strike, greetings get a canned reply.
  const scope = classifyRequest(question, { history, storyScoped: Boolean(body.storyId) });
  if (scope.verdict === 'out' || scope.verdict === 'canned') {
    if (scope.verdict === 'out') void recordStrike(request.headers);
    recordEvent('scope', { verdict: scope.verdict, category: scope.category, edition: body.edition || 'geopolitics' });
    return NextResponse.json({
      ...refusalFor(scope.category),
      citations: [],
      provider: 'none',
      usedBackgroundKnowledge: false,
      outOfScope: scope.verdict === 'out',
    });
  }

  if (wantsWeb) return webSearchReply(request, body, question, history, t0);

  const budget = await chargeChat(request.headers);
  if (!budget.ok) {
    return NextResponse.json({ error: budget.reason, message: budget.message }, { status: 429 });
  }

  // The Markets tab has no ranked articles of its own: it answers from the
  // finance wire plus that tab's market data (headlines and index levels).
  const marketsTab = body.edition === 'markets';
  const edition = body.edition === 'finance' || marketsTab ? 'finance' : 'geopolitics';
  const selectedMarket = isMarketKey(body.market) ? body.market : null;
  const focusClusterId =
    typeof body.storyId === 'string' && /^[\w-]{1,64}$/.test(body.storyId) ? body.storyId : undefined;

  const brief = await getEditionBrief(edition);

  // "What does this mean for markets?" questions get the market-impact mode:
  // news from both editions (geopolitics moves prices), live cross-asset
  // prices, and a structured scenario analysis.
  const impactOn = wantsMarketImpact(body.message, marketsTab ? 'markets' : edition);
  let pool = brief.articles;
  if (impactOn) {
    const other = await getEditionBrief(edition === 'finance' ? 'geopolitics' : 'finance').catch(() => null);
    if (other?.articles?.length) {
      const seen = new Set(pool.map((a) => a.id));
      pool = [...pool, ...other.articles.filter((a) => !seen.has(a.id))];
    }
  }

  // Pin market data when the question is about a market (any edition), or
  // default to the market selected on the Markets tab.
  const wanted = detectMarkets(body.message, {
    defaultMarket: marketsTab ? selectedMarket : null,
    force: marketsTab,
  });
  const contexts = await Promise.all(
    wanted.map((m) => getMarketContext(m).catch(() => null))
  );
  // Share the pinned-source budget: with two markets, each gets its index
  // level plus a few headlines instead of the first market using every slot.
  const maxHeadlines = impactOn ? 3 : wanted.length > 1 ? 3 : 8;
  const marketPinned = contexts.flatMap((ctx, i) =>
    ctx ? marketSources(wanted[i], ctx, Date.now(), { maxHeadlines }) : []
  );

  let impact;
  let assetPinned = [];
  if (impactOn) {
    const history_ = Array.isArray(body.history) ? body.history : [];
    const priorText = history_.filter((t) => t?.role === 'user').slice(-2).map((t) => String(t.text || '').slice(0, 200)).join(' ');
    const pairs = await getAssetQuotes(pickAssets(body.message, { priorText })).catch(() => []);
    assetPinned = pairs.map(([asset, quote]) => assetSource(asset, quote)).filter(Boolean);
    impact = { decision: asksForDecision(body.message), marketData: marketDataStrip(pairs) };
  }
  // Live prices lead: they are the baseline the analysis is measured against.
  const pinned = [...assetPinned, ...marketPinned];

  const request_ = {
    pinned,
    impact,
    articles: pool,
    edition,
    message: body.message,
    history: body.history,
    focusClusterId,
    memory: body.memory,
    learn: body.learn === true,
  };
  const sourcesSeen = Math.min(impactOn ? 14 : 10, pool.length) + pinned.length;

  // Only single-turn questions are cached: a follow-up depends on the thread.
  const singleTurn = !Array.isArray(body.history) || body.history.length === 0;
  if (!singleTurn) {
    const result = await answerChat(request_);
    track(result, { edition, cached: false, ms: Date.now() - t0, sources: sourcesSeen });
    return NextResponse.json(await decorate(result, { request, question: body.message, edition, count: brief.articles.length, cached: false }));
  }

  const key = cacheKey({
    edition,
    question: body.message,
    focusClusterId,
    memory: cleanIncomingMemory(body.memory),
    learn: request_.learn,
    // Market data moves faster than the brief: bucket it by 2 minutes.
    briefVersion: `${brief.generatedAt}|${wanted.join(',')}|${wanted.length || impactOn ? Math.floor(Date.now() / 120000) : 0}|${impactOn ? 'impact' : ''}`,
  });
  const { value, cached } = await withCache(key, () => answerChat(request_), {
    fresh: body.fresh === true,
    // Never pin a fallback produced during an outage.
    cacheable: (v) => v.provider === 'gemini' || v.provider === 'openrouter',
  });

  // memoryUpdates belong to the reader who triggered the model call, never
  // to whoever the cached answer is replayed to.
  const result = cached ? { ...value, memoryUpdates: { add: [], drop: [] } } : value;
  track(result, { edition, cached, ms: Date.now() - t0, sources: sourcesSeen });
  return NextResponse.json(await decorate(result, { request, question: body.message, edition, count: brief.articles.length, cached }));
}

/** Adds the web-search offer (and strikes a model-detected off-topic question). */
async function decorate(result, { request, question, edition, count, cached }) {
  if (result.outOfScope) void recordStrike(request.headers);
  const { needsWeb, ...rest } = result;
  const enabled = webSearchEnabled();
  const offer = webOffer({
    needsWeb,
    question,
    enabled,
    left: enabled && needsWeb ? await webSearchesLeft(request.headers) : 0,
  });
  return { ...rest, edition, articleCount: count, cached, ...(offer ? { offerWebSearch: offer } : {}) };
}

/** The reader asked for a web search: charge the budget, search, shape the reply. */
async function webSearchReply(request, body, question, history, t0) {
  if (!webSearchEnabled()) return NextResponse.json(webChatReply({ ok: false, reason: 'disabled' }));
  const charge = await chargeWebSearch(request.headers);
  if (!charge.ok) {
    return NextResponse.json({ ...webChatReply({ ok: false, reason: 'unavailable' }), answer: charge.message, webSearchesLeft: 0, webBlocked: charge.reason });
  }
  const edition = body.edition === 'finance' || body.edition === 'markets' ? 'finance' : 'geopolitics';
  const brief = await getEditionBrief(edition).catch(() => null);
  const context = retrieveSources(brief?.articles || [], question).slice(0, 5).map((a) => a.title);
  const result = await searchWeb({ question, context, missing: typeof body.missing === 'string' ? body.missing : '' });
  recordEvent('websearch', { ok: result.ok, reason: result.reason || null, provider: result.provider || null, ms: Date.now() - t0, cached: Boolean(result.cached), edition });
  return NextResponse.json({ ...webChatReply(result, { left: charge.remaining }), edition });
}
