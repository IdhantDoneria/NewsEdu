'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const EDITION_LABELS = {
  geopolitics: 'Geopolitics',
  finance: 'Finance',
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

function todayLine() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/* 3D tilt that follows the cursor — depth as a navigation cue, not a toy.
   Capped at a few degrees and disabled for reduced-motion users. */
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

function ScoreDial({ score, small = false, label }) {
  return (
    <span
      className={`dial${small ? ' small' : ''}`}
      style={{ '--pct': `${score}%` }}
      title={`Meridian Score: ${score}/100`}
    >
      <b>{score}</b>
      {label && <small>{label}</small>}
    </span>
  );
}

function MetricStrip({ metrics }) {
  const items = [
    { key: 'headlineIntegrity', label: 'Headline', max: 40 },
    { key: 'sourceTrust', label: 'Trust', max: 30 },
    { key: 'freshness', label: 'Fresh', max: 30 },
  ];
  return (
    <div className="metric-strip" aria-hidden="true">
      {items.map(({ key, label, max }) => (
        <span className="metric" key={key} title={`${label}: ${metrics[key]}/${max} pts`}>
          <label>{label}</label>
          <span className="bar">
            <i style={{ width: `${Math.min(100, (metrics[key] / max) * 100)}%` }} />
          </span>
        </span>
      ))}
    </div>
  );
}

function Byline({ article }) {
  return (
    <div className="byline">
      <span className="src">{article.sourceName}</span>
      <span>·</span>
      <span>{timeAgo(article.publishedAt)}</span>
    </div>
  );
}

export default function Dashboard() {
  const [edition, setEdition] = useState('geopolitics');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flipping, setFlipping] = useState(false);
  const [error, setError] = useState(null);
  const tilt = useTilt(4);
  const leadTilt = useTilt(2.5);

  const load = useCallback(async (ed) => {
    setError(null);
    try {
      const res = await fetch(`/api/news?edition=${ed}`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(edition);
    const id = setInterval(() => load(edition), REFRESH_MS);
    return () => clearInterval(id);
  }, [edition, load]);

  const switchEdition = (ed) => {
    if (ed === edition || flipping) return;
    // 3D page-turn: fold the stage away, swap content, fold back in
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

  return (
    <div data-edition={edition}>
      <div className="shell">
        <div className="topbar">
          <span>{todayLine()}</span>
          <span style={{ display: 'none' }} />
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
              : 'Statecraft · Conflict · Diplomacy'}{' '}
            — ranked by the Meridian Score
          </p>
        </header>

        {tickerItems.length > 0 && (
          <div className="ticker">
            <span className="ticker-label">Latest Wire</span>
            <div className="ticker-track">
              {[...tickerItems, ...tickerItems].map((a, i) => (
                <span className="ticker-item" key={`${a.id}-${i}`}>
                  <span className="diamond">◆</span>
                  <b>{a.sourceName}</b>
                  {a.title}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="section-head">
          <h2>{EDITION_LABELS[edition]} Edition</h2>
          <span className="meta">
            {loading
              ? 'Consulting the wire…'
              : `${articles.length} briefs · ${liveFeeds} live sources · refreshed ${
                  data ? timeAgo(data.generatedAt) : '—'
                }`}
          </span>
        </div>

        <div className="stage">
          <div className={`stage-inner${flipping ? ' flipping' : ''}`}>
            {loading ? (
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
                    {lead && (
                      <a
                        className="lead-card"
                        href={lead.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        {...leadTilt}
                      >
                        <div className="lead-kicker">Lead Brief</div>
                        <h3>{lead.title}</h3>
                        {lead.summary && <p className="summary">{lead.summary}</p>}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 16,
                          }}
                        >
                          <div>
                            <Byline article={lead} />
                            <div style={{ maxWidth: 280, marginTop: 12 }}>
                              <MetricStrip metrics={lead.metrics} />
                            </div>
                          </div>
                          <ScoreDial score={lead.score} label="Meridian Score" />
                        </div>
                      </a>
                    )}
                  </div>

                  <div className="rail-column">
                    {rail.map((a, i) => (
                      <a
                        className="rail-item"
                        key={a.id}
                        href={a.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        {...tilt}
                      >
                        <span className="rail-rank">{String(i + 2).padStart(2, '0')}</span>
                        <span>
                          <h4>{a.title}</h4>
                          <Byline article={a} />
                        </span>
                        <ScoreDial score={a.score} small />
                      </a>
                    ))}
                  </div>
                </div>

                {rest.length > 0 && (
                  <>
                    <div className="section-head">
                      <h2>The Full Ledger</h2>
                      <span className="meta">scores below {data.noiseFloor} are cut as noise</span>
                    </div>
                    <div className="card-grid">
                      {rest.map((a) => (
                        <a
                          className="news-card"
                          key={a.id}
                          href={a.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          {...tilt}
                        >
                          <div className="card-top">
                            <Byline article={a} />
                            <ScoreDial score={a.score} small />
                          </div>
                          <h4>{a.title}</h4>
                          {a.summary && <p className="summary">{a.summary}</p>}
                          <MetricStrip metrics={a.metrics} />
                        </a>
                      ))}
                    </div>
                  </>
                )}

                <section className="methodology">
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
                        Exponential half-life decay from publication: 8 hours for finance,
                        18 for geopolitics. Old news fades; it is never artificially
                        revived.
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
          <span>The Meridian Brief — an open-source news intelligence experiment</span>
          <span>Sources: free public RSS wires · No tracking</span>
        </footer>
      </div>
    </div>
  );
}
