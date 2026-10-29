'use client';

import { useState } from 'react';

const W = 640;
const H = 220;
const PAD = { l: 38, r: 12, t: 12, b: 26 };

const mmdd = (d) => d.slice(5).replace('-', '/');

/** Split a series into runs of consecutive non-null points (null = no data that day). */
function runs(values) {
  const out = [];
  let cur = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(i);
  });
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Multi-line chart in plain SVG (no chart library).
 * series: [{ key, label, values: (number|null)[] }]; values align with dates.
 * unit: 'count' | 'percent' (values are 0-1 shares).
 */
export default function TrendsChart({ dates, series, unit = 'count', label }) {
  const [active, setActive] = useState(null);
  if (!dates?.length || !series?.length) return null;

  const fmt = (v) => (unit === 'percent' ? `${Math.round(v * 100)}%` : String(Math.round(v * 10) / 10));
  const max = Math.max(unit === 'percent' ? 0.1 : 1, ...series.flatMap((s) => s.values.filter((v) => v != null)));
  const top = unit === 'percent' ? Math.min(1, Math.ceil(max * 10) / 10) : Math.ceil(max);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i) => PAD.l + (dates.length === 1 ? iw / 2 : (i / (dates.length - 1)) * iw);
  const y = (v) => PAD.t + ih - (v / top) * ih;
  const ticks = [0, top / 2, top];
  const labelEvery = Math.ceil(dates.length / 8);

  return (
    <figure className="trends-figure">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="trends-svg"
        role="img"
        aria-label={label || 'Trend chart'}
        preserveAspectRatio="xMidYMid meet"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="trends-grid" />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" className="trends-axis">
              {fmt(t)}
            </text>
          </g>
        ))}
        {dates.map((d, i) =>
          i % labelEvery === 0 || i === dates.length - 1 ? (
            <text key={d} x={x(i)} y={H - 8} textAnchor="middle" className="trends-axis">
              {mmdd(d)}
            </text>
          ) : null
        )}
        {series.map((s, si) => {
          const dim = active != null && active !== s.key;
          return (
            <g key={s.key} className={`trends-line trends-c${si % 6}${dim ? ' dim' : ''}`}>
              {runs(s.values).map((run, ri) =>
                run.length > 1 ? (
                  <polyline key={ri} fill="none" points={run.map((i) => `${x(i)},${y(s.values[i])}`).join(' ')} />
                ) : null
              )}
              {s.values.map((v, i) =>
                v == null ? null : (
                  <circle key={i} cx={x(i)} cy={y(v)} r="3">
                    <title>{`${s.label}, ${mmdd(dates[i])}: ${fmt(v)}`}</title>
                  </circle>
                )
              )}
            </g>
          );
        })}
      </svg>
      <figcaption>
        <ul className="trends-legend">
          {series.map((s, si) => {
            const last = [...s.values].reverse().find((v) => v != null);
            return (
              <li
                key={s.key}
                className={`trends-c${si % 6}`}
                onMouseEnter={() => setActive(s.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(s.key)}
                onBlur={() => setActive(null)}
                tabIndex={0}
              >
                <span className="trends-swatch" aria-hidden="true" />
                {s.label}
                {last != null && <span className="meta"> {fmt(last)}</span>}
              </li>
            );
          })}
        </ul>
      </figcaption>
    </figure>
  );
}

/** Tiny inline trend line for list rows. */
export function Sparkline({ values, label }) {
  if (!values?.length) return null;
  const w = 90;
  const h = 22;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${values.length === 1 ? w / 2 : (i / (values.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="trends-spark" role="img" aria-label={label || 'Daily counts'}>
      <polyline fill="none" points={pts.join(' ')} />
    </svg>
  );
}
