'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import PageChrome from './intel/PageChrome';
import styles from './Briefing.module.css';
import ClassBadge from './intel/ClassBadge';
import { TOPICS } from '@/lib/intelligence/topics.mjs';
import { speakable, useSpeech } from '@/lib/client/speech';
import {
  loadProfile,
  toggleInterest,
  briefingPayload,
  recordHistory,
  recordShown,
} from '@/lib/client/userState';

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const LAST_KEY = 'meridian.briefing.last.v1';

function saveLastBriefing(briefing) {
  try {
    window.localStorage.setItem(LAST_KEY, JSON.stringify({ at: Date.now(), briefing }));
  } catch {
    /* storage full or blocked: no offline copy */
  }
}

function loadLastBriefing() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(LAST_KEY) || 'null');
    return saved?.briefing?.essential ? saved : null;
  } catch {
    return null;
  }
}

/** The briefing as a spoken script: section by section, finite and in order. */
function briefingScript(briefing) {
  const lines = [`Your Meridian briefing for ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`];
  const section = (title, items) => {
    if (!items?.length) return;
    lines.push(`${title}.`);
    items.forEach((it, i) => {
      lines.push(
        `${i + 1}. ${speakable(it.title)}. ${speakable(it.summary || '')} ${it.whyItMatters ? `Why it matters: ${speakable(it.whyItMatters)}` : ''}`
      );
    });
  };
  section('Essential developments', briefing.essential);
  section('Developing stories', briefing.developing);
  section('Understand one issue', briefing.understand);
  if (briefing.watch?.length) {
    lines.push('Watch next.');
    briefing.watch.forEach((w) => lines.push(`${speakable(w.title)}. ${speakable(w.text || '')}`));
  }
  return lines;
}

const RATES = [
  { value: 0.9, label: 'Slow' },
  { value: 1, label: 'Normal' },
  { value: 1.2, label: 'Fast' },
];

function ListenBar({ briefing }) {
  const speech = useSpeech();
  const [rate, setRate] = useState(1);
  if (!speech.supported) return null;
  const idle = speech.state === 'idle';
  return (
    <div className="listen-bar" role="group" aria-label="Read the briefing aloud">
      {idle ? (
        <button type="button" onClick={() => speech.speak(briefingScript(briefing), { rate })}>
          ▶ Listen to this briefing
        </button>
      ) : (
        <>
          <button type="button" onClick={speech.state === 'paused' ? speech.resume : speech.pause}>
            {speech.state === 'paused' ? '▶ Resume' : '❚❚ Pause'}
          </button>
          <button type="button" onClick={speech.stop}>
            ■ Stop
          </button>
        </>
      )}
      <label>
        <span className="sr-only">Speaking speed</span>
        <select value={rate} onChange={(e) => setRate(Number(e.target.value))} disabled={!idle} aria-label="Speaking speed">
          {RATES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function InterestPicker({ interests, onToggle, compact }) {
  return (
    <div className={`interest-picker${compact ? ' compact' : ''}`}>
      {!compact && (
        <p className="meta">
          Pick what you care about. Your interests shape ~70% of
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

const EXPLORATION_LABEL = 'Outside your usual topics';

/** "Why this?": relevance vs global significance, one node until opened. */
function whyText(item) {
  const parts = [`Relevance to you ${item.relevance}/100, global significance ${item.global}/100.`];
  if (item.matchedTopics?.length) parts.push(`Matches: ${item.matchedTopics.join(', ')}.`);
  if (item.followed) parts.push('You follow this story.');
  if (item.exploration) parts.push('Picked from outside your usual topics so the briefing does not narrow.');
  else if (item.slot === 'global') parts.push('Reserved slot for the biggest story that does not overlap the others.');
  if (item.repeat) parts.push('Shown before; included again because it changed.');
  return parts.join(' ');
}

function WhyThis({ item }) {
  const [open, setOpen] = useState(false);
  const text = whyText(item);
  return (
    <>
      <button
        type="button"
        className={styles.why}
        aria-expanded={open}
        title={text}
        onClick={() => setOpen((o) => !o)}
      >
        why this?
      </button>
      {open && (
        <span className={styles.whyText} role="note">
          {text}
        </span>
      )}
    </>
  );
}

function BriefingItem({ item, rank }) {
  return (
    <li className="brief-item">
      <span className="rail-rank" aria-hidden="true">
        {String(rank).padStart(2, '0')}
      </span>
      <div className="brief-body">
        {item.exploration && <span className={styles.explore}>{EXPLORATION_LABEL}</span>}
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
          {item.repeat && ' · updated'} {typeof item.relevance === 'number' && <WhyThis item={item} />}
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
  const [offlineCopy, setOfflineCopy] = useState(null); // { at } when showing a saved copy

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOfflineCopy(null);
    try {
      const res = await fetch('/api/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(briefingPayload()),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      setBriefing(json);
      saveLastBriefing(json);
      // Remember everything this briefing showed so tomorrow's does not repeat it
      // (the server still re-includes a story that has materially changed).
      recordShown([...(json.essential || []), ...(json.developing || []), ...(json.understand || []), ...(json.watch || [])]);
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
      // Offline or the wire is down: fall back to the last briefing saved here.
      const saved = loadLastBriefing();
      if (saved) {
        setBriefing(saved.briefing);
        setOfflineCopy({ at: saved.at });
      } else {
        setError(err.message);
      }
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

      {offlineCopy && (
        <p className="meta offline-note" role="status">
          Couldn&apos;t reach the wire. Showing the briefing saved {timeAgo(offlineCopy.at)}.
        </p>
      )}
      {briefing && !loading && briefing.essential?.length > 0 && <ListenBar briefing={briefing} />}

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
                        {item.sources.length} {item.sources.length === 1 ? 'source' : 'sources'} · open the full intelligence page for
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
