# Article Scoring Schema

The Meridian Brief is a stateless application — there is no relational
database. Articles are ingested from RSS wires per request, scored in the
Node runtime, cached in-memory for 5 minutes, and returned as JSON.

The "schema" is therefore the shape of the article objects in the
`/api/news` response. Any downstream consumer (frontend, mobile client,
future analytics store) can rely on these fields.

## Article object

| Field                  | Type    | Notes                                                                                          |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `id`                   | string  | Stable hash of `link`.                                                                         |
| `title`                | string  | Cleaned headline.                                                                              |
| `link`                 | string  | Canonical article URL.                                                                         |
| `summary`              | string  | HTML-stripped description / lede.                                                              |
| `image`                | string  | Best-effort media URL, may be `null`.                                                          |
| `publishedAt`          | number  | Unix ms.                                                                                       |
| `sourceName`           | string  | Outlet display name.                                                                           |
| `source`               | object  | `{ name, trust (0-20), authority (0-10) }`. Only `name` and (for unknown outlets) `trust` matter: the outlet table in `outlets.mjs` is keyed by domain and name.                         |
| `edition`              | string  | `"geopolitics"` or `"finance"`.                                                                |
| `metrics`              | object  | **Legacy, superseded.** Old 4-metric Meridian breakdown `{ headlineIntegrity, sourceTrust, freshness }`. Kept for observability only — do not render as the explanation for `score`. |
| `ageHours`             | number  | Hours since publication when scored.                                                           |
| `corroboration`        | number  | **Legacy, superseded.** −12..+8 from the old cross-source de-duplication pass.                 |
| `scoreNotes`           | array   | **Legacy, superseded.** Human-readable notes from the old headline-integrity metric.            |
| **`geopoliticalScore`** | integer | 0-100 display value of the geopolitics pipeline. Present on every article regardless of edition. |
| **`financialScore`**    | integer | 0-100 display value of the finance pipeline. Present on every article regardless of edition. |
| **`rankScore`**         | number  | Unclamped sort key of the edition pipeline (may exceed 100 or go below 0; 0.01 resolution). **Sort on this.** |
| **`finalCurationScore`** | integer | `displayScore(rankScore)`: monotonic 0-100 for the dial and the noise floor. Identity up to 90, then saturating. Never sort on it. |
| **`scoreBreakdown`**    | array   | `[{ key, label, delta, note? }, ...]`. The deltas sum **exactly** to `rankScore` (`layers.reduce((a, l) => a + l.delta, 0) === rankScore`). Layers: outlet baseline (bounded band), recency (30 x 0.5^(age/half-life); 18 h geopolitics, 8 h finance), entities or instruments, density, event/macro/fundamental vocabulary, volatility, speculation and clickbait, topic gate, soft news. |
| `meridianScore`        | integer | 0-100, legacy Meridian metric total. Kept for observability only — no longer the ranking basis. |
| `score`                | integer | Alias of `finalCurationScore` — kept so existing UI bindings keep working.                     |

## Frontend contract

- **Ordering.** Articles are pre-sorted by `rankScore` (descending)
  server-side. Clients that want a different order should sort by any of the
  three integer score fields.
- **Filtering.** Anything below the `noiseFloor` in the response payload has
  already been dropped server-side; clients can apply additional thresholds
  against `finalCurationScore` if needed.
- **Presentation.** The UI displays `score` (which equals `finalCurationScore`)
  as the headline number and `scoreBreakdown` as the explanation — a signed
  "receipt" of exactly which layers pushed the score up or down. Do not
  resurrect `metrics`/`corroboration` in new UI: they describe a different,
  retired algorithm and summing them will not equal `score`.

## Migration note (if a real database is added later)

The three integer columns to persist alongside each article row:

```sql
ALTER TABLE articles
  ADD COLUMN geopolitical_score   INTEGER NOT NULL CHECK (geopolitical_score BETWEEN 0 AND 100),
  ADD COLUMN financial_score      INTEGER NOT NULL CHECK (financial_score BETWEEN 0 AND 100),
  ADD COLUMN final_curation_score INTEGER NOT NULL CHECK (final_curation_score BETWEEN 0 AND 100);

CREATE INDEX articles_by_curation ON articles (final_curation_score DESC);
```
