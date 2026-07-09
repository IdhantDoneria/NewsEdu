import { NextResponse } from 'next/server';
import { EDITIONS, FINNHUB_ENDPOINT } from '@/lib/feeds';
import { fetchFeed } from '@/lib/rss';
import {
  scoreArticle,
  applyCorroboration,
  totalScore,
  NOISE_FLOOR,
} from '@/lib/score';
import { scoreArticlesAsync } from '@/lib/scoring/index.mjs';

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
        image: it.image || null,
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

  // Run the two 10-layer pipelines (geopolitics + finance) concurrently over
  // the whole batch. Each article is scored through both algorithms so the
  // response carries geopoliticalScore, financialScore, and finalCurationScore
  // (the edition-appropriate one) — the frontend can sort/filter on any of
  // them. Because scoring is CPU-bound but wrapped in Promise.all, we yield
  // between microtasks and don't block the response.
  const pipelineScores = await scoreArticlesAsync(articles, edition);
  articles = articles.map((a, i) => {
    const scores = pipelineScores[i] || {
      geopoliticalScore: 0,
      financialScore: 0,
      finalCurationScore: 0,
    };
    return {
      ...a,
      geopoliticalScore: scores.geopoliticalScore,
      financialScore: scores.financialScore,
      finalCurationScore: scores.finalCurationScore,
      // Keep the legacy Meridian totalScore around for observability & the
      // metric-strip breakdown UI, but the primary "score" the frontend
      // ranks / renders is now the 10-layer pipeline's finalCurationScore.
      meridianScore: totalScore(a),
      score: scores.finalCurationScore,
    };
  });

  articles = articles
    .filter((a) => a.finalCurationScore >= NOISE_FLOOR) // the clickbait cut
    .sort((a, b) => b.finalCurationScore - a.finalCurationScore)
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
