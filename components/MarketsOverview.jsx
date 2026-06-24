'use client';

import { useState, useEffect } from 'react';

const MARKETS = [
  'US', 'China', 'Japan', 'India', 'UK', 'France', 'Canada', 'Germany',
  'Taiwan', 'South Korea', 'Saudi Arabia', 'Switzerland', 'Australia'
];

export default function MarketsOverview() {
  const [selectedMarket, setSelectedMarket] = useState('US');
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      setMarketData(null);
      try {
        const res = await fetch(`/api/markets?market=${selectedMarket}`);
        if (!res.ok) throw new Error('Failed to fetch market data');
        const data = await res.json();
        setMarketData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [selectedMarket]);

  return (
    <div className="markets-overview">
      <div className="markets-header">
        <h2>Global Markets Overview</h2>
        <select 
          value={selectedMarket} 
          onChange={(e) => setSelectedMarket(e.target.value)}
          className="market-select"
        >
          {MARKETS.map(m => (
            <option key={m} value={m}>{m} Market</option>
          ))}
        </select>
      </div>

      {loading && <div className="loading-state">Analyzing {selectedMarket} market data...</div>}
      
      {error && <div className="error-state">Error: {error}</div>}

      {marketData && !loading && (
        <div className="market-content">
          <div className="market-summary-box">
            <h3>AI Summary</h3>
            <div className="summary-text">
              {marketData.summary.split('\n\n').map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>

          <div className="market-news-list">
            <h3>Key Developments</h3>
            <ul>
              {marketData.articles.map((article, i) => (
                <li key={i} className="market-article">
                  <a href={article.link} target="_blank" rel="noopener noreferrer">
                    {article.title}
                  </a>
                  <span className="article-meta">
                    {article.source} • {new Date(article.publishedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <style jsx>{`
        .markets-overview {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px 0;
        }
        .markets-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .markets-header h2 {
          margin: 0;
          font-size: 1.5rem;
          color: var(--fg);
        }
        .market-select {
          padding: 8px 12px;
          font-size: 1rem;
          background: var(--bg-card, #f4f4f5);
          color: var(--fg);
          border: 1px solid var(--border, #e4e4e7);
          border-radius: 6px;
          cursor: pointer;
        }
        .loading-state, .error-state {
          text-align: center;
          padding: 40px;
          color: var(--fg-muted, #71717a);
        }
        .error-state {
          color: #ef4444;
        }
        .market-summary-box {
          background: var(--bg-card, #f4f4f5);
          border: 1px solid var(--border, #e4e4e7);
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 24px;
        }
        .market-summary-box h3 {
          margin-top: 0;
          margin-bottom: 12px;
          color: var(--fg);
          font-size: 1.2rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .market-summary-box h3::before {
          content: '✨';
        }
        .summary-text p {
          line-height: 1.6;
          color: var(--fg-muted, #3f3f46);
          margin-bottom: 12px;
        }
        .summary-text p:last-child {
          margin-bottom: 0;
        }
        .market-news-list h3 {
          margin-bottom: 16px;
          color: var(--fg);
          font-size: 1.2rem;
        }
        .market-news-list ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .market-article {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border, #e4e4e7);
        }
        .market-article:last-child {
          border-bottom: none;
        }
        .market-article a {
          color: var(--fg);
          text-decoration: none;
          font-weight: 500;
          line-height: 1.4;
        }
        .market-article a:hover {
          text-decoration: underline;
        }
        .article-meta {
          font-size: 0.85rem;
          color: var(--fg-muted, #71717a);
        }
      `}</style>
    </div>
  );
}
