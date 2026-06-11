"use client";

/**
 * YojanaScan — Prototype Variant B: "Cinematic Money"
 * Design language: Exaggerated Minimalism
 * Near-black #05070d · Inter 900 · oversized clamp() type ·
 * hairline dividers · amber accent ONLY on hero number + primary CTA
 *
 * Two files only: page.tsx + styles.module.css
 * No new npm packages. No globals edited.
 */

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./styles.module.css";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Data — drawn from app/page.tsx source of truth (21 schemes, ₹499, etc.)    */
/* ─────────────────────────────────────────────────────────────────────────── */

const CENTRAL_SCHEMES = [
  "PMEGP", "CGTMSE", "MUDRA", "Stand-Up India", "PM Vishwakarma",
  "PMFME", "ZED", "LEAN", "NSIC", "GeM Onboarding",
  "SFURTI", "CLCSS", "MSME Champions", "Udyam Assist",
  "ECLGS", "RAMP",
];

const STATE_SCHEMES = [
  "CMEGP", "PSI Maharashtra", "Seed Money Loan",
  "Women Entrepreneur Subsidy", "SC/ST Top-up",
];

const ALL_SCHEMES = [
  ...CENTRAL_SCHEMES.map((n) => ({ name: n, level: "central" as const })),
  ...STATE_SCHEMES.map((n) => ({ name: n, level: "state" as const })),
];

const CENTRAL_COUNT = CENTRAL_SCHEMES.length;
const STATE_COUNT   = STATE_SCHEMES.length;
const TOTAL_SCHEMES = CENTRAL_COUNT + STATE_COUNT;
const VERIFIED_DATE = "11 Jun 2026";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Inline SVG icons — one stroke style, 1.5px stroke, no fill                 */
/* ─────────────────────────────────────────────────────────────────────────── */

const IconScan = ({ size = 20 }: { size?: number }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <line x1="7" y1="12" x2="17" y2="12" />
  </svg>
);

