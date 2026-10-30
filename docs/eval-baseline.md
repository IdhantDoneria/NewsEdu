# Evaluation baseline (the "before" for the roadmap build)

Generated 2026-10-29 by `npm run eval` at the **scaffold base commit `a675e42`** (the code every stream branched from, before any roadmap change). Machine-readable twin: `docs/eval-baseline.json`.

Re-run and diff after any change:

```
npm run eval -- --compare docs/eval-baseline.json        # deltas with better/worse verdicts
npm run eval -- --out /tmp/now.json --md-out /tmp/now.md # keep a copy of a run
```

To regenerate this baseline from the base commit after the streams are merged (the harness runs any checkout's `lib/` against these fixtures):

```
git worktree add /tmp/meridian-base a675e42 && ln -s "$PWD/node_modules" /tmp/meridian-base/node_modules
EVAL_CODE_ROOT=/tmp/meridian-base npm run eval -- --out docs/eval-baseline.json
```

## How to read it

- **Primary snapshot `2026-10-29-1841`** is a fresh capture (raw feed pool plus production output). It is replayed through the real `lib/ingest.js` (filters, legacy score, 10-layer scoring, dedupe, noise floor, cap 60, clustering) with `fetch` mocked to serve the captured items and `Date.now` frozen at capture time ("pipeline replay").
- **Feeds blocked at capture** (this build host got HTTP 403 from BBC, Guardian, NYT, DW and 404/entity errors from Yahoo Finance and Fox Business) are back-filled from that snapshot's production output where the outlet appears (BBC World, NYT World). Their items are therefore the production top picks rather than the full raw feed, which slightly flatters those outlets. Use `--no-augment` to see the un-filled pool.
- **Secondary snapshot `2026-10-29`** is the production output the roadmap analysed (post-cap, 60 per edition); it can only be re-scored and re-clustered ("rescore replay"), so ingest-stage logic (outlet caps, breadth bonus, cluster-before-cap) is only visible in the primary snapshot. Its numbers reproduce the roadmap's section 3 (geopolitics median 86, SD about 4.2, 17 distinct values; finance 14 distinct).
- Scores are compared on two scales. **Display** is `finalCurationScore`/`score` (0-100, what readers see). **Sort key** is `rankScore ?? finalCurationScore ?? score`. At the base commit they are identical, which is exactly the defect "ties at 100 and 17 distinct values"; after roadmap item 2 they diverge.
- Labelled-set scores use headline-only articles with a neutral outlet (trust 14, authority 7) and a fixed 2 h age, so they isolate what the layers do with wording.
- **Day-over-day repeat rate** is simulated here (the same pool aged 24 h, items older than 72 h dropped, the day-1 briefed cluster IDs passed to `composeBriefing` under several plausible profile keys). Base code ignores shown-state, so 100 % is expected; it is meaningful only once shown-state suppression exists. Pass `--prev <older snapshot>` to use two real snapshots instead.
- **Front-page metrics are a proxy**, not editorial front pages: the sample (`tests/fixtures/labels/front-pages.json`) is each reachable outlet's own feed order (Al Jazeera, France 24, Foreign Policy; CNBC, MarketWatch, Fortune, Sifted, Crunchbase, TechCrunch, Investing.com). BBC and NYT were unreachable, which is why geopolitics P@10 is 0 at baseline (Meridian's top 10 is all BBC/NYT). Read the finance figures as "agreement with outlets' own ordering", nothing stronger.
- Cluster-pair and topic sets come from streams C and D (their label files as they stood when this baseline was cut: 594 pairs, 316 headlines). `change-cards.json` did not exist yet, so that metric is skipped. Re-cut the baseline if those label files change materially.

## Headline findings at baseline

- Scores are compressed and clipped: geopolitics SD 4.3 with 18 distinct values, finance SD 5.6 with 13; 44-46 of the top 50 items are tied on the sort key.
- Outlet concentration: the geopolitics top 20 is 60 % one outlet (NYT World 12, BBC 7, Al Jazeera 1); finance 50 % MarketWatch.
- Recency: 30 % of the finance top 20 is older than 24 h (finance has no recency term).
- Events: the 60 geopolitics slots hold only 47 distinct events (duplicates consume 13 slots); finance 59 of 60.
- Soft news: 35 % of the labelled finance top 20 is soft content; on the 280-headline soft/hard set the scorer separates hard from soft only moderately (AUC 0.75) and cuts none of it at the noise floor.
- Pump copy: the finance scorer barely separates synthetic pump headlines from legitimate ones (AUC 0.55; 81 % of pumps score at or above the median legitimate headline) and the noise floor removes none.
- Topicality: off-topic headlines (train crashes, sport, lifestyle) make up 27-31 % of the top fifth of the labelled set by score.
- Briefing: with Middle East/defence/Russia interests, 3 of 4 Essential slots share one topic; clustering F1 on C's pairs is 0.34 (precision 0.96, recall 0.21); topic-tag micro recall is 0.52.

## Vitals: snapshot 2026-10-29-1841 (pipeline replay)

