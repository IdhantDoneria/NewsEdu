import { NextResponse } from 'next/server';
import { kvRange, kvAvailable } from '@/lib/store/kv.mjs';
import { readJsonBounded } from '@/lib/intelligence/http.mjs';
import {
  recordEvent,
  summarizeEvents,
  validateFeedback,
  isRateLimited,
  tokenMatches,
  TELEMETRY_KEY,
  MAX_EVENTS,
} from '@/lib/telemetry.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientIp(request) {
  // The last hop is the one appended by our own proxy; earlier ones are client-controlled.
  const fwd = (request.headers.get('x-forwarded-for') || '').split(',').pop().trim();
  return request.headers.get('x-real-ip') || fwd || 'local';
}

/** Reader feedback (thumbs). Fire-and-forget from the browser. */
export async function POST(request) {
  if (await isRateLimited(clientIp(request))) {
    return NextResponse.json({ error: 'rate-limited' }, { status: 429 });
  }
  const read = await readJsonBounded(request, 4 * 1024);
  if (read.error) return NextResponse.json({ error: read.error }, { status: read.status });

  const v = validateFeedback(read.body);
  if (v.error) return NextResponse.json({ error: v.error }, { status: 400 });

  await recordEvent(v.type, v.data);
  return NextResponse.json({ ok: true }, { status: 202 });
}

/** Admin summary. Disabled (404) unless TELEMETRY_TOKEN is set. */
export async function GET(request) {
  const expected = process.env.TELEMETRY_TOKEN;
  if (!expected) return NextResponse.json({ error: 'not-found' }, { status: 404 });

  const url = new URL(request.url);
  const auth = request.headers.get('authorization') || '';
  const supplied = url.searchParams.get('token') || auth.replace(/^Bearer\s+/i, '');
  if (!tokenMatches(supplied, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const events = await kvRange(TELEMETRY_KEY, 0, MAX_EVENTS - 1);
  const recent = Math.min(100, Math.max(0, Number(url.searchParams.get('recent')) || 0));
  return NextResponse.json(
    {
      durable: kvAvailable(),
      summary: summarizeEvents(events),
      ...(recent ? { recent: events.slice(0, recent) } : {}),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
