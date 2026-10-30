import { NextResponse } from 'next/server';
import { getEditionBrief } from '@/lib/ingest';
import { answerChat } from '@/lib/intelligence/chat.mjs';
import { readJsonBounded } from '@/lib/intelligence/http.mjs';
import { cacheKey, withCache } from '@/lib/intelligence/chatcache.mjs';
import { cleanIncomingMemory } from '@/lib/intelligence/memory.mjs';
import { detectMarkets, isMarketKey, marketSources } from '@/lib/intelligence/marketsctx.mjs';
import { rateLimit } from '@/lib/intelligence/ratelimit.mjs';
import { getMarketContext } from '@/lib/markets.mjs';
import { hasGeminiKey } from '@/lib/intelligence/ai.mjs';
import { hasOpenRouterKey } from '@/lib/intelligence/openrouter.mjs';
import { recordEvent } from '@/lib/telemetry.mjs';

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
    grounding: result.grounding || null,
    lowRelevance: Boolean(result.lowRelevance),
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

  // The Markets tab has no ranked articles of its own: it answers from the
  // finance wire plus that tab's market data (headlines and index levels).
  const marketsTab = body.edition === 'markets';
  const edition = body.edition === 'finance' || marketsTab ? 'finance' : 'geopolitics';
  const selectedMarket = isMarketKey(body.market) ? body.market : null;
  const focusClusterId =
    typeof body.storyId === 'string' && /^[\w-]{1,64}$/.test(body.storyId) ? body.storyId : undefined;

  const brief = await getEditionBrief(edition);

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
  const maxHeadlines = wanted.length > 1 ? 3 : 8;
  const pinned = contexts.flatMap((ctx, i) =>
    ctx ? marketSources(wanted[i], ctx, Date.now(), { maxHeadlines }) : []
  );

  const request_ = {
    pinned,
    articles: brief.articles,
    edition,
    message: body.message,
    history: body.history,
    focusClusterId,
    memory: body.memory,
    learn: body.learn === true,
  };
  const sourcesSeen = Math.min(10, brief.articles.length) + pinned.length;

  // Only single-turn questions are cached: a follow-up depends on the thread.
  const singleTurn = !Array.isArray(body.history) || body.history.length === 0;
  if (!singleTurn) {
    const result = await answerChat(request_);
    track(result, { edition, cached: false, ms: Date.now() - t0, sources: sourcesSeen });
    return NextResponse.json({ ...result, edition, articleCount: brief.articles.length, cached: false });
  }

  const key = cacheKey({
    edition,
    question: body.message,
    focusClusterId,
    memory: cleanIncomingMemory(body.memory),
    learn: request_.learn,
    // Market data moves faster than the brief: bucket it by 2 minutes.
    briefVersion: `${brief.generatedAt}|${wanted.join(',')}|${wanted.length ? Math.floor(Date.now() / 120000) : 0}`,
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
  return NextResponse.json({ ...result, edition, articleCount: brief.articles.length, cached });
}
