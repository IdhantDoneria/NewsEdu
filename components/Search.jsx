'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import PageChrome from './intel/PageChrome';
import { WatchTags } from './PersonalTools';
import { TOPICS } from '@/lib/intelligence/topics.mjs';
import { AGE_OPTIONS, describeSearch, searchArticles } from '@/lib/personal/search.mjs';
import { loadSearches, loadWatchlist, saveSearches } from '@/lib/client/personalStore';

const EMPTY = { query: '', edition: 'all', source: '', topic: '', maxAgeHours: 0, sort: '' };

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

export default function Search() {
  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [saved, setSaved] = useState([]);
  const [terms, setTerms] = useState([]);

  useEffect(() => {
    setSaved(loadSearches());
    setTerms(loadWatchlist().terms);
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setF((prev) => ({ ...prev, query: q.slice(0, 200) }));

    let cancelled = false;
    (async () => {
      try {
        const editions = ['geopolitics', 'finance'];
        const results = await Promise.all(
          editions.map(async (ed) => {
            const res = await fetch(`/api/news?edition=${ed}`);
            if (!res.ok) throw new Error(`API ${res.status}`);
            const json = await res.json();
            return (json.articles || []).map((a) => ({ ...a, edition: ed }));
          })
        );
        if (!cancelled) setPool(results.flat());
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sources = useMemo(() => [...new Set(pool.map((a) => a.sourceName))].sort(), [pool]);
  const results = useMemo(() => searchArticles(pool, f), [pool, f]);
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));
  const active = JSON.stringify({ ...f, sort: '' }) !== JSON.stringify(EMPTY);

  const savedView = useMemo(
    () =>
      saved.map((s) => {
        const hits = searchArticles(pool, s.filters);
        const seen = new Set(s.seenIds || []);
        return { ...s, total: hits.length, fresh: hits.filter((a) => !seen.has(a.id)).length, hits };
      }),
    [saved, pool]
  );

  const persist = (next) => {
    setSaved(next);
    saveSearches(next);
  };
  const saveCurrent = () => {
    const filters = { ...f };
    persist([
      {
        id: `s${Date.now().toString(36)}`,
        label: describeSearch(filters),
        filters,
        seenIds: results.map((a) => a.id),
        createdAt: Date.now(),
      },
      ...saved,
    ]);
  };
  const open = (s) => {
    setF({ ...EMPTY, ...s.filters });
    // Opening a saved search marks its current matches as seen.
    persist(saved.map((x) => (x.id === s.id ? { ...x, seenIds: s.hits.map((a) => a.id) } : x)));
  };
  const remove = (id) => persist(saved.filter((s) => s.id !== id));

  return (
    <PageChrome kicker="Search" title="Find any story" edition="geopolitics">
      <form className="search-form" onSubmit={(e) => e.preventDefault()} role="search">
        <input
          type="search"
          value={f.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder={'Search headlines and summaries: tariff steel, "red sea", oil -sports'}
          aria-label="Search stories"
          maxLength={200}
        />
        <div className="search-filters">
          <select value={f.edition} onChange={(e) => set({ edition: e.target.value })} aria-label="Edition">
            <option value="all">Both editions</option>
            <option value="geopolitics">Geopolitics</option>
            <option value="finance">Finance</option>
          </select>
          <select value={f.topic} onChange={(e) => set({ topic: e.target.value })} aria-label="Topic">
            <option value="">Any topic</option>
            {TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <select value={f.source} onChange={(e) => set({ source: e.target.value })} aria-label="Source">
            <option value="">Any source</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={f.maxAgeHours} onChange={(e) => set({ maxAgeHours: Number(e.target.value) })} aria-label="Age">
            {AGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select value={f.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort">
            <option value="">Best match</option>
            <option value="score">Highest score</option>
            <option value="newest">Newest</option>
          </select>
        </div>
        <div className="search-actions">
          <button type="button" onClick={saveCurrent} disabled={!active}>
            Save this search
          </button>
          {active && (
            <button type="button" onClick={() => setF(EMPTY)}>
              Clear
            </button>
          )}
        </div>
      </form>

      {savedView.length > 0 && (
        <section className="saved-searches" aria-label="Saved searches">
          <h3>Saved searches</h3>
          <ul>
            {savedView.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => open(s)} className="saved-open">
                  {s.label}
                  <span className={`saved-count${s.fresh > 0 ? ' fresh' : ''}`}>
                    {s.fresh > 0 ? `${s.fresh} new` : `${s.total}`}
                  </span>
                </button>
                <button type="button" onClick={() => remove(s.id)} aria-label={`Delete saved search ${s.label}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="meta search-meta" aria-live="polite">
        {loading ? 'Loading the wire…' : failed ? 'The wire is unreachable.' : `${results.length} of ${pool.length} stories`}
      </p>

      <ol className="search-results">
        {results.map((a) => (
          <li key={`${a.edition}-${a.id}`} className="search-result">
            <div className="byline">
              <span className="src">{a.sourceName}</span>
              <span aria-hidden="true">·</span>
              <span>{timeAgo(a.publishedAt)}</span>
              <span aria-hidden="true">·</span>
              <span>{a.edition === 'finance' ? 'Finance' : 'Geopolitics'}</span>
              <WatchTags article={a} terms={terms} />
            </div>
            <h4>
              <a href={a.link} target="_blank" rel="noopener noreferrer">
                {a.title}
              </a>
            </h4>
            {a.summary && <p className="summary">{a.summary}</p>}
            <div className="search-result-foot">
              <span className="search-score" title="Meridian Score">
                Score {a.score}
              </span>
              {a.clusterId && (
                <Link className="intel-link" href={`/story/${a.clusterId}?edition=${a.edition}`}>
                  Full intelligence →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
      {!loading && !failed && results.length === 0 && (
        <div className="state-box">No stories match. Try fewer words or clear a filter.</div>
      )}
    </PageChrome>
  );
}
