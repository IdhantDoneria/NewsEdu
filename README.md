# YojanaScan

**Government scheme eligibility engine for Indian MSMEs.** Answer 10 questions, get a deterministic verdict across hand-encoded central + Maharashtra schemes — benefit amounts, document checklists, application links, and a last-verified date on every rule. Free teaser, ₹499 full report.

> India runs 100+ MSME schemes. Consultants charge ₹10,000–50,000 just to say which ones apply. Government portals list schemes but can't answer *"which apply to my business?"* — that's the gap this sells into.

## Why this isn't an AI wrapper

The moat is **data, not AI**: every scheme's eligibility (entity type, sector, turnover/investment bands, Udyam status, ownership category, new-vs-existing unit) is hand-encoded as machine-readable conditions in [`data/schemes.json`](data/schemes.json), researched from official government portals.

- **Matching is deterministic.** `lib/engine/evaluate.ts` walks each scheme's rule tree against your answers. Same answers → same verdict, every time, with a condition-by-condition trace.
- **The LLM only narrates.** The optional Claude call writes the plain-language opening of the paid report from results the engine already computed. It cannot hallucinate you into (or out of) a scheme. No API key → deterministic template, product fully works.
- **Honest coverage.** Central schemes + ONE state (Maharashtra) at launch. Every scheme card shows `lastVerified` and source links. Pan-India on day one would be fake.

## Product flow

```
Landing (3D hero) → /scan (10 questions) → /results (free teaser:
match count + benefit ceiling + 1 unlocked scheme, rest blurred)
→ ₹499 checkout (Razorpay, or demo mode) → /report (full deliverable,
print-ready PDF) — plus near-misses: "fix one thing, unlock N more"
```

## Stack

- **Next.js 16 / React 19 / TypeScript** — App Router, custom CSS design system (no UI framework)
- **three.js + react-three-fiber** — interactive hero: ~7k particles assemble into the ₹ glyph, repel around the cursor; respects `prefers-reduced-motion`, degrades without WebGL
- **Razorpay** — order creation + HMAC signature verification (`/api/checkout`, `/api/verify`); clean demo mode when keys are absent
- **@anthropic-ai/sdk** — optional report narration (`/api/narrate`)
- **vitest** — engine + data integrity tests

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine + schemes.json integrity tests
npm run build      # production build
```

Works with zero configuration (demo checkout, template narration). For production:

```bash
cp .env.example .env.local
# RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET  -> real ₹499 payments
# ANTHROPIC_API_KEY                      -> Claude-narrated report opening
```

## Repository map

```
data/schemes.json       THE data moat — encoded eligibility rules per scheme
data/sources.md         research provenance: what was verified where & when
lib/engine/             deterministic rule engine (types, evaluator, formatter)
lib/questions.ts        the 10-question intake definition (drives the wizard)
app/page.tsx            landing
app/scan/               intake wizard
app/results/            free teaser + paywall
app/report/             the ₹499 report (print = PDF)
app/api/checkout        Razorpay order / demo unlock
app/api/verify          payment signature verification
app/api/narrate         Claude narration (optional)
components/three/       3D hero scene
tests/engine.test.ts    engine behaviour + data integrity (CI gate)
```

## Encoding a new scheme

1. Research the official portal/guidelines; capture benefit slabs, hard criteria, negative list, documents, application URL.
2. Add an entry to `data/schemes.json`: rule tree over the fact set (`lib/engine/types.ts`), `softChecks` for anything the 10 questions can't verify, `sources` (mark official ones), `lastVerified` (the date YOU verified, not today's date), `confidence`.
3. `npm test` — integrity tests enforce documents/steps/sources/verified-date and that the scheme is actually matchable.

Adding a state = adding schemes with `"level": "state"` + a state option in `lib/questions.ts`. No engine changes.

## Accounts & OTP sign-in

YojanaScan uses a **stateless, database-free** email-OTP flow for V1.

**How it works**

- OTPs are HMAC-SHA256-derived from `AUTH_SECRET + email + 5-minute window index` — no OTP table, no Redis.  Two consecutive 5-minute windows are accepted (≈10 min total validity).
- Sessions are signed cookies (`ys_session`): `base64url(JSON payload) + "." + HMAC-SHA256 signature`.  Payload: `{email, paid, iat}`.  30-day maxAge, httpOnly, sameSite lax.

**Gmail app-password setup**

1. Enable 2-Step Verification on your Google Account.
2. Go to Account → Security → App passwords, generate one for "Mail".
3. Remove all spaces from the 16-char password.
4. Set `GMAIL_USER` (your Gmail address) and `GMAIL_APP_PASSWORD` in `.env.local`.

**Demo mode (no credentials)**

When `GMAIL_USER` / `GMAIL_APP_PASSWORD` are absent, `POST /api/auth/request-otp` returns `{ok:true, mode:"demo", devOtp:"XXXXXX"}` and the login UI shows the code in a chip.  The full sign-in/pay/report flow works without any email credentials.

**Payment binding**

After a valid Razorpay payment (`/api/verify`), if a session cookie is present it is re-sealed with `paid:true`.  `/report` accepts either the sessionStorage unlock token (existing flow) or a `paid:true` session cookie — whichever is present.

**V1 honesty note**

No database is used.  Payment status is cookie-scoped — if the user clears cookies they must pay again unless a server-side receipt store is added.  Suitable for V1/demo; harden before production billing.

## V1 honesty notes (production hardening)

- **Report gating is client-side** (sessionStorage token after payment verification). Fine for V1/demo; production should persist payments server-side and gate `/report` by receipt lookup.
- **No database** — scans are anonymous and stateless by design; add persistence only when you add accounts/receipts.
- **Data freshness is the product.** Re-verify schemes on a schedule; the `lastVerified` badge is a feature, keep it honest.

## Disclaimer

YojanaScan is an independent screening tool, not a government body. Final eligibility rests with the implementing agency/lender. Scheme parameters change; verify against the linked official sources before applying.
