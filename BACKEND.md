# Zenith Cloud Backend

Serverless API (Vercel Functions in [`/api`](./api)) that gives Zenith a real
cloud backend: **account storage with hashed passwords**, **session cookies**, a
**server-side rate-limit “dam”**, and a **daily marketing-email campaign** sent on
a Vercel Cron schedule.

It is **fail-safe**: if the environment variables below are not set, the API
returns clear “not configured” responses and the app automatically falls back to
the built-in local-first accounts — so the site keeps working at every stage.

## Endpoints

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Reports which capabilities are configured (used by the app to feature-detect) |
| `/api/auth/signup` | POST | Create an account (`{name,email,password}`), set session cookie, send welcome email |
| `/api/auth/login` | POST | Verify credentials, set session cookie |
| `/api/auth/me` | GET | Return the current user if the session cookie is valid |
| `/api/auth/logout` | POST | Clear the session cookie |
| `/api/unsubscribe` | GET | One-click unsubscribe from campaigns (`?e=&t=`) |
| `/api/cron/daily-digest` | GET | **Cron only** — emails the daily campaign to all subscribed users |

## Security

- **Passwords** are hashed with **scrypt** (`node:crypto`) + a per-user random salt.
  Plaintext is never stored or logged.
- **Sessions** are stateless HMAC-SHA256 tokens (signed with `AUTH_SECRET`) in an
  **HttpOnly, Secure, SameSite=Lax** cookie.
- **The dam:** every auth route passes through a per-IP token-bucket
  ([`api/_lib/dam.js`](./api/_lib/dam.js)). When a caller overflows their reservoir
  the API replies **429** with `Retry-After` — a surge of traffic is throttled
  instead of hammering the store. (The frontend has a matching client-side dam.)

## Provisioning (≈5 minutes)

Set these in **Vercel → Project → Settings → Environment Variables**, then redeploy.

### 1. Sessions (required for cloud auth)
```
AUTH_SECRET = <a long random string>      # e.g. `openssl rand -hex 32`
```
Without it, cloud auth stays off and the app uses local accounts.

### 2. Account storage — Upstash Redis / Vercel KV (required to persist accounts)
Create a free KV store: **Vercel → Storage → Create → KV (Upstash Redis)** and
“Connect to Project”. Vercel injects these automatically:
```
KV_REST_API_URL
KV_REST_API_TOKEN
```
(Plain Upstash works too via `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.)
Without a store, accounts live in per-instance memory only (non-persistent —
`/api/health` reports `"store":"ephemeral"`).

### 3. Email campaigns — Resend (required to send mail)
Create a free [Resend](https://resend.com) account, verify a sending domain, make
an API key:
```
RESEND_API_KEY  = re_xxxxxxxx
MARKETING_FROM  = Zenith <hello@yourdomain.com>   # must be on your verified domain
APP_URL         = https://your-deployment.vercel.app
```
Until set, signups succeed but no email is sent (`/api/health` → `"email":false`).

### 4. Daily campaign cron
Already declared in [`vercel.json`](./vercel.json):
```json
"crons": [{ "path": "/api/cron/daily-digest", "schedule": "0 14 * * *" }]
```
Runs every day at 14:00 UTC. Optionally lock the endpoint:
```
CRON_SECRET = <random string>     # Vercel sends it as the cron Authorization header
```

## The campaign

[`api/_lib/email.js`](./api/_lib/email.js) holds the brand-styled, email-safe
templates — **welcome**, **daily digest** (a rotating “tip of the day”),
**product update**, and **re-engagement** — plus the tip rotation the cron uses.
Every email carries a working **unsubscribe** link.

> **Compliance:** only registered users are emailed, each message includes an
> unsubscribe link, and mail is sent from *your* verified domain. Ensure you have
> consent and honor opt-outs (CAN-SPAM / GDPR) before enabling daily sends.

## Verify after deploy
```bash
curl https://<your-deployment>/api/health
# → {"ok":true,"auth":true,"store":"persistent","email":true,...}
```
