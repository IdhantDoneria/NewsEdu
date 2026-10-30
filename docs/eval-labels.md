# Evaluation labels: method, schemas, limits

All label files live in `tests/fixtures/labels/`. Any file may be absent; the harness reports "skipped" instead of failing. Point `EVAL_LABEL_DIR` at another directory to evaluate a different set.

## Sets written by the eval stream

Each file is `{ name, version, createdAt, method, limits[], items[] }`. Every row has `title`; the label field differs per set. Rows tagged `synthetic: true` were written by the annotator, the rest are real headlines from the 2026-10-29 snapshots (production top-60 lists for both editions plus the raw feed pool captured in `2026-10-29-1841`). `borderline: true` marks rows the annotator was unsure about.

| File | Rows | Labels | What the metric means |
|---|---|---|---|
| `soft-vs-hard.json` | 280 (97 soft, 183 hard; 47 synthetic) | `label: soft\|hard`, `kind` for soft rows (service, how-to, personal-finance, stock-picks, sport, celebrity, culture, lifestyle, promo, wrap, opinion, explainer, human-interest, listicle, interview, ...), `edition` (the pipeline it is scored in) | AUC that hard news outranks soft; soft share of the top fifth by score; soft content cut by the noise floor |
| `pump-vs-legit.json` | 215 (100 pump, 115 legit) | `label: pump\|legit`, `kind` for pumps (microcap-pump, crypto-shill, guru-tip, sponsored-promo, guaranteed-returns, fake-press-release) | AUC legit over pump in the finance pipeline; pumps at or above the median legitimate score; best-threshold F1 and noise-floor P/R for flagging pumps |
| `edition-topicality.json` | 261 (92 geopolitics, 101 finance, 68 off-topic) | `label: geopolitics\|finance\|off-topic`, optional `also` (second edition it fits) | per edition: AUC that on-topic outranks off-topic; off-topic share of the top fifth |

### Labelling method

One annotator (Claude) read every headline once, without the body or outlet, applying written rules (stored in each file's `method`):

- **Hard vs soft.** Hard is a concrete event, decision, data release, transaction, ruling, disaster or analysis directly tied to one. Soft is service content, how-to or listicle, personal finance, stock picks, sport, celebrity or culture, lifestyle, promo or event marketing, index wraps, opinion or essay without a news hook, human-interest features.
- **Topicality.** Geopolitics is international affairs, conflict, diplomacy, elections and domestic politics with international weight, security and trade policy. Finance is markets, macro, central banks, corporate deals, funding and financial regulation. Accidents (train crashes, rock collapses), sport, culture, local human-interest and generic product news are off-topic.
- **Pump vs legit.** Pump is promotional or manipulative copy: ticker hype, urgency, guaranteed returns, sponsored funnels, fake press-release excitement. Legit is news reporting, including headlines with strong verbs (soars, plunges, crashes) and headlines reporting on pump schemes, which are the hard negatives.

### Limits (read before trusting a number)

- Single annotator, no agreement statistic. Borderline rows are about 10-15 % of soft/hard and topicality.
- One news day. Topic mix, outlets and vocabulary are skewed to 2026-10-29 (Israel election, Spain train crash, Fed and CPI).
- Several outlets (BBC raw feed, Guardian, NYT raw feed, DW, Fox Business, Yahoo Finance) were blocked to the capture host; their headlines appear only through the production top-60 lists, which are already selected by the current scorer. That makes the real rows mildly optimistic for the current scorer.
- **All 100 pump rows are synthetic** (the curated feeds contain none). They are realistic in style but their separation from legit text is probably easier or different from what a live pump would look like. Treat pump metrics as a regression guard and a relative comparison between builds, not as an absolute false-positive rate.
- The scorer is applied to headline only (no summary), with neutral outlet and a fixed age. Real articles also carry summaries, which shift scores.

## Sets written by other streams (schemas the harness accepts)

- `cluster-pairs.json` (stream C): `{ articles: [{ id, title, sourceName, hoursAgo, event?, origin? }], pairs: [{ a, b, label: "same"\|"different", tag? }] }`. Also accepted: rows with inline `a`/`b` objects or `titleA`/`titleB`, and `same`/`sameEvent` booleans. Each pair is clustered in isolation, both input orders; reported: precision, recall, F1 of "same", accuracy, order-invariant share.
- `topics.json` (stream D): `{ topics: [...ids], items: [{ title, topics: [ids], origin? }] }` (also `labels`, `expected`). Each headline becomes a one-article cluster and goes through `topicsForCluster`; reported: micro and macro precision/recall and micro F1.
- `change-cards.json` (stream D, not present at baseline): `{ items: [{ cluster | articles, snapshot: { articleIds, lastSeenAt }, expectChange?: boolean, expectTypes?: string[] }] }`, run through `detectChanges`; reported: card precision, recall, F1. If D uses another shape the harness prints a "schema unrecognised" skip instead of failing; adjust `evalChangeCards` in `scripts/eval/labels.mjs`.

## Weak labels: editorial front pages

`front-pages.json` (schema in `scripts/eval/frontpages.mjs`) holds per-snapshot lists of `{ outlet, rank, title, link }`. The metric grades each Meridian article 0-4 (rank 1-3 -> 3, 4-6 -> 2, 7+ -> 1, plus one per additional outlet carrying the story; matched by normalised link or title overlap) and reports precision@10, NDCG@10 and entry coverage.

The sample committed here is a **proxy built from each reachable outlet's feed order** (`node scripts/eval/frontpages.mjs --build <snapshot>`), because real front pages could not be fetched reliably from the build host. It measures agreement with outlets' own ordering, not with an editor's choices, and says nothing about reader interest. Add real front-page captures under a new snapshot key to replace it.
