# The Meridian ranking system: how it works and how to improve it

Date: 2026-10-29. Method: eight read-only analyst agents (one per subsystem, plus external research and a live-data audit) produced reports; I then re-ran the key claims against the code and live production data. Items marked **[verified]** were reproduced by me; the rest are the agents' findings with file references and should be treated as strong leads.

---

## 1. The pipeline at a glance

```
RSS wires (7 geopolitics, 9 finance + Finnhub)          lib/feeds.js, lib/rss.js
   │  fetch all feeds in parallel (10 s timeout each)
   ▼
Drop: undated, future-dated, geopolitics keyword filter, > 72 h old, exact (source,title) duplicates
   ▼
Score every article through BOTH 10-layer pipelines     lib/scoring/geopolitics.mjs, finance.mjs
   │  final score = the edition's pipeline, clamped 0-100
   ▼
Cut below noise floor (32), sort by score, keep top 60  lib/ingest.js
   ▼
Cluster the 60 into events (entities + title tokens, 48 h window)   lib/intelligence/cluster.mjs
   ▼
 ├─ Front page: ranked list; reader may re-rank locally (weights, watchlist)   lib/personal/ranking.mjs
 ├─ Daily briefing: 70 % personal relevance + 30 % global significance         lib/intelligence/briefing.mjs
 ├─ Story pages / Q&A / chat / recall: AI on top of clusters, with citation validation
 └─ Brief cached 5 min per server instance (stale copy served for up to 30 min while rebuilding)
```

Only the 10-layer score decides the front-page order. The older "Meridian" 4-metric score and its corroboration pass are still computed but **do not affect ordering** (they only feed a legacy number shown on story pages).

---

## 2. Scoring: layer by layer

All layers are additive points; there are no weights. The sum is clamped to 0-100.

### Geopolitics (`lib/scoring/geopolitics.mjs`)

| Layer | Measures | Formula / constants | Range |
|---|---|---|---|
| L1 Outlet baseline | Credibility of the outlet | Domain table (60-100 band for known hosts), else `trust×3 + authority×4` from the feed registry, default 45 | 0-100 |
| L2 Entities and stats | Named countries, orgs, leaders, figures | `min(100, hits×5) × 0.2` | 0-20 |
| L3 Age decay | Staleness | **−0.5 per hour, no cap** | 0 to −∞ |
| L4 Subjectivity | Emotive adjectives, "!" | 3 per adjective + 2 per "!", cap 30 | 0 to −30 |
| L5 Entity density | Entities per word | `hits/words × 60`, cap 15 (needs 5+ words) | 0-15 |
| L6 Outlet authority | Per-feed authority | `authority × 1.5`, cap 15 | 0-15 |
| L7 Event vocabulary | War, sanctions, summit… | `min(100, hits×10) × 0.1` | 0-10 |
| L8 Macro vocabulary | Trade, energy, commodities | 0, or `min(8, 2 + hits)` | 0 or 3-8 |
| L9 Clickbait | "you won't believe", "?", "!", "…", shouting | 8 per phrase, 5 for "?", 3 for "!", 4 for "…", 6 for shouting, cap 50 | 0 to −50 |
| L10 Clamp | | `clamp(sum, 0, 100)` | 0-100 |

### Finance (`lib/scoring/finance.mjs`)

| Layer | Measures | Formula / constants | Range |
|---|---|---|---|
| L1 Source | Outlet baseline | Domain table (60-100) else `trust×3 + authority×4`, default 40 | 0-100 |
| L2 Instruments | `$AAPL`, `(NASDAQ:MSFT)`, FX pairs, commodity words | unique count × 1.5, **uncapped** | 0+ |
| L3 Data density | Figures per word | `min(100, %) × 0.5`, cap 25 | 0-25 |
| L4 Volatility language | plunge, crash, meltdown, "!" | `−min(20, 1.5×hits + 2×"!")` | −20 to 0 |
| L5 Regulatory | Any filing/regulator term in the text | **+15 flat** | 0 or 15 |
| L6 Macro | Fed, CPI, GDP… | `min(100, 12×hits) × 0.1` | 0-10 |
| L7 Institutional flow | Funds, flows | +5 flat | 0 or 5 |
| L8 Fundamentals | EPS, P/E, valuation terms | `min(100, 14×hits) × 0.15` | 0-15 |
| L9 Speculation | Pump terms, clickbait cues | up to −50 | −50 to 0 |
| L10 Clamp | | `clamp(sum, 0, 100)` | 0-100 |

