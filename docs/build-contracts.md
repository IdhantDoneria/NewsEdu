# Build contracts (one-shot roadmap build)

Spec: `docs/ranking-algorithm-and-improvements.md` (Phases 0-4). Every stream owns specific files; **never edit a file you do not own** (if you need a change there, code against the contract below and note it in your report). Use relative imports in `.mjs` modules (`node --test` has no `@/` alias); `@/` is fine only in Next.js `.js/.jsx` files.

Rules for all streams: add your own new test files (`tests/<stream>-*.test.mjs`); update assertions in existing tests only for behaviour you intentionally changed (touch only the relevant hunks); run `npm test` and `npm run build` before finishing; commit on your worktree branch; final report = branch name, what shipped, what you skipped and why, any contract deviations. No new npm dependencies. No network at test time. Keep the code style of the surrounding files; concise comments.

## Streams and ownership

| Stream | Items | Owns |
|---|---|---|
| A scoring | 1,2,3,4(part),5,6,7 | `lib/scoring/**`, `lib/score.js` |
| B ingest+sources | 4(part),8,11(part),13,14 | `lib/ingest.js`, `lib/feeds.js`, `lib/rss.js`, new `lib/signals/**`, `app/api/news/route.js` |
| C clustering | 9,10,11(cluster side),12 | `lib/intelligence/{cluster,entities,identity}.mjs`, `lib/text.mjs` |
| D briefing+personal | 15,16,17,18,19,20 | `lib/intelligence/{briefing,changes,topics,compare,recall}.mjs`, `lib/personal/**`, `lib/client/userState.js`, `components/{Briefing,PersonalTools,Search}.jsx`, `app/api/{briefing,changes,recall}/**` |
| E AI layers | 21,22,23(chat golden),24,25 | `lib/intelligence/{chat,qa,extract,schema,llm,ai,openrouter,marketsctx,chatcache,memory,store}.mjs`, `lib/gemini.js`, `lib/markets.mjs`, `lib/intelligence/http.mjs`, `components/{ChatWidget,StoryPage}.jsx`, `app/api/{chat,intel,markets}/**`, `tests/golden/**` |
| F storage+telemetry | 23(telemetry),26 | `lib/store/**`, `lib/telemetry.mjs`, `lib/archive.mjs`, `app/api/{telemetry,archive,trends}/**`, `app/trends/**`, `components/Trends*.jsx`, `lib/client/telemetry.js` |
| G eval | 0 | `scripts/**`, `tests/fixtures/**`, `tests/eval-*.test.mjs`, `docs/eval-*.md`, `package.json` scripts (`eval`, `eval:capture`) only |

## Shared interfaces (stubs already on the base commit)

**Scoring (`lib/scoring/index.mjs`, A)**
- `scoreArticlesAsync(articles, edition, { now? })` -> per article `{ geopoliticalScore, financialScore, finalCurationScore, rankScore, scoreBreakdown }`.
- `rankScore`: unclamped sort key (may exceed 100 or go below 0). `finalCurationScore = displayScore(rankScore, edition)`: 0-100 display value, monotonic in rankScore, never used for sorting. `scoreBreakdown` layers must sum **exactly** to `rankScore` (A adds a test) so the receipt reconciles. Article objects passed in have `title, summary, link, publishedAt, source:{name,trust,authority}, sourceName, ageHours`.
- `export function displayScore(rank, edition)`.
- Nothing outside A changes score semantics. B may *append* a layer `{ name, points, note }` (same shape as existing layers; read `scoreBreakdown` entries to match) and add the same points to `rankScore`, then recompute `finalCurationScore = displayScore(rankScore, edition)`.
- `lib/score.js` keeps exporting `scoreArticle, applyCorroboration, totalScore, NOISE_FLOOR, headlineIntegrity, sourceTrust, freshness` (B imports them). A may retune `NOISE_FLOOR` and must update it consistently with the new scale; A clamps future/missing `publishedAt` to fetch time inside `scoreArticle`.

**Clustering (`lib/intelligence/cluster.mjs`, C)**
- `clusterArticles(articles, edition, { now? })`: pure and order-invariant (shuffling input must not change output ids/membership). Input articles carry `rankScore`/`score`, `sourceName`, `source`, `publishedAt`, `title`, `summary`, `link`, `id`. Output cluster keeps existing fields and adds `breadth` (distinct independent outlets after syndication dedupe), `syndicated` (article ids judged syndicated copies). `articles` are ordered best-first by `rankScore ?? score`.
- `export function breadthBonus(breadth)`: points added to a story's lead article rank (0 for <=1, saturating, <= ~12). C chooses the curve.
- `clusterVersion`, `clusterSummary`, `titleTokenSet` stay exported with the same signatures.

