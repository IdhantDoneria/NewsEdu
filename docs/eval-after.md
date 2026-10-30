# Evaluation run @ 9ad188b

## Vitals: snapshot 2026-10-29-1841 (pipeline replay)

| Vital | Geopolitics | Finance | Better |
|---|---|---|---|
| Articles / clusters | 60 / 50 | 60 / 59 |  |
| Share of display scores at 100 | 0% | 0% | lower |
| Share of sort keys above 100 | 3% | 0% |  |
| Median display score | 83 | 62.5 |  |
| SD of display score | 7.95 | 11.24 | higher |
| SD of sort key | 8.43 | 11.23 | higher |
| Distinct display values | 27 | 30 | higher |
| Distinct sort-key values | 60 | 58 | higher |
| Items tied in top 50 (sort key) | 0 | 4 | lower |
| Top outlet share of top 20 | 25% | 25% | lower |
| Distinct outlets in top 20 | 5 | 6 | higher |
| Median age of top 20 (h) | 3.1 | 1.4 | lower |
| Share of top 20 older than 24 h | 0% | 0% | lower |
| Regional metadata present (top 60) | 100% | 100% |  |
| Non-US/EU share (top 60, if region) | 20% | 0% | higher |
| Distinct events in top 60 | 50 | 59 | higher |
| Soft-news share of top 20 (labelled) | 0% | 20% | lower |
| Off-topic share of top 20 (labelled) | 0% | 0% | lower |

Top-20 outlets: geopolitics NYT World:5, France 24:5, Al Jazeera:5, BBC World:4, Foreign Policy:1; finance MarketWatch:5, Investing.com:5, CNBC Markets:4, Fortune:3, Sifted:2.
Feeds back-filled from the production snapshot (blocked at capture): BBC World, NYT World.

Briefing

| Metric | Value |
|---|---|
| Max single-topic share in Essential (neutral profile) | 50% |
| Max single-topic share in Essential (Middle East/defence/Russia interests) | 50% |
| Day-over-day repeat rate, all briefed items (simulated: pool aged 24 h) | 40% |
| Day-over-day repeat rate, Essential | 50% |

Retrieval: entity-query hit rate 97% over 30 queries; generic-question max outlet share geopolitics 60%, finance 50%.

Front-page proxy (feed-order proxy, not real front pages):

| Edition | Entries | Articles matched | Entry coverage | P@10 | NDCG@10 |
|---|---|---|---|---|---|
| geopolitics | 30 | 20 | 67% | 0.5 | 0.3 |
| finance | 70 | 57 | 81% | 1 | 0.83 |

## Vitals: snapshot 2026-10-29 (rescore replay)

| Vital | Geopolitics | Finance | Better |
|---|---|---|---|
| Articles / clusters | 60 / 47 | 60 / 56 |  |
| Share of display scores at 100 | 0% | 0% | lower |
| Share of sort keys above 100 | 0% | 0% |  |
| Median display score | 79.5 | 54 |  |
| SD of display score | 14 | 14.25 | higher |
| SD of sort key | 14.05 | 14.3 | higher |
| Distinct display values | 28 | 34 | higher |
| Distinct sort-key values | 60 | 59 | higher |
| Items tied in top 50 (sort key) | 0 | 2 | lower |
| Top outlet share of top 20 | 35% | 40% | lower |
| Distinct outlets in top 20 | 4 | 5 | higher |
| Median age of top 20 (h) | 3.1 | 1.6 | lower |
| Share of top 20 older than 24 h | 0% | 0% | lower |
| Regional metadata present (top 60) | 0% | 0% |  |
| Non-US/EU share (top 60, if region) | - | - | higher |
| Distinct events in top 60 | 47 | 56 | higher |
| Soft-news share of top 20 (labelled) | 0% | 35% | lower |
| Off-topic share of top 20 (labelled) | 5% | 0% | lower |

Top-20 outlets: geopolitics Al Jazeera:7, NYT World:6, BBC World:4, France 24:3; finance MarketWatch:8, CNBC Markets:4, Investing.com:3, Fortune:3, Sifted:2.

Briefing

| Metric | Value |
|---|---|
| Max single-topic share in Essential (neutral profile) | 50% |
| Max single-topic share in Essential (Middle East/defence/Russia interests) | 50% |
| Day-over-day repeat rate, all briefed items (simulated: pool aged 24 h) | 0% |
| Day-over-day repeat rate, Essential | 0% |

Retrieval: entity-query hit rate 100% over 30 queries; generic-question max outlet share geopolitics 30%, finance 30%.

## Labelled sets

| Set | Metric | Value |
|---|---|---|
| soft-vs-hard | n (soft share) | 280 (35%) |
| soft-vs-hard | AUC hard over soft (1 = soft always lower) | 0.9 |
| soft-vs-hard | Mean score gap hard minus soft | 20.6 |
| soft-vs-hard | Soft share of top 20% by score (geo / fin) | 0% / 0% |
| soft-vs-hard | Soft cut by noise floor: P / R | 1 / 0.22 |
| pump-vs-legit | n pump / legit | 100 / 115 |
| pump-vs-legit | AUC legit over pump | 0.94 |
| pump-vs-legit | Mean score gap legit minus pump | 13.9 |
| pump-vs-legit | Pumps scoring at/above the median legit | 3% |
| pump-vs-legit | Best-threshold F1 (P / R) | 0.92 (0.9 / 0.93) |
| pump-vs-legit | Pumps cut by noise floor: P / R | 0.9 / 0.09 |
| edition-topicality | n (off-topic share) | 261 (26%) |
| edition-topicality | AUC on-topic over off-topic (geo / fin) | 0.93 / 0.97 |
| edition-topicality | Off-topic share of top 20% by score (geo / fin) | 4% / 2% |
| cluster-pairs | n pairs | 593 |
| cluster-pairs | Precision / recall / F1 | 0.97 / 0.63 / 0.77 |
| cluster-pairs | Order-invariant share | 100% |
| topics | n headlines | 316 |
| topics | Micro precision / recall / F1 | 0.98 / 0.99 / 0.99 |
| topics | Macro precision / recall | 0.98 / 0.99 |
| change-cards | n cases | 166 |
| change-cards | Precision / recall / F1 | 1 / 1 / 1 |
