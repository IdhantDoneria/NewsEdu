import { NextResponse } from 'next/server';
import { findClusterById } from '@/lib/ingest';
import { getIntelForCluster } from '@/lib/intelligence/extract.mjs';
import { answerStoryQuestion } from '@/lib/intelligence/qa.mjs';
import { readJsonBounded } from '@/lib/intelligence/http.mjs';
import { rateLimit } from '@/lib/intelligence/ratelimit.mjs';
import { recordEvent } from '@/lib/telemetry.mjs';
import { classifyRequest, refusalFor, recordStrike, chargeChat, chargeWebSearch, webSearchesLeft } from '@/lib/intelligence/scope.mjs';
import { searchWeb, webSearchEnabled, webOffer, webStoryReply } from '@/lib/intelligence/websearch.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Contextual Q&A scoped to one story cluster. */
export async function POST(request, { params }) {
  // Every answer can cost a model call; same non-spoofable client key as /api/chat.
  const limit = await rateLimit(request.headers, { scope: 'ask', limit: 20, windowSec: 60 });
  if (limit.limited) {
    return NextResponse.json(
      { error: 'rate-limited', message: 'Too many questions. Wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    );
  }

  const t0 = Date.now();
  const read = await readJsonBounded(request, 8 * 1024);
  if (read.error) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = read.body;

  const cluster = await findClusterById(params.id, body?.edition);
  if (!cluster) {
    return NextResponse.json(
      { error: 'story-not-found', message: 'This story is no longer available.' },
      { status: 404 }
    );
  }

  const question = typeof body?.question === 'string' ? body.question : '';

  // Same gate as the chat: off-topic and injection never reach a model.
  const scope = classifyRequest(question, { storyScoped: true });
  if (scope.verdict === 'out' || scope.verdict === 'canned') {
    if (scope.verdict === 'out') void recordStrike(request.headers);
    recordEvent('scope', { verdict: scope.verdict, category: scope.category, edition: 'story' });
    return NextResponse.json({ answered: false, statements: [], notice: refusalFor(scope.category).answer, outOfScope: scope.verdict === 'out' });
  }

  // A web search runs only when the reader asked for it with the button.
  if (body?.webSearch === true) {
    if (!webSearchEnabled()) return NextResponse.json(webStoryReply({ ok: false, reason: 'disabled' }));
    const charge = await chargeWebSearch(request.headers);
    if (!charge.ok) {
      return NextResponse.json({ answered: false, statements: [], source: 'web', notice: charge.message, webSearchesLeft: 0, webBlocked: charge.reason });
    }
    const context = [cluster.title, ...cluster.articles.slice(0, 4).map((a) => a.title)];
    const found = await searchWeb({ question: `${question} (about: ${cluster.title})`, context });
    recordEvent('websearch', { ok: found.ok, reason: found.reason || null, provider: found.provider || null, ms: Date.now() - t0, cached: Boolean(found.cached), edition: 'story' });
    return NextResponse.json(webStoryReply(found, { left: charge.remaining }));
  }

  const budget = await chargeChat(request.headers);
  if (!budget.ok) {
    return NextResponse.json({ error: budget.reason, message: budget.message }, { status: 429 });
  }

  const intelRecord = await getIntelForCluster(cluster, { allowGenerate: false });
  const result = await answerStoryQuestion(cluster, intelRecord, question);

  // The story's sources do not answer it: say so and offer a web search.
  if (result.insufficientEvidence || result.answered === false) {
    const enabled = webSearchEnabled();
    const offer = webOffer({
      needsWeb: { missing: '' },
      question,
      enabled,
      left: enabled ? await webSearchesLeft(request.headers) : 0,
    });
    if (offer) result.offerWebSearch = offer;
  }
  recordEvent('qa', {
    provider: result.provider || 'fallback',
    model: result.model || null,
    ms: Date.now() - t0,
    answered: Boolean(result.answered),
    groundingSupported: result.grounding?.supported ?? null,
    groundingTotal: result.grounding?.total ?? null,
  });

  return NextResponse.json(result);
}
