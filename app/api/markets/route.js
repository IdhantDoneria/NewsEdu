import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import { GoogleGenAI } from '@google/genai';

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
    if (geminiKey && topArticles.length > 0) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        
        const prompt = `You are a financial analyst. Provide a brief, highly accurate 2-paragraph summary of the recent developments in the ${marketKey} stock market based on the following news headlines. Focus on key movers, economic data, and overall sentiment.\n\nHeadlines:\n` + topArticles.map(a => `- ${a.title}`).join('\n');
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        summary = response.text;
      } catch (aiError) {
        console.error('Gemini API Error:', aiError);
        summary = 'AI summary is currently unavailable due to an error generating the content.';
      }
    } else if (!geminiKey) {
       summary = 'AI summary requires a Gemini API key in the environment variables (GEMINI_API_KEY).';
    } else {
       summary = 'No recent news found to summarize.';
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
