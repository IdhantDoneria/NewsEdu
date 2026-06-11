"use client";

/**
 * YojanaScan — Prototype C: "Paper Ledger" (Editorial)
 * ─────────────────────────────────────────────────────
 * Warm paper background · Fraunces display serif · DM Sans body
 * Saffron #C5620A accent (5.1:1 on #FAF8F4) · Bento grid stats
 * Hairline rules · Numbered editorial steps · Print-premium feel
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import s from "./styles.module.css";

// ─── Inline SVG icons (consistent 20px / 1.5px stroke) ───────────────────────

function IconScan({ size = 20 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 20 20" fill="none"
      aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 6V4a2 2 0 0 1 2-2h2M14 2h2a2 2 0 0 1 2 2v2M18 14v2a2 2 0 0 1-2 2h-2M6 18H4a2 2 0 0 1-2-2v-2"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 10h8M10 6v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconRupee({ size = 20 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 20 20" fill="none"
      aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 4h8M6 8h8M6 8c0 3.314 2.686 6 6 6L8 18"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconCheck({ size = 14 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 14 14" fill="none"
      aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 7.5l3 3 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconPlus({ size = 14 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 14 14" fill="none"
      aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function IconArrowRight({ size = 16 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 16 16" fill="none"
      aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconShield({ size = 20 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 20 20" fill="none"
      aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 2L4 5v5c0 3.5 2.667 6.5 6 7.5C13.333 16.5 16 13.5 16 10V5l-6-3z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7.5 10l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconClock({ size = 20 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 20 20" fill="none"
      aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 7v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconDoc({ size = 20 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 20 20" fill="none"
      aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
        stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconBrain({ size = 20 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 20 20" fill="none"
      aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 4c-2.5 0-4 1.5-4 3.5 0 .5.1 1 .3 1.4C5.5 9.4 5 10.3 5 11.5 5 13.4 6.3 15 8 15.4V17h4v-1.6c1.7-.4 3-2 3-3.9 0-1.2-.5-2.1-1.3-2.6.2-.4.3-.9.3-1.4C14 5.5 12.5 4 10 4z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 8v3M8.5 9.5h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  );
}

function IconLock({ size = 16 }: { size?: number }) {
  return (
    <svg className={s.icon} width={size} height={size} viewBox="0 0 16 16" fill="none"
      aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Fade-up hook ─────────────────────────────────────────────────────────────

function useFadeUp<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("visible"); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);
  return (
    <header className={`${s.nav} ${scrolled ? s.navScrolled : ""}`} role="banner">
      <div className={s.navInner}>
        <Link href="/" className={s.wordmark} aria-label="YojanaScan — back to homepage">
          <span className={s.wordmarkMark} aria-hidden="true">₹</span>
          <span className={s.wordmarkText}>Yojana<em>Scan</em></span>
        </Link>
        <nav className={s.navLinks} aria-label="Primary navigation">
          <a href="#how-it-works" className={s.navLink}>How it works</a>
          <a href="#schemes" className={s.navLink}>Schemes</a>
          <a href="#pricing" className={s.navLink}>Pricing</a>
        </nav>
        <div className={s.navActions}>
          <Link href="/login" className={s.navSignIn}>Sign in</Link>
          <Link href="/scan" className={`${s.btnPrimary}`} style={{ padding: "9px 18px", fontSize: "13.5px", minHeight: "40px" }}>
            Free scan
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── FadeUp wrapper ───────────────────────────────────────────────────────────

function FadeUp({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useFadeUp<HTMLDivElement>();
  const delayClass = delay === 1 ? "delay1" : delay === 2 ? "delay2" : delay === 3 ? "delay3" : delay === 4 ? "delay4" : "";
  return (
    <div ref={ref} className={`${s.fadeUp} ${delayClass ? s[delayClass as keyof typeof s] : ""} ${className}`}>
      {children}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EditorialPrototype() {
  return (
    <div className={s.editorial}>
      {/* neutralise root dark nav + footer injected by layout.tsx */}
      <style>{`
        header.nav,
        footer.footer,
        nav.nav { display: none !important; }
        body { background: #FAF8F4 !important; }
        body::before, body::after { display: none !important; }
      `}</style>

      {/* Skip to main */}
      <a href="#main-content" className={s.skipLink}>Skip to main content</a>

      {/* Prototype badge */}
      <Link href="/" className={s.prototypeBadge} aria-label="Back to homepage — Prototype Paper Ledger C">
        Prototype: Paper Ledger · C
      </Link>

      <Nav />

      {/* ===================== HERO ===================== */}
      <main id="main-content">
        <section className={s.hero} aria-labelledby="hero-heading">
          <div className={s.heroInner}>
            {/* Left column */}
            <div>
              <FadeUp>
                <div className={s.heroLabel}>
                  <span className={s.heroDot} aria-hidden="true" />
                  21 schemes encoded · verified 11 Jun 2026
                </div>
              </FadeUp>

              <FadeUp delay={1}>
                <h1 id="hero-heading" className={s.heroH1}>
                  Your MSME is leaving{" "}
                  <em>government money</em> on the table.
                </h1>
              </FadeUp>

              <FadeUp delay={2}>
                <p className={s.heroSub}>
                  India runs 100+ subsidy, credit and certification schemes for
                  small businesses. Consultants charge ₹10,000–50,000 just to
                  tell you which ones apply. YojanaScan answers in 3 minutes —
                  10 questions, a deterministic rule engine, and a ₹499 report
                  with amounts, documents and application links.
                </p>
              </FadeUp>

              <FadeUp delay={3}>
                <div className={s.heroCtas}>
                  <Link href="/scan" className={`${s.btnPrimary} ${s.btnPrimaryLg}`}>
                    Run the free scan <IconArrowRight />
                  </Link>
                  <a href="#how-it-works" className={s.btnOutline} style={{ padding: "15px 24px", fontSize: "16px", minHeight: "52px", borderRadius: "var(--r-lg)" }}>
                    How it works
                  </a>
                </div>
                <div className={s.heroTrust} aria-label="Trust signals">
                  <span>Deterministic rules</span>
                  <span className={s.trustSep} aria-hidden="true" />
                  <span>Sources cited</span>
                  <span className={s.trustSep} aria-hidden="true" />
                  <span>Verified 11 Jun 2026</span>
                  <span className={s.trustSep} aria-hidden="true" />
                  <span>No signup to scan</span>
                </div>
              </FadeUp>
            </div>

            {/* Right aside — teaser rate card */}
            <aside className={s.heroAside} aria-label="Quick stats">
              <FadeUp delay={2}>
                <div className={s.heroAsideCard}>
                  <div className={s.asideLabel}>Coverage today</div>
                  <div className={s.asideStat}>21</div>
                  <div className={s.asideDesc}>hand-verified schemes across central government and Maharashtra</div>
                  <div className={s.asideDivider} />
                  <div className={s.asideLabel}>Consultant price</div>
                  <div className={s.asideStat} style={{ fontSize: "26px" }}>₹10–50k</div>
                  <div className={s.asideDesc}>for the same eligibility answer</div>
                  <div className={s.asideDivider} />
                  <div className={s.asideLabel}>YojanaScan price</div>
                  <div className={s.asideStat} style={{ fontSize: "32px", color: "var(--saffron-light)" }}>₹499</div>
                  <div className={s.asideDesc} style={{ marginBottom: 0 }}>full report · scan free</div>
                  <div style={{ marginTop: "var(--sp-4)" }}>
                    <span className={s.asideTag}>
                      <IconCheck size={12} /> 1% of consultant cost
                    </span>
                  </div>
                </div>
              </FadeUp>
            </aside>
          </div>
        </section>

        {/* ===================== STATS / BENTO ===================== */}
        <section className={s.section} aria-label="Key statistics">
          <div className={s.wrap}>
            <FadeUp>
              <div className={s.sectionNum}>01 — Why it matters</div>
              <h2 className={s.sectionH2}>
                The schemes exist.<br />
                <em>Finding them is the problem.</em>
              </h2>
              <p className={s.sectionLead} style={{ marginBottom: "var(--sp-7)" }}>
                Every number below reflects real friction Indian MSMEs face when
                trying to access government support that is already allocated.
              </p>
            </FadeUp>

            <div className={s.bentoGrid} role="list" aria-label="Statistics">

              {/* Big stat 1 */}
              <FadeUp className={s.bentoSpan4} delay={0}>
                <div className={`${s.bentoCard} ${s.bentoFeatured}`} role="listitem">
                  <div className={s.bentoStat}>
                    100<span className={s.bentoStatAccent}>+</span>
                  </div>
                  <div className={s.bentoLabel}>
                    live central &amp; state MSME schemes — scattered across
                    dozens of portals nobody reads end-to-end
                  </div>
                </div>
              </FadeUp>

              {/* Big stat 2 */}
              <FadeUp className={s.bentoSpan4} delay={1}>
                <div className={s.bentoCard} role="listitem">
                  <div className={s.bentoStat}>
                    ₹<span className={s.bentoStatAccent}>50</span>k
                  </div>
                  <div className={s.bentoLabel}>
                    what consultants charge for an eligibility answer — the
                    schemes themselves cost nothing to apply to
                  </div>
                </div>
              </FadeUp>

              {/* Big stat 3 */}
              <FadeUp className={s.bentoSpan4} delay={2}>
                <div className={s.bentoCard} role="listitem">
                  <div className={s.bentoStat}>
                    3<span className={s.bentoStatAccent}> min</span>
                  </div>
                  <div className={s.bentoLabel}>
                    to your verdict — every match traced
                    condition-by-condition against hand-encoded rules
                  </div>
                </div>
              </FadeUp>

              {/* Feature card — engine description */}
              <FadeUp className={s.bentoSpan6} delay={0}>
                <div className={`${s.bentoCard}`} role="listitem" style={{ minHeight: "160px" }}>
                  <div className={s.bentoTitle}>Engine matches. LLM narrates.</div>
                  <p className={s.bentoCopy}>
                    Eligibility is computed by a deterministic rule engine over
                    hand-encoded scheme data. A language model writes the
                    plain-language summary — it cannot hallucinate you into or
                    out of a scheme.
                  </p>
                  <div style={{ marginTop: "var(--sp-4)", display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                    <span className={s.bentoSchemeTag}>Deterministic</span>
                    <span className={s.bentoSchemeTag}>Traceable</span>
                    <span className={s.bentoSchemeTag}>Sourced &amp; dated</span>
                  </div>
                </div>
              </FadeUp>

              {/* Feature card — central schemes */}
              <FadeUp className={s.bentoSpan6} delay={1}>
                <div className={s.bentoCard} role="listitem">
                  <div className={s.bentoTitle}>16 Central · 5 Maharashtra</div>
                  <div className={s.bentoSchemeList}>
                    {["PMEGP","CGTMSE","MUDRA","ZED","NSIC","LEAN","PMFME",
                      "PM Vishwakarma","Stand-Up India","CMEGP","PSI"].map((n) => (
                      <span key={n} className={s.bentoSchemeTag}>{n}</span>
                    ))}
                    <span className={s.bentoSchemeTagState}>+10 more</span>
                  </div>
                </div>
              </FadeUp>

            </div>
          </div>
        </section>

        {/* ===================== HOW IT WORKS ===================== */}
        <section
          id="how-it-works"
          className={`${s.section} ${s.sectionAlt}`}
          aria-labelledby="how-heading"
        >
          <div className={s.wrap}>
            <FadeUp className={s.sectionHead}>
              <div className={s.sectionNum}>02 — How it works</div>
              <h2 id="how-heading" className={s.sectionH2}>
                Deterministic by design.<br />
                <em>The AI never decides.</em>
              </h2>
              <p className={s.sectionLead}>
                Each scheme's eligibility — entity type, sector, turnover
                bands, Udyam status, ownership category — is hand-encoded as
                machine-readable conditions. Matching is pure rules: same
                answers, same verdict, every time.
              </p>
            </FadeUp>

            <div className={s.stepsGrid} role="list" aria-label="Process steps">
              {/* Step 1 */}
              <FadeUp delay={0}>
                <div className={s.stepCell} role="listitem">
                  <div className={s.stepNumeral}>
                    01 <span className={s.stepNumeralLine} aria-hidden="true" />
                  </div>
                  <div className={s.stepIcon} aria-hidden="true">
                    <IconScan />
                  </div>
                  <h3 className={s.stepH3}>Answer 10 questions</h3>
                  <p className={s.stepBody}>
                    Stage, sector, entity type, investment and turnover bands,
                    Udyam status, owner profile. No documents needed, no
                    account required.
                  </p>
                </div>
              </FadeUp>

              {/* Step 2 */}
              <FadeUp delay={1}>
                <div className={s.stepCell} role="listitem">
                  <div className={s.stepNumeral}>
                    02 <span className={s.stepNumeralLine} aria-hidden="true" />
                  </div>
                  <div className={s.stepIcon} aria-hidden="true">
                    <IconBrain />
                  </div>
                  <h3 className={s.stepH3}>Rule engine matches</h3>
                  <p className={s.stepBody}>
                    Your answers run against every encoded scheme. You
                    instantly see your match count, total benefit ceiling and
                    one unlocked scheme — free, no payment needed.
                  </p>
                </div>
              </FadeUp>

              {/* Step 3 */}
              <FadeUp delay={2}>
                <div className={s.stepCell} role="listitem">
                  <div className={s.stepNumeral}>
                    03 <span className={s.stepNumeralLine} aria-hidden="true" />
                  </div>
                  <div className={s.stepIcon} aria-hidden="true">
                    <IconDoc />
                  </div>
                  <h3 className={s.stepH3}>₹499 full report</h3>
                  <p className={s.stepBody}>
                    Every matched scheme: benefit amounts, document checklist,
                    application links, why-you-qualify trace and verified date.
                    Plus near-misses — what one fix would unlock.
                  </p>
                </div>
              </FadeUp>
            </div>
          </div>
        </section>

        {/* ===================== COVERAGE ===================== */}
        <section
          id="schemes"
          className={s.section}
          aria-labelledby="coverage-heading"
        >
          <div className={s.wrap}>
            <FadeUp className={s.sectionHead}>
              <div className={s.sectionNum}>03 — Coverage</div>
              <h2 id="coverage-heading" className={s.sectionH2}>
                16 central schemes. 5 Maharashtra schemes.{" "}
                <em>Honest about the rest.</em>
              </h2>
              <p className={s.sectionLead}>
                Pan-India coverage on day one would be false advertising. We
                launch deep on central schemes plus one state, with a verified
                date on every rule — more states follow the same playbook.
              </p>
            </FadeUp>

            <div className={s.coverageGrid}>
              {/* Central */}
              <FadeUp delay={0}>
                <div className={s.coverageCard}>
                  <span className={s.coverageTag}>Central · 16 schemes</span>
                  <h3 className={s.coverageH3}>The flagship money</h3>
                  <p className={s.coverageSub}>
                    PMEGP, CGTMSE, MUDRA, Stand-Up India, PM Vishwakarma,
                    PMFME, ZED, LEAN, NSIC, procurement &amp; more — available
                    to every MSME across India regardless of state.
                  </p>
                  <div className={s.schemeList} role="list" aria-label="Central schemes">
                    {[
                      "PMEGP","CGTMSE","MUDRA","Stand-Up India",
                      "PM Vishwakarma","PMFME","ZED Certification","LEAN",
                      "NSIC Credit","NSIC Marketing","SFURTI","Cluster Dev",
                      "RAMP","ASPIRE","Women Entrepreneur","ODOP",
                    ].map((n) => (
                      <span key={n} className={s.schemeTag} role="listitem">{n}</span>
                    ))}
                  </div>
                </div>
              </FadeUp>

              {/* Maharashtra */}
              <FadeUp delay={1}>
                <div className={s.coverageCard}>
                  <span className={`${s.coverageTag} ${s.coverageTagState}`}>Maharashtra · 5 schemes</span>
                  <h3 className={s.coverageH3}>The state layer consultants bill for</h3>
                  <p className={s.coverageSub}>
                    CMEGP, Package Scheme of Incentives, seed money, women
                    &amp; SC/ST top-ups — the state-level instruments that stack
                    on top of central support.
                  </p>
                  <div className={s.schemeList} role="list" aria-label="Maharashtra schemes">
                    {["CMEGP","Package Scheme of Incentives","Seed Money","Women Entrepreneur Grant","SC/ST Assistance"].map((n) => (
                      <span key={n} className={`${s.schemeTag} ${s.schemeTagState}`} role="listitem">{n}</span>
                    ))}
                  </div>
                  <div style={{ marginTop: "var(--sp-5)", paddingTop: "var(--sp-4)", borderTop: "1px solid var(--rule)" }}>
                    <p style={{ fontSize: "13px", color: "var(--ink-4)", lineHeight: "1.55", margin: "0 0 var(--sp-3)" }}>
                      Outside Maharashtra you still get every central scheme
                      today. State packs ship as they are encoded and verified
                      — never before.
                    </p>
                    <span className={`${s.schemeTag} ${s.schemeTagNext}`}>Your state · next</span>
                  </div>
                </div>
              </FadeUp>
            </div>
          </div>
        </section>

        {/* ===================== TRUST — NOT AN AI WRAPPER ===================== */}
        <section className={`${s.section} ${s.sectionAlt}`} aria-labelledby="trust-heading">
          <div className={s.wrap}>
            <FadeUp className={s.sectionHead}>
              <div className={s.sectionNum}>04 — Why trust the verdict</div>
              <h2 id="trust-heading" className={s.sectionH2}>
                Rules you can audit, not <em>vibes.</em>
              </h2>
            </FadeUp>

            <div className={s.trustGrid}>
              {/* Audit trail */}
              <FadeUp delay={0}>
                <div className={s.trustCard}>
                  <div style={{ marginBottom: "var(--sp-4)" }}>
                    <span style={{ color: "var(--saffron)" }}>
                      <IconShield size={24} />
                    </span>
                  </div>
                  <h3 className={s.trustH3}>Every condition is traceable</h3>
                  <ul className={s.trustList} aria-label="Trust guarantees">
                    <li className={s.trustListItem}>
                      <span className={s.trustCheck}><IconCheck /></span>
                      Every condition is encoded from official portals and
                      guidelines, with source links
                    </li>
                    <li className={s.trustListItem}>
                      <span className={s.trustCheck}><IconCheck /></span>
                      Every scheme card carries a last-verified date — stale
                      data is flagged, not hidden
                    </li>
                    <li className={s.trustListItem}>
                      <span className={s.trustCheck}><IconCheck /></span>
                      The report shows the exact conditions you passed, one
                      by one — a printed decision trace
                    </li>
                    <li className={s.trustListItem}>
                      <span className={s.trustCheck}><IconCheck /></span>
                      Requirements we cannot verify from 10 questions are
                      listed as explicit caveats
                    </li>
                  </ul>
                </div>
              </FadeUp>

              {/* LLM role */}
              <FadeUp delay={1}>
                <div className={s.trustCard}>
                  <div style={{ marginBottom: "var(--sp-4)" }}>
                    <span style={{ color: "var(--saffron)" }}>
                      <IconBrain size={24} />
                    </span>
                  </div>
                  <h3 className={s.trustH3}>The LLM narrates. It never matches.</h3>
                  <p className={s.trustBody}>
                    Eligibility comes from a deterministic rule engine over
                    hand-encoded scheme data — weeks of grunt work a chatbot
                    wrapper cannot fake. A language model only writes the
                    plain-language summary of results the engine already
                    computed.
                  </p>
                  <div className={s.verbatimBlock}>
                    <p className={s.verbatimText}>
                      "It cannot hallucinate you into — or out of — a scheme."
                    </p>
                    <p className={s.verbatimCaption}>Design principle · YojanaScan</p>
                  </div>
                  <div className={s.trustChips}>
                    <span className={s.trustChip}><IconCheck size={12} /> Deterministic matching</span>
                    <span className={s.trustChip}><IconCheck size={12} /> Traceable conditions</span>
                    <span className={s.trustChip}><IconCheck size={12} /> Sourced &amp; dated data</span>
                  </div>
                </div>
              </FadeUp>
            </div>
          </div>
        </section>

        {/* ===================== PRICING — RATE CARD ===================== */}
        <section
          id="pricing"
          className={s.section}
          aria-labelledby="pricing-heading"
        >
          <div className={s.wrap}>
            <FadeUp className={s.sectionHead}>
              <div className={s.sectionNum}>05 — Rate card</div>
              <h2 id="pricing-heading" className={s.sectionH2}>
                One consultant question.<br />
                <em>1% of the consultant price.</em>
              </h2>
            </FadeUp>

            <FadeUp>
              <div className={s.rateCardGrid}>
                {/* Free tier */}
                <div className={s.rateCard}>
                  <div className={s.rateCardName}>Free scan</div>
                  <div className={s.rateCardPrice}>₹0</div>
                  <div className={s.rateCardSub}>No signup. No catch.</div>
                  <ul className={s.rateCardFeatures} aria-label="Free scan features">
                    <li className={s.rateCardFeature}>
                      <span className={`${s.rateFeatureIcon}`}><IconCheck size={16} /></span>
                      Your total match count
                    </li>
                    <li className={s.rateCardFeature}>
                      <span className={s.rateFeatureIcon}><IconCheck size={16} /></span>
                      Combined benefit ceiling
                    </li>
                    <li className={s.rateCardFeature}>
                      <span className={s.rateFeatureIcon}><IconCheck size={16} /></span>
                      One matched scheme, fully unlocked
                    </li>
                    <li className={s.rateCardFeature} style={{ color: "var(--ink-4)" }}>
                      <span className={s.rateFeatureIconMuted}><IconLock size={16} /></span>
                      Full scheme list
                    </li>
                    <li className={s.rateCardFeature} style={{ color: "var(--ink-4)" }}>
                      <span className={s.rateFeatureIconMuted}><IconLock size={16} /></span>
                      Document checklists
                    </li>
                    <li className={s.rateCardFeature} style={{ color: "var(--ink-4)" }}>
                      <span className={s.rateFeatureIconMuted}><IconLock size={16} /></span>
                      Near-miss analysis
                    </li>
                  </ul>
                  <Link href="/scan" className={s.btnOutline} style={{ width: "100%", justifyContent: "center" }}>
                    Start free <IconArrowRight />
                  </Link>
                </div>

                {/* Paid tier */}
                <div className={`${s.rateCard} ${s.rateCardFeatured}`}>
                  <span className={s.rateCardAccent}>Most useful</span>
                  <div className={s.rateCardName}>Full report</div>
                  <div className={`${s.rateCardPrice} ${s.rateCardPriceAccent}`}>₹499</div>
                  <div className={s.rateCardSub}>Scan first, pay after — only if you match.</div>
                  <ul className={s.rateCardFeatures} aria-label="Full report features">
                    <li className={s.rateCardFeature}>
                      <span className={s.rateFeatureIcon}><IconCheck size={16} /></span>
                      Every matched scheme with benefit amounts
                    </li>
                    <li className={s.rateCardFeature}>
                      <span className={s.rateFeatureIcon}><IconCheck size={16} /></span>
                      Document checklist per scheme
                    </li>
                    <li className={s.rateCardFeature}>
                      <span className={s.rateFeatureIcon}><IconCheck size={16} /></span>
                      Direct application links &amp; steps
                    </li>
                    <li className={s.rateCardFeature}>
                      <span className={s.rateFeatureIcon}><IconCheck size={16} /></span>
                      Why-you-qualify trace + last-verified dates
                    </li>
                    <li className={s.rateCardFeature}>
                      <span className={s.rateFeatureIcon}><IconCheck size={16} /></span>
                      Near-misses: what one fix unlocks
                    </li>
                    <li className={s.rateCardFeature}>
                      <span className={s.rateFeatureIcon}><IconCheck size={16} /></span>
                      Print-ready PDF
                    </li>
                  </ul>
                  <Link href="/scan" className={`${s.btnPrimary}`} style={{ width: "100%", justifyContent: "center", padding: "15px 24px", fontSize: "15px", minHeight: "52px", borderRadius: "var(--r-lg)" }}>
                    Scan first, pay after <IconArrowRight />
                  </Link>
                </div>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ===================== FAQ ===================== */}
        <section className={`${s.section} ${s.sectionAlt}`} aria-labelledby="faq-heading">
          <div className={s.wrapNarrow}>
            <FadeUp className={s.sectionHead}>
              <div className={s.sectionNum}>06 — Fair questions</div>
              <h2 id="faq-heading" className={s.sectionH2} style={{ fontSize: "clamp(26px,3.5vw,38px)" }}>
                FAQ
              </h2>
            </FadeUp>

            <FadeUp>
              <div className={s.faqList} role="list">
                <details className={s.faqItem} role="listitem">
                  <summary>
                    Is this a government website?
                    <span className={s.faqToggle} aria-hidden="true"><IconPlus /></span>
                  </summary>
                  <p className={s.faqBody}>
                    No. YojanaScan is an independent screening tool. We encode
                    rules from official portals and link you straight to the
                    government application pages — we never handle your
                    application money.
                  </p>
                </details>

                <details className={s.faqItem} role="listitem">
                  <summary>
                    How is this different from asking ChatGPT?
                    <span className={s.faqToggle} aria-hidden="true"><IconPlus /></span>
                  </summary>
                  <p className={s.faqBody}>
                    A chatbot guesses from training data and routinely invents
                    subsidy percentages. Here, eligibility is computed by a
                    rule engine over hand-encoded conditions with per-scheme
                    verification dates. The model only writes prose around
                    results that are already decided by deterministic logic.
                  </p>
                </details>

                <details className={s.faqItem} role="listitem">
                  <summary>
                    What if a scheme&rsquo;s rules changed yesterday?
                    <span className={s.faqToggle} aria-hidden="true"><IconPlus /></span>
                  </summary>
                  <p className={s.faqBody}>
                    Every scheme shows its last-verified date, and reports link
                    to the official source so you can confirm. Schemes whose
                    budgets lapse are marked, not silently dropped.
                  </p>
                </details>

                <details className={s.faqItem} role="listitem">
                  <summary>
                    I&rsquo;m outside Maharashtra — is the report still worth it?
                    <span className={s.faqToggle} aria-hidden="true"><IconPlus /></span>
                  </summary>
                  <p className={s.faqBody}>
                    Yes — central schemes (PMEGP, CGTMSE, MUDRA, ZED, NSIC
                    and more) apply across India and carry the largest amounts.
                    You will see state coverage labelled honestly before you
                    pay.
                  </p>
                </details>

                <details className={s.faqItem} role="listitem">
                  <summary>
                    Does eligible mean approved?
                    <span className={s.faqToggle} aria-hidden="true"><IconPlus /></span>
                  </summary>
                  <p className={s.faqBody}>
                    No screening tool can promise approval — banks and
                    implementing agencies make the final call. We show you
                    exactly which conditions you meet, which we could not
                    verify, and what documents the agency will ask for.
                  </p>
                </details>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ===================== FINAL CTA ===================== */}
        <section className={s.section} aria-label="Final call to action">
          <div className={s.wrap}>
            <FadeUp>
              <div className={s.finalCta}>
                <h2 className={s.finalCtaH2}>
                  Three minutes. <em>Every rupee you qualify for.</em>
                </h2>
                <p className={s.finalCtaSub}>
                  The scan is free and anonymous. Pay only if you want the
                  full report — and only after you see your match count.
                </p>
                <div className={s.finalCtaActions}>
                  <Link href="/scan" className={`${s.btnPrimary} ${s.btnPrimaryLg}`}>
                    Run the free scan <IconArrowRight />
                  </Link>
                  <Link href="/login" className={s.btnOutline} style={{ padding: "15px 24px", fontSize: "16px", minHeight: "52px", borderRadius: "var(--r-lg)" }}>
                    Sign in
                  </Link>
                </div>
                <p className={s.finalCtaMeta}>
                  21 schemes · 16 central + 5 Maharashtra · verified 11 Jun 2026
                </p>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ===================== FOOTER ===================== */}
        <footer className={s.footer} role="contentinfo">
          <div className={s.footerInner}>
            {/* Brand */}
            <div className={s.footerBrand}>
              <Link href="/" className={s.wordmark} style={{ fontSize: "17px" }}>
                <span className={s.wordmarkMark} style={{ width: "28px", height: "28px", fontSize: "14px" }} aria-hidden="true">₹</span>
                <span className={s.wordmarkText}>Yojana<em>Scan</em></span>
              </Link>
              <p className={s.footerTagline}>
                Deterministic MSME scheme eligibility — 10 questions, a rule
                engine, a ₹499 report.
              </p>
            </div>

            {/* Product links */}
            <nav className={s.footerLinks} aria-label="Product links">
              <div className={s.footerLinksHead}>Product</div>
              <a href="#how-it-works" className={s.footerLink}>How it works</a>
              <a href="#schemes" className={s.footerLink}>Schemes covered</a>
              <a href="#pricing" className={s.footerLink}>Pricing</a>
              <Link href="/scan" className={s.footerLink}>Run free scan</Link>
            </nav>

            {/* Account links */}
            <nav className={s.footerLinks} aria-label="Account links">
              <div className={s.footerLinksHead}>Account</div>
              <Link href="/login" className={s.footerLink}>Sign in</Link>
              <Link href="/scan" className={s.footerLink}>Start scanning</Link>
            </nav>
          </div>

          {/* Bottom bar */}
          <div className={s.footerBottom}>
            <p className={s.footerDisclaimer}>
              YojanaScan is an independent eligibility screening tool, not a
              government portal. We encode rules from official sources; the
              final eligibility decision rests with the implementing agency or
              bank. Scheme data verified as at 11 Jun 2026. Always confirm
              current rules at the official portal before applying.
            </p>
            <span className={s.footerCopy}>© 2026 YojanaScan</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
