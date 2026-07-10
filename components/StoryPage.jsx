'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import PageChrome from './intel/PageChrome';
import ClassBadge from './intel/ClassBadge';
import {
  isFollowing,
  followStory,
  unfollowStory,
  markVisit,
  recordHistory,
} from '@/lib/client/userState';

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function dateLine(ts) {
  return new Date(ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Superscript provenance links back to the source articles. */
function Cites({ citations, articlesById }) {
  const refs = (citations || [])
    .map((c) => (typeof c === 'string' ? articlesById.get(c) : c))
    .filter(Boolean);
  if (refs.length === 0) return null;
  return (
    <sup className="cites">
      {refs.map((r, i) => (
        <a
          key={`${r.articleId || r.id}-${i}`}
          href={r.link}
          target="_blank"
          rel="noopener noreferrer"
          title={`${r.source || r.sourceName}: ${r.title}`}
        >
          [{i + 1}]
        </a>
      ))}
    </sup>
  );
}

function Statement({ s, articlesById }) {
  return (
    <p className="intel-statement">
      {s.text}
      <Cites citations={s.citations} articlesById={articlesById} />{' '}
      <ClassBadge kind={s.classification} />
    </p>
  );
}

function Section({ title, children, note }) {
  return (
    <section className="intel-section">
      <div className="section-head">
        <h2>{title}</h2>
        {note && <span className="meta">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------ Ask this story ------------------------------ */

function AskStory({ clusterId, edition, articlesById, onAsked }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [exchanges, setExchanges] = useState([]);
  const boxRef = useRef(null);

  const ask = useCallback(
    async (e) => {
      e?.preventDefault();
      const q = question.trim();
      if (!q || busy) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/intel/${clusterId}/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q, edition }),
        });
        const json = await res.json();
        setExchanges((x) => [...x, { q, a: json }]);
        setQuestion('');
        onAsked?.(q);
      } catch {
        setExchanges((x) => [
          ...x,
          { q, a: { answered: false, statements: [], notice: 'The answerer is unreachable — try again shortly.' } },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [question, busy, clusterId, edition, onAsked]
  );

  useEffect(() => {
    boxRef.current?.scrollTo?.(0, boxRef.current.scrollHeight);
  }, [exchanges]);

  return (
    <div className="ask-box">
      {exchanges.length > 0 && (
        <div className="ask-thread" ref={boxRef}>
          {exchanges.map((x, i) => (
            <div key={i} className="ask-exchange">
              <p className="ask-q">{x.q}</p>
              {x.a.statements?.length > 0 ? (
                x.a.statements.map((s, j) => (
                  <p className="ask-a" key={j}>
                    {s.text}
                    {s.citations?.length > 0 && (
                      <sup className="cites">
                        {s.citations.map((c, k) => (
                          <a key={k} href={c.link} target="_blank" rel="noopener noreferrer" title={`${c.source}: ${c.title}`}>
                            [{k + 1}]
                          </a>
                        ))}
                      </sup>
                    )}{' '}
                    <ClassBadge kind={s.classification} />
                  </p>
                ))
              ) : (
                <p className="ask-a ask-empty">
                  {x.a.notice || 'The available source set does not support a reliable answer.'}
                </p>
              )}
              {x.a.notice && x.a.statements?.length > 0 && <p className="ask-notice">{x.a.notice}</p>}
            </div>
          ))}
        </div>
      )}
      <form onSubmit={ask} className="ask-form">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this story — why it happened, what each side wants, what to watch…"
          maxLength={400}
          aria-label="Ask a question about this story"
        />
        <button type="submit" disabled={busy || question.trim().length < 3}>
          {busy ? 'Consulting…' : 'Ask'}
        </button>
      </form>
      <p className="ask-scope-note">
        Answers use only this story’s {articlesById.size} source article
        {articlesById.size === 1 ? '' : 's'} and its intelligence brief.
      </p>
    </div>
  );
}

/* ----------------------------- Source comparison ---------------------------- */

function SourceComparison({ comparison, framing }) {
  if (!comparison) return null;
  if (comparison.singleSource) {
    return (
      <p className="single-source-note">
        Only one outlet in the live window is covering this story — comparison needs a second
        independent source. Treat single-source reporting with proportionate caution.
      </p>
    );
  }
  return (
    <div className="compare-wrap">
      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Headline</th>
              <th>Published</th>
              <th>Score</th>
              <th>Primary focus</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((r) => (
              <tr key={r.articleId}>
                <td className="cmp-src">{r.source}</td>
                <td>
                  <a href={r.link} target="_blank" rel="noopener noreferrer">
                    {r.headline}
                  </a>
                </td>
                <td className="cmp-time">{timeAgo(r.publishedAt)}</td>
                <td className="cmp-score">{r.meridianScore ?? '—'}</td>
                <td className="cmp-focus">{r.primaryFocus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {framing?.agreement && (
        <p className="intel-statement">
          <b>Where sources agree:</b> {framing.agreement} <ClassBadge kind="ANALYSIS" />
        </p>
      )}
      {framing?.differences?.map((d, i) => (
        <p className="intel-statement" key={i}>
          <b>Framing difference:</b> {d} <ClassBadge kind="ANALYSIS" />
        </p>
      ))}

      {comparison.emphasis.length > 0 && (
        <ul className="emphasis-list">
          {comparison.emphasis.map((e, i) => (
            <li key={i}>
              <b>{e.dimension}</b> is emphasized by {e.emphasizedBy.join(', ')} but absent from{' '}
              {e.absentFrom.join(', ')}.
            </li>
          ))}
        </ul>
      )}

      {comparison.singleSourceNumbers.length > 0 && (
        <div className="dispute-box">
          <h4>Figures reported by only one outlet</h4>
          <ul>
            {comparison.singleSourceNumbers.map((n, i) => (
              <li key={i}>
                “{n.label}” — {n.source} only <ClassBadge kind="PARTY CLAIM" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- main page -------------------------------- */

export default function StoryPage({ id, editionHint }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [related, setRelated] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/intel/${id}${editionHint ? `?edition=${editionHint}` : ''}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json?.message || 'This story could not be loaded.');
        } else {
          setData(json);
          setFollowing(isFollowing(id));
          // Reading this page is the visit baseline for "What Changed" and
          // feeds Weekly Recall history — all stored locally.
          markVisit(id, json.cluster.articleIds);
          recordHistory({
            clusterId: id,
            title: json.cluster.title,
            edition: json.cluster.edition,
            kind: 'read',
          });
        }
      } catch {
        if (!cancelled) setError('The wire is unreachable. It will retry when you reload.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, editionHint]);

  // Related developments: other clusters sharing entities, bounded to 4.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/intel?edition=${data.cluster.edition}`);
        const json = await res.json();
        if (cancelled || !json?.clusters) return;
        const mine = new Set(data.cluster.entities);
        const rel = json.clusters
          .filter((c) => c.id !== id)
          .map((c) => ({ c, overlap: c.entities.filter((e) => mine.has(e)).length }))
          .filter((x) => x.overlap >= 2)
          .sort((a, b) => b.overlap - a.overlap)
          .slice(0, 4)
          .map((x) => x.c);
        setRelated(rel);
      } catch {
        /* related is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, id]);

  const articlesById = useMemo(
    () => new Map((data?.articles || []).map((a) => [a.id, { ...a, articleId: a.id, source: a.sourceName }])),
    [data]
  );

  const toggleFollow = useCallback(() => {
    if (!data) return;
    if (following) {
      unfollowStory(id);
      setFollowing(false);
    } else {
      followStory({
        clusterId: id,
        title: data.cluster.title,
        edition: data.cluster.edition,
        articleIds: data.cluster.articleIds,
      });
      setFollowing(true);
    }
  }, [data, following, id]);

  const onAsked = useCallback(() => {
    if (!data) return;
    recordHistory({
      clusterId: id,
      title: data.cluster.title,
      edition: data.cluster.edition,
      kind: 'asked',
    });
  }, [data, id]);

  if (loading) {
    return (
      <PageChrome kicker="Story Intelligence" edition={editionHint || 'geopolitics'}>
        <div className="state-box">
          <div className="press" />
          Assembling the intelligence brief…
        </div>
      </PageChrome>
    );
  }

  if (error || !data) {
    return (
      <PageChrome kicker="Story Intelligence" title="Story unavailable" edition={editionHint || 'geopolitics'}>
        <div className="state-box">
          {error}
          <p style={{ marginTop: 12 }}>
            <Link href="/">← Back to the front page</Link>
          </p>
        </div>
      </PageChrome>
    );
  }

  const { cluster, intel, comparison, framing } = data;
  const thin = data.articles.length < 2;

  return (
    <PageChrome
      kicker={`Story Intelligence · ${cluster.edition === 'finance' ? 'Finance' : 'Geopolitics'} · updated ${timeAgo(cluster.latestAt)}`}
      title={cluster.title}
      edition={cluster.edition}
      actions={
        <div className="story-actions">
          <button className={`follow-btn${following ? ' on' : ''}`} onClick={toggleFollow}>
            {following ? '✓ Following — you’ll see what changes' : '+ Follow this story'}
          </button>
          <span className="meta">
            {data.articles.length} article{data.articles.length === 1 ? '' : 's'} ·{' '}
            {cluster.sources.length} source{cluster.sources.length === 1 ? '' : 's'}
            {intel.mode === 'fallback' && ' · extractive brief (AI analysis not configured)'}
          </span>
        </div>
      }
    >
      <div className="story-grid">
        <div className="story-main">
          <Section title="What Happened">
            <Statement s={intel.whatHappened} articlesById={articlesById} />
          </Section>

          {intel.whyItMatters?.length > 0 && (
            <Section title="Why It Matters">
              {intel.whyItMatters.map((s, i) => (
                <Statement key={i} s={s} articlesById={articlesById} />
              ))}
            </Section>
          )}

          {intel.background?.length > 0 && (
            <Section title="Essential Background" note="only what you need to read this event">
              {intel.background.map((s, i) => (
                <Statement key={i} s={s} articlesById={articlesById} />
              ))}
            </Section>
          )}

          {intel.stakeholders?.length > 0 && (
            <Section title="Stakeholder Positions" note="public position vs. inferred interest">
              <div className="stakeholder-grid">
                {intel.stakeholders.map((s, i) => (
                  <div className="stakeholder-card" key={i}>
                    <h4>{s.actor}</h4>
                    {s.publiclyClaims && (
                      <p>
                        <b>Publicly claims:</b> {s.publiclyClaims} <ClassBadge kind="PARTY CLAIM" />
                      </p>
                    )}
                    {s.wants && (
                      <p>
                        <b>Wants:</b> {s.wants} <ClassBadge kind="ANALYSIS" />
                      </p>
                    )}
                    {s.opposes && (
                      <p>
                        <b>Opposes:</b> {s.opposes} <ClassBadge kind="ANALYSIS" />
                      </p>
                    )}
                    {s.mayCompromiseOn && (
                      <p>
                        <b>May compromise on:</b> {s.mayCompromiseOn} <ClassBadge kind="ANALYSIS" />
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {intel.disagreements?.length > 0 && (
            <Section title="Points of Disagreement">
              {intel.disagreements.map((s, i) => (
                <Statement key={i} s={s} articlesById={articlesById} />
              ))}
            </Section>
          )}

          {intel.scenarios?.length > 0 && (
            <Section title="What Could Happen Next" note="possibilities, not predictions">
              <div className="scenario-list">
                {intel.scenarios.map((s, i) => (
                  <div className="scenario-card" key={i}>
                    <p className="scenario-desc">
                      {s.description} <ClassBadge kind="SCENARIO" uncertainty={s.uncertainty} />
                    </p>
                    {s.signals?.length > 0 && (
                      <p className="scenario-signals">
                        <b>Signals:</b> {s.signals.join(' · ')}
                      </p>
                    )}
                    {s.counterSignals?.length > 0 && (
                      <p className="scenario-signals">
                        <b>Counter-signals:</b> {s.counterSignals.join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section
            title="How Sources Cover It"
            note={comparison.singleSource ? undefined : `${comparison.sourceCount} independent outlets`}
          >
            <SourceComparison comparison={comparison} framing={framing} />
          </Section>

          <Section title="Ask About This Story">
            <AskStory
              clusterId={id}
              edition={cluster.edition}
              articlesById={articlesById}
              onAsked={onAsked}
            />
          </Section>
        </div>

        <aside className="story-rail">
          {intel.keyActors?.length > 0 && (
            <div className="rail-block">
              <h3>Key Actors</h3>
              <ul className="actor-list">
                {intel.keyActors.map((a, i) => (
                  <li key={i}>
                    <b>{a.name}</b>
                    {a.role && <span> — {a.role}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {intel.keyNumbers?.length > 0 && (
            <div className="rail-block">
              <h3>Key Numbers</h3>
              <ul className="numbers-list">
                {intel.keyNumbers.map((n, i) => (
                  <li key={i}>
                    <b>{n.value}</b> <span>{n.label}</span>
                    <Cites citations={n.citations} articlesById={articlesById} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {intel.timeline?.length > 0 && (
            <div className="rail-block">
              <h3>Timeline</h3>
              <ol className="timeline">
                {intel.timeline.map((t, i) => (
                  <li key={i}>
                    <time>{t.at ? dateLine(t.at) : '—'}</time>
                    <p>
                      {t.text}
                      <Cites citations={t.citations} articlesById={articlesById} />
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="rail-block">
            <h3>Source Articles</h3>
            <ul className="provenance-list">
              {data.articles.map((a) => (
                <li key={a.id}>
                  <a href={a.link} target="_blank" rel="noopener noreferrer">
                    {a.title}
                  </a>
                  <span className="meta">
                    {a.sourceName} · {timeAgo(a.publishedAt)} · score {a.meridianScore}
                  </span>
                </li>
              ))}
            </ul>
            {thin && (
              <p className="meta thin-note">
                Single-article story — analysis is limited until more coverage arrives.
              </p>
            )}
          </div>

          {related.length > 0 && (
            <div className="rail-block">
              <h3>Related Developments</h3>
              <ul className="related-list">
                {related.map((c) => (
                  <li key={c.id}>
                    <Link href={`/story/${c.id}?edition=${c.edition}`}>{c.title}</Link>
                    <span className="meta">
                      {c.size} article{c.size === 1 ? '' : 's'} · {timeAgo(c.latestAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </PageChrome>
  );
}