| Vital | Geopolitics | Finance | Better |
|---|---|---|---|
| Articles / clusters | 60 / 47 | 60 / 59 |  |
| Share of display scores at 100 | 2% | 0% | lower |
| Share of sort keys above 100 | 0% | 0% |  |
| Median display score | 85.5 | 76 |  |
| SD of display score | 4.26 | 5.59 | higher |
| SD of sort key | 4.26 | 5.59 | higher |
| Distinct display values | 18 | 13 | higher |
| Distinct sort-key values | 18 | 13 | higher |
| Items tied in top 50 (sort key) | 44 | 46 | lower |
| Top outlet share of top 20 | 60% | 50% | lower |
| Distinct outlets in top 20 | 3 | 4 | higher |
| Median age of top 20 (h) | 4.7 | 2.9 | lower |
| Share of top 20 older than 24 h | 0% | 30% | lower |
| Regional metadata present (top 60) | 0% | 0% |  |
| Non-US/EU share (top 60, if region) | - | - | higher |
| Distinct events in top 60 | 47 | 59 | higher |
| Soft-news share of top 20 (labelled) | 0% | 35% | lower |
| Off-topic share of top 20 (labelled) | 15% | 5% | lower |

Top-20 outlets: geopolitics NYT World:12, BBC World:7, Al Jazeera:1; finance MarketWatch:10, Crunchbase News:5, CNBC Markets:4, TechCrunch Venture:1.
Feeds back-filled from the production snapshot (blocked at capture): BBC World, NYT World.

Briefing

| Metric | Value |
|---|---|
| Max single-topic share in Essential (neutral profile) | 25% |
| Max single-topic share in Essential (Middle East/defence/Russia interests) | 75% |
| Day-over-day repeat rate, all briefed items (simulated: pool aged 24 h) | 100% |
| Day-over-day repeat rate, Essential | 100% |

Retrieval: entity-query hit rate 100% over 30 queries; generic-question max outlet share geopolitics 60%, finance 50%.

Front-page proxy (feed-order proxy, not real front pages):

| Edition | Entries | Articles matched | Entry coverage | P@10 | NDCG@10 |
|---|---|---|---|---|---|
| geopolitics | 30 | 8 | 27% | 0 | 0 |
| finance | 70 | 49 | 70% | 1 | 0.69 |

## Vitals: snapshot 2026-10-29 (rescore replay)

| Vital | Geopolitics | Finance | Better |
|---|---|---|---|
| Articles / clusters | 60 / 47 | 60 / 59 |  |
| Share of display scores at 100 | 2% | 0% | lower |
| Share of sort keys above 100 | 0% | 0% |  |
| Median display score | 86 | 78 |  |
| SD of display score | 4.17 | 5.71 | higher |
| SD of sort key | 4.17 | 5.71 | higher |
| Distinct display values | 17 | 14 | higher |
| Distinct sort-key values | 17 | 14 | higher |
| Items tied in top 50 (sort key) | 45 | 45 | lower |
| Top outlet share of top 20 | 60% | 45% | lower |
| Distinct outlets in top 20 | 3 | 4 | higher |
| Median age of top 20 (h) | 4.7 | 3.4 | lower |
| Share of top 20 older than 24 h | 0% | 35% | lower |
| Regional metadata present (top 60) | 0% | 0% |  |
| Non-US/EU share (top 60, if region) | - | - | higher |
| Distinct events in top 60 | 47 | 59 | higher |
| Soft-news share of top 20 (labelled) | 0% | 30% | lower |
| Off-topic share of top 20 (labelled) | 15% | 5% | lower |

Top-20 outlets: geopolitics NYT World:12, BBC World:7, Al Jazeera:1; finance MarketWatch:9, Crunchbase News:5, CNBC Markets:5, TechCrunch Venture:1.

Briefing

| Metric | Value |
|---|---|
| Max single-topic share in Essential (neutral profile) | 25% |
| Max single-topic share in Essential (Middle East/defence/Russia interests) | 75% |
| Day-over-day repeat rate, all briefed items (simulated: pool aged 24 h) | 100% |
| Day-over-day repeat rate, Essential | 100% |

Retrieval: entity-query hit rate 100% over 30 queries; generic-question max outlet share geopolitics 60%, finance 50%.

## Labelled sets

| Set | Metric | Value |
|---|---|---|
| soft-vs-hard | n (soft share) | 280 (35%) |
| soft-vs-hard | AUC hard over soft (1 = soft always lower) | 0.75 |
| soft-vs-hard | Mean score gap hard minus soft | 4.1 |
| soft-vs-hard | Soft share of top 20% by score (geo / fin) | 7% / 15% |
| soft-vs-hard | Soft cut by noise floor: P / R | 0 / 0 |
| pump-vs-legit | n pump / legit | 100 / 115 |
| pump-vs-legit | AUC legit over pump | 0.55 |
| pump-vs-legit | Mean score gap legit minus pump | 1.7 |
| pump-vs-legit | Pumps scoring at/above the median legit | 81% |
| pump-vs-legit | Best-threshold F1 (P / R) | 0.65 (0.48 / 0.98) |
| pump-vs-legit | Pumps cut by noise floor: P / R | 0 / 0 |
| edition-topicality | n (off-topic share) | 261 (26%) |
| edition-topicality | AUC on-topic over off-topic (geo / fin) | 0.75 / 0.69 |
| edition-topicality | Off-topic share of top 20% by score (geo / fin) | 27% / 31% |
| cluster-pairs | n pairs | 594 |
| cluster-pairs | Precision / recall / F1 | 0.96 / 0.21 / 0.34 |
| cluster-pairs | Order-invariant share | 100% |
| topics | n headlines | 316 |
| topics | Micro precision / recall / F1 | 0.86 / 0.52 / 0.65 |
| topics | Macro precision / recall | 0.89 / 0.52 |
| change-cards | skipped | tests/fixtures/labels/change-cards.json absent (stream D) |
