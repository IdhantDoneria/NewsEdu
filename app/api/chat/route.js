import { NextResponse } from 'next/server';
import { getEditionBrief } from '@/lib/ingest';
import { answerChat } from '@/lib/intelligence/chat.mjs';
import { readJsonBounded } from '@/lib/intelligence/http.mjs';
import { cacheKey, withCache } from '@/lib/intelligence/chatcache.mjs';
import { cleanIncomingMemory } from '@/lib/intelligence/memory.mjs';
import { hasGeminiKey } from '@/lib/intelligence/ai.mjs';
import { hasOpenRouterKey } from '@/lib/intelligence/openrouter.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45; // Gemini models, then OpenRouter

// Per-IP sliding window — each request can cost a model call.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map(); // ip -> timestamps

function rateLimited(request) {
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return recent.length > MAX_PER_WINDOW;
}

/** Which providers are configured (booleans only; never the keys). */
export async function GET() {
  return NextResponse.json({ gemini: hasGeminiKey(), openrouter: hasOpenRouterKey() });
}

/** Site-wide news chat, grounded in the current edition's ranked articles. */
export async function POST(request) {
  if (rateLimited(request)) {
    return NextResponse.json(
      { error: 'rate-limited', message: 'Too many questions. Wait a moment and try again.' },
      { status: 429 }
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

  const edition = body.edition === 'finance' ? 'finance' : 'geopolitics';
  const focusClusterId =
    typeof body.storyId === 'string' && /^[\w-]{1,64}$/.test(body.storyId) ? body.storyId : undefined;

  const brief = await getEditionBrief(edition);
  const request_ = {
    articles: brief.articles,
    edition,
    message: body.message,
    history: body.history,
    focusClusterId,
    memory: body.memory,
    learn: body.learn === true,
  };

  // Only single-turn questions are cached: a follow-up depends on the thread.
  const singleTurn = !Array.isArray(body.history) || body.history.length === 0;
  if (!singleTurn) {
    const result = await answerChat(request_);
    return NextResponse.json({ ...result, edition, articleCount: brief.articles.length, cached: false });
  }

  const key = cacheKey({
    edition,
    question: body.message,
    focusClusterId,
    memory: cleanIncomingMemory(body.memory),
    learn: request_.learn,
    briefVersion: brief.generatedAt,
  });
  const { value, cached } = await withCache(key, () => answerChat(request_), {
    fresh: body.fresh === true,
    // Never pin a fallback produced during an outage.
    cacheable: (v) => v.provider === 'gemini' || v.provider === 'openrouter',
  });

  // memoryUpdates belong to the reader who triggered the model call, never
  // to whoever the cached answer is replayed to.
  const result = cached ? { ...value, memoryUpdates: { add: [], drop: [] } } : value;
  return NextResponse.json({ ...result, edition, articleCount: brief.articles.length, cached });
}
