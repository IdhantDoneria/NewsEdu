# The Meridian Brief

A news intelligence dashboard that rebuilds [global-intel-dashboard.onrender.com](https://global-intel-dashboard.onrender.com/) from scratch — re-imagined as a classic broadsheet with a **Geopolitics ⇄ Finance** toggle and a new, transparent point-based ranking algorithm (the **Meridian Score**).

**UI design (Canva):** [view](https://www.canva.com/d/gFXk9iwoJ3Temwq) · [edit](https://www.canva.com/d/jPzlvn-58viI3IQ)

---

## Breakdown of the original site

The original "GlobalIntel" dashboard was:

- A static frontend (vanilla HTML/CSS/JS, dark "intelligence terminal" theme) served by a Render backend with MongoDB that scraped RSS feeds (`/api/news`, `/api/sync`, `/api/sitrep`).
- Features: breaking-news ticker, sidebar filters (geopolitics/technology, source checkboxes, timeframe, sort), expandable cards, 60-second polling, a SITREP modal, speech-synthesis audio briefings.
- Ranking: an "8-layer heuristic" — keyword tiers (+50/+20), clickbait and caps-lock penalties (−30), summary-length bonus, a 1.5× source-authority *multiplier*, aggressive exponential time decay (factor 1.5 per hour), and a word-overlap dedup pass.

This rebuild keeps the good ideas (ticker, ranked feed, clickbait filtering, dedup) and replaces the rest:

| | Original | Rebuild |
|---|---|---|
| Stack | Static files + Render/Express/Mongo | Next.js 14 (App Router) — one repo, runs locally, deploys to Vercel |
| Editions | Geopolitics / Technology | **Geopolitics / Finance**, toggle in the top right |
| Ranking | Opaque multiplier soup, client-side | Additive 100-point score, computed server-side, breakdown shown on every card |
| Design | Dark sci-fi terminal | Broadsheet editorial (WSJ/NYT-inspired, distinct palette) |
| Data | Scraper + database | Free public RSS wires fetched on demand, cached 5 min, no database |

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Production mode:

```bash
npm run build && npm start
```

No API keys, no database, no environment variables required.

## Deploying to Vercel

The app is a stock Next.js project — Vercel deploys it with zero configuration:

```bash
npm i -g vercel
vercel             # preview deploy
vercel --prod      # production deploy
```

Or click: [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FIdhantDoneria%2FNewsEdu)

Optional: set `FINNHUB_API_KEY` in Vercel → Project → Settings → Environment Variables to merge [Finnhub's](https://finnhub.io) free-tier market wire into the finance edition.

## The Meridian Score (the new algorithm)

Every article is scored out of **100 points** across four metrics, server-side in [`lib/score.js`](lib/score.js). The per-metric breakdown is displayed on each card — the ranking is never a black box.

### 1. Headline Integrity — 0–40 pts
Starts at 24. **Penalties:** curiosity-gap phrases ("you won't believe", "here's why"… −8 each), listicle patterns (−8), question-mark headlines (−5, Betteridge's law), exclamation marks (−3 each), trailing ellipsis (−4), all-caps shouting (−6), hedging words (−2), too-thin headlines (−5). **Bonuses:** attributed actions — *says, raises, acquires, sanctions…* (+6), concrete figures — $, %, magnitudes (+5), substantive length 40–120 chars (+5).

### 2. Source Trust — 0–30 pts
Each outlet carries a **baseline reliability** score (0–20) plus a **topical authority** bonus (0–10) for the edition it appears in — MarketWatch testifies on markets, Foreign Policy on statecraft. The registry lives in [`lib/feeds.js`](lib/feeds.js).

### 3. Freshness — 0–30 pts
Exponential half-life decay from publication time: `30 × 0.5^(age / halfLife)` with an **8-hour half-life for finance** and **18 hours for geopolitics**. Smooth, predictable, and never resurrects stale news.

### 4. Corroboration — −12…+8 pts
Articles sharing ≥3 significant title tokens are treated as one event. The strongest telling earns **+8** if a *second independent outlet* confirms it; near-duplicate retellings take **−12** so one event can't flood the page.

**The clickbait cut:** anything totaling under **32 points** is dropped entirely.

## Finance sources (all free, no API key)

Explored options: paid/keyed APIs (Alpha Vantage, Marketaux, StockNewsAPI, EODHD, Financial Modeling Prep) all gate news behind keys and tight free quotas — so the default pipeline uses **free public RSS wires** instead, with Finnhub's free tier as an optional keyed upgrade:

- **Startup fundings / venture:** Crunchbase News, TechCrunch Venture, Sifted (Europe)
- **Stock-market movers:** MarketWatch (Dow Jones), CNBC Markets, Yahoo Finance, Investing.com, Fox Business, Fortune
- **Optional:** Finnhub market wire via `FINNHUB_API_KEY`

Geopolitics edition: BBC World, Al Jazeera, France 24, Foreign Policy, The Guardian World, NYT World, Deutsche Welle. Failed feeds degrade gracefully (`Promise.allSettled`) — some publishers block datacenter IPs but work from Vercel's edge.

## Design

Designed first in Canva ([view](https://www.canva.com/d/gFXk9iwoJ3Temwq) / [edit](https://www.canva.com/d/jPzlvn-58viI3IQ)), then implemented in CSS:

- **Palette:** ivory paper `#F7F3EA`, ink `#181511`, hairline rules, antique gold `#A8852E`, with an edition-keyed accent — **oxblood** `#8C2F1B` for geopolitics, **ledger green** `#1F5C45` for finance. Classic WSJ/NYT broadsheet feel, deliberately not a copy.
- **Type:** Playfair Display (masthead/display), Source Serif 4 (text), Inter (labels/UI).
- **3D & motion, in service of navigation:** cursor-following 3D tilt on cards (depth = "this is clickable"), a 3D page-turn when switching editions, conic-gradient score dials, animated metric bars, a pausable ticker tape, and a letterpress masthead rise. Everything respects `prefers-reduced-motion`.

## Project structure

```
app/
  api/news/route.js   # fetch feeds → score → corroborate → rank (5-min cache)
  globals.css         # broadsheet design system + 3D effects
  layout.js, page.js
components/
  Dashboard.jsx       # toggle, ticker, lead story, ranked rail, ledger grid
lib/
  feeds.js            # source registry with trust/authority weights
  rss.js              # RSS 2.0 / Atom / RDF parser (fast-xml-parser)
  score.js            # the Meridian Score algorithm
```