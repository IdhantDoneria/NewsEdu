# Zenith — Pricing & Monetization Strategy

**A 3-tier pricing recommendation for Zenith, a Notion-class all-in-one workspace.**
Prepared 2026-06-13 · INR-first (Razorpay), USD secondary · Evidence-based, sources cited inline.

---

## 0. Executive summary (TL;DR)

Zenith should ship **three tiers — a genuinely useful Free, a flagship paid "Pro," and a top "Studio"** — priced in INR-first charm/round-luxury points, with a ~17% ("2 months free") annual discount.

| Tier | Persona | Monthly (INR / USD) | Annual (INR / USD) | One-liner |
|---|---|---|---|---|
| **Zenith Free** | Curious individual, student, evaluator | ₹0 / $0 | ₹0 / $0 | "Your second brain, on the house." |
| **Zenith Pro** | Prosumer, solo knowledge worker, freelancer | **₹399 / $7.99** | **₹3,999 / $79** | "Quiet luxury for your whole workspace." |
| **Zenith Studio** | Power user, creator, consultant, light team-of-one+ | **₹799 / $14.99** | **₹7,999 / $149** | "Unlimited everything, managed AI, white-glove." |

**Why this shape:** Zenith is **single-author, local-first, no real-time multiplayer yet** — so it cannot credibly sell *per-seat collaboration* the way Notion/Coda do. The honest, defensible monetization levers are **(1) managed AI** (we host the key so users don't need their own Gemini key), **(2) cloud accounts + sync depth + storage/files**, **(3) version-history depth + unlimited databases/pages**, and **(4) support + early access to multiplayer**. That maps cleanly onto a prosumer "Pro" anchor and a "Studio" ceiling, with Free as the funnel.

The two paid tiers (**Pro, Studio**) need Razorpay subscription plans (4 plan objects total: monthly + annual each). Free needs none.

---

## 1. Competitor pricing landscape (fetched, current as of June 2026)

All figures are **per user/seat unless noted**, and reflect the **standalone individual/prosumer** offering most comparable to Zenith. Monthly = billed monthly; Annual = effective per-month when billed annually.

| Product | Model | Free tier | Paid entry (monthly) | Paid entry (annual eff.) | Higher tier | AI pricing | What's gated / notes |
|---|---|---|---|---|---|---|---|
| **Notion** | Per-seat SaaS | Yes — 5 MB file cap, 7-day history, 10 guests | **Plus $10** | **Plus $8** (save ~20%) | **Business $20 mo / $15 ann** | AI **no longer a standalone add-on**; bundled into **Business** (full AI), Free/Plus get a "limited trial". Custom Agents: **$10 per 1,000 monthly credits** | File uploads, history depth (7/30/90 days), guests, private teamspaces, granular DB permissions, AI all gate upward |
| **Coda** | Per-**Doc-Maker** (editors/viewers free) | Yes | **Pro $12** | **Pro $10** (~17% off) | **Team $36 mo / $30 ann** | AI credits bundled by tier | Only doc *makers* are billed; automations, integrations, storage gate up |
| **Craft** (craft.do) | Subscription | Yes — ~1,500 blocks, 1 GB | **Personal ~$4.79** | annual saves more (occasional 50% promos) | "Friends & Family" ~$8.99 | Some AI included | Unlimited docs/blocks, storage gate up |
| **Capacities** | Subscription | **Generous** — unlimited notes/objects, sync, 5 GB media | **Pro $11.99** | **Pro $9.99** (~17% off) | **Believer $14.99 mo / $12.49 ann** (same features, "support the devs") | AI assistant + priority support in Pro | Unlimited storage, AI, priority support gate up; Believer is a *patronage* tier, not more features |
| **Anytype** | Annual-only "network" plans | Yes — 1 GB, 3 shared spaces | — (no monthly) | **Builder $99/yr** (~$8.25/mo) | **Co-Creator $299/yr** | Local AI / BYO | Network storage (1 GB → 128 GB → 256 GB), shared-space capacity gate up. **No monthly option** |
| **Obsidian** | App free + à-la-carte add-ons | App **free** for personal use | **Sync $4–5** / **Publish $8–10** | Sync/Publish save ~20% annually | — | No first-party AI; community plugins + BYO key | Multi-device **Sync** and **Publish** (per site) are the only paid things; everything else free |
| **Evernote** | Subscription | Limited free | **Starter ~$8.25** (≈$99/yr) | ~$99/yr | **Teams $24.99** | AI features bundled in paid | Heavy historical price increases; legacy Professional ~$15.99/mo |
| **Microsoft Loop** | Bundled in M365 | **Free** for personal/M365 accounts | n/a (comes with M365) | n/a | — | Copilot sold separately at org level | Not sold standalone; storage tied to M365 |
| **AppFlowy** | Per-seat (open source) | Yes — unlimited pages/blocks, 5 GB, **10 AI responses/mo** | **Pro $12.50** | **Pro $10** (~20% off) | (team seats) | **AI metered**: 10/mo free → unlimited in Pro + 50 AI images/mo | AI responses, storage, members, file uploads gate up |
| **Logseq** | Free app + supporter | **Free** (all features) | **Supporter $5 or $15/mo** (donation) | — | — | BYO / plugins | Only **Sync** early-access gates behind supporter donation |
| **Reflect** | Flat subscription | Trial only | **$10** (flat) | annual discount | — | **AI included** (GPT-class) in the price | Positioned as "AI notes for solo knowledge workers"; no real free tier |
| **Mem** | Subscription | Limited | **~$14.99** (also seen ~$10–12) | annual discount | — | AI-native, included | AI search/chat is the core paid value |
| **Tana** | Per-seat + AI credits | Yes — **500 AI credits/mo**, 0.5 GB, 5 Supertags | **Plus $10** (2,000 credits) | annual discount | **Pro $18** (5,000 credits) | **AI credits** are the metered lever (500 → 2,000 → 5,000) | Supertag cap (the core feature!) + AI credits + storage gate up |
| **Twos** | Subscription | Yes | **Twos Plus ~$1.67** (annual) → **Premium $4.99** → **Pro $9.99** | annual saves | included by tier | low-cost ladder | Cheap "consumer" ladder, useful as a floor anchor |

**Sources:**
[Notion pricing (official)](https://www.notion.com/pricing) ·
[Notion AND India INR](https://www.itforsme.in/pricing/notion-india/) ·
[Notion AI add-on status](https://felloai.com/notion-ai-pricing/) ·
[Coda pricing](https://aitoolpick.org/blog/coda-pricing-2026/) ·
[Craft pricing](https://www.fahimai.com/craft-review) ·
[Capacities pricing](https://capacities.io/pricing/) ·
[Anytype pricing](https://aiproductivity.ai/pricing/anytype/) ·
[Obsidian pricing](https://aiproductivity.ai/pricing/obsidian/) ·
[Evernote pricing](https://www.eesel.ai/blog/evernote-pricing) ·
[Microsoft Loop pricing](https://www.saasworthy.com/product/microsoft-loop/pricing) ·
[AppFlowy pricing](https://www.saasworthy.com/product/appflowy-io) ·
[Logseq pricing](https://aiproductivity.ai/pricing/logseq/) ·
[Reflect/Tana/Mem](https://aiproductivity.ai/tools/tana/) ·
[Tana plans/credits](https://costbench.com/software/note-taking/tana/) ·
[Twos pricing](https://aichief.com/ai-productivity-tools/twos-app/)

### Reading the field

1. **The prosumer "all-in-one editor + database" sweet spot is ~$8–12/mo** (Notion Plus $8–10, Capacities $10–12, Coda $10–12, AppFlowy $10, Reflect $10, Tana Plus $10). Pure note apps drift cheaper ($4.79–5: Craft, Twos). **Zenith's Pro at $7.99 sits just under the Notion/Capacities cluster** — a deliberate, defensible "premium-but-fair" position.
2. **AI is the new monetization frontier and a sore point.** Notion *removed* the standalone AI add-on and now forces **Business ($15–20)** to get full AI — widely called a "rip-off" ([dev.to](https://dev.to/ii-x/notion-ai-is-a-rip-off-for-power-users-but-a-killer-for-beginners-1ifc)). Tana/AppFlowy meter **AI credits** as the lever. **This is Zenith's biggest opportunity: sell *managed* AI cheaply and transparently.**
3. **Metered AI credits + storage + history-depth are the standard gates.** Almost no one gates the *core editor*. We should keep Zenith's editor fully usable on Free and gate the *operational* dimensions (volume, AI, history, support).
4. **Patronage tiers exist** (Capacities "Believer", Anytype "Co-Creator", Logseq supporter) — proof that a segment will *pay more for the same features* to support an indie product they love. Zenith's "Studio" can carry a light dose of this energy while still adding real value.

---

## 2. Willingness-to-pay (WTP) signals

### 2.1 What users actually say
- **Notion's AI pricing is the loudest complaint.** "$10/month per user for AI on top of your plan… a straight-up rip-off… $120/year just for summarization and basic editing" ([dev.to](https://dev.to/ii-x/notion-ai-is-a-rip-off-for-power-users-but-a-killer-for-beginners-1ifc)). Forcing Business ($15–20) for AI alienates individuals.
- **Unpredictable/usage-based billing scares people.** Reviews cite surprise charges of "$150 and even $200" when they expected $15–30 ([G2 via dev.to](https://dev.to/ii-x/notion-ai-is-a-glorified-search-bar-and-heres-why-its-still-winning-1kl3)). **Lesson: managed AI must be a flat, predictable allowance, not metered overage that surprises.**
- **The PKM/Obsidian crowd is free-first and BYO-AI-tolerant.** They like *optionality* — "integrate AI or don't, it's your choice" ([nickmilo](https://nickmilo.substack.com/p/obsidian-just-won), [get-alfred](https://get-alfred.ai/blog/best-ai-note-taking-apps)). **Zenith's existing BYO-Gemini-key path is a genuine asset for this segment — keep it on Free.**
- **But a real segment happily pays ~$10/mo for built-in AI notes** (Reflect $10, Mem ~$15) "for focus" ([get-alfred](https://get-alfred.ai/blog/best-ai-note-taking-apps)). That validates a **managed-AI Pro at ₹399/$7.99**.
- **79% of Notion G2 reviewers give 5 stars** ([G2](https://learn.g2.com/is-notion-worth-it)) — the category is *loved*; people pay when value is obvious and pricing is fair. The complaint is **value-per-dollar on AI**, not subscriptions per se.

### 2.2 Synthesis: the Zenith WTP map
| Segment | Will pay | Won't pay for | Zenith hook |
|---|---|---|---|
| Student / evaluator (esp. India) | ₹0, maybe ₹199 if cheap | per-seat, surprise AI bills | Free w/ BYO-key AI; cheap Pro |
| Prosumer / solo knowledge worker | ₹399–599 / $7–12 for *managed* AI + cloud + unlimited | $15+ "team" plans they don't need | **Pro** — managed AI, no key hassle, unlimited |
| Power user / creator / consultant | ₹799–999 / $15 for "everything + priority + early multiplayer" | enterprise complexity | **Studio** — top AI allowance, white-glove, early access |

---

## 3. India-specific context (Razorpay = India-first)

This is decisive for the **INR** numbers, which are **not** a naive FX conversion of the USD price.

- **Indian WTP is structurally 60–70% lower than Western;** SaaS commonly prices India at **40–60% of US sticker**, and the recommended **India:international ratio is 3–5× for B2C/prosumer** ([Playto](https://www.playto.so/blogs/how-to-price-your-saas-for-indian-vs-international-customers-in-2026), [EximPe](https://eximpe.com/blog/psp/inr-pricing-for-global-saas-should-you-charge-indian-customers-in-rupees)). A naive $7.99 → ~₹670 conversion would *overprice* India. **Zenith Pro at ₹399 is a deliberate ~6× discount vs the $7.99 USD price** — PPP-correct, and *cheaper than Notion's ~₹670 Plus in India*, which Indian founders publicly complain "will not work for most startups in India" ([Vaibhav Sisinty on X](https://x.com/VaibhavSisinty/status/1655485430698213378)).
- **INR + domestic gateway (Razorpay) dramatically lifts recurring-payment success** via **UPI AutoPay** and **Netbanking e-Mandates**, versus Indian cards which fail often ([EximPe](https://eximpe.com/blog/psp/inr-pricing-for-global-saas-should-you-charge-indian-customers-in-rupees), [productgrowth.in](https://productgrowth.in/insights/saas/saas-pricing-rupee-vs-dollar/)). **Billing Zenith in INR via Razorpay is a conversion feature, not just a currency choice.**
- **UPI AutoPay standard cap is ₹15,000/transaction** (higher for some categories) — Zenith's prices are far below, so **UPI AutoPay is the ideal default mandate**; offer **e-NACH** as fallback ([Razorpay UPI AutoPay guide](https://razorpay.com/blog/master-recurring-payments-upi-autopay-guide/), [Razorpay vs e-mandate](https://razorpay.com/blog/upi-autopay-vs-card-e-mandates/)).
- **India responds to promos and longer trials.** "Constant promotional pricing drives 74% higher purchase intent" in B2C/prosumer; **21–30 day trials/free periods** beat 7–14 day ones in risk-averse India ([Playto](https://www.playto.so/blogs/how-to-price-your-saas-for-indian-vs-international-customers-in-2026), [upGrowth](https://upgrowth.in/saas-pricing-packaging-strategy-india-gtm/)).
- **Student/India discount norms:** 40–50% student discounts are standard (Tana 50% student, Evernote 40% student). Recommend a **₹199 student Pro** (see §4.4).
- **GST/reverse-charge friction with foreign vendors** (Notion bills US, Indian businesses self-assess 18% RCM) is a pain point Indian buyers feel ([itforsme](https://www.itforsme.in/pricing/notion-india/)). **A local INR invoice from Zenith via Razorpay is a quiet advantage** — show GST-inclusive pricing.

**Net:** INR points are anchored at **prosumer-friendly round/charm values (₹199 / ₹399 / ₹799)** that clear UPI AutoPay easily and undercut Notion-in-India, while the **USD points ($7.99 / $14.99)** hold a premium global position.

---

## 4. AI cost reality → what "managed AI" must charge

Zenith's AI is currently **bring-your-own Gemini key** (zero cost to Zenith). The monetization upgrade is **managed AI**: Zenith hosts the key so the user doesn't have to. To stay margin-positive, price the allowance above realistic token cost on a **Flash-class** model.

**Gemini Flash-class API pricing (per 1M tokens, fetched June 2026):**
| Model | Input / 1M | Output / 1M |
|---|---|---|
| Gemini 2.5 Flash | **$0.30** | **$2.50** |
| Gemini 2.5 Flash-Lite | **$0.10** | **$0.40** |
| Gemini 2.0 Flash-Lite (cheapest) | $0.075 | $0.30 |

Sources: [AI Cost Check](https://aicostcheck.com/blog/google-gemini-pricing-guide-2026), [devtk.ai](https://devtk.ai/en/models/gemini-2-5-flash/).

**Cost model for a managed-AI user.** A typical AI action (summarize/rewrite/brainstorm) ≈ **2,000 input + 800 output tokens**.
- On **Flash-Lite** ($0.10 in / $0.40 out): 2,000×$0.10/1M + 800×$0.40/1M = **$0.0002 + $0.00032 ≈ $0.00052 per action (~₹0.044)**.
- A **"light/medium" Pro user at ~300 AI actions/month** ≈ **$0.16/mo (~₹13)** on Flash-Lite, or ~$0.46/mo on full 2.5 Flash.
- A **heavy Studio user at ~1,500 actions/month** ≈ **$0.78/mo** (Flash-Lite) to ~$2.3/mo (2.5 Flash).

**Implication:** even on the *better* 2.5 Flash, raw AI cost for a generous allowance is **well under ₹100/mo**. So:
- **Pro (₹399 / $7.99)** can include a **managed-AI allowance (e.g. ~500 "AI credits"/mo, 1 credit = 1 action)** at **>90% gross margin**, while still offering the **free BYO-key** path for unlimited self-funded AI.
- **Studio (₹799 / $14.99)** can include a **much larger allowance (e.g. ~3,000 credits/mo)** and still net huge margin.
- **Guardrail (per the WTP finding):** make the allowance a **flat, predictable monthly bucket**; when exhausted, **degrade to BYO-key or offer a small top-up pack** — never silent metered overage (that's exactly what burned Notion users). Recommended top-up: **₹99 / $1.49 per +500 credits.**
- Use **Flash-Lite as the default managed model** (10×+ cheaper, ample for write/summarize/translate/tone), reserve **2.5 Flash** for Studio "high-quality" mode.

---

## 5. Freemium & annual-discount benchmarks

- **Freemium free→paid converts ~2.6–5.5% median, top performers 8–12%** ([First Page Sage](https://firstpagesage.com/seo-blog/saas-freemium-conversion-rates/), [Artisan](https://www.artisangrowthstrategies.com/blog/saas-conversion-rate-benchmarks-2026-data-1200-companies)). Plan financials around **~4%**.
- **Role/feature gating lifts conversion** — gating admin/collab/power features pushed one cohort to **5.1%** (~2× yield) without raising churn ([Artisan](https://www.artisangrowthstrategies.com/blog/saas-conversion-rate-benchmarks-2026-data-1200-companies)). **→ Gate volume + AI + history + support, not the editor.**
- **Annual discount norm is ~16–20% ("2 months free").** Notion ~20%, Coda/Capacities ~17%, Obsidian ~20%. **Zenith uses ~17% ("2 months free"): ₹399×10 = ₹3,990 → round to ₹3,999; $7.99×10 ≈ $79.90 → $79.** Same logic for Studio.
- **India:** offer a **longer free runway / 30-day Pro trial** to suit risk-averse buyers, plus periodic promos.

---

## 6. The recommendation — EXACTLY 3 tiers

> Design principles: **(1)** Free is genuinely useful (the full editor, local-first, BYO-key AI) so Zenith spreads and gets loved; **(2)** every gate is an *operational* upgrade trigger (volume, managed AI, history depth, support), never a crippled editor; **(3)** charm/round-luxury pricing matching "quiet luxury"; **(4)** INR is PPP-anchored and undercuts Notion-in-India; **(5)** only features Zenith has today or can plausibly add soon.

### 6.1 Zenith Free — "Your second brain, on the house."
**Persona:** student, evaluator, casual individual, Obsidian-style free-first PKM user.
**Price:** ₹0 / $0.

**Included (deliberately generous):**
- **Full block editor** — all 20+ block types, slash menu, markdown shortcuts, @mentions, backlinks/linked references, code+KaTeX, columns, sub-pages, buttons.
- **Databases:** all 6 views + all 18 property types incl. formulas/relations/rollups, filters, sort, grouping, calculations — but **capped at 3 databases** (enough to learn the power, a clear upgrade trigger).
- **Local-first storage:** unlimited pages on-device.
- **Cloud account + sync:** **1 device** + cloud backup (the account backend already exists). *Multi-device sync is the upgrade trigger.*
- **AI: bring-your-own Google Gemini key** — unlimited self-funded write/summarize/translate/tone/brainstorm. **No managed AI credits.**
- **Files:** up to **5 MB/file**, **1 GB** total (matches Notion-Free / Craft-Free norms).
- **Version history:** **7 days**. Comments, trash, templates, export/import, dark mode: included.

**Upgrade triggers (intentional friction):** hitting the 3-database cap; wanting a 2nd device synced; not wanting to manage a Gemini key (managed AI); needing >7-day history or bigger files.

---

### 6.2 Zenith Pro — "Quiet luxury for your whole workspace." ⭐ (anchor / most-popular)
**Persona:** prosumer, solo knowledge worker, freelancer, indie creator — the heart of the market.
**Price:** **₹399/mo · ₹3,999/yr (~17% off, "2 months free")** — **$7.99/mo · $79/yr**.

**Everything in Free, plus:**
- **Unlimited databases & pages** (cap removed).
- **Managed AI** — **~500 AI credits/month** on Zenith-hosted **Gemini Flash-Lite** (write/summarize/translate/tone/brainstorm) with **no API key needed**; flat, predictable allowance. **BYO-key remains available for unlimited extra AI.** Optional top-up **₹99 / $1.49 per +500**.
- **Multi-device cloud sync** (unlimited devices) + cloud backup.
- **Unlimited file uploads**, **5 MB → 50 MB/file**, **50 GB** storage.
- **Version history: 7 → 30 days.**
- **Standard support** (email) + **all templates**.

**Strategic rationale:** Lands at **$7.99 — just under Notion Plus ($8–10) / Capacities ($10–12) / Reflect ($10)** while *including managed AI* that Notion makes you pay $15+ Business for. In India, **₹399 decisively undercuts Notion-in-India (~₹670)** and clears UPI AutoPay trivially. This is the **conversion workhorse**; "most popular" badge here.

---

### 6.3 Zenith Studio — "Unlimited everything. Managed AI. White-glove."
**Persona:** power user, full-time creator, consultant, researcher, "team-of-one-plus" preparing to collaborate.
**Price:** **₹799/mo · ₹7,999/yr (~17% off)** — **$14.99/mo · $149/yr**.

**Everything in Pro, plus:**
- **High AI allowance — ~3,000 AI credits/month**, with **"high-quality" mode on Gemini 2.5 Flash** (vs Flash-Lite) for better long-form/translation. Generous top-ups.
- **Version history: 30 → 90 days.**
- **Storage 50 GB → 200 GB**, **50 MB → 250 MB/file**.
- **Priority support** (front-of-queue) + **onboarding/templates concierge**.
- **Early access to real-time multiplayer / sharing** when it ships (Zenith is single-author today — this is the credible "coming soon" carrot), plus early access to new block types/views.
- A light **patron** signal — "you fund Zenith's independence" (à la Capacities Believer / Anytype Co-Creator), without locking essential features behind it.

**Strategic rationale:** Mirrors the **Notion Business ($15–20) / Tana Pro ($18) / Mem ($15)** ceiling, but for an *individual power user* rather than a team — value is **AI depth + history + storage + white-glove + early multiplayer**, not seats. Captures high-WTP fans and pre-sells the multiplayer roadmap. **₹799** stays comfortably inside UPI AutoPay limits.

---

### 6.4 Add-ons & modifiers (recommended)
- **Student Pro: ₹199/mo (India) / $4.99/mo** with valid student verification — matches Tana/Evernote student norms; huge for India's student-heavy productivity market.
- **AI top-up packs:** **₹99 / $1.49 per +500 credits** (predictable, no surprise overage).
- **30-day Pro free trial** (India-friendly long runway), **opt-in (no card)** to protect brand trust, *or* opt-out via UPI AutoPay to lift conversion — A/B test (opt-out trials convert ~31% vs ~9% opt-in, [ChartMogul/ADV.me](https://adv.me/articles/conversion-optimization/saas-free-trial-conversion-rate-benchmarks-2025/)).
- **Launch promo:** "Founding member — 40% off annual for life" on Pro/Studio (leverages India's promo-responsiveness + builds an evangelist base).

### 6.5 Razorpay implementation note
- **Paid tiers = Pro & Studio.** Create **4 Razorpay Subscription plans**: `pro_monthly` (₹399), `pro_annual` (₹3,999), `studio_monthly` (₹799), `studio_annual` (₹7,999) — plus optional `student_pro_monthly` (₹199) and a one-time `ai_topup_500` (₹99). USD plans mirror these for global checkout.
- Default mandate: **UPI AutoPay**; fallback **card/e-NACH**. All prices < ₹15,000 cap → no AFA friction.
- Show **GST-inclusive INR** pricing (local-invoice advantage over US-billed Notion).

---

## 7. Positioning one-liners (per tier)
- **Free:** *"Your second brain, on the house — the full editor, forever free."*
- **Pro:** *"Quiet luxury for your whole workspace — unlimited everything, managed AI, no API keys."*
- **Studio:** *"For people who live in their workspace — top-tier AI, deep history, white-glove, first in line for multiplayer."*

---

## 8. Upgrade-prompt microcopy (3 examples)
1. **At the 3rd database (Free → Pro):**
   > **You've filled your last free database.** Pro unlocks **unlimited databases & pages** — plus managed AI and multi-device sync. *Go Pro for ₹399/mo (2 months free yearly).* → **Upgrade**
2. **On clicking AI without a key (Free → Pro):**
   > **Skip the setup.** No Gemini key handy? **Zenith Pro** runs AI for you — 500 actions/month of write, summarize & translate, *no keys, no surprise bills.* → **Turn on managed AI**
3. **Second device / 31-day-old version (Pro → Studio):**
   > **Need to reach further back?** Studio extends version history to **90 days**, triples your AI to **3,000 actions/mo** on our highest-quality model, and puts you **first in line for real-time multiplayer.** → **See Studio**

---

## 9. Sensitivity / what to tune
**If conversion is LOW (<~3% free→paid):**
- The Free tier is likely **too generous** — tighten gates: drop Free databases **3 → 2**, file cap **5 MB → 2 MB**, history **7 → 3 days**.
- **Lower the Pro entry barrier** psychologically: lead with **annual** (₹3,999 ≈ "₹333/mo") and run the 40%-off founding promo harder.
- Add **more managed-AI value to Pro** (raise to 750 credits) so the AI upgrade-trigger fires more often — AI cost is trivial (§4).
- Lengthen/strengthen the **trial** and test **opt-out (UPI AutoPay) trials**.

**If conversion is HIGH (>~8%) / low price sensitivity:**
- **Raise Pro** ₹399 → ₹499 and $7.99 → $9.99 (still ≤ Notion/Capacities); raise **Studio** ₹799 → ₹999 / $14.99 → $17.99.
- **Trim Free** managed-AI-adjacent generosity is already nil; instead reduce Free storage 1 GB → 500 MB to push storage-driven upgrades.
- Introduce **lifetime / multi-year** Studio offers to capture surplus WTP (à la Anytype/Capacities patrons).

**If AI costs rise** (model price increases or heavy usage): cut Pro allowance 500 → 300, push BYO-key harder for heavy users, and lean on **Flash-Lite** as default. Margin headroom is large, so this is a slow dial.

**If churn is high on monthly:** widen the annual gap to **20% ("save ~₹800/yr")** and add a one-time **"pause" instead of cancel** (retention-friendly, easy on Razorpay).

---

## 10. Sales / conversion playbook

### 10.1 Lead with these 3 value props (highest-converting)
1. **"Managed AI, no API key, no surprise bills."** Directly answers the #1 market complaint (Notion AI = "rip-off", surprise charges). *Predictable flat allowance* is the wedge.
2. **"One app for notes *and* real databases — 6 views, formulas, relations, rollups."** Zenith's database depth is genuinely Notion-class and beats the cheaper note-only apps (Craft/Twos/Reflect) on capability.
3. **"Local-first & private, with cloud sync when you want it."** Speaks to the PKM/Obsidian crowd that distrusts cloud lock-in — *your data on your device + your Firebase*, sync as an upgrade, not a hostage.

### 10.2 Objection → response
| Objection | Response |
|---|---|
| *"Notion's free tier is already enough."* | "Ours is too — full editor, forever. You only pay when you want **managed AI without keys**, **multi-device sync**, or **unlimited databases**. And in India we're **₹399 vs Notion's ~₹670**, billed locally in INR (no GST reverse-charge headache)." |
| *"I already pay for ChatGPT/Gemini."* | "Then stay on **Free with your own key** — unlimited AI, zero extra cost. Pro is for people who'd rather we run it: 500 actions/month, in-context, no setup." |
| *"No real-time collaboration — that's a dealbreaker."* | "Today Zenith is built for focused, single-author work — which is why it's fast and local-first. Multiplayer is on the roadmap, and **Studio gets you first access** the day it ships." |
| *"AI tools surprise me with huge bills."* | "Never here. Your allowance is a **flat monthly bucket**; run out and you simply switch to your own key or buy a **₹99 top-up** — you'll never get a metered shock." |
| *"Why not just use Obsidian (free)?"* | "Love Obsidian. But if you want **native databases with 6 views**, managed AI, and zero-plugin sync in one place, Zenith is that — and Free already covers the editor." |
| *"₹399 is a lot in India."* | "It's **less than ₹15/day**, billed via **UPI AutoPay**, cheaper than every global rival's India price. Students pay **₹199**. Annual is **2 months free**." |
| *"What if I cancel?"* | "Cancel anytime in-app; your notes stay yours (local-first + export). You can also **pause** instead of cancel." |

### 10.3 Funnel motion
- **Top:** ship Free wide (PKM/India communities, Obsidian/Notion-switcher content). It's the marketing engine.
- **Activate:** get users to **3 databases + first AI action** fast (these are the upgrade triggers).
- **Convert:** contextual prompts (§8) at the *moment of friction*, default to **annual** framing in INR.
- **Expand:** nudge Pro→Studio on **history limits, AI exhaustion, multiplayer waitlist**.

---

## 11. Assumptions & caveats
- Competitor prices were **fetched live (June 2026)** from official and reputable secondary sources; figures occasionally vary across resellers/promos — re-verify Notion/Coda/Tana before launch as these change quarterly.
- **FX assumption:** ~₹83–85/USD used for sanity checks; INR prices are intentionally **PPP-anchored, not FX-converted** (§3).
- **AI margin math** assumes Gemini Flash-Lite/2.5 Flash at fetched rates and ~2,000-in/800-out tokens per action; revisit if model pricing or usage shifts (§4).
- Feature allocation uses **only what Zenith has today** (editor, databases, BYO-Gemini AI, cloud accounts/sync, version history, files, export) **or a near-term plausible add** (managed-AI hosting, real-time multiplayer = explicitly "coming soon," storage tiers). Nothing here overclaims current capability.
- Conversion/discount benchmarks are category medians — treat the §9 sensitivity dials as the live control surface.

---

### Appendix — full source list
Notion: [official pricing](https://www.notion.com/pricing) · [AI add-on status](https://felloai.com/notion-ai-pricing/) · [India INR](https://www.itforsme.in/pricing/notion-india/) · [founder critique on India parity](https://x.com/VaibhavSisinty/status/1655485430698213378) · [AI "rip-off" critique](https://dev.to/ii-x/notion-ai-is-a-rip-off-for-power-users-but-a-killer-for-beginners-1ifc) · [G2 satisfaction](https://learn.g2.com/is-notion-worth-it)
Coda: [pricing](https://aitoolpick.org/blog/coda-pricing-2026/) · Craft: [pricing](https://www.fahimai.com/craft-review) · Capacities: [pricing](https://capacities.io/pricing/) · Anytype: [pricing](https://aiproductivity.ai/pricing/anytype/) · Obsidian: [pricing](https://aiproductivity.ai/pricing/obsidian/) · Evernote: [pricing](https://www.eesel.ai/blog/evernote-pricing) · Microsoft Loop: [pricing](https://www.saasworthy.com/product/microsoft-loop/pricing) · AppFlowy: [pricing](https://www.saasworthy.com/product/appflowy-io) · Logseq: [pricing](https://aiproductivity.ai/pricing/logseq/) · Tana/Reflect/Mem: [overview](https://aiproductivity.ai/tools/tana/) · [Tana credits/plans](https://costbench.com/software/note-taking/tana/) · Twos: [pricing](https://aichief.com/ai-productivity-tools/twos-app/)
India/Razorpay: [INR pricing strategy (EximPe)](https://eximpe.com/blog/psp/inr-pricing-for-global-saas-should-you-charge-indian-customers-in-rupees) · [India vs intl pricing (Playto)](https://www.playto.so/blogs/how-to-price-your-saas-for-indian-vs-international-customers-in-2026) · [GTM packaging (upGrowth)](https://upgrowth.in/saas-pricing-packaging-strategy-india-gtm/) · [rupee vs dollar (productgrowth)](https://productgrowth.in/insights/saas/saas-pricing-rupee-vs-dollar/) · [UPI AutoPay guide (Razorpay)](https://razorpay.com/blog/master-recurring-payments-upi-autopay-guide/) · [UPI AutoPay vs e-mandate (Razorpay)](https://razorpay.com/blog/upi-autopay-vs-card-e-mandates/)
AI cost: [Gemini pricing guide](https://aicostcheck.com/blog/google-gemini-pricing-guide-2026) · [Gemini 2.5 Flash](https://devtk.ai/en/models/gemini-2-5-flash/)
Benchmarks: [freemium conversion (First Page Sage)](https://firstpagesage.com/seo-blog/saas-freemium-conversion-rates/) · [SaaS benchmarks 2026 (Artisan)](https://www.artisangrowthstrategies.com/blog/saas-conversion-rate-benchmarks-2026-data-1200-companies) · [trial conversion (ADV.me)](https://adv.me/articles/conversion-optimization/saas-free-trial-conversion-rate-benchmarks-2025/) · WTP/PKM: [best AI note apps (get-alfred)](https://get-alfred.ai/blog/best-ai-note-taking-apps) · [Obsidian won (nickmilo)](https://nickmilo.substack.com/p/obsidian-just-won)
