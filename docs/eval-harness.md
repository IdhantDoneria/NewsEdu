# Evaluation harness (roadmap Phase 0)

Offline, deterministic, no network at run time. Everything lives in `scripts/eval/` and `tests/fixtures/`.

| Command | What it does |
|---|---|
| `npm run eval:capture` | Saves `/api/news` and `/api/intel` (both editions) from the base URL, plus the raw pre-filter feed pool (via `lib/feeds.js` + `lib/rss.js`), to `tests/fixtures/snapshots/<YYYY-MM-DD-HHmm>/` (UTC). `-- --base http://localhost:3000`, `-- --no-raw`, `-- --raw-only`, `-- --no-intel`. Default base is the production URL; override with `EVAL_BASE_URL`. Feeds that return 403 from the host are recorded as failed in `raw-<edition>.json` and `meta.json`. |
| `npm run eval` | Replays the committed snapshots through the current code and prints vitals plus labelled-set metrics. `-- --json`, `-- --out f.json`, `-- --md-out f.md`, `-- --compare docs/eval-baseline.json`, `-- --snapshot a,b` (first is primary; `latest` / `latest-raw` pick the newest), `-- --prev <snapshot>` (real day-over-day), `-- --mode rescore`, `-- --no-augment`. |
| `node scripts/eval/frontpages.mjs --build <snapshot>` | Rebuilds the front-page proxy sample from a snapshot's raw feed order. |

Environment: `EVAL_CODE_ROOT=/path/to/checkout` runs another checkout's `lib/` against these fixtures (used to cut the baseline from the base commit); `EVAL_LABEL_DIR` swaps the label directory; `EVAL_BASE_URL` sets the capture base.

## Modules

- `capture.mjs` snapshot capture. `replay.mjs` snapshot loading, frozen clock, `pipeline` replay (real `lib/ingest.js` with mocked `fetch`, through `alias-loader.mjs` which resolves the Next `@/` alias) and `rescore` replay (`scoreArticlesAsync` + `clusterArticles`).
- `vitals.mjs` the vitals, briefing (`composeBriefing`), retrieval (`retrieveSources`), compare and markdown rendering. `labels.mjs` labelled-set loaders and evaluators. `frontpages.mjs` weak-label loader and metric. `metrics.mjs` unit-tested helpers: P/R/F1, precision@k, DCG/NDCG, AUC, best-threshold F1, descriptive stats.

## Vitals reported (per edition, per snapshot)

Share of display scores at 100; share of sort keys above 100; SD; distinct values; items tied in the top 50 on the sort key; top-outlet share and distinct outlets in the top 20; median age of the top 20 and share older than 24 h; share with `region` metadata and non-US/EU share of the top 60 (when `region` exists); distinct events in the top 60; labelled soft-news and off-topic share of the top 20. Briefing: max single-topic share in Essential (neutral and interested profiles), day-over-day repeat rate. Retrieval: entity-query hit rate and generic-question outlet share.

The sort key is always `rankScore ?? finalCurationScore ?? score`; display is `finalCurationScore ?? score ?? rankScore`. The harness never calls anything stream-specific beyond the shared interfaces in `docs/build-contracts.md`, and falls back to `rescore` replay if the ingest stage cannot run.

## Tests

`tests/eval-metrics.test.mjs` (helpers, front-page metric, compare renderer) and `tests/eval-harness.test.mjs` (snapshots parse, vitals run, label sets well formed, loose floors such as AUC > 0.5) are written to pass on the base and on the final code.
