/**
 * Lightweight index snapshot for the Markets edition.
 *
 * Uses Yahoo Finance's public chart endpoint (no API key, best-effort —
 * unofficial and can change or rate-limit). Failures degrade gracefully:
 * callers get `null` and render an "unavailable" state rather than crash.
 */

export const MARKET_INDEX = {
  US: { symbol: '^GSPC', name: 'S&P 500' },
  China: { symbol: '000001.SS', name: 'Shanghai Composite' },
  Japan: { symbol: '^N225', name: 'Nikkei 225' },
  India: { symbol: '^BSESN', name: 'BSE Sensex' },
  UK: { symbol: '^FTSE', name: 'FTSE 100' },
  France: { symbol: '^FCHI', name: 'CAC 40' },
  Canada: { symbol: '^GSPTSE', name: 'S&P/TSX Composite' },
  Germany: { symbol: '^GDAXI', name: 'DAX' },
  Taiwan: { symbol: '^TWII', name: 'TAIEX' },
  'South Korea': { symbol: '^KS11', name: 'KOSPI' },
  'Saudi Arabia': { symbol: '^TASI.SR', name: 'Tadawul All Share' },
  Switzerland: { symbol: '^SSMI', name: 'SMI' },
  Australia: { symbol: '^AXJO', name: 'S&P/ASX 200' },
};

export async function fetchIndexSnapshot(marketKey) {
  const entry = MARKET_INDEX[marketKey];
  if (!entry) return null;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(entry.symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MeridianBrief/1.0)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number') return null;

    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = price - prevClose;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;

    return {
      symbol: entry.symbol,
      name: entry.name,
      currency: meta.currency || null,
      price,
      change,
      changePercent,
      asOf: (meta.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000,
    };
  } catch {
    return null;
  }
}
