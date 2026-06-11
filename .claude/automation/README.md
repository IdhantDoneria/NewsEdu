# Midnight resume — overnight auto-continue

This repo runs a scheduled agent that wakes up **after your Claude limits reset
at midnight (IST)** and continues any development you left unfinished. If there
is nothing pending, it does nothing.

## Why this exists

When you hit your Claude usage limit, it resets around midnight — but that's
when you're asleep. This workflow spends the freshly-reset quota for you,
finishing queued-up work overnight, so it's ready when you wake up.

## One-time setup

The agent authenticates with your **Claude subscription** (not a paid API key),
so it draws from the exact quota that resets at midnight.

1. On your machine, generate a long-lived token:
   ```bash
   claude setup-token
   ```
   Copy the token it prints.

2. In GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**
   - Name: `CLAUDE_CODE_OAUTH_TOKEN`
   - Value: the token from step 1

That's it. The schedule is already wired up in
`.github/workflows/midnight-resume.yml`.

## How it decides what to work on

Each run checks three sources of "unfinished work". If **any** has something
pending, Claude runs; otherwise the run exits quietly.

| # | Source | How to queue work there |
|---|--------|--------------------------|
| 1 | `.claude/pending-work.md` | Add an unchecked `- [ ]` task. |
| 2 | Open GitHub issues labelled **`auto`** | Open an issue, apply the `auto` label. |
| 3 | Open **draft** pull requests | Leave a PR as a draft; the agent finishes it. |

When Claude finishes a queue task it ticks the box (`- [x]`) and writes a short
note. For draft PRs it pushes to the same branch so the PR just updates. For new
work it opens a **draft** PR for you to review in the morning.

## Schedule

Currently set to **03:00 IST** (`30 21 * * *` UTC) — comfortably after the
midnight reset has landed. To change it, edit the `cron:` line in
`.github/workflows/midnight-resume.yml`. GitHub cron is always in UTC, so
subtract 5h30m from your desired IST time.

> Note: GitHub's scheduled workflows can start a few minutes late under load,
> and only run on branches that exist on the default branch. Make sure this
> workflow is merged to `main` for the schedule to take effect.

## Test it without waiting for midnight

Go to **Actions → Midnight resume → Run workflow**. Tick **force** to make
Claude run even when nothing is queued, so you can confirm the token and
permissions work end-to-end.

## Safety

- Never commits to `main` — always a branch + draft PR.
- Runs `npm run build` / `npm run lint` and won't push a broken build.
- Skips ambiguous or risky tasks and leaves a note instead of guessing.
- `--max-turns` is capped so a single run can't loop forever.
