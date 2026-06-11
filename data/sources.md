# Data provenance — schemes.json

Every scheme in `schemes.json` was researched against official government sources on
**10–11 June 2026** (the `lastVerified` date on each entry). Research method: direct
fetches of official portals where they respond (many Indian government sites are
JS-heavy or intermittently unreachable), corroborated by web search across PIB press
releases, official circulars/GRs and bank/scheme pages. Where a number could not be
re-verified against an official source, the scheme is marked `"confidence": "medium"`
and the caveat is stated in `notes`/`softChecks` — never silently guessed.

## Key facts verified against primary sources

| Fact | Source |
|---|---|
| PMEGP subsidy slabs (15/25/25/35%), ₹50L/₹20L ceilings, 8th-pass rule, 2nd loan ₹1cr | msme.gov.in scheme page (fetched) |
| CGTMSE cover raised ₹5cr → ₹10cr w.e.f. 01-04-2025; AGF from 0.37%; 90% women cover | CGTMSE Circular No. 250/2024-25 (18-03-2025) + cgtmse.in scheme document Apr 2025 |
| Revised MSME classification (micro ₹2.5cr/₹10cr; small ₹25cr/₹100cr; medium ₹125cr/₹500cr) | udyamregistration.gov.in (fetched) |
| MUDRA Tarun Plus ₹10–20L (Oct 2024), CGFMU cover | PIB doc 29-10-2024 + mudra.org.in |
| Stand-Up India ₹10L–1cr, greenfield, 51% rule | standupmitra.in + PIB FAQ |
| PM Vishwakarma ₹15k toolkit, ₹1L+₹2L tranches @5% | pmvishwakarma.gov.in + myscheme.gov.in |
| PM SVANidhi restructuring: extended to 31-03-2030, ₹15k/₹25k/₹50k ladder | PIB PRID 2161157 (Cabinet, Aug 2025) |
| PMFME 35%/₹10L subsidy; window extended till Sep 2026; 5-yr extension proposed | mofpi guidelines PDF + ministry reporting (May 2026) |
| ZED fees ₹10k/40k/90k; subsidy 80/60/50%; women 100%; +10%/+5% top-ups; ₹10k reward | zed.msme.gov.in subsidy page |
| LEAN 90% contribution; caps ₹1.08L/₹1.2L/₹2.4L; +5% top-ups | lean.msme.gov.in + ministry releases |
| SFURTI ₹2.5cr/₹5cr/₹8cr cluster slabs; 100-artisan minimum | sfurti.msme.gov.in + msme.gov.in |
| MSE-CDP CFC 70%/90% of ≤₹20cr; ID 60%/80% | dcmsme.gov.in/mse-cdprog.htm (fetched) |
| NSIC SPRS benefits (EMD exemption, L1+15%, 358 items, ₹5L provisional, SC/ST ₹100 fee) | nsic.co.in SPRS page (fetched) |
| NSIC RMA: 180-day credit, rates 8.75–10.25% (w.e.f. 01-07-2025), BG security | nsic.co.in RMA page (fetched) |
| CMEGP slabs 15–35%, ₹50L/₹10L ceilings, age 18–45, 7th/10th-pass rules | mskvib.org (implementing board) + maha-cmegp.gov.in + MAITRI |
| MIISP 2025 replaced PSI-2019 (GR 31-12-2025, valid to 30-12-2030); IPS 30–100% by zone | MAITRI policies + GR analyses (secondary; see note) |
| Annasaheb Patil IR-I ₹10L loan / ₹3L refund / 5 yrs; IR-II ₹50L/₹15L | udyog.mahaswayam.gov.in (portal) + consistent secondary sources |
| Ahilyadevi Holkar Women Startup ₹1–25L grant; >51% women equity; DPIIT; 1yr+; ₹10L–1cr turnover | MSInS flyer (official PDF) + district pages |
| MH Textile Policy 2023-28: 30–45% capital subsidy by zone +5% special category | mahatextile.maharashtra.gov.in GR documents |

## Deliberately excluded (and why)

- **CLCSS (Credit Linked Capital Subsidy Scheme)** — discontinued; ministry statements
  (Nov 2025) only promise to "consider revival". Encoding a dead scheme would be the
  exact failure mode this product exists to prevent.
- **Interest Equalisation Scheme (export credit)** — lapsed/expired status could not be
  confirmed as active for FY 2026-27; excluded pending verification.
- **Maharashtra Seed Money (Beej Bhandwal) & MSKVIB margin-money schemes** — current
  terms could not be verified against a live official source during research.
- **MSME Champions Innovative (incubation/design/IPR), MCGS-MSME (₹100cr equipment
  guarantee), TEAM/ONDC onboarding** — live but parameters not yet verified; queued for
  the next data pass.

## Verification discipline

- `lastVerified` = the date *we* checked, not the scheme's notification date.
- `confidence: medium` ⇒ at least one material number comes from a secondary source or
  could not be re-confirmed; the report says so out loud.
- Re-verification cadence target: every 90 days, and immediately after Union/State
  budgets.
