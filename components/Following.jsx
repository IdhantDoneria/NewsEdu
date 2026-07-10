'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import PageChrome from './intel/PageChrome';
import ClassBadge from './intel/ClassBadge';
import {
  getFollows,
  unfollowStory,
  markVisit,
  changesPayload,
} from '@/lib/client/userState';

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ChangeCard({ change }) {
  return (
    <div className="change-card">
      <div className="change-head">
        <span className="change-type">{change.type}</span>
        <span className="meta">
          {change.source} · {timeAgo(change.at)}
        </span>
      </div>
      <p className="change-what">
        <a href={change.link} target="_blank" rel="noopener noreferrer">
          {change.what}
        </a>{' '}
        <ClassBadge kind={change.classification} />
      </p>
      {change.detail && <p className="summary">{change.detail}</p>}
      <p className="change-why">
        <b>Why it matters:</b> {change.why}
      </p>
      <p className="meta">{change.replaces}</p>
    </div>
  );
}

export default function Following() {
  const [follows, setFollows] = useState([]);
  const [deltas, setDeltas] = useState(null); // clusterId -> result
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(async () => {
    const f = getFollows();
    setFollows(f);
    if (f.length === 0) {
      setDeltas(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changesPayload()),
      });
      const json = await res.json();
      setDeltas(new Map((json.results || []).map((r) => [r.clusterId, r])));
    } catch {
      setDeltas(new Map());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) refresh();
  }, [hydrated, refresh]);

  const onUnfollow = useCallback(
    (id) => {
      unfollowStory(id);
      refresh();
    },
    [refresh]
  );

  const caughtUp = useCallback(
    (id) => {
      const delta = deltas?.get(id);
      const follow = getFollows().find((f) => f.clusterId === id);
      const known = new Set(follow?.snapshot?.articleIds || []);
      for (const c of delta?.changes || []) for (const cid of c.citations || []) known.add(cid);
      markVisit(id, [...known]);
      refresh();
    },
    [deltas, refresh]
  );

  return (
    <PageChrome kicker="Followed Stories" title="What Changed">
      {!hydrated || loading ? (
        <div className="state-box">
          <div className="press" />
          Checking your stories for material developments…
        </div>
      ) : follows.length === 0 ? (
        <div className="state-box">
          You aren’t following any stories yet. Open a story’s intelligence page from the{' '}
          <Link href="/">front page</Link> and press “Follow this story” — material developments
          will collect here. Follows are stored only in this browser.
        </div>
      ) : (
        <div className="follow-list">
          {follows.map((f) => {
            const delta = deltas?.get(f.clusterId);
            return (
              <section className="follow-block" key={f.clusterId}>
                <div className="section-head">
                  <h2>
                    <Link href={`/story/${f.clusterId}?edition=${f.edition}`}>{f.title}</Link>
                  </h2>
                  <div className="follow-actions">
                    <span className="meta">followed {timeAgo(f.followedAt)}</span>
                    <button className="chip" onClick={() => onUnfollow(f.clusterId)}>
                      Unfollow
                    </button>
                  </div>
                </div>

                {!delta || delta.expired ? (
                  <p className="meta expired-note">
                    This story has left the live 72-hour window. Your notes and history keep it;
                    fresh developments will start a new story cluster.
                  </p>
                ) : delta.changes.length === 0 ? (
                  <p className="meta no-change-note">
                    No material change since your last visit
                    {delta.newArticleCount > 0
                      ? ` — ${delta.newArticleCount} new article${delta.newArticleCount === 1 ? ' was' : 's were'} published, but ${delta.newArticleCount === 1 ? 'it adds' : 'they add'} nothing substantive (duplicates and rewrites are suppressed).`
                      : '.'}
                  </p>
                ) : (
                  <>
                    <div className="change-grid">
                      {delta.changes.map((c, i) => (
                        <ChangeCard change={c} key={i} />
                      ))}
                    </div>
                    <div className="caught-up-row">
                      <button className="refresh-btn" onClick={() => caughtUp(f.clusterId)}>
                        Mark caught up
                      </button>
                      {delta.suppressedCount > 0 && (
                        <span className="meta">
                          {delta.suppressedCount} low-information update
                          {delta.suppressedCount === 1 ? '' : 's'} suppressed
                        </span>
                      )}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </PageChrome>
  );
}
