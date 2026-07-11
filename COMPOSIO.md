# Zenith × Composio — Connected Apps Setup

Lets Zenith AI look things up and take action in real tools on a signed-in
user's behalf — Gmail, Google Calendar, Slack, Linear, Notion, GitHub, and
Todoist. Fully optional and fail-safe: without `COMPOSIO_API_KEY`, the
Settings → **Connections** tab and the "Manage tasks with connected apps" AI
action both show a clear "not set up" message instead of breaking anything.

Code lives in [`api/composio.js`](./api/composio.js),
[`api/_lib/composio.js`](./api/_lib/composio.js) (connection + tool-execution
helpers), and the tool-calling round inside [`api/ai.js`](./api/ai.js).

> Composio needs the **auth + KV** variables from [`BACKEND.md`](./BACKEND.md)
> too, since a "connected account" is tied to a signed-in Zenith user by email
> — guests can't connect apps.

## How it stays safe

Every tool call is classified as **read** (search, list, get) or **write**
(send, create, delete, update…). Reads run immediately when the AI proposes
them. Anything classified as a write is **never executed automatically** — the
AI instead returns a proposed action, Zenith shows the user exactly what it
wants to do, and only `POST /api/composio?action=execute` with an explicit
`confirm:true` (sent after the user clicks **Run**) actually performs it.

## A. The exact environment variables to add

Add these in **Vercel → your project → Settings → Environment Variables**,
then redeploy. All except the first are optional — add only the toolkits you
want available.

| Variable | Where to get it |
|---|---|
| `COMPOSIO_API_KEY` | [composio.dev](https://composio.dev) → sign up (free) → Dashboard → **API Keys** → create one |
| `COMPOSIO_AUTHCONFIG_GMAIL` | Dashboard → **Auth Configs → Create** → pick **Gmail** → "Composio managed" → copy the config id (`ac_…`) |
| `COMPOSIO_AUTHCONFIG_SLACK` | Same flow, pick **Slack** → "Composio managed" |
| `COMPOSIO_AUTHCONFIG_NOTION` | Same flow, pick **Notion** → "Composio managed" |
| `COMPOSIO_AUTHCONFIG_GITHUB` | Same flow, pick **GitHub** → "Composio managed" |
| `COMPOSIO_AUTHCONFIG_GOOGLECALENDAR` | Needs **your own** Google OAuth app first — see B below |
| `COMPOSIO_AUTHCONFIG_LINEAR` | Needs **your own** Linear OAuth app first — see B below |
| `COMPOSIO_AUTHCONFIG_TODOIST` | Needs **your own** Todoist OAuth app first — see B below |

Skip any row you don't want — that toolkit just won't appear as connectable
(`/api/composio?action=config` reports each toolkit's `ready` status).

## B. Toolkits needing your own OAuth app

Gmail, Slack, Notion, and GitHub have a **Composio-managed** app — the table
above is all you need for those. Google Calendar, Linear, and Todoist don't;
each requires registering an OAuth app with that provider, then wiring its
client id/secret into a **custom** Composio Auth Config:

1. Register an OAuth app with the provider (Google Cloud Console for Calendar,
   Linear's workspace **Settings → API → OAuth applications**, Todoist's **App
   Console**) and set its redirect URI to whatever Composio's dashboard shows
   you when you start step 2 below.
2. Composio Dashboard → **Auth Configs → Create** → pick the toolkit → choose
   **"Use my own OAuth app"** → paste the client id/secret from step 1 → save.
3. Copy the resulting config id into the matching `COMPOSIO_AUTHCONFIG_*`
   variable above.

## C. Pricing

Composio's free tier: **20,000 tool calls/month, no card required** — plenty
for a personal or small-team workspace. Paid tiers start at $29/mo for 200K
calls if you outgrow it. Check [composio.dev/pricing](https://composio.dev/pricing)
for current numbers before a large rollout.

## D. Verify after deploy

```bash
curl https://<your-deployment>/api/composio?action=config
# → {"enabled":true,"toolkits":[{"slug":"GMAIL","name":"Gmail","ready":true}, ...]}
```

Then, signed in as a real (non-guest) account: Settings → **Connections** →
**Connect** next to a ready toolkit → complete the OAuth popup → it should
flip to "Connected" within a couple seconds. From any page, open the AI menu
→ **Manage tasks with connected apps** → try something like "what's on my
calendar tomorrow" (read, runs immediately) or "email the team a summary of
this page" (write, asks for confirmation first).

**TL;DR:** paste `COMPOSIO_API_KEY` plus whichever `COMPOSIO_AUTHCONFIG_*`
values you want into Vercel — Gmail/Slack/Notion/GitHub take five minutes
each, Calendar/Linear/Todoist need you to register an OAuth app with that
provider first.