**Identity (`lib/intelligence/identity.mjs`, C)**
- `reconcileClusterIds(newClusters, prevClusters)` -> newClusters; a cluster sharing >= 50% of article ids with a previous cluster inherits its `id` (displaced id pushed to `aliases: string[]`). One-to-one assignment, greedy by overlap.
- `matchFollowedCluster(follow:{clusterId,articleIds}, clusters)` -> cluster|null (id, then alias, then article overlap).
- B calls `reconcileClusterIds` after clustering using the previous cached clusters (in memory; also a KV snapshot under `identity:<edition>` if `kvAvailable()`); `findClusterById` also matches `aliases`. D uses `matchFollowedCluster` for follows.

**Ingest order (B)**: fetch -> score (all, no cap) -> dedupe -> cluster all -> add `breadthBonus(c.breadth)` to each cluster's lead article (append receipt layer, update `rankScore`/`finalCurationScore`), penalise syndicated/duplicate members instead of the old `applyCorroboration` -> noise floor -> per-outlet cap and <= 2 items per story in the top 20 -> cap 60 -> `reconcileClusterIds` -> topics -> `archiveBrief` (fire and forget under `keepAlive`). Sort key is always `rankScore`. Payload shape for `/api/news` stays backward compatible (new optional fields only).

**KV (`lib/store/kv.mjs`, F)**: `kvAvailable() kvGet(key) kvSet(key,value,{ttlSec}) kvDel(key) kvIncr(key,{ttlSec}) kvPush(key,value,{max,ttlSec}) kvRange(key,start,stop)`. All async, never throw. In-memory fallback is already implemented; F adds the Upstash/Vercel-KV REST driver (env `UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL`+`KV_REST_API_TOKEN`), selected at call time, with fetch timeout 1.5 s and fallthrough to memory on error. Do not change signatures.

**Telemetry (`lib/telemetry.mjs`, F)**: `recordEvent(type, data)`. E calls it from the chat/intel routes: `recordEvent('chat', { provider, model, ms, cached, sources, citations, dropped, notice, edition })`, `recordEvent('intel', { provider, ms, fallback })`. Clients post thumbs to `POST /api/telemetry` (F owns) `{ type:'feedback', rating:'up'|'down', question?, provider? }`; E's ChatWidget calls `lib/client/telemetry.js` `sendFeedback(payload)` (F creates; fire-and-forget `navigator.sendBeacon`/fetch). Never send chat text without the user having thumbs-downed it, and truncate to 200 chars. Admin read: `GET /api/telemetry?token=` compared to `TELEMETRY_TOKEN` env (disabled when unset).

**Archive (`lib/archive.mjs`, F)**: `archiveBrief(edition, brief)` stores a compact hourly snapshot (title, link, source, publishedAt, rankScore, clusterId) in KV; `GET /api/archive?edition=&day=`, `GET /api/trends?edition=` (entity/topic frequency over time, recurring stories), page `/trends`. Must degrade gracefully (empty state) when only the in-memory store exists.

**Eval (G)**: `scripts/eval/*.mjs` import the real modules via relative paths and the stable interfaces above; `npm run eval` prints vitals + metrics; `docs/eval-baseline.md` = metrics at the base commit; `tests/fixtures/snapshots/2026-10-29/` already holds `news-{geopolitics,finance}.json` (post-cap production output; articles include source trust/authority so scoring can be replayed offline). Labelled sets live in `tests/fixtures/labels/*.json`. G must not depend on A-F's new behaviour except through the interfaces above, and eval tests in `tests/eval-*.test.mjs` assert only loose floors (they must pass on both base and final code).

## Honest limits (state in reports, not hidden)
Email/push alerts, fact-check badge and embeddings are out of scope. Shared storage is implemented behind `lib/store/kv.mjs` and activates only when the user provisions Upstash/Vercel KV env vars. Wikipedia/GDELT signals ship behind env flags (`SIGNAL_WIKIPEDIA=1`, `SIGNAL_GDELT=1`), default off.
