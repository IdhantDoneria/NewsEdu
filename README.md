# The Meridian Brief

A news intelligence dashboard that surfaces the most trustworthy, timely stories from global RSS wires — ranked by the **Meridian Score**, a transparent 100-point algorithm. Two editions: **Geopolitics** and **Finance**, toggled from the top right.

**UI design (Canva):** [view](https://www.canva.com/d/gFXk9iwoJ3Temwq) · [edit](https://www.canva.com/d/jPzlvn-58viI3IQ)

---

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Production mode:

```bash
npm run build && npm start
```

**Optional:** Set environment variables in `.env.local` for enhanced features:
- `GEMINI_API_KEY` – AI-powered market summaries in Markets overview (free tier available)
- `FINNHUB_API_KEY` – Enhanced market news in Finance edition

## Deploying to Vercel

Stock Next.js — Vercel deploys it with zero configuration:

```bash
npm i -g vercel
vercel             # preview deploy
vercel --prod      # production deploy
```

Or click: [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FIdhantDoneria%2FNewsEdu)

**Optional API Keys:**

1. **Gemini API Key** (for AI market summaries)
   - Get free key at: https://aistudio.google.com/apikey
   - Set `GEMINI_API_KEY` in Vercel → Project → Settings → Environment Variables
   - Enables AI-powered summaries in the Markets overview page

2. **Finnhub API Key** (for enhanced market news)
   - Get free key at: https://finnhub.io
   - Set `FINNHUB_API_KEY` in Vercel → Project → Settings → Environment Variables
   - Merges [Finnhub's](https://finnhub.io) free-tier market wire into the Finance edition

Both are optional — the app works with zero API keys.

## Markets Overview (AI-Powered)

The **Markets** tab (top right toggle) provides AI-generated summaries of global stock markets:

- **13 markets:** US, China, Japan, India, UK, France, Canada, Germany, Taiwan, South Korea, Saudi Arabia, Switzerland, Australia
- **AI Summaries:** When `GEMINI_API_KEY` is set, Gemini 2.5 Flash generates 2-paragraph financial analysis summaries
- **Latest News:** Fetches top 10 articles for each market from Google News
- **Market Selector:** Dropdown to switch between markets in real-time

**How it works:**
1. Fetch top news headlines for the selected market from Google News RSS
2. If Gemini API key is configured, send headlines to Gemini for financial analysis
3. Display AI summary + ranked news list with publication metadata

No API key? The page still works — you'll see the latest news without AI summaries.

## News refresh cadence

- **Auto-refresh:** every 5 minutes in the background.
- **Force refresh:** the "Refresh now" button in the section header bypasses the cache and re-fetches all feeds immediately.
- Feeds that are unreachable degrade gracefully — only live sources contribute to each refresh.

## The Meridian Score

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

## Sources (all free, no API key)

**Finance edition**
- Startup fundings / venture: Crunchbase News, TechCrunch Venture, Sifted (Europe)
- Stock-market movers: MarketWatch, CNBC Markets, Yahoo Finance, Investing.com, Fortune, Fox Business
- Optional keyed upgrade: Finnhub market wire via `FINNHUB_API_KEY`

**Geopolitics edition**
- BBC World, Al Jazeera, France 24, Foreign Policy, The Guardian World, NYT World, Deutsche Welle

Feeds that fail (some publishers block datacenter IPs) degrade gracefully via `Promise.allSettled` — they work from Vercel's edge network.

## Design

Designed first in Canva ([view](https://www.canva.com/d/gFXk9iwoJ3Temwq) / [edit](https://www.canva.com/d/jPzlvn-58viI3IQ)), then implemented in CSS:

- **Palette:** ivory paper `#F7F3EA`, ink `#181511`, hairline rules, antique gold `#A8852E`, with an edition-keyed accent — **oxblood** `#8C2F1B` for geopolitics, **ledger green** `#1F5C45` for finance.
- **Type:** Playfair Display (masthead/display), Source Serif 4 (text), Inter (labels/UI).
- **3D & motion:** cursor-following 3D tilt on cards, 3D page-turn on edition switch, conic-gradient score dials, animated metric bars, pausable ticker tape, letterpress masthead rise. All effects respect `prefers-reduced-motion`.

## Project structure

```
app/
  api/
    news/route.js       # fetch feeds → score → corroborate → rank (5-min cache, force-refresh)
    markets/route.js    # fetch Google News → Gemini AI summary → JSON response
  globals.css           # broadsheet design system + 3D effects
  layout.js, page.js
components/
  Dashboard.jsx         # edition toggle (geopolitics/finance/markets)
  MarketsOverview.jsx   # market selector + AI summary + news list (uses /api/markets)
lib/
  feeds.js              # source registry with trust/authority weights
  rss.js                # RSS 2.0 / Atom / RDF parser (fast-xml-parser)
  score.js              # the Meridian Score algorithm
```
