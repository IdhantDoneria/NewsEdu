import { NextResponse } from 'next/server';
import { findClusterById } from '@/lib/ingest';
import { getIntelForCluster } from '@/lib/intelligence/extract.mjs';
import { answerStoryQuestion } from '@/lib/intelligence/qa.mjs';
import { readJsonBounded } from '@/lib/intelligence/http.mjs';
import { rateLimit } from '@/lib/intelligence/ratelimit.mjs';
import { recordEvent } from '@/lib/telemetry.mjs';

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

  const intelRecord = await getIntelForCluster(cluster, { allowGenerate: false });
  const result = await answerStoryQuestion(cluster, intelRecord, body?.question);
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
