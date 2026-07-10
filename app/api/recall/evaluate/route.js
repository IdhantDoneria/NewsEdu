import { NextResponse } from 'next/server';
import { evaluateRecallAnswer } from '@/lib/intelligence/recall.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Grade one recall answer (paraphrase-tolerant). */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  const question = String(body?.question || '').slice(0, 500);
  const expectedAnswer = String(body?.expectedAnswer || '').slice(0, 1200);
  const userAnswer = String(body?.userAnswer || '').slice(0, 1500);

  if (!question || !expectedAnswer) {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  const result = await evaluateRecallAnswer({ question, expectedAnswer, userAnswer });
  return NextResponse.json(result);
}