const IconCheck = ({ size = 16, className }: { size?: number; className?: string }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconShield = ({ size = 24 }: { size?: number }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

const IconLayers = ({ size = 24 }: { size?: number }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"
  >
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const IconTarget = ({ size = 24 }: { size?: number }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

const IconCpu = ({ size = 24 }: { size?: number }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" />
    <line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" />
    <line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" />
    <line x1="20" y1="14" x2="23" y2="14" />
    <line x1="1" y1="9" x2="4" y2="9" />
    <line x1="1" y1="14" x2="4" y2="14" />
  </svg>
);

const IconArrow = ({ size = 18 }: { size?: number }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const IconPlus = ({ size = 20 }: { size?: number }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconWordmark = () => (
  <svg
    width="18" height="18" viewBox="0 0 18 18"
    fill="none" aria-hidden="true"
  >
    <rect x="1" y="1" width="16" height="16" rx="4" fill="currentColor" />
    <path
      d="M5 9h8M9 5l4 4-4 4"
      stroke="#0a0500" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

/* ─────────────────────────────────────────────────────────────────────────── */
/* Reveal-on-scroll hook                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Bail out for users who prefer reduced motion
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      el.classList.add(styles.visible);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add(styles.visible);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return ref;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Scroll-aware nav hook                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

function useScrolled(px = 60) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > px);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [px]);
  return scrolled;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Tiny reveal wrapper component                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

function Reveal({
  children,
  delay = 0,
  className = "",
  as = "div",
}: {
  children: React.ReactNode;
  delay?: 0 | 1 | 2 | 3;
  className?: string;
  as?: "div" | "section" | "span" | "p" | "li" | "article";
}) {
  const ref = useReveal(0.12);
  const delayClass = delay === 1 ? styles.revealDelay1
    : delay === 2 ? styles.revealDelay2
    : delay === 3 ? styles.revealDelay3
    : "";
  // Collapse the tag union to one concrete signature; the runtime element is
  // still whatever `as` names.
  const Tag = as as "div";

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`${styles.reveal} ${delayClass} ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* PAGE COMPONENT                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */

export default function FintechPrototype() {
  const scrolled = useScrolled();

  return (
    <>
      {/* Suppress root layout's Nav + Footer */}
      <style>{`
        header.nav, nav.nav, footer, .nav { display: none !important; }
      `}</style>

      <div className={styles.page}>
        {/* ── Skip link ─────────────────────────────────────────────────── */}
        <a href="#main-content" className={styles.skipLink}>
          Skip to main content
        </a>

        {/* ── Prototype badge (top-right, fixed) ───────────────────────── */}
        <Link href="/" className={styles.protoBadge} aria-label="Back to main site — Prototype: Cinematic Money B">
          <span className={styles.protoBadgeDot} aria-hidden="true" />
          Prototype: Cinematic Money · B
        </Link>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* NAV                                                             */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <header className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`} role="banner">
          <nav className={styles.navInner} aria-label="Main navigation">
            <Link href="/" className={styles.wordmark} aria-label="YojanaScan — home">
              <span className={styles.wordmarkIcon} aria-hidden="true">
                <IconWordmark />
              </span>
              YojanaScan
            </Link>

            <div className={styles.navLinks} role="list">
              <a href="#how-it-works" className={styles.navLink} role="listitem">How it works</a>
              <a href="#coverage"     className={styles.navLink} role="listitem">Schemes</a>
              <a href="#pricing"      className={styles.navLink} role="listitem">Pricing</a>
            </div>

            <div className={styles.navActions}>
              <Link href="/login" className={`${styles.btn} ${styles.btnGhost} ${styles.btnGhostSm}`}>
                Sign in
              </Link>
              <Link href="/scan" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnGhostSm}`}>
                Free scan
              </Link>
            </div>
          </nav>
        </header>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* HERO                                                            */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section className={styles.hero} id="main-content" aria-labelledby="hero-headline">
          <div className={styles.heroInner}>
            <div className={styles.wrap}>
              {/* Eyebrow label */}
              <p className={styles.heroEyebrow} aria-label={`${TOTAL_SCHEMES} schemes verified ${VERIFIED_DATE}`}>
                <span className={styles.eyebrowDot} aria-hidden="true" />
                {TOTAL_SCHEMES} schemes encoded
                <span className={styles.microDivider} aria-hidden="true" />
                verified {VERIFIED_DATE}
              </p>

              {/* Statement headline — amber only on the money figure */}
              <h1 id="hero-headline" className={styles.heroHeadline}>
                <span className={styles.heroAmber}>₹2.4&nbsp;crore</span>
                {" "}you never claimed.
              </h1>

              <p className={styles.heroBrow}>
                India runs {TOTAL_SCHEMES} verified MSME schemes. Consultants charge
                ₹10,000–50,000 just to identify which ones apply.
                YojanaScan answers in&nbsp;3&nbsp;minutes — deterministic rules,
                not AI guesses.
              </p>

              {/* ONE primary CTA in hero viewport */}
              <div className={styles.heroCTAs}>
                <Link href="/scan" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`}>
                  <IconScan size={18} />
                  Run the free scan
                  <IconArrow size={16} />
                </Link>
                <a href="#how-it-works" className={`${styles.btn} ${styles.btnGhost} ${styles.btnLg}`}>
                  How it works
                </a>
              </div>

              {/* Trust microcopy */}
              <ul className={styles.heroMicro} aria-label="Key facts">
                <li className={styles.heroMicroItem}>
                  <IconCheck size={12} aria-hidden="true" />
                  Deterministic rules
                </li>
                <span className={styles.microDivider} aria-hidden="true" />
                <li className={styles.heroMicroItem}>
                  <IconCheck size={12} aria-hidden="true" />
                  Sources cited
                </li>
                <span className={styles.microDivider} aria-hidden="true" />
                <li className={styles.heroMicroItem}>
                  <IconCheck size={12} aria-hidden="true" />
                  Verified {VERIFIED_DATE}
                </li>
                <span className={styles.microDivider} aria-hidden="true" />
                <li className={styles.heroMicroItem}>
                  No signup to scan
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* BIG ANIMATED NUMBER MOMENT                                      */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section className={styles.bigNumberSection} aria-label="Scale of unclaimed government money">
          <div className={styles.bigNumberInner}>
            <Reveal>
              <p className={styles.bigNumberLabel} aria-hidden="true">
                The gap · Central MSME schemes alone
              </p>
            </Reveal>
            <Reveal delay={1}>
              <p
                className={styles.bigNumber}
                aria-label="Over 10 lakh crore rupees in government MSME schemes goes unclaimed"
              >
                ₹10L+&nbsp;Cr
              </p>
            </Reveal>
            <Reveal delay={2}>
              <p className={styles.bigNumberSub}>
                Annual MSME scheme budgets — the gap between what&apos;s
                allocated and what&apos;s claimed. The problem isn&apos;t
                eligibility. It&apos;s information asymmetry.
                YojanaScan fixes that.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* STATS ROW                                                       */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section className={styles.statsSection} aria-label="Key numbers">
          <div className={styles.wrap}>
            <Reveal>
              <dl className={styles.statsGrid}>
                <div className={styles.statCell}>
                  <dt className={styles.statLabel}>Schemes encoded</dt>
                  <dd className={styles.statValue}>{TOTAL_SCHEMES}</dd>
                  <p className={styles.statDesc}>
                    Hand-verified central + Maharashtra schemes. More states follow.
                  </p>
                </div>
                <div className={styles.statCell}>
                  <dt className={styles.statLabel}>Consultant alternative</dt>
                  <dd className={styles.statValue}>₹499</dd>
                  <p className={styles.statDesc}>
                    Full report with amounts, documents and application links.
                    Consultants charge ₹50,000.
                  </p>
                </div>
                <div className={styles.statCell}>
                  <dt className={styles.statLabel}>Time to verdict</dt>
                  <dd className={styles.statValue}>3&nbsp;min</dd>
                  <p className={styles.statDesc}>
                    10 questions. Deterministic rule engine. Same inputs,
                    same verdict, every time.
                  </p>
                </div>
              </dl>
            </Reveal>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* HOW IT WORKS                                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section
          className={`${styles.stepsSection} ${styles.section}`}
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <div className={styles.wrap}>
            <Reveal>
              <p className={styles.sectionLabel} aria-hidden="true">How it works</p>
              <h2 id="how-title" className={styles.sectionTitle}>
                Deterministic by design.<br />
                The AI never decides.
              </h2>
              <p className={styles.sectionBody}>
                Each scheme&apos;s eligibility — entity type, sector, turnover bands,
                Udyam status, ownership category — is hand-encoded as machine-readable
                conditions from official sources. Matching is pure rules.
              </p>
            </Reveal>

            <div className={styles.stepsGrid} role="list">
              <Reveal className={styles.stepCard} as="article" aria-label="Step 1 — Answer 10 questions">
                <p className={styles.stepNumber} aria-hidden="true">01</p>
                <h3 className={styles.stepTitle}>Answer 10 questions</h3>
                <p className={styles.stepBody}>
                  Stage, sector, entity type, investment &amp; turnover bands,
                  Udyam status, owner profile. No documents. No signup.
                </p>
              </Reveal>

              <Reveal delay={1} className={styles.stepCard} as="article" aria-label="Step 2 — Rule engine matches">
                <p className={styles.stepNumber} aria-hidden="true">02</p>
                <h3 className={styles.stepTitle}>Rule engine matches</h3>
                <p className={styles.stepBody}>
                  Your answers run against every encoded scheme. You instantly
                  see your match count, the total benefit ceiling and one
                  unlocked scheme — free.
                </p>
              </Reveal>

              <Reveal delay={2} className={styles.stepCard} as="article" aria-label="Step 3 — Full report for ₹499">
                <p className={styles.stepNumber} aria-hidden="true">03</p>
                <h3 className={styles.stepTitle}>₹499 full report</h3>
                <p className={styles.stepBody}>
                  Every matched scheme: benefit amounts, document checklist,
                  application links, why-you-qualify trace, last-verified date.
                  Plus near-misses — what one fix unlocks.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* COVERAGE                                                        */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section
          className={`${styles.coverageSection} ${styles.section}`}
          id="coverage"
          aria-labelledby="coverage-title"
        >
          <div className={styles.wrap}>
            <Reveal>
              <p className={styles.sectionLabel} aria-hidden="true">Coverage</p>
              <h2 id="coverage-title" className={styles.sectionTitle}>
                {CENTRAL_COUNT} central schemes.<br />
                {STATE_COUNT} Maharashtra schemes.<br />
                Honest about the rest.
              </h2>
              <p className={styles.sectionBody}>
                Pan-India coverage on day one would be fake. We launch deep on
                central schemes plus one state, with a verified date on every
                rule — more states follow the same playbook.
              </p>
            </Reveal>

            <div className={styles.coverageGrid}>
              <Reveal>
                <div className={styles.coverageCard}>
                  <span className={`${styles.coverageBadge} ${styles.badgeCentral}`} aria-label={`Central · ${CENTRAL_COUNT} schemes`}>
                    Central · {CENTRAL_COUNT}
                  </span>
                  <p className={styles.coverageCount} aria-hidden="true">
                    {CENTRAL_COUNT}
                  </p>
                  <h3 className={styles.coverageTitle}>Central Schemes</h3>
                  <p className={styles.coverageBody}>
                    PMEGP, CGTMSE, MUDRA, Stand-Up India, PM Vishwakarma,
                    PMFME, ZED, LEAN, NSIC, procurement &amp; more — the
                    flagship money.
                  </p>
                </div>
              </Reveal>

              <Reveal delay={1}>
                <div className={styles.coverageCard}>
                  <span className={`${styles.coverageBadge} ${styles.badgeState}`} aria-label={`Maharashtra · ${STATE_COUNT} schemes`}>
                    Maharashtra · {STATE_COUNT}
                  </span>
                  <p className={styles.coverageCount} aria-hidden="true">
                    {STATE_COUNT}
                  </p>
                  <h3 className={styles.coverageTitle}>Maharashtra Schemes</h3>
                  <p className={styles.coverageBody}>
                    CMEGP, Package Scheme of Incentives, seed money, women
                    &amp; SC/ST top-ups — the state layer consultants actually
                    bill for.
                  </p>
                </div>
              </Reveal>

              <Reveal delay={2}>
                <div className={styles.coverageCard}>
                  <span className={`${styles.coverageBadge} ${styles.badgeComingSoon}`}>
                    Your state · next
                  </span>
                  <p className={styles.coverageCount} aria-hidden="true" style={{ color: "var(--c-ink-3)" }}>
                    —
                  </p>
                  <h3 className={styles.coverageTitle}>More states</h3>
                  <p className={styles.coverageBody}>
                    Outside Maharashtra you still get every central scheme
                    today. State packs ship as they&apos;re encoded and
                    verified — never before.
                  </p>
                </div>
              </Reveal>
            </div>

            {/* Marquee */}
            <Reveal>
              <div className={styles.marqueeWrap} role="marquee" aria-label="Scheme names scroll">
                <div className={styles.marqueeTrack} aria-hidden="true">
                  {[...ALL_SCHEMES, ...ALL_SCHEMES].map((s, i) => (
                    <span
                      key={`${s.name}-${i}`}
                      className={`${styles.schemeChip} ${
                        s.level === "central" ? styles.schemeChipCentral : styles.schemeChipState
                      }`}
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TRUST — "Not an AI wrapper"                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section
          className={`${styles.trustSection} ${styles.section}`}
          aria-labelledby="trust-title"
        >
          <div className={styles.wrap}>
            <Reveal>
              <p className={styles.sectionLabel} aria-hidden="true">Why trust the verdict</p>
              <h2 id="trust-title" className={styles.sectionTitle}>
                Not an AI wrapper.
              </h2>
            </Reveal>

            <Reveal>
              <div className={styles.trustGrid}>
                {/* Block 1 — auditability */}
                <div className={styles.trustBlock}>
                  <div className={styles.trustIcon} aria-hidden="true">
                    <IconShield size={22} />
                  </div>
                  <h3 className={styles.trustTitle}>
                    Rules you can audit,<br />not vibes.
                  </h3>
                  <ul className={styles.trustList} aria-label="Auditability facts">
                    <li className={styles.trustListItem}>
                      <IconCheck size={16} className={styles.trustCheckIcon} aria-hidden="true" />
                      Every condition encoded from official portals with source links
                    </li>
                    <li className={styles.trustListItem}>
                      <IconCheck size={16} className={styles.trustCheckIcon} aria-hidden="true" />
                      Every scheme card carries a last-verified date — stale data is flagged, not hidden
                    </li>
                    <li className={styles.trustListItem}>
                      <IconCheck size={16} className={styles.trustCheckIcon} aria-hidden="true" />
                      Report shows the exact conditions you passed, one by one
                    </li>
                    <li className={styles.trustListItem}>
                      <IconCheck size={16} className={styles.trustCheckIcon} aria-hidden="true" />
                      Requirements we can&apos;t verify from 10 questions listed as explicit caveats
                    </li>
                  </ul>
                  <div className={styles.trustVerdict}>
                    <span className={styles.verifiedPill}>
                      <IconCheck size={12} aria-hidden="true" />
                      Traceable conditions
                    </span>
                    <span className={styles.verifiedPill}>
                      <IconCheck size={12} aria-hidden="true" />
                      Sourced &amp; dated data
                    </span>
                  </div>
                </div>

                {/* Block 2 — LLM role */}
                <div className={styles.trustBlock}>
                  <div className={styles.trustIcon} aria-hidden="true">
                    <IconCpu size={22} />
                  </div>
                  <h3 className={styles.trustTitle}>
                    The LLM narrates.<br />It never matches.
                  </h3>
                  <p className={styles.trustBody}>
                    Eligibility comes from a deterministic rule engine over
                    hand-encoded scheme data — weeks of grunt work a chatbot
                    wrapper can&apos;t fake. A language model only writes the
                    plain-language summary of results the engine already
                    computed. It cannot hallucinate you into or out of a scheme.
                  </p>
                  <div className={styles.trustVerdict} style={{ marginTop: "1.5rem" }}>
                    <span className={styles.verifiedPill}>
                      <IconCheck size={12} aria-hidden="true" />
                      Deterministic matching
                    </span>
                    <span className={styles.verifiedPill}>
                      <IconCheck size={12} aria-hidden="true" />
                      Engine decides, LLM narrates
                    </span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PRICING                                                         */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section
          className={`${styles.pricingSection} ${styles.section}`}
          id="pricing"
          aria-labelledby="pricing-title"
        >
          <div className={styles.wrap}>
            <Reveal>
              <p className={styles.sectionLabel} aria-hidden="true">Pricing</p>
              <h2 id="pricing-title" className={styles.sectionTitle}>
                One consultant question.<br />
                1% of the consultant price.
              </h2>
            </Reveal>

            <div className={styles.pricingGrid}>
              {/* Free */}
              <Reveal>
                <div className={styles.pricingCard}>
                  <p className={styles.pricingTier}>Free scan</p>
                  <p className={styles.pricingPrice} aria-label="Free — zero rupees">
                    ₹0
                  </p>
                  <hr className={styles.pricingDivider} />
                  <ul className={styles.pricingFeatureList} aria-label="Free scan features">
                    <li className={styles.pricingFeatureItem}>
                      <IconCheck size={14} aria-hidden="true" className={styles.featureCheck} />
                      Your total match count
                    </li>
                    <li className={styles.pricingFeatureItem}>
                      <IconCheck size={14} aria-hidden="true" className={styles.featureCheck} />
                      Combined benefit ceiling
                    </li>
                    <li className={styles.pricingFeatureItem}>
                      <IconCheck size={14} aria-hidden="true" className={styles.featureCheck} />
                      One matched scheme, fully unlocked
                    </li>
                  </ul>
                  <div className={styles.pricingAction}>
                    <Link
                      href="/scan"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      style={{ width: "100%" }}
                    >
                      Start free
                    </Link>
                  </div>
                </div>
              </Reveal>

              {/* Full report — featured */}
              <Reveal delay={1}>
                <div className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}>
                  <p className={`${styles.pricingTier} ${styles.pricingTierFeatured}`}>
                    Full report
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        padding: "3px 8px",
                        borderRadius: "999px",
                        background: "rgba(245,158,11,0.12)",
                        border: "1px solid rgba(245,158,11,0.25)",
                        color: "#fcd34d",
                      }}
                    >
                      Most useful
                    </span>
                  </p>
                  <p
                    className={`${styles.pricingPrice} ${styles.pricingPriceFeatured}`}
                    aria-label="Full report — 499 rupees"
                  >
                    ₹499
                  </p>
                  <hr className={styles.pricingDivider} />
                  <ul className={styles.pricingFeatureList} aria-label="Full report features">
                    <li className={styles.pricingFeatureItem}>
                      <IconCheck size={14} aria-hidden="true" className={styles.featureCheck} />
                      Every matched scheme with benefit amounts
                    </li>
                    <li className={styles.pricingFeatureItem}>
                      <IconCheck size={14} aria-hidden="true" className={styles.featureCheck} />
                      Document checklist per scheme
                    </li>
                    <li className={styles.pricingFeatureItem}>
                      <IconCheck size={14} aria-hidden="true" className={styles.featureCheck} />
                      Direct application links &amp; steps
                    </li>
                    <li className={styles.pricingFeatureItem}>
                      <IconCheck size={14} aria-hidden="true" className={styles.featureCheck} />
                      Why-you-qualify trace + last-verified dates
                    </li>
                    <li className={styles.pricingFeatureItem}>
                      <IconCheck size={14} aria-hidden="true" className={styles.featureCheck} />
                      Near-misses: what one fix unlocks
                    </li>
                    <li className={styles.pricingFeatureItem}>
                      <IconCheck size={14} aria-hidden="true" className={styles.featureCheck} />
                      Print-ready PDF
                    </li>
                  </ul>
                  <div className={styles.pricingAction}>
                    <Link
                      href="/scan"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      style={{ width: "100%" }}
                    >
                      Scan first, pay after
                      <IconArrow size={16} />
                    </Link>
                  </div>
                </div>
              </Reveal>
            </div>

            <Reveal>
              <p className={styles.pricingNote}>
                Free scan is anonymous — no signup required. Pay only if you
                want the full report.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* FAQ                                                             */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section
          className={`${styles.faqSection} ${styles.section}`}
          aria-labelledby="faq-title"
        >
          <div className={styles.wrap}>
            <Reveal>
              <p className={styles.sectionLabel} aria-hidden="true">FAQ</p>
              <h2 id="faq-title" className={styles.sectionTitle}>
                Fair questions.
              </h2>
            </Reveal>

            <Reveal>
              <div className={styles.faqList}>

                <details className={styles.faqItem}>
                  <summary className={styles.faqSummary}>
                    Is this a government website?
                    <span className={styles.faqIcon} aria-hidden="true">
                      <IconPlus size={18} />
                    </span>
                  </summary>
                  <p className={styles.faqBody}>
                    No. YojanaScan is an independent screening tool. We encode
                    rules from official portals and link you straight to the
                    government application pages — we never take your
                    application money.
                  </p>
                </details>

                <details className={styles.faqItem}>
                  <summary className={styles.faqSummary}>
                    How is this different from asking ChatGPT?
                    <span className={styles.faqIcon} aria-hidden="true">
                      <IconPlus size={18} />
                    </span>
                  </summary>
                  <p className={styles.faqBody}>
                    A chatbot guesses from training data and routinely invents
                    subsidy percentages. Here, eligibility is computed by a
                    rule engine over hand-encoded conditions with per-scheme
                    verification dates. The model only writes prose around
                    results that are already decided.
                  </p>
                </details>

                <details className={styles.faqItem}>
                  <summary className={styles.faqSummary}>
                    What if a scheme&apos;s rules changed yesterday?
                    <span className={styles.faqIcon} aria-hidden="true">
                      <IconPlus size={18} />
                    </span>
                  </summary>
                  <p className={styles.faqBody}>
                    Every scheme shows its last-verified date, and reports link
                    to the official source so you can confirm. Schemes whose
                    budgets lapse get marked, not silently dropped.
                  </p>
                </details>

                <details className={styles.faqItem}>
                  <summary className={styles.faqSummary}>
                    I&apos;m outside Maharashtra — is the report still worth it?
                    <span className={styles.faqIcon} aria-hidden="true">
                      <IconPlus size={18} />
                    </span>
                  </summary>
                  <p className={styles.faqBody}>
                    Yes — central schemes (PMEGP, CGTMSE, MUDRA, ZED, NSIC
                    and more) apply across India and carry the largest amounts.
                    You&apos;ll see state coverage labelled honestly before
                    you pay.
                  </p>
                </details>

                <details className={styles.faqItem}>
                  <summary className={styles.faqSummary}>
                    Does eligible mean approved?
                    <span className={styles.faqIcon} aria-hidden="true">
                      <IconPlus size={18} />
                    </span>
                  </summary>
                  <p className={styles.faqBody}>
                    No screening tool can promise approval — banks and
                    implementing agencies make the final call. We show you
                    exactly which conditions you meet, which we couldn&apos;t
                    verify, and what documents the agency will ask for.
                  </p>
                </details>

              </div>
            </Reveal>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* FINAL CTA BAND                                                  */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section className={styles.finalCtaSection} aria-labelledby="final-cta-title">
          <div className={styles.finalCtaInner}>
            <div className={styles.finalCtaRule} aria-hidden="true" />
            <Reveal>
              <h2 id="final-cta-title" className={styles.finalHeadline}>
                Three minutes.{" "}
                <span className={styles.heroAmber}>Every rupee you qualify for.</span>
              </h2>
              <p className={styles.finalSub}>
                The scan is free and anonymous. Pay only if you want the full
                report — ₹499, not ₹50,000.
              </p>
              {/* Single primary CTA */}
              <Link href="/scan" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`}>
                <IconScan size={18} />
                Run the free scan
                <IconArrow size={16} />
              </Link>
              <p className={styles.finalMicro}>
                Deterministic rules · sources cited · verified {VERIFIED_DATE}
              </p>
            </Reveal>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* FOOTER                                                          */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <footer className={styles.footer} role="contentinfo">
          <div className={styles.footerInner}>
            <div className={styles.footerBrand}>
              <Link href="/" className={styles.footerWordmark} aria-label="YojanaScan home">
                <span className={styles.wordmarkIcon} aria-hidden="true">
                  <IconWordmark />
                </span>
                YojanaScan
              </Link>
              <p className={styles.footerTagline}>
                Deterministic eligibility engine for Indian MSMEs.
                Engine matches — LLM narrates.
              </p>
            </div>

            <nav className={styles.footerLinks} aria-label="Footer navigation">
              <Link href="/scan"  className={styles.footerLink}>Free scan</Link>
              <Link href="/login" className={styles.footerLink}>Sign in</Link>
              <a href="#how-it-works" className={styles.footerLink}>How it works</a>
              <a href="#pricing"      className={styles.footerLink}>Pricing</a>
            </nav>
          </div>

          <div className={`${styles.wrap}`}>
            <p className={styles.disclaimer}>
              YojanaScan is an independent eligibility screening tool and is not
              affiliated with, endorsed by, or a part of any government ministry,
              department, or scheme. Eligibility results are indicative — final
              approval rests with the relevant implementing agency or bank.
              Scheme data verified {VERIFIED_DATE}; always confirm current rules
              at official portals before applying.
            </p>
          </div>
        </footer>

      </div>
    </>
  );
}
