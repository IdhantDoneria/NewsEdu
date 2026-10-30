import Link from 'next/link';
import PageChrome from '@/components/intel/PageChrome';
import TrendsChart, { Sparkline } from '@/components/TrendsChart';
import { readTrends } from '@/lib/archive.mjs';

export const metadata = {
  title: 'Trends — The Meridian Brief',
};

export const dynamic = 'force-dynamic';

const RANGES = [7, 14, 30];
const EDITIONS = [
  ['geopolitics', 'Geopolitics'],
  ['finance', 'Finance'],
];

const href = (edition, days) => `/trends?edition=${edition}&days=${days}`;

function Empty({ trends }) {
  return (
    <section className="trends-empty" aria-live="polite">
      <h2>History is still building</h2>
      <p>
        The Meridian Brief saves a compact snapshot of each edition&apos;s ranked stories once an hour. Trends appear
        here as those snapshots accumulate: rising people and places need at least two days of data, recurring stories
        need a story to survive across days.
      </p>
      {!trends.durable && (
        <p>
          This server has no durable storage configured, so history lives in memory only and restarts erase it. To keep
          30 days of history, connect Upstash Redis or Vercel KV (see <code>docs/storage.md</code>).
        </p>
      )}
    </section>
  );
}

export default async function Page({ searchParams }) {
  const edition = searchParams?.edition === 'finance' ? 'finance' : 'geopolitics';
  const asked = Number(searchParams?.days);
  const days = RANGES.includes(asked) ? asked : 7;
  const trends = await readTrends(edition, days);
  const empty = trends.snapshots === 0;

  return (
    <PageChrome kicker="Over time" title="Trends" edition={edition}>
      <nav className="trends-controls" aria-label="Trend filters">
        <span className="trends-group">
          {EDITIONS.map(([key, name]) => (
            <Link key={key} href={href(key, days)} prefetch={false} className={key === edition ? 'on' : ''} aria-current={key === edition ? 'page' : undefined}>
              {name}
            </Link>
          ))}
        </span>
        <span className="trends-group">
          {RANGES.map((n) => (
            <Link key={n} href={href(edition, n)} prefetch={false} className={n === days ? 'on' : ''} aria-current={n === days ? 'page' : undefined}>
              {n} days
            </Link>
          ))}
        </span>
      </nav>

      <p className="meta trends-status">
        {trends.snapshots} hourly snapshot{trends.snapshots === 1 ? '' : 's'} over {trends.daysWithData} day
        {trends.daysWithData === 1 ? '' : 's'} · {trends.durable ? 'durable history (KV)' : 'in-memory history only'}
      </p>

      {empty ? (
        <Empty trends={trends} />
      ) : (
        <div className="trends-grid-page">
          <section className="trends-block">
            <h2>Rising entities</h2>
            {trends.hasBaseline ? (
              trends.rising.length ? (
                <ul className="trends-list">
                  {trends.rising.map((r) => (
                    <li key={r.name}>
                      <span className="trends-name">{r.label}</span>
                      {r.isNew && <span className="trends-new">new</span>}
                      <span className="meta">
                        {r.prior} → {r.recent} stories/day
                      </span>
                      <Sparkline
                        values={trends.entities.find((e) => e.name === r.name)?.series || []}
                        label={`${r.label}: stories per day`}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="meta">Nothing is clearly rising yet; coverage has been steady.</p>
              )
            ) : (
              <p className="meta">Rising entities need at least two days of snapshots to compare against.</p>
            )}
          </section>

          <section className="trends-block">
            <h2>Most covered entities</h2>
            <TrendsChart
              dates={trends.dates}
              unit="count"
              label="Distinct stories per day mentioning each entity"
              series={trends.entities.slice(0, 6).map((e) => ({ key: e.name, label: e.label, values: e.series }))}
            />
            <p className="meta">Distinct stories per day that name the entity.</p>
          </section>

          <section className="trends-block">
            <h2>Topic share</h2>
            <TrendsChart
              dates={trends.dates}
              unit="percent"
              label="Share of each day's stories by topic"
              series={trends.topics.slice(0, 6).map((t) => ({ key: t.id, label: t.label, values: t.share }))}
            />
            <p className="meta">Share of each day&apos;s ranked stories tagged with the topic.</p>
          </section>

          <section className="trends-block">
            <h2>Recurring stories</h2>
            {trends.recurring.length ? (
              <ol className="trends-list">
                {trends.recurring.map((s) => (
                  <li key={s.id || s.title}>
                    <a href={s.link} target="_blank" rel="noopener noreferrer" className="trends-name">
                      {s.title}
                    </a>
                    <span className="meta">
                      {s.daysSeen} days · {s.source}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="meta">No story has stayed in the ranking across more than one day yet.</p>
            )}
          </section>
        </div>
      )}

      {!empty && !trends.durable && (
        <p className="meta trends-note">
          History is held in server memory and resets on restart. Connect Upstash Redis or Vercel KV to keep 30 days (see{' '}
          <code>docs/storage.md</code>).
        </p>
      )}
    </PageChrome>
  );
}