**Finance has no recency term at all.**

---

## 3. What I verified (reproduced against the code)

| Claim | Evidence from my run |
|---|---|
| **[verified]** Outlet metadata swings scores ~35 points for identical text | Same Iran/Israel headline, 2 h old: trust 10/auth 5 → **65**; trust 16/auth 8 → **100**; trust 19/auth 9 → **100** |
| **[verified]** Geopolitics decay is linear and unbounded | Same story at 1 / 24 / 72 / 120 h → **100 / 90 / 66 / 42** |
| **[verified]** Finance ignores age | Same Fed headline at 1 / 24 / 71 h → **95 / 95 / 95** |
| **[verified]** Entity regexes are brittle | "US sanctions Iran" gets 1 entity hit vs 2 for "United States sanctions Iran"; "Israeli strikes Rafah" gets 0 entity hits vs 1 for "Israel strikes Rafah" |
| **[verified]** Bare tickers and Indian instruments score zero | `$AAPL and $MSFT…` → ticker layer 3; `AAPL and MSFT…` → 0; `Sensex and Nifty…` → 0; `(NSE:RELIANCE)` → 0 |
| **[verified]** Regulatory bonus is a word match | "Court filing: Tesla CEO faces pay lawsuit" gets +15; the same headline without "Court filing" gets 0 |
| **[verified]** Topic regexes mis-tag | "Woman **who** survived…" → Global Health; "Price **war**…" → Defense; "Tear **gas**…" → Energy; "Government **raises** fuel prices" → Venture; "US announces **tariffs** on **Indian** steel" → no topic; "**Russian** forces…" → no topic |
| **[verified]** Briefing blend is effectively lexicographic | Best non-match = 0.3×100 = **30**; worst single-topic match = 0.7×40 = **28**. Any topic match beats any non-match |
| **[verified]** Clustering over-merges on shared actors | "Trump says Iran deal is close" + "Trump threatens Iran with strikes" → 1 cluster; "Russia strikes Ukraine grid" + "Russia and Ukraine swap prisoners" → 1 cluster; Georgia (US state) + Georgia (country) → 1 cluster |
| **[verified]** Clustering under-merges on wording | "Russian forces" vs "Russia army" → 2 clusters; "Kiev" vs "Kyiv" → 2 clusters |
| **[verified]** Live scores are compressed (60 articles/edition) | Geopolitics: median 86, SD 4.3, 38 of 60 within ±3 of the median, 17 distinct values. Finance: median 78, SD 5.3, 17 distinct values. Noise floor 32: **0 of 120 articles fall below it** |
| **[verified]** Outlet dominance | Top 10 geopolitics: NYT 6, BBC 3, Al Jazeera 1. Top 10 finance: MarketWatch 5, CNBC 3 |
| **[verified]** Clustering is nearly inactive in finance | 59 clusters for 60 articles (58 singletons); geopolitics 46 clusters (41 singletons) |
| **[verified]** Finance top 10 includes 69-70 h old items | Ages of the top 10: 69, 3, 70, 2, 1, 2, 0, 1, 2, 43 hours |
| **[verified, and fixed]** Chat memory bug | Re-confirming an 80-day-idle note added its bonus to the *undecayed* score (9.0 instead of ~2.7). Fixed with a test |

Agent findings I did **not** independently reproduce (treat as leads): L2/L5 double-counting magnitudes, "!" double penalty, clickbait false positives on acronyms and "here's what", Object-prototype host key (`constructor`), shouting rule on NATO/UNESCO, the receipt not summing to the clamped score by up to 2.3, keyword drop of "actor"/"film" substrings in the legacy filter, Gemini calls having no timeout, entity-decode-before-strip injection path, spoofable rate-limit key.

---

## 4. Problems, ranked by impact

