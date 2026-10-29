import { NextResponse } from 'next/server';
import { findClusterById } from '@/lib/ingest';
import { framingNarrative } from '@/lib/intelligence/compare.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/** The AI framing narrative for a story, generated on demand and cached. */
export async function GET(request, { params }) {
  const { searchParams } = new URL(request.url);
  const cluster = await findClusterById(params.id, searchParams.get('edition') || undefined);
  if (!cluster) {
    return NextResponse.json({ error: 'story-not-found' }, { status: 404 });
  }
  const framing = await framingNarrative(cluster).catch(() => null);
  return NextResponse.json({ framing });
}
