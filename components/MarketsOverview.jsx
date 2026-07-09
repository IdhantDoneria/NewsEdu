'use client';

import { useState, useEffect } from 'react';

const MARKETS = [
  'US', 'China', 'Japan', 'India', 'UK', 'France', 'Canada', 'Germany',
  'Taiwan', 'South Korea', 'Saudi Arabia', 'Switzerland', 'Australia'
];

function formatPrice(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function TrendIcon({ up, ...props }) {
  return up ? (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 3l9 15H3z" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 21L3 6h18z" />
    </svg>
  );
}

function SnapshotCard({ snapshot, indexName, market }) {
  if (!snapshot) {
    return (
      <div className="snapshot-box snapshot-empty">
        <h3>{indexName || `${market} Index`}</h3>
        <p>Index data unavailable right now — the price feed may be rate-limited. News and AI summary below are unaffected.</p>
      </div>
    );
  }

  const up = snapshot.change >= 0;
  const dirWord = up ? 'up' : 'down';

  return (
    <div className={`snapshot-box ${up ? 'is-up' : 'is-down'}`}>
      <div className="snapshot-top">
        <h3>{snapshot.name}</h3>
        <span className="snapshot-asof">as of {formatTime(snapshot.asOf)}</span>
      </div>
      <div className="snapshot-figures">
        <span className="snapshot-price">
          {formatPrice(snapshot.price)}
          {snapshot.currency && <small>{snapshot.currency}</small>}
        </span>
        <span
          className={`snapshot-change ${up ? 'good' : 'bad'}`}
          aria-label={`${dirWord} ${Math.abs(snapshot.change).toFixed(2)} points, ${Math.abs(snapshot.changePercent).toFixed(2)} percent`}
        >
          <TrendIcon up={up} />
          {up ? '+' : ''}
          {formatPrice(snapshot.change)} ({up ? '+' : ''}
          {snapshot.changePercent.toFixed(2)}%)
        </span>
      </div>
    </div>
  );
}

function SkeletonLines({ count = 3 }) {
  return (
    <div className="skeleton-lines" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span className="skeleton-line" key={i} style={{ width: `${86 - i * 14}%` }} />
      ))}
    </div>
  );
}

export default function MarketsOverview() {
  const [selectedMarket, setSelectedMarket] = useState('US');
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/markets?market=${encodeURIComponent(selectedMarket)}`);
        if (!res.ok) throw new Error('Failed to fetch market data');
        const data = await res.json();
        if (!cancelled) setMarketData(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [selectedMarket]);

  return (
    <div className="markets-overview">
      <div className="markets-header">
        <h2>Global Markets Overview</h2>
        <select
          value={selectedMarket}
          onChange={(e) => setSelectedMarket(e.target.value)}
          className="market-select"
          aria-label="Select market"
        >
          {MARKETS.map(m => (
            <option key={m} value={m}>{m} Market</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="error-state" role="alert">
          Error: {error}. It will retry on next selection.
        </div>
      )}

      {!error && loading && (
        <div className="market-content" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading {selectedMarket} market data…</span>
          <div className="snapshot-box skeleton-box">
            <SkeletonLines count={2} />
          </div>
          <div className="market-summary-box">
            <h3>AI Summary</h3>
            <SkeletonLines count={4} />
          </div>
          <div className="market-news-list">
            <h3>Key Developments</h3>
            <ul>
              {[0, 1, 2, 3].map((i) => (
                <li className="market-article skeleton-article" key={i}>
                  <SkeletonLines count={2} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!error && !loading && marketData && (
        <div className="market-content">
          <SnapshotCard snapshot={marketData.snapshot} indexName={marketData.indexName} market={selectedMarket} />

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
            {marketData.newsOk === false || marketData.articles.length === 0 ? (
              <p className="empty-note">
                No live headlines for {selectedMarket} right now — the news source may be
                temporarily unreachable. Try another market or check back shortly.
              </p>
            ) : (
              <ul>
                {marketData.articles.map((article, i) => (
                  <li key={i} className="market-article">
                    <a href={article.link} target="_blank" rel="noopener noreferrer">
                      {article.title}
                    </a>
                    <span className="article-meta">
                      {article.source} • <time dateTime={new Date(article.publishedAt).toISOString()}>{new Date(article.publishedAt).toLocaleString()}</time>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