1. **The scale is compressed and clipped.** SD of 4-5 points, ties broken by feed order, the noise floor never binds, and the top score is clipped (raw 102 shown as 100). Ordering inside the wide middle is decided mostly by outlet and age.
2. **Outlet identity dominates content.** Finance: source authority explains ~64 % of score variance; geopolitics: outlet plus age explain most of it. Two source tables (feed registry and domain table) disagree (e.g. NYT 89 vs 74) and the domain table silently wins.
3. **Recency is inconsistent.** Finance none; geopolitics linear and unbounded; only a hard 72 h cliff in ingest.
4. **Importance is not measured.** Cross-outlet coverage (the best free importance signal) is computed in a legacy pass that does not reach the ranking; clustering runs after the top-60 cut, so duplicates of one event consume slots (12 of 60 geopolitics slots were one election story).
5. **Regex recall is narrow and English-noun-centric** (demonyms, plurals, "US/UK", transliterations, Indian instruments and institutions). Indian coverage is essentially absent from scoring, entities and sources.
6. **Soft news ranks high.** Personal-finance, listicles, how-tos, sport and index wraps appear in the top 20 (6 of the finance top 20, 3 of the geopolitics top 20 in the audit).
7. **Briefing lacks diversity and novelty.** Essential can be 4 of 4 on one topic; Watch can repeat Essential; yesterday's stories return.
8. **AI layers.** Retrieval is lexical with no IDF; citations are validated only against article IDs, not against supporting text; story analysis blocks the page; stored fallbacks can stick.

---

## 5. Improvement roadmap

Order matters: **build the measurement first (Phase 0)**, then change the algorithm, so every change is judged by numbers rather than by feel.

### Phase 0: an evaluation harness (≈1 day, no user-visible change)

- **Snapshot capture:** a script that saves `/api/news` and `/api/intel` JSON for both editions at fixed times (e.g. 4 per day for a week) into a fixtures folder. This is the replay set for everything below.
- **Weak labels:** use real editorial front pages (BBC, NYT, Reuters, CNBC) at the same timestamps as positives; report precision@10 and graded NDCG of the Meridian order against them. (Replay evaluation with partial labels is the standard offline method for front-page ranking; front pages are a proxy for editors, not for readers, so treat as a guide.)
- **Hand-labelled sets (~200 each):** headline pairs (same event / different event) for clustering; headlines for topic tags; soft-news vs hard-news; pump vs legitimate for finance.
- **Dashboard of vitals:** share of scores at 100, SD, distinct values, ties in the top 50, outlet share of top 20, median age of top 20, regional share. These are the numbers in section 3; track them per build.

### Phase 1: calibration quick wins (≈2-3 days)

| # | Change | Why (evidence) | Measure |
|---|---|---|---|
| 1 | **One recency term in both editions**: half-life decay (e.g. 18 h geopolitics, 8 h finance) replacing linear/none; soft tail instead of the hard 72 h cut; clamp future/missing dates to fetch time | Finance flat at 95; geopolitics 100→42 linearly; 70 h old items in the finance top 10; future-dated items score as fresh | Median age of top 20; share > 24 h old |
| 2 | **Stop clipping:** sort on the unclamped total (or a logistic/percentile map) and clamp only for display; make the receipt sum exactly to what is sorted | Ties at 100; raw 102 shown as 100; 17 distinct values | Distinct sort keys in top 50; receipt test |
| 3 | **Unify outlet baselines:** one table (domain-keyed), drop the second authority term; fix the `Object.hasOwn` lookup; scale to a defined band | 35-point swing for identical text; trust numbers have no provenance | Same-outlet variance across code paths ≤ 2 |
| 4 | **Cap outlet influence** and add a per-outlet limit in the top N | MarketWatch 5 of top 10; Sifted 18 of 19 in the bottom half purely by outlet tier | Outlet share of top 20 |
| 5 | **Fix recall:** demonyms, plurals, US/UK/USA, missing countries, case-insensitive orgs/leaders, disambiguate Georgia/Jordan/Chile; add Indian terms (RBI, Sensex, Nifty, BSE/NSE, SEBI, FII/DII, crore/lakh, ₹, USD/INR) | Verified probes above | Recall on 50-100 labelled headlines per area |
| 6 | **Tighten rules:** distinct-token density (remove `$6.14` double count), cap L2, L8 counts unique terms, regulatory bonus keyed to the source host or filing-form phrases (keyword-only gets +3), one "!" penalty, add pump-and-dump variants and plummet/tumble/slump | Probes and agent cases | Accuracy on 50 pump + 50 legitimate headlines |
| 7 | **Topic gate:** require a topical hit in the title for the edition or cap the score; add a soft-news/service penalty (how-to, listicle, personal finance, sport, index wraps) | Apple chargers on Reuters scored 100; 6 of finance top 20 soft | Off-topic share of top 20 |
| 8 | **Enrich summary-less items** (og:description) before scoring | 26 of 60 finance items had no summary and average 8 points lower | Score gap with/without summary |

