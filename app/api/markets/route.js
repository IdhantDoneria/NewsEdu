import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import { generateMarketSummary } from '@/lib/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKETS = {
  US: 'US stock market',
  China: 'China stock market',
  Japan: 'Japan stock market',
  India: 'India stock market',
  UK: 'UK stock market',
  France: 'France stock market',
  Canada: 'Canada stock market',
  Germany: 'Germany stock market',
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const marketKey = searchParams.get('market') || 'US';
  const query = MARKETS[marketKey] || MARKETS['US'];

  try {
    // 1. Fetch RSS feed from Google News
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' when:1d')}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const xml = await res.text();

    const parser = new XMLParser();
    const parsed = parser.parse(xml);
    const items = parsed?.rss?.channel?.item || [];
    
    // Normalize to array
    const articlesArray = Array.isArray(items) ? items : [items];
    const topArticles = articlesArray.slice(0, 10).map((item) => ({
      title: item.title,
      link: item.link,
      publishedAt: item.pubDate,
      source: item.source || 'Google News',
    }));

    // 2. Summarize using Gemini if API key is present
    let summary = '';
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!geminiKey) {
      summary = 'AI summary requires a Gemini API key. Set GEMINI_API_KEY in environment variables. Get your free key at: https://aistudio.google.com/apikey';
    } else if (topArticles.length === 0) {
      summary = 'No recent news found to summarize.';
    } else {
      try {
        const headlines = topArticles.map(a => a.title);
        summary = await generateMarketSummary(marketKey, headlines);
      } catch (aiError) {
        console.error('Gemini API Error:', aiError.message || aiError);
        summary = `AI summary unavailable: ${aiError.message || 'Unknown error'}. Verify your GEMINI_API_KEY is valid at https://aistudio.google.com/apikey`;
      }
    }

    return NextResponse.json({
      market: marketKey,
      summary,
      articles: topArticles,
    });
  } catch (err) {
    console.error('Markets API Error:', err);
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
  }
}
