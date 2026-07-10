import { NextResponse } from 'next/server';
import { findClusterById } from '@/lib/ingest';
import { getIntelForCluster } from '@/lib/intelligence/extract.mjs';
import { answerStoryQuestion } from '@/lib/intelligence/qa.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Contextual Q&A scoped to one story cluster. */
export async function POST(request, { params }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  const cluster = await findClusterById(params.id, body?.edition);
  if (!cluster) {
    return NextResponse.json(
      { error: 'story-not-found', message: 'This story is no longer available.' },
      { status: 404 }
    );
  }

  const intelRecord = await getIntelForCluster(cluster, { allowGenerate: false });
  const result = await answerStoryQuestion(cluster, intelRecord, body?.question);

  return NextResponse.json(result);
}
