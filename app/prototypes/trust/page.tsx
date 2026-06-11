"use client";

/**
 * YojanaScan — Prototype "Civic Trust" (Variant A)
 * Design Direction: Accessible & Ethical · GOV.UK clarity meets Indian fintech
 * Light surfaces · Navy ink · Single saffron accent (CTA only)
 * WCAG-AAA · Mobile-first · Semantic tokens · No emoji icons
 */

import Link from "next/link";
import { useEffect } from "react";
import s from "./styles.module.css";

/* ------------------------------------------------------------------ */
/* Inline SVG icon primitives — consistent 20×20 / 24×24 Lucide-style  */
/* stroke-width 1.75, round caps/joins                                  */
/* ------------------------------------------------------------------ */
function IconCheck({ size = 16 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconShield({ size = 20 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconDatabase({ size = 20 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
    </svg>
  );
}

function IconFile({ size = 20 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function IconZap({ size = 20 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconLink({ size = 20 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconCalendar({ size = 20 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconUsers({ size = 20 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconArrowRight({ size = 18 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function IconChevronDown({ size = 18 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconInfo({ size = 16 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function IconX({ size = 14 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Scroll-reveal hook                                                    */
/* ------------------------------------------------------------------ */
function useScrollReveal() {
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(s.revealVisible);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    const elements = document.querySelectorAll(`.${s.reveal}`);
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);
}

/* ------------------------------------------------------------------ */
/* Page Component                                                        */
/* ------------------------------------------------------------------ */
export default function TrustPrototypePage() {
  useScrollReveal();

  return (
    <div className={s.page}>
      {/* Neutralize site header/footer */}
      {/* eslint-disable-next-line react/no-danger */}
      <style>{`
        header.nav,
        nav[class*="Nav"],
        footer[class*="Footer"],
        footer[class*="footer"],
        body > header,
        body > footer,
        #__next > header,
        #__next > footer {
          display: none !important;
        }
      `}</style>

      {/* Skip to main content */}
      <a href="#main-content" className={s.skipLink}>
        Skip to main content
      </a>

      {/* Prototype reviewer banner */}
      <Link href="/" className={s.protoBanner} aria-label="Prototype: Civic Trust, Variant A — back to home">
        <span className={s.protoBannerDot} aria-hidden="true" />
        Prototype: Civic Trust · A
      </Link>

      {/* ============================================================
          NAVIGATION
          ============================================================ */}
      <header className={s.nav} role="banner">
        <nav className={s.navInner} aria-label="Main navigation">
          <Link href="/" className={s.navLogo} aria-label="YojanaScan — home">
            <span className={s.navLogoText}>
              Yojana<span className={s.navLogoAccent}>Scan</span>
            </span>
          </Link>

          <ul className={s.navLinks} role="list">
            <li>
              <a href="#how-it-works" className={s.navLink}>How it works</a>
            </li>
            <li>
              <a href="#schemes" className={s.navLink}>Schemes</a>
            </li>
            <li>
              <a href="#pricing" className={s.navLink}>Pricing</a>
            </li>
          </ul>

          <div className={s.navActions}>
            <Link href="/login" className={[s.btn, s.btnGhost].join(" ")}>
              Sign in
            </Link>
            <Link href="/scan" className={[s.btn, s.btnPrimary].join(" ")}>
              Free scan
            </Link>
          </div>
        </nav>
      </header>

      {/* ============================================================
          MAIN CONTENT
          ============================================================ */}
      <main id="main-content" tabIndex={-1}>

        {/* ==========================================================
            HERO
            ========================================================== */}
        <section className={s.hero} aria-labelledby="hero-headline">
          <div className={s.wrap}>
            <div className={s.heroInner}>
              {/* Verified status eyebrow */}
              <div className={s.heroEyebrow} aria-label="21 schemes encoded, last verified 11 June 2026">
                <span className={s.heroPulseDot} aria-hidden="true" />
                21 schemes encoded · last verified 11 Jun 2026
              </div>

              <h1 id="hero-headline" className={s.heroHeadline}>
                Your MSME is leaving{" "}
                <span className={s.heroHighlight}>government money</span>{" "}
                on the table.
              </h1>

              <p className={s.heroSub}>
                India runs 100+ subsidy, credit and certification schemes for small
                businesses. Consultants charge ₹10,000–50,000 just to tell you which
                ones apply. YojanaScan answers in 3 minutes — 10 questions, a
                deterministic rule engine, and a ₹499 report with benefit amounts,
                document checklists and direct application links.
              </p>

              <div className={s.heroCtas}>
                <Link href="/scan" className={[s.btn, s.btnPrimary, s.btnLg].join(" ")}>
                  Run the free scan
                  <IconArrowRight size={20} />
                </Link>
                <a href="#pricing" className={[s.btn, s.btnSecondary, s.btnLg].join(" ")}>
                  See sample report
                </a>
              </div>

              {/* Trust strip */}
              <div className={s.heroTrustStrip} role="list" aria-label="Trust indicators">
                <div className={s.trustItem} role="listitem">
                  <span className={s.trustItemIcon} aria-hidden="true">
                    <IconCheck size={14} />
                  </span>
                  Deterministic rules
                </div>
                <div className={s.trustItem} role="listitem">
                  <span className={s.trustItemIcon} aria-hidden="true">
                    <IconCheck size={14} />
                  </span>
                  No AI guesswork
                </div>
                <div className={s.trustItem} role="listitem">
                  <span className={s.trustItemIcon} aria-hidden="true">
                    <IconCheck size={14} />
                  </span>
                  Sources cited per scheme
                </div>
                <div className={s.trustItem} role="listitem">
                  <span className={s.trustItemIcon} aria-hidden="true">
                    <IconCalendar size={14} />
                  </span>
                  Verified 11 Jun 2026
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================================
            STATS ROW
            ========================================================== */}
        <section className={s.section} aria-labelledby="stats-heading">
          <h2 id="stats-heading" className={s.srOnly}>Key statistics</h2>
          <div className={s.wrap}>
            <div className={[s.statsGrid, s.reveal].join(" ")}>
              <div className={s.statCard}>
                <div className={s.statDivider} aria-hidden="true" />
                <div className={s.statNumber} aria-label="21 schemes">21</div>
                <div className={s.statLabel}>
                  hand-verified MSME schemes — 16 Central + 5 Maharashtra, every
                  rule encoded from official portals
                </div>
              </div>
              <div className={s.statCard}>
                <div className={s.statDivider} aria-hidden="true" />
                <div className={s.statNumber} aria-label="up to rupees 50,000 saved vs consultants">₹50k</div>
                <div className={s.statLabel}>
                  what consultants charge to answer the eligibility question
                  YojanaScan answers in 3 minutes for free
                </div>
              </div>
              <div className={s.statCard}>
                <div className={s.statDivider} aria-hidden="true" />
                <div className={s.statNumber} aria-label="10 questions">10</div>
                <div className={s.statLabel}>
                  questions to your match count, benefit ceiling and one
                  fully-unlocked scheme — no signup required
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================================
            HOW IT WORKS
            ========================================================== */}
        <section className={[s.section, s.sectionAlt].join(" ")} id="how-it-works"
          aria-labelledby="how-heading">
          <div className={s.wrap}>
            <div className={s.sectionHead}>
              <div className={[s.reveal, s.sectionEyebrow].join(" ")}>
                <IconZap size={14} />
                How it works
              </div>
              <h2 id="how-heading" className={[s.reveal, s.sectionTitle].join(" ")}>
                Deterministic by design.{" "}
                <span className={s.textAccent}>The AI never decides.</span>
              </h2>
              <p className={[s.reveal, s.sectionSub].join(" ")}>
                Each scheme&apos;s eligibility — entity type, sector, turnover bands,
                Udyam status, ownership category — is hand-encoded as machine-readable
                conditions from official government sources. Matching is pure rules:
                same answers, same verdict, every time.
              </p>
            </div>

            <div className={s.stepsGrid}>
              <div className={[s.stepCard, s.reveal].join(" ")}>
                <div className={s.stepNumber} aria-hidden="true">1</div>
                <h3 className={s.stepTitle}>Answer 10 questions</h3>
                <p className={s.stepDesc}>
                  Business stage, sector, entity type, investment and turnover
                  bands, Udyam registration status, and owner profile. No
                  documents needed, no signup, no commitment.
                </p>
              </div>

              <div className={[s.stepCard, s.reveal, s.revealDelay1].join(" ")}>
                <div className={s.stepNumber} aria-hidden="true">2</div>
                <h3 className={s.stepTitle}>Rule engine matches</h3>
                <p className={s.stepDesc}>
                  Your answers run against every encoded scheme. You instantly see
                  your match count, the total benefit ceiling and one fully
                  unlocked scheme — completely free.
                </p>
              </div>

              <div className={[s.stepCard, s.reveal, s.revealDelay2].join(" ")}>
                <div className={s.stepNumber} aria-hidden="true">3</div>
                <h3 className={s.stepTitle}>₹499 full report</h3>
                <p className={s.stepDesc}>
                  Every matched scheme with benefit amounts, document checklist,
                  application portal links, why-you-qualify trace and last-verified
                  dates. Plus near-misses: what one fix would unlock.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================================
            COVERAGE
            ========================================================== */}
        <section className={s.section} id="schemes" aria-labelledby="coverage-heading">
          <div className={s.wrap}>
            <div className={s.sectionHead}>
              <div className={[s.reveal, s.sectionEyebrow].join(" ")}>
                <IconDatabase size={14} />
                Coverage
              </div>
              <h2 id="coverage-heading" className={[s.reveal, s.sectionTitle].join(" ")}>
                16 central schemes.{" "}
                5 Maharashtra schemes.{" "}
                <span className={s.textAccent}>Honest about the rest.</span>
              </h2>
              <p className={[s.reveal, s.sectionSub].join(" ")}>
                Pan-India coverage on day one would be fake. We launched deep on
                central schemes plus Maharashtra, with a verified date on every
                rule — more states follow the same playbook when they&apos;re ready.
              </p>
            </div>

            <div className={s.coverageGrid}>
              {/* Central */}
              <div className={[s.coverageCard, s.reveal].join(" ")}>
                <div className={s.coverageHeader}>
                  <span className={[s.badge, s.badgeSaffron].join(" ")}>Central</span>
                </div>
                <div className={s.coverageCount} aria-label="16 schemes">16</div>
                <p className={s.coverageDesc} style={{ marginBottom: "var(--sp-4)" }}>
                  The flagship money — schemes that apply across every Indian state.
                </p>
                <ul className={s.schemeList} aria-label="Central scheme examples">
                  {[
                    "PMEGP — up to ₹17.5L margin-money subsidy",
                    "CGTMSE — collateral-free credit guarantee",
                    "MUDRA — ₹10L Shishu to Tarun loans",
                    "Stand-Up India — ₹10L–1Cr for SC/ST & women",
                    "ZED, LEAN, NSIC, PMFME & more",
                  ].map((item) => (
                    <li key={item} className={s.schemeListItem}>
                      <span style={{ color: "var(--c-accent)", marginTop: "2px", flexShrink: 0 }}>
                        <IconCheck size={14} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Maharashtra */}
              <div className={[s.coverageCard, s.reveal, s.revealDelay1].join(" ")}>
                <div className={s.coverageHeader}>
                  <span className={[s.badge, s.badgeAccent].join(" ")}>Maharashtra</span>
                </div>
                <div className={s.coverageCount} aria-label="5 schemes">5</div>
                <p className={s.coverageDesc} style={{ marginBottom: "var(--sp-4)" }}>
                  State-layer schemes — the ones consultants actually bill for.
                </p>
                <ul className={s.schemeList} aria-label="Maharashtra scheme examples">
                  {[
                    "CMEGP — state analogue to PMEGP",
                    "Package Scheme of Incentives (PSI 2019)",
                    "Annasaheb Patil interest rebate",
                    "Ahilyadevi Holkar for women entrepreneurs",
                    "Maharashtra Textile Policy 2023-28",
                  ].map((item) => (
                    <li key={item} className={s.schemeListItem}>
                      <span style={{ color: "var(--c-accent)", marginTop: "2px", flexShrink: 0 }}>
                        <IconCheck size={14} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Other states */}
              <div className={[s.coverageCard, s.reveal, s.revealDelay2].join(" ")}>
                <div className={s.coverageHeader}>
                  <span className={[s.badge, s.badgeMuted].join(" ")}>Your state · next</span>
                </div>
                <div className={s.coverageCount} style={{ color: "var(--c-text-3)" }}>
                  —
                </div>
                <p className={s.coverageDesc}>
                  Outside Maharashtra? You still get every central scheme today —
                  the largest amounts are all central. State packs ship as they&apos;re
                  encoded and verified. Never before.
                </p>
                <div style={{ marginTop: "var(--sp-4)", padding: "var(--sp-3) var(--sp-4)",
                  background: "var(--c-navy-10)", borderRadius: "var(--r-md)",
                  border: "1px solid var(--c-border)" }}>
                  <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "flex-start" }}>
                    <span style={{ color: "var(--c-accent)", flexShrink: 0, marginTop: "1px" }}>
                      <IconInfo size={14} />
                    </span>
                    <p style={{ fontSize: "var(--ts-xs)", color: "var(--c-text-2)", lineHeight: "1.55",
                      fontWeight: 500, margin: 0 }}>
                      Coverage scope is always shown before you pay.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================================
            TRUST — WHY NOT AN AI WRAPPER
            ========================================================== */}
        <section className={[s.section, s.sectionAlt].join(" ")} aria-labelledby="trust-heading">
          <div className={s.wrap}>
            <div className={s.sectionHead}>
              <div className={[s.reveal, s.sectionEyebrow].join(" ")}>
                <IconShield size={14} />
                Why trust the verdict
              </div>
              <h2 id="trust-heading" className={[s.reveal, s.sectionTitle].join(" ")}>
                Rules you can audit,{" "}
                <span className={s.textAccent}>not vibes.</span>
              </h2>
            </div>

            <div className={s.trustGrid}>
              {/* Audit trail card */}
              <div className={[s.trustCard, s.reveal].join(" ")}>
                <h3 className={s.trustCardTitle}>
                  Every condition is traceable.
                </h3>
                <ul className={s.trustList} aria-label="Auditability features">
                  {([
                    ["Sourced from official portals",
                      "Every rule is encoded from MoMSME, KVIC, SIDBI, state portals and gazette notifications — with the source URL."],
                    ["Last-verified date on every scheme",
                      "Stale data is flagged, not hidden. Lapsed scheme budgets are marked before you rely on them."],
                    ["Condition-by-condition trace",
                      "Your report shows exactly which conditions you passed, in order. No black box."],
                    ["Explicit caveats, not false certainty",
                      "Requirements we cannot verify from 10 questions are listed as caveats — never silently assumed."],
                  ] as [string, string][]).map(([title, desc]) => (
                    <li key={title} className={s.trustListItem}>
                      <span className={s.trustListIconWrap} aria-hidden="true">
                        <IconCheck size={14} />
                      </span>
                      <div>
                        <strong style={{ fontWeight: 600, display: "block",
                          marginBottom: "2px", color: "var(--c-text-1)" }}>
                          {title}
                        </strong>
                        {desc}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Engine diagram card */}
              <div className={[s.trustCard, s.reveal, s.revealDelay1].join(" ")}>
                <h3 className={s.trustCardTitle}>
                  The LLM narrates.{" "}
                  <span style={{ color: "var(--c-accent)" }}>It never matches.</span>
                </h3>
                <p style={{ fontSize: "var(--ts-base)", color: "var(--c-text-2)",
                  lineHeight: "1.65", marginBottom: "var(--sp-5)" }}>
                  Eligibility comes from a deterministic rule engine over hand-encoded
                  scheme data — weeks of verification a chatbot wrapper cannot
                  replicate. A language model only writes the plain-language summary
                  of results the engine already computed. It cannot hallucinate you
                  into — or out of — a scheme.
                </p>

                {/* Visual engine diagram */}
                <div className={s.engineDiagram} aria-label="How the engine works diagram">
                  <div className={s.engineRow}>
                    <span style={{ color: "var(--c-accent)" }}><IconDatabase size={16} /></span>
                    <span>Your 10 answers</span>
                    <span className={[s.badge, s.badgeAccent, s.engineRowBadge].join(" ")}>
                      input
                    </span>
                  </div>
                  <div className={s.engineArrow} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </div>
                  <div className={s.engineRow}>
                    <span style={{ color: "var(--c-navy)" }}><IconZap size={16} /></span>
                    <span>Rule engine — 21 schemes</span>
                    <span className={[s.badge, s.badgeNavy, s.engineRowBadge].join(" ")}>
                      deterministic
                    </span>
                  </div>
                  <div className={s.engineArrow} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </div>
                  <div className={s.engineRow}>
                    <span style={{ color: "var(--c-text-3)" }}><IconFile size={16} /></span>
                    <span>LLM writes prose summary</span>
                    <span className={[s.badge, s.badgeMuted, s.engineRowBadge].join(" ")}>
                      narrative only
                    </span>
                  </div>
                  <div className={s.engineArrow} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </div>
                  <div className={s.engineRow}>
                    <span style={{ color: "var(--c-success)" }}><IconCheck size={16} /></span>
                    <span>Your verified report</span>
                    <span className={[s.badge, s.badgeSuccess, s.engineRowBadge].join(" ")}>
                      output
                    </span>
                  </div>
                </div>

                {/* Trust chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)",
                  marginTop: "var(--sp-5)" }}>
                  {["Deterministic matching", "Traceable conditions", "Sourced & dated"].map((t) => (
                    <span key={t} className={[s.badge, s.badgeSuccess].join(" ")}>
                      <IconCheck size={11} />
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================================
            PRICING
            ========================================================== */}
        <section className={s.section} id="pricing" aria-labelledby="pricing-heading">
          <div className={s.wrap}>
            <div className={s.sectionHead}>
              <div className={[s.reveal, s.sectionEyebrow].join(" ")}>
                <IconFile size={14} />
                Pricing
              </div>
              <h2 id="pricing-heading" className={[s.reveal, s.sectionTitle].join(" ")}>
                One consultant question.{" "}
                <span className={s.textAccent}>1% of the consultant price.</span>
              </h2>
              <p className={[s.reveal, s.sectionSub].join(" ")}>
                Scan first, pay only if you want the full report. No subscription,
                no hidden fees.
              </p>
            </div>

            <div className={s.pricingGrid}>
              {/* Free tier */}
              <div className={[s.pricingCard, s.reveal].join(" ")}>
                <div className={s.pricingName}>Free scan</div>
                <div>
                  <span className={s.pricingPrice}>₹0</span>
                </div>
                <p className={s.pricingDesc}>
                  Get your match count and benefit ceiling instantly. No signup,
                  no card.
                </p>
                <ul className={s.pricingFeatures}>
                  {[
                    "Your total match count",
                    "Combined benefit ceiling",
                    "One matched scheme, fully unlocked",
                    "Scan is anonymous",
                  ].map((f) => (
                    <li key={f} className={s.pricingFeatureItem}>
                      <span className={s.pricingCheck} aria-hidden="true">
                        <IconCheck size={16} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/scan"
                  className={[s.btn, s.btnSecondary].join(" ")}
                  style={{ marginTop: "auto" }}>
                  Start free scan
                </Link>
              </div>

              {/* Full report */}
              <div className={[s.pricingCardFeatured, s.reveal, s.revealDelay1].join(" ")}>
                <div className={s.pricingBadge}>
                  <span className={[s.badge, s.badgeSaffron].join(" ")}>Most useful</span>
                </div>
                <div className={s.pricingName}>Full report</div>
                <div>
                  <span className={s.pricingPrice}>₹499</span>
                  <span className={s.pricingPriceSmall}> one-time</span>
                </div>
                <p className={s.pricingDesc}>
                  Every scheme, every detail — pay only after you see your match
                  count from the free scan.
                </p>
                <ul className={s.pricingFeatures}>
                  {[
                    "All matched schemes with benefit amounts",
                    "Document checklist per scheme",
                    "Direct application links & step-by-step",
                    "Why-you-qualify trace, condition-by-condition",
                    "Last-verified date per scheme",
                    "Near-misses: what one fix would unlock",
                    "Print-ready PDF",
                  ].map((f) => (
                    <li key={f} className={s.pricingFeatureItem}>
                      <span className={s.pricingCheck} aria-hidden="true">
                        <IconCheck size={16} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/scan"
                  className={[s.btn, s.btnPrimary].join(" ")}
                  style={{ marginTop: "auto" }}>
                  Scan first, pay after
                  <IconArrowRight size={17} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================================
            FAQ
            ========================================================== */}
        <section className={[s.section, s.sectionAlt].join(" ")} aria-labelledby="faq-heading">
          <div className={s.wrapNarrow}>
            <div className={s.sectionHead} style={{ textAlign: "center" }}>
              <div className={[s.reveal, s.sectionEyebrow].join(" ")}
                style={{ justifyContent: "center" }}>
                Fair questions
              </div>
              <h2 id="faq-heading" className={[s.reveal, s.sectionTitle].join(" ")}>
                Frequently asked
              </h2>
            </div>

            <div className={[s.faqList, s.reveal].join(" ")} role="list">
              {[
                {
                  q: "Is this a government website?",
                  a: "No. YojanaScan is an independent screening tool. We encode eligibility rules from official government portals and link you directly to the government application pages — we never take your application money or handle applications on your behalf.",
                },
                {
                  q: "How is this different from asking ChatGPT?",
                  a: "A chatbot guesses from training data and routinely invents subsidy percentages, eligibility thresholds and scheme names. Here, eligibility is computed by a rule engine over hand-encoded conditions with per-scheme verification dates. The language model only writes prose around results the engine already decided — it cannot hallucinate you into or out of a scheme.",
                },
                {
                  q: "What if a scheme's rules changed after you verified them?",
                  a: "Every scheme card shows its last-verified date, and reports link to the official source so you can confirm current terms. Schemes whose budgets have lapsed are marked, not silently dropped. We re-verify on a rolling basis — never wait for annual reviews.",
                },
                {
                  q: "I'm outside Maharashtra — is the report still worth it?",
                  a: "Yes. Central schemes (PMEGP, CGTMSE, MUDRA, Stand-Up India, ZED, NSIC and more) apply across all Indian states and carry the largest benefit amounts. You'll see exactly which schemes are in scope, labelled by level, before you pay.",
                },
                {
                  q: "Does 'eligible' mean 'approved'?",
                  a: "No screening tool can promise bank or agency approval — implementing bodies make the final call based on documentation, project appraisal and budget availability. We show you exactly which conditions you meet, which we couldn't verify from 10 questions, and what documents the agency will ask for. Transparent caveats, not false certainty.",
                },
              ].map(({ q, a }) => (
                <details key={q} className={s.faqItem} role="listitem">
                  <summary className={s.faqSummary}>
                    <span>{q}</span>
                    <span className={s.faqChevron} aria-hidden="true">
                      <IconChevronDown size={18} />
                    </span>
                  </summary>
                  <p className={s.faqBody}>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ==========================================================
            FINAL CTA BAND
            ========================================================== */}
        <section className={s.ctaBand} aria-labelledby="cta-heading">
          <div className={s.wrap}>
            <div className={s.reveal}>
              <h2 id="cta-heading" className={s.ctaBandTitle}>
                Three minutes.{" "}
                <span style={{ color: "var(--c-saffron)" }}>
                  Every rupee you qualify for.
                </span>
              </h2>
              <p className={s.ctaBandSub}>
                The scan is free and anonymous. See your match count before you
                decide whether the full report is worth ₹499.
              </p>

              <div className={s.ctaBandActions}>
                <Link href="/scan"
                  className={[s.btn, s.btnLg, s.ctaBandPrimary].join(" ")}>
                  Run the free scan
                  <IconArrowRight size={20} />
                </Link>
                <a href="#how-it-works"
                  className={[s.btn, s.btnLg, s.ctaBandSecondary].join(" ")}>
                  How it works
                </a>
              </div>

              <p className={s.ctaNote}>
                No signup required to scan · Pay only for the full report · ₹499 one-time
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ============================================================
          FOOTER
          ============================================================ */}
      <footer className={s.footer} role="contentinfo">
        <div className={s.wrap}>
          <div className={s.footerInner}>
            {/* Brand column */}
            <div className={s.footerBrand}>
              <div className={s.footerLogoText} aria-label="YojanaScan">
                Yojana<span style={{ color: "var(--c-saffron)" }}>Scan</span>
              </div>
              <p className={s.footerTagline}>
                Deterministic MSME scheme eligibility screening. 10 questions.
                21 verified schemes. No AI guesswork.
              </p>
              <p className={s.footerDisclaimer}>
                Independent screening tool. Not affiliated with any government
                body. Eligibility assessment does not guarantee approval.
                Verify scheme terms at official portals before applying.
              </p>
            </div>

            {/* Product links */}
            <div>
              <div className={s.footerColTitle}>Product</div>
              <ul className={s.footerLinks} role="list">
                {[
                  ["/scan", "Free scan"],
                  ["#how-it-works", "How it works"],
                  ["#schemes", "Schemes covered"],
                  ["#pricing", "Pricing"],
                ].map(([href, label]) => (
                  <li key={href}>
                    <a href={href} className={s.footerLink}>{label}</a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Trust links */}
            <div>
              <div className={s.footerColTitle}>Trust</div>
              <ul className={s.footerLinks} role="list">
                {[
                  ["/#", "Data sources"],
                  ["/#", "Verification methodology"],
                  ["/login", "Sign in"],
                  ["/#", "Privacy policy"],
                ].map(([href, label]) => (
                  <li key={label}>
                    <a href={href} className={s.footerLink}>{label}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Footer bottom bar */}
          <div className={s.footerBottom}>
            <p className={s.footerCopy}>
              &copy; 2026 YojanaScan. Independent eligibility screening.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)" }}>
              <span className={s.footerVerifiedBadge}>
                <IconCheck size={10} />
                Data verified 11 Jun 2026
              </span>
              <span className={[s.badge, s.badgeMuted].join(" ")}
                style={{ background: "rgba(255,255,255,0.07)",
                  color: "rgba(255,255,255,0.45)",
                  borderColor: "rgba(255,255,255,0.10)" }}>
                21 schemes
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
