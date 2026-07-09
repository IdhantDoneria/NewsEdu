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
| `source`               | object  | `{ name, trust (0-20), authority (0-10) }` — used by the L1 baselines.                         |
| `edition`              | string  | `"geopolitics"` or `"finance"`.                                                                |
| `metrics`              | object  | Legacy Meridian metric breakdown: `{ headlineIntegrity, sourceTrust, freshness }`.             |
| `ageHours`             | number  | Hours since publication when scored.                                                           |
| `corroboration`        | number  | −12..+8 from cross-source de-duplication.                                                      |
| `scoreNotes`           | array   | Human-readable breakdown of penalty/bonus flags.                                               |
| **`geopoliticalScore`** | integer | 0-100, from the 10-layer geopolitics pipeline. Present on every article regardless of edition. |
| **`financialScore`**    | integer | 0-100, from the 10-layer finance pipeline. Present on every article regardless of edition.     |
| **`finalCurationScore`** | integer | 0-100, the edition-appropriate score used for sort / filter.                                  |
| `meridianScore`        | integer | 0-100, legacy Meridian metric total (headline + trust + freshness + corroboration).            |
| `score`                | integer | Alias of `finalCurationScore` — kept so existing UI bindings keep working.                     |

## Frontend contract

- **Ordering.** Articles are pre-sorted by `finalCurationScore` (descending)
  server-side. Clients that want a different order should sort by any of the
  three integer score fields.
- **Filtering.** Anything below the `noiseFloor` in the response payload has
  already been dropped server-side; clients can apply additional thresholds
  against `finalCurationScore` if needed.
- **Presentation.** The UI displays `score` (which equals `finalCurationScore`)
  as the headline number and `metrics` as the breakdown bars — the legacy
  Meridian metrics remain a useful "why" alongside the new pipeline totals.

## Migration note (if a real database is added later)

The three integer columns to persist alongside each article row:

```sql
ALTER TABLE articles
  ADD COLUMN geopolitical_score   INTEGER NOT NULL CHECK (geopolitical_score BETWEEN 0 AND 100),
  ADD COLUMN financial_score      INTEGER NOT NULL CHECK (financial_score BETWEEN 0 AND 100),
  ADD COLUMN final_curation_score INTEGER NOT NULL CHECK (final_curation_score BETWEEN 0 AND 100);

CREATE INDEX articles_by_curation ON articles (final_curation_score DESC);
```
