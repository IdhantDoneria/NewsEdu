import { NextResponse } from 'next/server';
import { EDITIONS, FINNHUB_ENDPOINT } from '@/lib/feeds';
import { fetchFeed } from '@/lib/rss';
import {
  scoreArticle,
  applyCorroboration,
  totalScore,
  NOISE_FLOOR,
} from '@/lib/score';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_AGE_HOURS = 72;
const MAX_ARTICLES = 60;

// Per-edition in-memory cache so a burst of clients doesn't hammer the feeds.
const cache = new Map(); // edition -> { at, payload }
const CACHE_TTL_MS = 5 * 60 * 1000;

async function finnhubArticles() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`${FINNHUB_ENDPOINT}&token=${key}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.slice(0, 40).map((it) => ({
      raw: {
        title: it.headline,
        link: it.url,
        summary: it.summary,
        publishedAt: it.datetime * 1000,
      },
      source: { name: 'Finnhub Wire', trust: 14, authority: 8 },
    }));
  } catch {
    return [];
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const edition = searchParams.get('edition') === 'finance' ? 'finance' : 'geopolitics';
  const force = searchParams.get('refresh') === '1';

  const cached = cache.get(edition);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload);
  }

  const sources = EDITIONS[edition];
  const now = Date.now();

  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const items = await fetchFeed(source.url);
      return items.map((raw) => ({ raw, source }));
    })
  );

  let pool = [];
  const feedStatus = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      pool.push(...result.value);
      feedStatus.push({ source: sources[i].name, ok: true, items: result.value.length });
    } else {
      feedStatus.push({ source: sources[i].name, ok: false, items: 0 });
    }
  });

  if (edition === 'finance') {
    pool.push(...(await finnhubArticles()));
  }

  // Score, drop stale and unscorable items
  let articles = pool
    .map(({ raw, source }) => scoreArticle(raw, source, edition, now))
    .filter(Boolean)
    .filter((a) => a.ageHours <= MAX_AGE_HOURS);

  // Corroboration pass works best when the strongest telling comes first
  articles.sort(
    (a, b) =>
      b.metrics.headlineIntegrity + b.metrics.sourceTrust -
      (a.metrics.headlineIntegrity + a.metrics.sourceTrust)
  );
  applyCorroboration(articles);

  articles = articles
    .map((a) => ({ ...a, score: totalScore(a) }))
    .filter((a) => a.score >= NOISE_FLOOR) // the clickbait cut
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ARTICLES);

  const payload = {
    edition,
    generatedAt: now,
    noiseFloor: NOISE_FLOOR,
    feeds: feedStatus,
    articles,
  };

  if (articles.length > 0) cache.set(edition, { at: now, payload });

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
  });
}