### Phase 2: events and importance (≈1 week)

| # | Change | Why | Measure |
|---|---|---|---|
| 9 | **Order-invariant clustering:** sort by (time, id); TF-IDF cosine on title words, bigrams and entity IDs with batch IDF; union-find with average-link and a size cap; require a *distinguishing* shared term, not just shared actors | Verified over-merges (Iran, Russia/Ukraine, Georgia); order dependence | P/R on ~300 labelled pairs; permutation test must change nothing |
| 10 | **Canonicaliser:** demonym and transliteration aliases (Kiev/Kyiv, Zelenskiy/Zelensky, Qaddafi/Gaddafi, accents via NFKD), Indian entities, summary fallback when Title Case defeats the capitalised-phrase heuristic | Verified under-merges | Entity P/R on 100 non-US headlines |
| 11 | **Cluster before the cap; add outlet breadth to the score:** `log(distinct independent outlets)` after syndication de-duplication (MinHash/SimHash on title shingles); at most 2 items per story in the top 20 | Cross-outlet breadth is the strongest free importance signal and is currently dead code; election story took 12 of 60 slots | Distinct events per top 60 |
| 12 | **Stable story identity:** follows store the article IDs they saw; match by ≥ 50 % overlap; `/story/[id]` resolves a stale ID to the current cluster holding those articles | Cluster ID is the earliest member's link hash, so one article leaving changes the ID (probe: `cb3e64d`→`cb3e64e`) and orphans follows | Orphaned follows per refresh = 0 |
| 13 | **Source coverage:** Asia-Pacific, India, Africa and Latin America feeds plus at least one wire per edition; repair the failing feeds the audit found (Guardian World, Yahoo Finance, Fox Business); a static, hand-reviewed reliability tier per outlet used only as a prior (do not use bias labels for ranking) | Zero feeds from Asia/Africa/LatAm; India has 0 finance articles | Regional share of top 60 |
| 14 | **Optional importance signals (free):** Wikipedia pageview spike for the top entity (public API, cached); GDELT volume as a cross-check. Skip Google Trends (alpha, gated) and runtime MBFC/NewsGuard calls | External research | Correlation with editorial front pages |

### Phase 3: briefing and personalization (≈1 week)

| # | Change | Why | Measure |
|---|---|---|---|
| 15 | **MMR-diversified Essential** with a real floor (best global story *not* overlapping picks), max 2 per topic; Watch excludes Essential | Essential can be 4/4 one topic; Watch duplicates Essential | Max single-topic share; repeat pair rate |
| 16 | **Shown-state suppression:** send the last 48 h of briefed cluster IDs (already logged client-side); repeat only when `detectChanges` is non-empty | Pure function of (pool, profile): same input, same output | Day-over-day repeat rate |
| 17 | **Graded, time-decayed interest vector** (≈14-day half-life, updated by visits/follows/clicks) instead of binary +40 stacking | Blend is lexicographic (30 vs 28); interests never decay | NDCG@4 on clicks; topic entropy |
| 18 | **One exploration slot** (ε-greedy ≈ 0.1) from non-matching topics, seeded by date + interest hash so it is stable across reloads, labelled | Filter-bubble guard | Clicks on off-interest topics |
| 19 | **Materiality precision:** remove ambiguous triggers (`fired`, `strike`, `rules`, `clarif`); require ≥ 2 signals for interest-only items; track first-seen per article ID so late-indexed articles are not dropped | Agent probes: "fired tear gas" → Leadership change; late articles never reported | Precision on 100 labelled change cards |
| 20 | **Fix topic regexes** (stem-aware, demonyms, contextual phrases instead of bare `who`, `war`, `fed`, `rates?`, `raises?`, `gas`) | Verified mis-tags | Per-topic P/R on 200 headlines |

