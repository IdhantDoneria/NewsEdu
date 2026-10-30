# Roadmap implementation status (2026-10-30)

Spec: `docs/ranking-algorithm-and-improvements.md`. Measurements: `docs/eval-baseline.md` (before) vs `docs/eval-after.md` (after), reproduce with `node --no-warnings scripts/eval/vitals.mjs --compare docs/eval-baseline.json`.

| # | Item | Status |
|---|---|---|
| 0 | Eval harness, snapshots, labelled sets | Shipped (`scripts/eval`, `tests/fixtures`, `docs/eval-*.md`) |
| 1 | Half-life recency, both editions | Shipped |
| 2 | Unclamped `rankScore` sort key, smooth display score, receipt sums exactly | Shipped |
| 3 | Single outlet table (`lib/scoring/outlets.mjs`) in a capped band | Shipped |
| 4 | Outlet influence cap + per-outlet / per-story caps in top N | Shipped |
| 5 | Regex recall (demonyms, plurals, US/UK, Indian terms, ambiguous names) | Shipped |
| 6 | Rule fixes (density, caps, regulatory, pump vocabulary) | Shipped |
| 7 | Topic gate and soft-news penalty | Shipped |
| 8 | Summary enrichment (og:description, SSRF-safe, budgeted) | Shipped |
| 9 | Order-invariant TF-IDF union-find clustering | Shipped |
| 10 | Canonicaliser (transliterations, demonyms, Indian entities) | Shipped |
| 11 | Cluster before cap, breadth bonus, syndication de-dupe | Shipped |
| 12 | Stable story identity (`reconcileClusterIds`, aliases) | Shipped |
| 13 | Source coverage (29 sources per edition, regions, alt URLs) | Shipped; several outlets 403 from some hosts, failures are non-fatal |
| 14 | Wikipedia / GDELT signals | Shipped behind `SIGNAL_WIKIPEDIA=1`, `SIGNAL_GDELT=1` (off by default) |
| 15 | MMR Essential, real floor, Watch excludes Essential | Shipped |
| 16 | Shown-state suppression (48 h) | Shipped |
| 17 | Decayed interest vector (14-day half-life) | Shipped |
| 18 | Exploration slot (date-seeded, labelled) | Shipped |
| 19 | Materiality precision, first-seen tracking | Shipped |
| 20 | Topic regex fixes | Shipped |
| 21 | Quote-grounded citations (deterministic) | Shipped; real-model quote compliance not yet measured, see telemetry `groundingSupported/Total` |
| 22 | BM25 retrieval, multilingual tokenisation | Shipped (recall@10 0.88 to 0.98, non-English 0.49 to 0.97) |
| 23 | Golden question set + telemetry | Shipped (`tests/golden`, `scripts/eval-chat.mjs`, `/api/telemetry`) |
| 24 | Deadlines, JSON repair, regenerate fallbacks, `warmIntel` | Shipped |
| 25 | Prompt hardening, non-spoofable rate limit | Shipped |
| 26 | Shared storage, archive, trends | Shipped behind `lib/store/kv.mjs`; durable only with Upstash/Vercel KV env vars (`docs/storage.md`), in-memory otherwise |

## Not done (by design)
Email/push alerts (needs a provider and breaks the opt-in model), embeddings, fact-check badge (needs an API key), and a human-labelled click set (needs real traffic).

## Known limits
- Labelled sets were hand-built from one news day; the topic and change-card sets were tuned against, so their near-perfect scores are optimistic (fresh holdout: topic P 0.93 / R 0.90, change cards P 0.93 / R 0.65).
- Pump headlines in the eval are synthetic.
- Cluster recall is 0.63 to 0.75: paraphrases with no shared words need embeddings.
- Reuters/AP arrive via Google News links, so the domain-keyed outlet table falls back to feed trust for them.
