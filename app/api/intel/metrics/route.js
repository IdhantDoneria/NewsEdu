import { NextResponse } from 'next/server';
import { snapshotMetrics } from '@/lib/intelligence/metrics.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** AI/caching observability counters (per server instance). */
export async function GET() {
  return NextResponse.json(snapshotMetrics());
}