### Phase 4: AI layers and infrastructure

| # | Change | Why | Measure |
|---|---|---|---|
| 21 | **Quote-grounded citations**, checked deterministically: each citation carries a verbatim quote; keep it only if the quote is a substring of that article; numbers in a statement must appear in the quote | Today only the article ID is validated; a sentence cited to S2 can be supported only by S5 | Unsupported-claim rate on a golden set |
| 22 | **BM25 retrieval** (IDF, length normalisation, title boost, Unicode tokenisation, shared market aliases); pad only with low-relevance-flagged items | Lexical set overlap, ASCII-only, no IDF; non-English questions silently get generic stories | recall@10 on ~150 golden questions |
| 23 | **Golden question set + nightly grading + server-side telemetry** (provider, notice, drops, thumbs) | No answer-quality regression suite exists; ratings never leave the browser | Citation validity, thumbs-down rate by provider |
| 24 | **Availability:** per-call timeouts and a shared deadline across the model chain; raise OpenRouter `max_tokens` for story analysis; regenerate stored fallbacks when quota returns; pre-generate analyses for top stories | Sticky fallback records; no timeout on Gemini calls | p95 latency; fallback share |
| 25 | **Hardening:** decode entities before stripping tags, escape `<`/`>` inside every prompt fence, strip literal `[n]` from model output, key the rate limit on a non-spoofable identifier with shared state | Article text is not escaped in fences; `X-Forwarded-For` leftmost is client-controlled | Canary injection tests |
| 26 | **Shared storage (the database step):** story archive, durable analysis cache, cross-instance consistency, real telemetry, alerts | Everything above that says "per instance" | |

### Methods researched and judged

| Method | Verdict | Notes |
|---|---|---|
| Static reliability tier (hand-reviewed JSON, ~50-100 outlets) | **Adopt now** | MBFC is the most-used open benchmark but a 2026 preprint disputes its method; NewsGuard is paid. Use as a prior only |
| TF-IDF / BM25 cosine clustering with MinHash syndication de-dupe | **Adopt now** | Standard TDT baseline; O(N²) over ~60-1,000 articles is milliseconds in JS |
| MMR re-rank (λ≈0.8) | **Adopt now** | Cost is trivial at briefing size; tune λ against the eval |
| Offline front-page replay evaluation | **Adopt now** | Needs snapshots (Phase 0) |
| Clickbait classifier (char n-gram logistic regression on Webis-17 + ~300 own labels) | Later, behind a flag | Webis is tweets, expect domain shift; only replace the keyword list if it wins on your own labels |
| Sentence embeddings for clustering | Later | Beat TF-IDF in published incremental-clustering studies, but add an API call and cold-start cost; ship only if F1 beats Phase 2 by a preset margin |
| Fact-check badge (Google Fact Check Tools / ClaimReview) | Later, as a badge not a score | Needs an API key; coverage likely English-heavy |
| Wikipedia pageview spikes, GDELT | Later | Free; needs caching |
| NLI claim verification, HDBSCAN / online clustering, Google Trends, social velocity | Skip | Need hosted models, persisted state, or gated/paid access |
| Interleaving / A-B tests | Later | Needs per-viewer bucketing and a click sink (storage) |

---

## 6. Suggested order

1. **Phase 0** (measure) and **Phase 1** items 1-3 (recency, stop clipping, unified baselines): the largest ranking-quality gain per hour, and all three are verified defects.
2. **Phase 1** items 5-7 (recall, rules, topic gate), then **Phase 2** items 9-11 (clustering and breadth).
3. **Phase 3** items 15-16 (diversity, no repeats): visible to readers immediately.
4. **Phase 4** items 21-23 (grounding and evaluation) before adding more AI features.
5. Storage (item 26) once two or three of the above need it.

## 7. Caveats

- Several agent claims come from reading code or small synthetic probes; the live-data numbers are a single snapshot (60 articles per edition on 2026-10-29).
- External-research claims rest on search snippets; licensing terms were not checked.
- Changing the score scale (Phase 1 items 1-3) changes what "100" means and requires re-tuning the noise floor; do it behind the replay harness.
