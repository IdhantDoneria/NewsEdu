import { NextResponse } from 'next/server';
import { findClusterById } from '@/lib/ingest';
import { getIntelForCluster } from '@/lib/intelligence/extract.mjs';
import { answerStoryQuestion } from '@/lib/intelligence/qa.mjs';
import { readJsonBounded } from '@/lib/intelligence/http.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Contextual Q&A scoped to one story cluster. */
export async function POST(request, { params }) {
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

  return NextResponse.json(result);
}
