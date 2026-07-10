'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import PageChrome from './intel/PageChrome';
import ClassBadge from './intel/ClassBadge';
import { TOPICS } from '@/lib/intelligence/topics.mjs';
import {
  loadProfile,
  toggleInterest,
  briefingPayload,
  recordHistory,
} from '@/lib/client/userState';

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function InterestPicker({ interests, onToggle, compact }) {
  return (
    <div className={`interest-picker${compact ? ' compact' : ''}`}>
      {!compact && (
        <p className="meta">
          Pick what you care about. Interests are stored only in this browser and shape ~70% of
          your briefing — globally significant stories always keep their place.
        </p>
      )}
      <div className="interest-chips">
        {TOPICS.map((t) => (
          <button
            key={t.id}
            className={`chip${interests.includes(t.id) ? ' on' : ''}`}
            onClick={() => onToggle(t.id)}
            aria-pressed={interests.includes(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BriefingItem({ item, rank }) {
  return (
    <li className="brief-item">
      <span className="rail-rank" aria-hidden="true">
        {String(rank).padStart(2, '0')}
      </span>
      <div className="brief-body">
        <Link href={`/story/${item.clusterId}?edition=${item.edition}`} className="brief-title">
          {item.title}
        </Link>
        {item.summary && <p className="summary">{item.summary}</p>}
        {item.whyItMatters && <p className="brief-why">Why it matters: {item.whyItMatters}</p>}
        {item.topChange && (
          <p className="brief-change">
            <b>{item.topChange.type}:</b> {item.topChange.what}
          </p>
        )}
        <span className="meta">
          {item.sources.join(' · ')} · {timeAgo(item.latestAt)}
          {item.followed && ' · following'}
          {item.relevance > 0 && ` · matches your interests`}
        </span>
      </div>
    </li>
  );
}

export default function Briefing() {
  const [interests, setInterests] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(briefingPayload()),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      setBriefing(json);
      // Briefed stories count as consumed for Weekly Recall.
      for (const item of (json.essential || []).slice(0, 3)) {
        recordHistory({
          clusterId: item.clusterId,
          title: item.title,
          edition: item.edition,
          kind: 'briefed',
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setInterests(loadProfile().interests);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) load();
  }, [hydrated, load]);

  const onToggle = useCallback((id) => {
    const p = toggleInterest(id);
    setInterests([...p.interests]);
  }, []);

  const noPersonalization = hydrated && interests.length === 0 && !loadProfile().history.length;

  return (
    <PageChrome kicker="Personalized Daily Intelligence" title="Your Briefing">
      <InterestPicker interests={interests} onToggle={onToggle} compact={!noPersonalization} />
      {!loading && (
        <div className="brief-refresh-row">
          <button className="refresh-btn" onClick={load}>
            Recompose briefing
          </button>
          {briefing?.interestsUsed?.length > 0 && (
            <span className="meta">weighted for: {briefing.interestsUsed.join(', ')}</span>
          )}
          {briefing && !briefing.personalized && (
            <span className="meta">
              No interests yet — this is the global significance briefing.
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="state-box">
          <div className="press" />
          Composing your briefing…
        </div>
      ) : error ? (
        <div className="state-box">The wire is unreachable ({error}). Reload to retry.</div>
      ) : !briefing || briefing.essential.length === 0 ? (
        <div className="state-box">
          No stories cleared the noise floor right now. Check back shortly.
        </div>
      ) : (
        <>
          <div className="section-head">
            <h2>Essential Developments</h2>
            <span className="meta">the finite core — {briefing.essential.length} stories, not a feed</span>
          </div>
          <ol className="brief-list">
            {briefing.essential.map((item, i) => (
              <BriefingItem key={item.clusterId} item={item} rank={i + 1} />
            ))}
          </ol>

          {briefing.developing.length > 0 && (
            <>
              <div className="section-head">
                <h2>Developing Stories</h2>
                <span className="meta">material change since you last looked</span>
              </div>
              <ol className="brief-list">
                {briefing.developing.map((item, i) => (
                  <BriefingItem key={item.clusterId} item={item} rank={i + 1} />
                ))}
              </ol>
            </>
          )}

          {briefing.understand.length > 0 && (
            <>
              <div className="section-head">
                <h2>Understand One Issue</h2>
                <span className="meta">worth ten minutes of context today</span>
              </div>
              <ol className="brief-list understand">
                {briefing.understand.map((item) => (
                  <li className="brief-item" key={item.clusterId}>
                    <div className="brief-body">
                      <Link
                        href={`/story/${item.clusterId}?edition=${item.edition}`}
                        className="brief-title"
                      >
                        {item.title}
                      </Link>
                      {item.summary && <p className="summary">{item.summary}</p>}
                      <span className="meta">
                        {item.sources.length} sources · open the full intelligence page for
                        actors, timeline and scenarios
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}

          {briefing.watch.length > 0 && (
            <>
              <div className="section-head">
                <h2>Watch Next</h2>
                <span className="meta">upcoming decisions and releases</span>
              </div>
              <ul className="watch-list">
                {briefing.watch.map((w, i) => (
                  <li key={i}>
                    <Link href={`/story/${w.clusterId}`}>{w.title}</Link>
                    <p>
                      {w.text} <ClassBadge kind={w.classification} uncertainty={w.uncertainty} />
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </PageChrome>
  );
}
