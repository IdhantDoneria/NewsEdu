# Lumina

A minimalist **luxury workspace** for notes, pages and databases — a
Notion-style editor pared back to what matters: your words, your structure,
and room to breathe.

Built with **Next.js (App Router) + TypeScript + Tailwind CSS v4**.

## Running it

```bash
cd apps/lumina
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Layout

| Route  | What it is                                  |
| ------ | ------------------------------------------- |
| `/`    | Landing page                                |
| `/app` | The workspace (sidebar, pages, editor)      |

## Architecture

- `src/lib/model.ts` — data model (pages, blocks) and pure helpers.
- `src/lib/store.ts` — client-side store with a localStorage persistence
  layer (`useSyncExternalStore`-based; no external state library).
- `src/components/` — workspace UI: sidebar, editor, blocks.

All data is stored locally in the browser (`localStorage`). Cloud sync via a
Google account is designed but stubbed — see `src/lib/sync.ts` for what
credentials are required to enable it.

## Deploying

This app is self-contained. To deploy on Vercel, set the project's
**Root Directory** to `apps/lumina` (or move it to its own repository).
