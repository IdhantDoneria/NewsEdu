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

// Tier thresholds are computed relative to the *current* batch's own score
// distribution (top / middle / bottom third), not fixed absolute cutoffs.
// The 10-layer pipelines routinely produce a batch where every visible score
// sits in a narrow band (e.g. 90-97) — fixed thresholds would paint every
// card the same color and erase the ranking signal. Percentile-relative
// bands guarantee visible differentiation regardless of where a given day's
// raw scores land.
function computeTierThresholds(articles) {
  if (!articles || articles.length === 0) return { high: 101, mid: 101 };
  const scores = articles.map((a) => a.score).sort((a, b) => b - a);
  const high = scores[Math.floor(scores.length / 3)] ?? scores[scores.length - 1];
  const mid = scores[Math.floor((scores.length * 2) / 3)] ?? scores[scores.length - 1];
  return { high, mid };
}

function scoreTier(score, thresholds) {
  if (score >= thresholds.high) return 'high';
  if (score >= thresholds.mid) return 'mid';
  return 'low';
}

// A source's failure reason, normalised to a short phrase safe to show
// directly in the UI (no raw URLs, no stack traces).
function feedFailureReason(f) {
  if (f.ok) return '';
  return f.reason || 'unreachable';
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

// Builds an accessible description straight from the same signed layers the
// UI renders — the dial's aria-label and the visible receipt can never say
// two different things about how a score was produced.
function describeScore(score, breakdown) {
  let desc = `Score: ${score} out of 100.`;
  const active = (breakdown || []).filter((l) => Math.abs(l.delta) >= 0.5);
  if (active.length) {
    desc += ' ' + active.map((l) => `${l.label} ${l.delta > 0 ? '+' : ''}${l.delta}`).join(', ') + '.';
  }
  return desc;
}

function ScoreDial({ score, small = false, label, breakdown }) {
  const desc = describeScore(score, breakdown);
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

const EDITION_LAYER_SUMMARY = {
  geopolitics: [
    'Source credibility — outlet baseline from a curated trust database',
    'Verified facts & entities — named countries, orgs, leaders, statistics',
    'Age decay — −0.5 pts per hour since publication',
    'Subjective language — penalised (shocking, devastating…)',
    'Information density, outlet authority & event relevance — bonuses',
    'Cross-border impact — minor bonus for trade/commodity relevance',
    'Clickbait & headline/body mismatch — penalised',
  ],
  finance: [
    'Source authority — regulators & exchanges outrank general media',
    'Tickers & instruments — $AAPL, (NASDAQ:MSFT), commodities, FX pairs',
    'Quantitative data density — hard figures per word',
    'Volatility language — penalised (plunge, meltdown, panic…)',
    'Regulatory filings (10-K, SEC…) — flat bonus',
    'Macro relevance, institutional flow & valuation depth — bonuses',
    'Speculation & pump-and-dump language — penalised',
  ],
};

function ScoreLegend({ edition }) {
  const layers = EDITION_LAYER_SUMMARY[edition] || EDITION_LAYER_SUMMARY.geopolitics;
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
        <p>
          Every brief runs through a dedicated 10-layer model for this edition,
          starting from a source baseline and adjusted layer by layer down to
          a final 0–100 integer:
        </p>
        <ul>
          {layers.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="legend-note">
          Tap any score to see the exact layers that produced it — the number
          shown under each headline is a receipt, not a black box.
        </p>
        <a href="#methodology">Read the full methodology ↓</a>
      </div>
    </details>
  );
}

// The signed "receipt" of layer contributions that summed (pre-clamp) to
// the displayed score. Replaces the old 4-metric bar strip, which described
// a different, retired algorithm and could show numbers that didn't add up
// to the headline score.
function ScoreBreakdown({ breakdown, compact = false }) {
  if (!breakdown || breakdown.length === 0) return null;
  const active = breakdown.filter((l) => Math.abs(l.delta) >= 0.5);
  const shown = compact ? active.slice(0, 4) : active;
  if (shown.length === 0) return null;
  return (
    <ul className="score-receipt">
      {shown.map((l) => (
        <li
          key={l.key}
          className={l.delta > 0 ? 'is-bonus' : l.delta < 0 ? 'is-penalty' : 'is-neutral'}
        >
          <span className="receipt-label">{l.label}</span>
          <span className="receipt-delta">
            {l.delta > 0 ? '+' : ''}
            {l.delta}
          </span>
        </li>
      ))}
    </ul>
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
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const imgRef = useRef(null);

  // Reset per-article so switching editions / refreshing doesn't carry over
  // a stale loaded/failed state onto a different image.
  useEffect(() => {
    setImgLoaded(false);
    setImgFailed(false);
    if (!article.image) return undefined;
    // Watchdog: some news CDNs hotlink-block by hanging the request rather
    // than returning a clean 4xx, so the <img> onError handler never fires
    // and the reserved image area sits blank indefinitely. If the image
    // hasn't resolved in 5s, treat it as failed so the quote-mark fallback
    // (always rendered underneath) stays visible instead of dead space.
    const t = setTimeout(() => {
      const el = imgRef.current;
      if (!el || !el.complete || el.naturalWidth === 0) setImgFailed(true);
    }, 5000);
    return () => clearTimeout(t);
  }, [article.id, article.image]);

  const showImage = Boolean(article.image) && !imgFailed;

  return (
    <a
      className="lead-card"
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      {...tiltProps}
    >
      <div className={`lead-media${imgLoaded ? ' is-loaded' : ''}`}>
        <span className="lead-quote" aria-hidden="true">
          “
        </span>
        {showImage && (
          <img
            ref={imgRef}
            src={article.image}
            alt=""
            loading="eager"
            fetchPriority="high"
            referrerPolicy="no-referrer"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgFailed(true)}
          />
        )}
      </div>
      <div className="lead-body">
        <div className="lead-kicker">Lead Brief</div>
        <h3>{article.title}</h3>
        {article.summary && <p className="summary">{article.summary}</p>}
        <div className="lead-foot">
          <div className="lead-foot-left">
            <Byline article={article} />
            <ScoreBreakdown breakdown={article.scoreBreakdown} />
          </div>
          <ScoreDial score={article.score} label="Score" breakdown={article.scoreBreakdown} />
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
            <span className="src-count">{f.ok ? `${f.items} items` : feedFailureReason(f)}</span>
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
  // The ticker is a "wire" of stories NOT already shown prominently in the
  // lead + rail two inches below it — repeating the same 6 headlines twice
  // on one screen is noise, not a second read of the news.
  const featuredIds = new Set([lead, ...rail].filter(Boolean).map((a) => a.id));
  const tickerItems = articles.filter((a) => !featuredIds.has(a.id)).slice(0, 10);
  const liveFeeds = data?.feeds?.filter((f) => f.ok).length ?? 0;
  const tierThresholds = computeTierThresholds(articles);

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
              <ScoreLegend edition={edition} />
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
                          data-tier={scoreTier(a.score, tierThresholds)}
                          {...tilt}
                        >
                          <span className="rail-rank" aria-hidden="true">
                            {String(i + 2).padStart(2, '0')}
                          </span>
                          <span>
                            <h4>{a.title}</h4>
                            <Byline article={a} />
                          </span>
                          <ScoreDial score={a.score} small breakdown={a.scoreBreakdown} />
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
                            data-tier={scoreTier(a.score, tierThresholds)}
                            {...tilt}
                          >
                            <div className="card-top">
                              <Byline article={a} />
                              <ScoreDial score={a.score} small breakdown={a.scoreBreakdown} />
                            </div>
                            <h4>{a.title}</h4>
                            {a.summary && <p className="summary">{a.summary}</p>}
                            <ScoreBreakdown breakdown={a.scoreBreakdown} compact />
                          </a>
                          <IntelLink article={a} edition={edition} />
                        </li>
                      ))}
                    </ol>
                  </>
                )}

                <section className="methodology" id="methodology">
                  <h3>How the {EDITION_LABELS[edition]} score is set</h3>
                  <p className="methodology-intro">
                    Every brief runs through a dedicated 10-layer pipeline for this
                    edition. Each layer inspects one property of the article — the
                    outlet, the language, the facts it contains — and adds or
                    subtracts points from a running total, which is finally clamped
                    to a 0–100 integer. Tap any score on the page to see the exact
                    layers that produced it.
                  </p>
                  <div className="methodology-grid">
                    {edition === 'finance' ? (
                      <>
                        <div>
                          <h5>Source authority</h5>
                          <p>Regulators and exchange filings outrank wire services, which outrank general finance media.</p>
                        </div>
                        <div>
                          <h5>Tickers &amp; data density</h5>
                          <p>Named instruments ($AAPL, NASDAQ:MSFT, commodities, FX pairs) and hard figures per word both earn points.</p>
                        </div>
                        <div>
                          <h5>Regulatory &amp; macro signal</h5>
                          <p>SEC/10-K filings, institutional flow, and Fed/CPI/GDP relevance earn flat or scaled bonuses.</p>
                        </div>
                        <div>
                          <h5>Volatility &amp; speculation</h5>
                          <p>Panic language ("meltdown," "plunge") and pump-and-dump phrasing are penalised directly.</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <h5>Source credibility</h5>
                          <p>A curated trust database baselines each outlet; unlisted sources fall back to their editorial trust rating.</p>
                        </div>
                        <div>
                          <h5>Facts &amp; density</h5>
                          <p>Named countries, organisations, leaders and statistics earn points scaled by how much of the article they make up.</p>
                        </div>
                        <div>
                          <h5>Age decay</h5>
                          <p>−0.5 points per hour since publication — old news fades; it is never artificially revived.</p>
                        </div>
                        <div>
                          <h5>Subjectivity &amp; clickbait</h5>
                          <p>Emotive language and headline/body mismatches are penalised directly from the running total.</p>
                        </div>
                      </>
                    )}
                  </div>
                  <p className="methodology-footnote">
                    Anything under {data.noiseFloor} points is cut before publication — that is the noise floor.
                  </p>
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
