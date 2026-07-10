# The Meridian Brief

A news intelligence dashboard that surfaces the most trustworthy, timely stories from global RSS wires — ranked by the **Meridian Score**, a transparent 100-point algorithm. Two editions: **Geopolitics** and **Finance**, toggled from the top right.

Beyond the ranked front page, Meridian is a personalized intelligence and knowledge-retention system built on one shared story-intelligence layer:

- **Story Intelligence Pages** (`/story/[id]`) — every ranked article links to its event cluster's full brief: what happened, why it matters, essential background, key actors, stakeholder positions (public claim vs. inferred interest), points of disagreement, key numbers, timeline, and what-could-happen-next scenarios with uncertainty labels. Every statement is classified (**FACT · PARTY CLAIM · ANALYSIS · SCENARIO · UNCERTAINTY**) and facts carry citations back to source articles.
- **Follow Story & What Changed** (`/following`) — follow a story and, on return, see only *material* developments (policy actions, rulings, escalation/de-escalation, data releases…) since your last visit. Duplicate reporting and low-information rewrites are suppressed.
- **Personalized Daily Briefing** (`/briefing`) — a finite briefing (Essential Developments, Developing Stories, Understand One Issue, Watch Next), blending ~70% personal relevance with ~30% global significance. Never an infinite feed.
- **Source Comparison & Framing** — inside each story page: per-outlet headlines, timing, Meridian Scores, primary focus, observable framing-emphasis differences, and figures reported by only one outlet.
- **Contextual Q&A** — "Ask about this story" answers strictly from the story's own articles and stored intelligence, with validated citations. Insufficient evidence produces an honest refusal, not invention.
- **Weekly Recall & Knowledge Map** (`/recall`) — understanding-level questions generated from stories you actually read/followed/asked about, paraphrase-tolerant grading with explanations, and causal chains connecting developments.

**Privacy model:** there are no accounts and no server-side user data. Interests, follows, visit snapshots, reading history and recall performance live in your browser's localStorage and are sent only transiently inside the requests that need them. This preserves the product's "No tracking" positioning.

**AI model:** intelligence generation, framing narratives, Q&A and recall grading use Gemini 2.5 Flash when `GEMINI_API_KEY` is set, with strict JSON schemas, server-side validation (fabricated citations are stripped; ungrounded "facts" are demoted to analysis) and caching per cluster version. Without a key, every feature still works in a deterministic extractive mode.

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
    news/route.js       # thin wrapper over lib/ingest.js (payload unchanged + clusterId)
    markets/route.js    # fetch Google News → Gemini AI summary → JSON response
    intel/route.js      # story-cluster list per edition
    intel/[id]/         # story intelligence payload + /ask (scoped Q&A)
    intel/metrics/      # AI/caching observability counters
    briefing/route.js   # personalized finite daily briefing (POST, stateless)
    changes/route.js    # material-change detection vs client snapshots (POST)
    recall/route.js     # recall questions + knowledge map; /evaluate grades answers
  briefing/ following/ recall/ story/[id]/   # product pages
  globals.css           # broadsheet design system + 3D effects + intelligence UI
  layout.js, page.js
components/
  Dashboard.jsx         # front page (edition toggle, what-changed strip, intel links)
  StoryPage.jsx         # story intelligence page (follow, comparison, Q&A)
  Briefing.jsx / Following.jsx / Recall.jsx
  intel/                # shared chrome + classification badges
lib/
  ingest.js             # shared fetch → score → corroborate → rank → cluster pipeline
  feeds.js              # source registry with trust/authority weights
  rss.js                # RSS 2.0 / Atom / RDF parser (fast-xml-parser)
  score.js              # the Meridian Score algorithm
  scoring/              # 10-layer geopolitics & finance pipelines
  client/userState.js   # local-first profile (follows, interests, history)
  intelligence/         # shared intelligence layer:
    cluster.mjs           # deterministic event clustering (stable IDs)
    extract.mjs           # Gemini structured intel + deterministic fallback
    schema.mjs            # validation: classifications, citation stripping
    changes.mjs           # material-change detection
    briefing.mjs          # finite briefing composer (70/30 configurable)
    compare.mjs           # source comparison + framing analysis
    qa.mjs                # scoped, citation-validated story Q&A
    recall.mjs            # recall questions, grading, knowledge map
    entities.mjs topics.mjs store.mjs metrics.mjs ai.mjs
```
