<div align="center">

# ⛰️ ZENITH

### *The Pinnacle Workspace*

**Peak thought. Zero friction.** Notes, docs, databases, AI and cloud sync —
one beautifully minimal workspace that compounds your output.

</div>

---

Zenith is a luxury-grade, Notion-class personal workspace. It is **local-first**
(your data lives in your browser's IndexedDB, instantly responsive, fully offline),
with optional **Google sign-in cloud sync** to your own Firebase project, an
**AI assistant** powered by Google Gemini, and optional **connected apps** (Gmail,
Calendar, Slack, Linear, Notion, GitHub, Todoist) via Composio so the AI can act
on real tasks, not just write text.

## ✨ Everything inside

| | |
|---|---|
| **Block editor** | 20+ block types: headings, lists, to-dos, toggles, toggle-headings, quotes, callouts, dividers, code (21 languages, syntax-highlighted), images, bookmarks, video/embeds, simple tables, TeX math (KaTeX), table of contents, columns, sub-pages & page links |
| **Slash menu** | Type `/` for everything; markdown shortcuts as you type (`#`, `-`, `[]`, `>`, ` ``` `, `---`, `**bold**`, `` `code` ``…) |
| **Databases** | Full collections with **Table · Board · Gallery · List · Calendar · Timeline** views, filters (and/or), multi-sorts, grouping, hidden properties, inline or full-page, linked views |
| **Properties** | Title, text, number (formats), select, multi-select, status, date, checkbox, URL, email, phone, **formulas**, **relations**, created/edited time |
| **Zenith AI** | Continue writing, summarize, improve, fix grammar, translate, change tone, brainstorm, outline, action items, custom prompts — streaming, powered by the workspace's own Gemini key (server-side, nothing for visitors to configure) |
| **Connected apps** | Composio-backed: AI can look things up and take action in Gmail, Google Calendar, Slack, Linear, Notion, GitHub and Todoist — reads run immediately, anything that changes something outside Zenith asks for confirmation first |
| **Organization** | Infinite page nesting, drag-and-drop everywhere (blocks, columns, sidebar tree), favorites, full-text search (`⌘K`), templates gallery, trash with restore |
| **Pages** | Emoji icons, gradient/image covers, serif & mono fonts, small text, full width, page lock, word count |
| **History** | Automatic version snapshots with preview & one-click restore; full undo/redo (`⌘Z`) |
| **Comments** | Page & block comments with resolve/reopen |
| **Data freedom** | Export Markdown / HTML / full JSON backup; import Markdown & JSON; storage stats |
| **Cloud sync** | Sign in with Google; live two-way sync to *your own* free Firebase project — your data never touches anyone else's server |
| **Design** | Quiet-luxury aesthetic: warm neutrals, restrained gold, dark & light themes (`⌘⇧L`), buttery micro-interactions |

## 🚀 Run it

```bash
npm install
npm run dev      # → http://localhost:5180
npm run build    # type-checks + builds to dist/
```

## 🤖 Zenith AI — one key, set once, works for everyone

There's no "bring your own key" — the app calls a server-side proxy
(`/api/ai`) using **your** Gemini key, so every visitor just gets a working AI
assistant with nothing to configure. Deploying your own copy? Set
`GEMINI_API_KEY` — see [`BACKEND.md`](./BACKEND.md).

## 🔌 Connected apps (optional, Composio)

Let Zenith AI act on real tools for a signed-in user — "what's on my calendar
tomorrow", "email the team a summary of this page", "file a Linear issue for
this." Reads run immediately; anything that changes something outside Zenith
always asks for confirmation first. Setup: [`COMPOSIO.md`](./COMPOSIO.md).

## ☁️ Enable cloud sync (your own free Firebase, ~2 minutes)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Create project** (free Spark plan).
2. **Build → Authentication** → enable the **Google** provider. **Build → Firestore** → create a database.
3. **Project settings → Your apps → Web** → copy the config object.
4. In Zenith: **Settings → Cloud sync** → paste config → **Sign in with Google**.

Zenith live-syncs pages, blocks and comments to `users/{you}/…` in **your** Firestore —
multi-device, last-write-wins, local-first. Suggested security rules are shown in-app.

## ▲ Deploy on Vercel

The frontend is a static SPA (`vite build` → `dist/`) with a serverless
backend in [`/api`](./api); `vercel.json` at the repo root wires both up.

```bash
npx vercel deploy --prod   # from the repo root
```

…or just import the repo in the Vercel dashboard — zero extra config needed.
See [`BACKEND.md`](./BACKEND.md) and [`COMPOSIO.md`](./COMPOSIO.md) for the
environment variables that turn on cloud accounts, AI, email and connected apps.

## 🏛 Architecture

- **React 18 + TypeScript (strict) + Vite** — no heavyweight editor framework; the block engine is custom contenteditable with fractional-index ordering
- **zustand** in-memory store, write-through to **Dexie/IndexedDB**, change-feed → pluggable sync providers
- **highlight.js** (code), **KaTeX** (math), **lucide** (icons) — that's the whole dependency story
- Modules: `lib/` (store, ordering, formulas, export, search, AI, sync) · `components/editor` · `components/database` · `components/ai` · `panels`

> *Intentionally not included:* third-party connectors/integrations (per spec), and real-time multiplayer cursors — Zenith is a single-author instrument, tuned for flow.

---

<div align="center"><sub>Crafted with obsessive restraint. 🥂</sub></div>
