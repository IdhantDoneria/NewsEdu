# Zenith × Razorpay — Billing Setup Runbook

Everything you must provide to make the **Pro** and **Studio** subscriptions go
live, and exactly where to get each value. Tiers & prices come from
[`PRICING.md`](./PRICING.md). Code lives in [`api/billing/`](./api/billing) and
[`zenith/src/lib/billing.ts`](./zenith/src/lib/billing.ts).

> Billing reuses the account backend, so the **auth + KV** variables from
> [`BACKEND.md`](./BACKEND.md) must also be set, or upgrades can't be tied to a user.

---

## A. The exact environment variables to add

Add all of these in **Vercel → your project → Settings → Environment Variables**
(Production + Preview), then redeploy.

### 1. Razorpay credentials
| Variable | Example | Where to get it |
|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_live_XXXXXXXX` | Razorpay Dashboard → **Account & Settings → API Keys** → *Generate Key* → copy **Key Id**. (Use `rzp_test_…` from **Test Mode** first.) |
| `RAZORPAY_KEY_SECRET` | `xxxxxxxxxxxxxxxx` | Shown **once** at the moment you generate the Key Id above. Regenerate if lost. |
| `RAZORPAY_WEBHOOK_SECRET` | a random string you choose | You type this when creating the webhook (section C). Use the same value in both places. |

### 2. Razorpay plan IDs (one per tier × cycle)
Create 4 subscription plans (section B) and paste their IDs:
| Variable | Plan to create | Amount |
|---|---|---|
| `RAZORPAY_PLAN_PRO_MONTHLY` | Pro, monthly | ₹399 / month |
| `RAZORPAY_PLAN_PRO_ANNUAL` | Pro, yearly | ₹3,999 / year |
| `RAZORPAY_PLAN_STUDIO_MONTHLY` | Studio, monthly | ₹799 / month |
| `RAZORPAY_PLAN_STUDIO_ANNUAL` | Studio, yearly | ₹7,999 / year |

Each value is a plan id like `plan_PXXXXXXXXXXXXX` from **Subscriptions → Plans**.

### 3. Required dependencies (from BACKEND.md — also needed)
| Variable | Where to get it |
|---|---|
| `AUTH_SECRET` | Any long random string. Generate: `openssl rand -hex 32`. |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Vercel → **Storage → Create Database → KV (Upstash Redis)** → *Connect to Project* (injected automatically). |

### 4. Optional
| Variable | Purpose |
|---|---|
| `APP_URL` | Your public URL (e.g. `https://zenith.app`) — used in emails/links. |
| `RESEND_API_KEY`, `MARKETING_FROM` | Welcome/marketing emails (see BACKEND.md). |

---

## B. Create the 4 subscription plans (one-time)

1. In the Razorpay Dashboard, switch to **Test Mode** first (top toggle).
2. Enable the **Subscriptions** product if prompted (Razorpay → Subscriptions).
3. Go to **Subscriptions → Plans → Create Plan** and make four:

| Plan name | Billing cycle | Amount (INR) |
|---|---|---|
| Zenith Pro – Monthly | Monthly, every 1 month | ₹399 |
| Zenith Pro – Annual | Yearly, every 12 months | ₹3,999 |
| Zenith Studio – Monthly | Monthly, every 1 month | ₹799 |
| Zenith Studio – Annual | Yearly, every 12 months | ₹7,999 |

4. Copy each **Plan Id** (`plan_…`) into the matching env var from A.2.

> The amounts here **must match** the display prices in
> `zenith/src/lib/plans.ts`. If you change prices, update both.

---

## C. Create the webhook (one-time)

1. Razorpay Dashboard → **Account & Settings → Webhooks → Add New Webhook**.
2. **Webhook URL:** `https://<your-deployment-domain>/api/billing/webhook`
3. **Secret:** the same string you put in `RAZORPAY_WEBHOOK_SECRET`.
4. **Active events** — tick these:
   - `subscription.activated`
   - `subscription.charged`
   - `subscription.completed`
   - `subscription.cancelled`
   - `subscription.halted`
   - `subscription.pending`
   - `payment.failed`
5. Save. Razorpay will start posting events; the endpoint verifies the
   signature and (as a fallback) re-fetches the subscription from Razorpay
   before changing anyone's plan.

---

## D. Go-live checklist

1. **Test mode first:** set the `rzp_test_…` keys + test plan ids, deploy, and run
   an upgrade using a [Razorpay test card](https://razorpay.com/docs/payments/payments/test-card-details/)
   (e.g. `4111 1111 1111 1111`, any future expiry/CVV). Confirm the plan flips to
   active in **Settings → Plan & billing**.
2. **Activate the account:** complete Razorpay **KYC/Activation** to enable Live
   Mode (Dashboard → Account & Settings → Account Activation).
3. **Swap to live:** replace the four env vars in A.1–A.2 with **Live Mode**
   values (new live keys + live plan ids + live webhook), redeploy.
4. **Verify:** `curl https://<domain>/api/billing/config` →
   `{"enabled":true, ... "plansReady":{"pro":true,"studio":true}}`.

---

## E. How the money flow works (for reference)

```
User clicks Upgrade (Settings → Plan, or sidebar → Upgrade)
  → POST /api/billing/subscribe  (creates a Razorpay subscription for the user)
  → Razorpay Checkout opens (UPI / card / netbanking / wallet)
  → on success → POST /api/billing/verify  (HMAC signature check → plan = active)
  → Razorpay webhooks keep status in sync (renewals, cancellations, failures)
Cancel → POST /api/billing/cancel  (cancels at end of cycle)
```

**TL;DR — paste these 9 values into Vercel:** `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_PRO_MONTHLY`,
`RAZORPAY_PLAN_PRO_ANNUAL`, `RAZORPAY_PLAN_STUDIO_MONTHLY`,
`RAZORPAY_PLAN_STUDIO_ANNUAL`, `AUTH_SECRET`, + a connected **KV** store.
