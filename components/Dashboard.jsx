'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import MarketsOverview from './MarketsOverview';
import { getFollows, changesPayload } from '@/lib/client/userState';

const EDITION_LABELS = {
  geopolitics: 'Geopolitics',
  finance: 'Finance',
  markets: 'Markets',
};

const REFRESH_MS = 5 * 60 * 1000;

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function absoluteTime(ts) {
  return new Date(ts).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function todayLine() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function scoreTier(score) {
  if (score >= 80) return 'high';
  if (score >= 60) return 'mid';
  return 'low';
}

function useTilt(maxDeg = 4) {
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const onMouseMove = useCallback(
    (e) => {
      if (reduced.current) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `perspective(900px) rotateX(${(-py * maxDeg).toFixed(2)}deg) rotateY(${(px * maxDeg).toFixed(2)}deg) translateZ(6px)`;
    },
    [maxDeg]
  );

  const onMouseLeave = useCallback((e) => {
    e.currentTarget.style.transform = '';
  }, []);

  return { onMouseMove, onMouseLeave };
}

function ScoreDial({ score, small = false, label, metrics, corroboration }) {
  let desc = `Meridian Score: ${score} out of 100.`;
  if (metrics) {
    desc += ` Headline integrity ${Math.round(metrics.headlineIntegrity)} of 40, source trust ${Math.round(metrics.sourceTrust)} of 30, freshness ${Math.round(metrics.freshness)} of 30.`;
    if (corroboration) {
      desc +=
        corroboration > 0
          ? ` Plus ${corroboration} for independent corroboration.`
          : ` Minus ${Math.abs(corroboration)} as a near-duplicate.`;
    }
  }
  return (
    <span
      className={`dial${small ? ' small' : ''}`}
      style={{ '--pct': `${score}%` }}
      role="img"
      aria-label={desc}
      title={desc}
    >
      <b aria-hidden="true">{score}</b>
      {label && <small aria-hidden="true">{label}</small>}
    </span>
  );
}

function ScoreLegend() {
  return (
    <details className="score-legend">
      <summary>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="11" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        How scores work
      </summary>
      <div className="score-legend-panel" role="note">
        <p>Every brief is scored 0–100 from four transparent metrics:</p>
        <ul>
          <li><b>Headline Integrity</b> · 0–40 pts — attribution &amp; facts vs. clickbait</li>
          <li><b>Source Trust</b> · 0–30 pts — outlet reliability + topical authority</li>
          <li><b>Freshness</b> · 0–30 pts — decays from publish time</li>
          <li><b>Corroboration</b> · −12…+8 pts — independent confirmation vs. duplicates</li>
        </ul>
        <a href="#methodology">Read the full methodology ↓</a>
      </div>
    </details>
  );
}

function MetricStrip({ metrics, corroboration }) {
  const items = [
    { key: 'headlineIntegrity', label: 'Headline', max: 40, cls: 'm-headline' },
    { key: 'sourceTrust', label: 'Trust', max: 30, cls: 'm-trust' },
    { key: 'freshness', label: 'Fresh', max: 30, cls: 'm-fresh' },
  ];
  return (
    <div className="metric-strip">
      {items.map(({ key, label, max, cls }) => {
        const val = Math.round(metrics[key] * 10) / 10;
        const pct = Math.min(100, Math.max(0, (val / max) * 100));
        return (
          <div className={`metric ${cls}`} key={key}>
            <div className="metric-head">
              <label>{label}</label>
              <span className="metric-val">
                {Math.round(val)}
                <small>/{max}</small>
              </span>
            </div>
            <span
              className="bar"
              role="img"
              aria-label={`${label}: ${Math.round(val)} of ${max} points`}
            >
              <i style={{ width: `${pct}%` }} />
            </span>
          </div>
        );
      })}
      {!!corroboration && (
        <span
          className={`corrob-pill ${corroboration > 0 ? 'good' : 'bad'}`}
          title={
            corroboration > 0
              ? 'A second independent outlet confirmed this story'
              : 'Near-duplicate of an earlier, higher-ranked story'
          }
        >
          {corroboration > 0 ? `+${corroboration} corroborated` : `${corroboration} duplicate`}
        </span>
      )}
    </div>
  );
}

function Byline({ article }) {
  return (
    <div className="byline">
      <span className="src">{article.sourceName}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={new Date(article.publishedAt).toISOString()} title={absoluteTime(article.publishedAt)}>
        {timeAgo(article.publishedAt)}
      </time>
    </div>
  );
}

function LeadCard({ article, tiltProps }) {
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(article.image) && !imgError;

  return (
    <a
      className={`lead-card${hasImage ? '' : ' no-image'}`}
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      {...tiltProps}
    >
      {hasImage ? (
        <div className="lead-media">
          <img
            src={article.image}
            alt=""
            loading="eager"
            fetchPriority="high"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <span className="lead-quote" aria-hidden="true">
          “
        </span>
      )}
      <div className="lead-body">
        <div className="lead-kicker">Lead Brief</div>
        <h3>{article.title}</h3>
        {article.summary && <p className="summary">{article.summary}</p>}
        <div className="lead-foot">
          <div>
            <Byline article={article} />
            <div style={{ maxWidth: 320, marginTop: 12 }}>
              <MetricStrip metrics={article.metrics} corroboration={article.corroboration} />
            </div>
          </div>
          <ScoreDial
            score={article.score}
            label="Meridian Score"
            metrics={article.metrics}
            corroboration={article.corroboration}
          />
        </div>
      </div>
    </a>
  );
}

/**
 * Compact home strip: material developments across followed stories since the
 * user's last visit. Renders nothing for users who follow nothing.
 */
function WhatChangedStrip() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getFollows().length === 0) return;
      try {
        const res = await fetch('/api/changes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changesPayload()),
        });
        const json = await res.json();
        if (cancelled) return;
        const results = json.results || [];
        const changed = results.filter((r) => !r.expired && r.changes.length > 0);
        const total = changed.reduce((n, r) => n + r.changes.length, 0);
        setSummary({ storyCount: changed.length, total, top: changed[0] || null });
      } catch {
        /* the strip is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!summary || summary.total === 0) return null;
  return (
    <Link href="/following" className="what-changed-strip">
      <span className="wc-label">Since you left</span>
      <span className="wc-text">
        {summary.total} material development{summary.total === 1 ? '' : 's'} across{' '}
        {summary.storyCount} followed {summary.storyCount === 1 ? 'story' : 'stories'}
        {summary.top?.changes?.[0] ? ` — latest: ${summary.top.changes[summary.top.changes.length - 1].what}` : ''}
      </span>
      <span className="wc-cta">Review →</span>
    </Link>
  );
}

/** Link into a story's intelligence page (sits beside external card links). */
function IntelLink({ article, edition }) {
  if (!article?.clusterId) return null;
  return (
    <Link
      className="intel-link"
      href={`/story/${article.clusterId}?edition=${edition}`}
      title="Open the full intelligence brief: actors, timeline, scenarios, source comparison, Q&A"
    >
      Full intelligence →
    </Link>
  );
}

function SourcesStatus({ feeds, liveCount }) {
  if (!feeds || feeds.length === 0) return null;
  return (
    <details className="sources-pop">
      <summary>
        {liveCount}/{feeds.length} sources live
      </summary>
      <ul className="sources-list">
        {feeds.map((f) => (
          <li key={f.source}>
            <span className={`dot ${f.ok ? 'ok' : 'down'}`} aria-hidden="true" />
            <span>{f.source}</span>
            <span className="src-count">{f.ok ? `${f.items} items` : 'unreachable'}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function Dashboard() {
  const [edition, setEdition] = useState('geopolitics');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [error, setError] = useState(null);
  const tilt = useTilt(4);
  const leadTilt = useTilt(2.5);

  const load = useCallback(async (ed, force = false) => {
    if (ed === 'markets') {
      setData(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    try {
      const url = `/api/news?edition=${ed}${force ? '&refresh=1' : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const forceRefresh = useCallback(() => {
    if (refreshing || loading) return;
    setRefreshing(true);
    load(edition, true);
  }, [refreshing, loading, load, edition]);

  useEffect(() => {
    setLoading(true);
    load(edition);
    const id = setInterval(() => load(edition), REFRESH_MS);
    return () => clearInterval(id);
  }, [edition, load]);

  const switchEdition = (ed) => {
    if (ed === edition || flipping) return;
    setFlipping(true);
    setTimeout(() => {
      setEdition(ed);
      setLoading(true);
      setFlipping(false);
    }, 380);
  };

  const articles = data?.articles ?? [];
  const lead = articles[0];
  const rail = articles.slice(1, 6);
  const rest = articles.slice(6, 30);
  const tickerItems = articles.slice(0, 10);
  const liveFeeds = data?.feeds?.filter((f) => f.ok).length ?? 0;
  const halfLife = edition === 'finance' ? 8 : 18;

  return (
    <div data-edition={edition}>
      <div className="shell">
        <div className="topbar">
          <span>{todayLine()}</span>
          <nav className="intel-nav" aria-label="Meridian sections">
            <Link href="/briefing">Your Briefing</Link>
            <Link href="/following">Following</Link>
            <Link href="/recall">Recall</Link>
          </nav>
          <nav
            className="edition-toggle"
            data-active={edition}
            aria-label="Switch news edition"
          >
            <span className="thumb" aria-hidden="true" />
            {Object.entries(EDITION_LABELS).map(([key, label]) => (
              <button
                key={key}
                className={edition === key ? 'on' : ''}
                onClick={() => switchEdition(key)}
                aria-pressed={edition === key}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <header className="masthead">
          <h1>The Meridian Brief</h1>
          <p className="tagline">
            {edition === 'finance'
              ? 'Fundings · Markets · Capital Flows'
              : edition === 'markets'
              ? 'Global Stock Markets · Equities · Indices'
              : 'Statecraft · Conflict · Diplomacy'}{' '}
            {edition !== 'markets' && '— ranked by the Meridian Score'}
          </p>
        </header>

        {edition !== 'markets' && <WhatChangedStrip />}

        {edition !== 'markets' && tickerItems.length > 0 && (
          <div className="ticker">
            <span className="ticker-label">Latest Wire</span>
            <div className="ticker-edge" aria-hidden="true">
              <div className="ticker-track">
                {[...tickerItems, ...tickerItems].map((a, i) => (
                  <span className="ticker-item" key={`${a.id}-${i}`}>
                    <span className="diamond" aria-hidden="true">◆</span>
                    <b>{a.sourceName}</b>
                    {a.title}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="section-head">
          <h2>
            <span className="edition-word">{EDITION_LABELS[edition]}</span> Edition
          </h2>
          {edition !== 'markets' && (
            <div className="section-head-right">
              <ScoreLegend />
              <span className="meta" aria-live="polite">
                {loading
                  ? 'Consulting the wire…'
                  : `${articles.length} briefs · refreshed ${data ? timeAgo(data.generatedAt) : '—'}`}
              </span>
              <SourcesStatus feeds={data?.feeds} liveCount={liveFeeds} />
              <button
                className="refresh-btn icon-only"
                onClick={forceRefresh}
                disabled={refreshing || loading}
                aria-label={refreshing ? 'Refreshing…' : 'Refresh now'}
                title="Pull the latest from all sources now"
              >
                <svg
                  className={`refresh-icon${refreshing ? ' spinning' : ''}`}
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 2v6h-6" />
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  <path d="M3 22v-6h6" />
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="stage">
          <div className={`stage-inner${flipping ? ' flipping' : ''}`}>
            {edition === 'markets' ? (
              <MarketsOverview />
            ) : loading ? (
              <div className="state-box">
                <div className="press" />
                Setting the type…
              </div>
            ) : error ? (
              <div className="state-box">
                The wire is unreachable ({error}). It will retry automatically.
              </div>
            ) : articles.length === 0 ? (
              <div className="state-box">
                No briefs cleared the noise floor. Check back shortly.
              </div>
            ) : (
              <>
                <div className="front-page">
                  <div className="lead-column">
                    {lead && <LeadCard article={lead} tiltProps={leadTilt} />}
                    {lead && <IntelLink article={lead} edition={edition} />}
                  </div>

                  <ol className="rail-column">
                    {rail.map((a, i) => (
                      <li key={a.id}>
                        <a
                          className="rail-item"
                          href={a.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-tier={scoreTier(a.score)}
                          {...tilt}
                        >
                          <span className="rail-rank" aria-hidden="true">
                            {String(i + 2).padStart(2, '0')}
                          </span>
                          <span>
                            <h4>{a.title}</h4>
                            <Byline article={a} />
                          </span>
                          <ScoreDial score={a.score} small metrics={a.metrics} corroboration={a.corroboration} />
                        </a>
                        <IntelLink article={a} edition={edition} />
                      </li>
                    ))}
                  </ol>
                </div>

                {rest.length > 0 && (
                  <>
                    <div className="section-head">
                      <h2>The Full Ledger</h2>
                      <span className="meta">scores below {data.noiseFloor} are cut as noise</span>
                    </div>
                    <ol className="card-grid">
                      {rest.map((a) => (
                        <li key={a.id}>
                          <a
                            className="news-card"
                            href={a.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-tier={scoreTier(a.score)}
                            {...tilt}
                          >
                            <div className="card-top">
                              <Byline article={a} />
                              <ScoreDial score={a.score} small metrics={a.metrics} corroboration={a.corroboration} />
                            </div>
                            <h4>{a.title}</h4>
                            {a.summary && <p className="summary">{a.summary}</p>}
                            <MetricStrip metrics={a.metrics} corroboration={a.corroboration} />
                          </a>
                          <IntelLink article={a} edition={edition} />
                        </li>
                      ))}
                    </ol>
                  </>
                )}

                <section className="methodology" id="methodology">
                  <h3>How the Meridian Score is set</h3>
                  <div className="methodology-grid">
                    <div>
                      <h5>Headline Integrity · 40 pts</h5>
                      <p>
                        Attributed actions and concrete figures earn points; curiosity-gap
                        phrasing, listicles, question-mark headlines and all-caps shouting
                        lose them. Clickbait rarely survives.
                      </p>
                    </div>
                    <div>
                      <h5>Source Trust · 30 pts</h5>
                      <p>
                        Each outlet carries a baseline reliability score plus a topical
                        authority bonus — a markets desk testifies on stocks, a world desk
                        on statecraft.
                      </p>
                    </div>
                    <div>
                      <h5>Freshness · 30 pts</h5>
                      <p>
                        Exponential half-life decay from publication: this{' '}
                        <b>{EDITION_LABELS[edition].toLowerCase()} edition uses a {halfLife}-hour half-life</b>{' '}
                        (8h for finance, 18h for geopolitics — finance news goes stale faster). Old
                        news fades; it is never artificially revived.
                      </p>
                    </div>
                    <div>
                      <h5>Corroboration · ±</h5>
                      <p>
                        A story confirmed by a second independent outlet earns a bonus;
                        near-duplicate retellings are docked so one event cannot flood the
                        page. Anything under {data.noiseFloor} points is cut.
                      </p>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>

        <footer className="footer">
          <span>The Meridian Brief — news intelligence, ranked and scored</span>
          <span>Free public RSS wires · No tracking · No paywalls</span>
        </footer>
      </div>
    </div>
  );
}
