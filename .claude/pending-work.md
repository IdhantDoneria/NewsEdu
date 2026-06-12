# Pending work queue

The midnight-resume agent reads this file after your Claude limits reset.
Add anything you were in the middle of (or want picked up overnight) as an
**unchecked** task. The agent works items top-to-bottom, ticks them off when
done, and notes what it did. Anything already checked `- [x]` is ignored.

Keep each task self-contained: say *what* to build and *where*, and link any
relevant file. The more specific the task, the better the overnight result.

> Big features are broken into small, self-contained chunks below — one chunk
> should be finishable in a single overnight run. The agent does as many as it
> can per night, then posts a GitHub issue summarising what's done, what's
> left, and anything that needs you (see `.claude/automation/README.md`).

## Project A — "Lumina" luxury note-taking app (Notion-like)

Built in-repo under `apps/lumina/` (CI can't create a separate GitHub repo —
that, plus the Vercel deploy, is flagged as an "action needed" in the report).
Pick the final product name if "Lumina" doesn't fit; keep it striking + premium.

- [x] Scaffold `apps/lumina/` as a standalone Next.js + TypeScript + Tailwind app with its own package.json, a minimalist luxury landing shell, and a README. Must build with its own `npm run build`.
  - Done 2026-06-12: Next.js 15 + TS + Tailwind v4 app in `apps/lumina/` with an ivory/gold luxury design system, animated landing page and README; `npm run build` green.
- [ ] Lumina: data model + a localStorage persistence layer; page create/read/update/delete with titles and icons.
- [ ] Lumina: block-based editor — paragraph, H1–H3, bulleted/numbered/to-do lists, with keyboard navigation between blocks.
- [ ] Lumina: nested pages — collapsible sidebar tree, breadcrumbs, and sub-page links inside a page.
- [ ] Lumina: advanced blocks — toggle, callout, quote, code (with syntax highlight), divider, and image (by URL).
- [ ] Lumina: slash "/" command menu to insert blocks, plus markdown shortcuts (#, -, [], ``` ).
- [ ] Lumina: database/table view with typed properties (text, select, date, checkbox) and add/delete rows.
- [ ] Lumina: global search + a Cmd-K quick switcher across pages.
- [ ] Lumina: final minimalist-luxury visual polish — refined type scale, spacing, light/dark themes, subtle motion.
- [ ] Lumina (optional, skip if no key): AI assist (summarise / continue writing) via a free Google AI Studio API, gated behind an env var; if the key/flow blocks development, stub it and move on.
- [ ] Lumina (needs you): cloud sync that stores user data via the user's Gmail/Google account. Design it and stub the interface; real Google OAuth needs your credentials, so leave a note describing exactly what you need to provide. Fall back to localStorage if unavailable.

## Project B — 30-second Remotion advert for Lumina

- [ ] Scaffold `apps/lumina-ad/` as a Remotion project with its own package.json.
- [ ] Lumina-ad: build a polished ~30s composition advertising the note app — premium, high-end, efficient code; renderable via Remotion.

## Project C — Maharashtra Jr College Grade 11 notes website

Source material (Google Drive) and the subjects image are NOT reachable from CI,
so build the structure + reusable templates with clearly-marked placeholder
content; flag "needs Drive access" for the actual notes.

- [ ] Scaffold `apps/mh-grade11/` as a Next.js app with subject → chapter → topic routing. Drive source: https://drive.google.com/drive/folders/1aQVoVV1XhTWGPr_L708sEghXEdIf5RQl
- [ ] mh-grade11: a per-topic note template with sections for detailed notes, a flowchart, tips & tricks, and acronyms; wire up one fully worked example topic, leaving the rest as placeholders pending the Drive content.

<!-- Add tasks below using the "- [ ] ..." checkbox format. Examples (the ">"
     prefix is only so these samples aren't picked up as real tasks — your real
     tasks should start with "- [ ]"):

     > - [ ] Finish the "Refresh now" spinner in components/Dashboard.jsx — show
     >       a spinner and disable the button while the fetch is in flight.
     > - [ ] Add a unit test for the freshness decay in lib/score.js.
-->

<!-- The agent appends a short note under each item it completes. -->
