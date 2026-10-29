# Shared storage (Upstash / Vercel KV)

Everything that needs to outlive one server instance goes through `lib/store/kv.mjs`. With no configuration it is an in-process map, so the app runs as before; with a Redis REST endpoint it becomes durable and shared across instances. The driver is chosen on every call from the environment, so there is nothing to rebuild.

## Provision

1. Create a database: Vercel dashboard -> Storage -> Upstash Redis (or KV), or directly at upstash.com. The free tier is plenty.
2. Set one pair of environment variables (a Vercel marketplace integration sets the `KV_*` pair for you):

| Provider | URL | Token |
|---|---|---|
| Upstash | `UPSTASH_REDIS_REST_URL` | `UPSTASH_REDIS_REST_TOKEN` |
| Vercel KV | `KV_REST_API_URL` | `KV_REST_API_TOKEN` |

Both halves of a pair are required; Upstash names win if both pairs are set. Use the read/write token, not the read-only one.

3. Optional: `TELEMETRY_TOKEN` (any long random string) enables the admin summary at `GET /api/telemetry?token=...` (or `Authorization: Bearer ...`). Unset, that endpoint returns 404.
4. Redeploy. `/trends` shows "durable history (KV)" once it is active.

## What is stored

| Key | Content | TTL / cap |
|---|---|---|
| `archive:<edition>:<YYYY-MM-DD>` | list of hourly snapshots for that UTC day: per story title, link, source, publishedAt, rankScore, cluster id and aliases, top entities, topic ids (about 60 stories, tens of KB per snapshot) | 30 days, at most 26 per day |
| `archive:index:<edition>` | hour buckets that have a snapshot | 30 days, 744 entries |
| `archive:claim:<edition>:<hour>` | counter so each hour is archived once, even across instances | 2 hours |
| `telemetry:events` | recent events: `chat`, `intel`, `feedback` (see below) | 1000 newest, 30 days |
| `rl:telemetry:<hash>:<minute>` | per-IP rate-limit counter for feedback POSTs (hashed address) | 70 seconds |
| `identity:<edition>` | previous cluster snapshot used to keep story ids stable across refreshes | set by the ingest stream |

Telemetry holds no personal data: no IPs, no cookies, no chat text. A thumbs-down stores the rating, provider and a scrubbed 200-character excerpt of the question (emails, phone numbers and links removed); a thumbs-up stores no text. Server events carry only provider, model, latency, cache/fallback flags and citation counts.

## What degrades without it

- **Archive and `/trends`:** history exists only in the memory of the running instance, so it starts empty after each restart or cold start and differs between serverless instances. The page says so and explains that history accumulates (rising entities need two days of snapshots).
- **Telemetry:** events and the admin summary are per instance and reset on restart; the rate limiter is per instance.
- **Anything else using the store** (cluster identity snapshots, shared caches) falls back to per-instance memory with the same limits as before.

## Failure behaviour

Every KV call has a 1.5 second timeout. On a timeout, HTTP error or Redis error that single operation falls through to the in-memory map and nothing throws, so a storage outage cannot take a page down; it only loses durability until it recovers. Data written to memory during an outage is not copied back to Redis afterwards.

## Endpoints

- `GET /api/archive?edition=&day=YYYY-MM-DD` - snapshots for a day (default today) plus the list of days that exist.
- `GET /api/trends?edition=&days=7` - entity and topic frequency per day, rising entities, recurring stories (`days` 1-30).
- `POST /api/telemetry` - reader feedback `{ type: 'feedback', rating: 'up'|'down', provider?, question? }`, 20 requests per IP per minute.
- `GET /api/telemetry?token=` - admin summary: chat count, cache-hit rate, provider mix, fallback share, grounding rate, thumbs by provider, p50/p95 latency. Add `&recent=50` for raw recent events.

## Wiring other streams

- Ingest calls `archiveBrief(edition, brief)` after each build (under `keepAlive`); it is idempotent per hour and never throws.
- The chat and intel routes call `recordEvent(type, data)`; the chat widget calls `sendFeedback({ rating, provider, question })` from `lib/client/telemetry.js` only when the reader clicks a thumb.
- The site navigation has no Trends link yet: add `{ href: '/trends', label: 'Trends' }` to `components/intel/PageChrome.jsx` and a `<Link href="/trends">` to the nav in `components/Dashboard.jsx`.
