'use client';

import { useState } from 'react';

import {
  PRESETS,
  WEIGHT_KEYS,
  WEIGHT_LABELS,
  addTerm,
  isDefaultWeights,
  matchWatchlist,
  sanitizeWeights,
} from '@/lib/personal/ranking.mjs';

/** Sliders that re-order the front page locally. The Meridian Score itself is unchanged. */
export function RankingPanel({ weights, onChange }) {
  const custom = !isDefaultWeights(weights);
  const setOne = (key, value) => onChange(sanitizeWeights({ ...weights, [key]: Number(value) }));

  return (
    <details className="rank-tools">
      <summary>
        Tune ranking
        {custom && <b className="rank-on">on</b>}
      </summary>
      <div className="rank-panel">
        <p className="rank-help">
          Re-orders the stories below by your own mix. Scores shown on each card stay the
          Meridian Score.
        </p>
        <div className="rank-presets" role="group" aria-label="Ranking presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={JSON.stringify(sanitizeWeights(p.weights)) === JSON.stringify(sanitizeWeights(weights))}
              onClick={() => onChange(sanitizeWeights(p.weights))}
            >
              {p.label}
            </button>
          ))}
        </div>
        {WEIGHT_KEYS.map((k) => (
          <label key={k} className="rank-row">
            <span>{WEIGHT_LABELS[k]}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={weights[k]}
              onChange={(e) => setOne(k, e.target.value)}
              aria-label={`${WEIGHT_LABELS[k]} weight`}
            />
            <output>{weights[k]}</output>
          </label>
        ))}
      </div>
    </details>
  );
}

/** Add/remove watchlist terms and filter the page to matching stories. */
export function WatchlistBar({ terms, onChange, only, onToggleOnly, matchCount }) {
  const [draft, setDraft] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const next = addTerm(terms, draft);
    if (next !== terms) onChange(next);
    setDraft('');
  };

  return (
    <section className="watchbar" aria-label="Watchlist">
      <span className="watch-label">Watchlist</span>
      <ul className="watch-chips">
        {terms.map((t) => (
          <li key={t}>
            {t}
            <button type="button" onClick={() => onChange(terms.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="watch-form">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add ticker or topic (AAPL, oil, Fed)"
          aria-label="Add a watchlist term"
          maxLength={40}
        />
        <button type="submit" disabled={!draft.trim()}>
          Add
        </button>
      </form>
      {terms.length > 0 && (
        <label className="watch-only">
          <input type="checkbox" checked={only} onChange={(e) => onToggleOnly(e.target.checked)} />
          Only my watchlist ({matchCount})
        </label>
      )}
    </section>
  );
}

/** Which watchlist terms a story mentions. */
export function WatchTags({ article, terms }) {
  const hits = matchWatchlist(article, terms);
  if (hits.length === 0) return null;
  return (
    <span className="watch-tags" title="Matches your watchlist">
      {hits.slice(0, 3).map((t) => (
        <span key={t} className="watch-tag">
          ★ {t}
        </span>
      ))}
    </span>
  );
}
