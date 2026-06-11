import Link from "next/link";
import HeroCanvas from "@/components/HeroCanvas";
import Reveal from "@/components/Reveal";
import CountUp from "@/components/CountUp";
import schemes from "@/data/schemes.json";
import type { Scheme } from "@/lib/engine/types";

const SCHEMES = schemes as unknown as Scheme[];

export default function Home() {
  const central = SCHEMES.filter((s) => s.level === "central").length;
  const mh = SCHEMES.filter((s) => s.level === "state").length;
  const verified = SCHEMES.reduce(
    (latest, s) => (s.lastVerified > latest ? s.lastVerified : latest),
    ""
  );
  const verifiedLabel = new Date(verified + "T00:00:00").toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });

  return (
    <main>
      {/* ================= HERO ================= */}
      <section className="hero">
        <HeroCanvas />
        <div className="hero-fade" />
        <div className="hero-content">
          <div className="wrap">
            <span className="hero-eyebrow">
              <span className="pulse-dot" />
              {SCHEMES.length} schemes encoded · verified {verifiedLabel}
            </span>
            <h1 className="hero-title">
              Your MSME is leaving <span className="grad-text">government money</span> on the table.
            </h1>
            <p className="hero-sub">
              India runs 100+ subsidy, credit and certification schemes for small
              businesses. Consultants charge ₹10,000–50,000 just to tell you which
              ones apply. YojanaScan answers in 3 minutes — 10 questions, a
              deterministic rule engine, and a ₹499 report with amounts, documents
              and application links.
            </p>
            <div className="hero-ctas">
              <Link href="/scan" className="btn btn-primary btn-lg">
                Run the free scan →
              </Link>
              <a href="#how" className="btn btn-ghost btn-lg">
                How it works
              </a>
            </div>
            <div className="hero-meta">
              <span className="chip chip-green">✓ Free match count</span>
              <span className="chip">10 questions · ~3 minutes</span>
              <span className="chip">No signup to scan</span>
              <span className="chip chip-saffron">Full report ₹499</span>
            </div>
          </div>
        </div>
        <div className="scroll-cue">
          <span>Scroll</span>
          <span>↓</span>
        </div>
      </section>

      {/* ================= STATS ================= */}
      <section className="section">
        <div className="wrap grid-3">
          <Reveal className="card">
            <div className="stat-number grad-text">
              <CountUp value={100} suffix="+" />
            </div>
            <div className="stat-label">
              live central & state MSME schemes — scattered across dozens of portals
              nobody reads end-to-end
            </div>
          </Reveal>
          <Reveal delay={1} className="card">
            <div className="stat-number grad-text">
              ₹<CountUp value={50} suffix="k" />
            </div>
            <div className="stat-label">
              what consultants charge for an eligibility answer. The schemes
              themselves are free to apply to
            </div>
          </Reveal>
          <Reveal delay={2} className="card">
            <div className="stat-number grad-text">
              <CountUp value={3} suffix=" min" />
            </div>
            <div className="stat-label">
              to your verdict — every match traced condition-by-condition against
              hand-encoded rules
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="section" id="how">
        <div className="wrap">
          <Reveal className="section-head">
            <div className="section-eyebrow">How it works</div>
            <h2 className="section-title">Deterministic by design. The AI never decides.</h2>
            <p className="section-sub">
              Each scheme&apos;s eligibility — entity type, sector, turnover bands,
              Udyam status, ownership category — is hand-encoded as machine-readable
              conditions from official sources. Matching is pure rules: same answers,
              same verdict, every time.
            </p>
          </Reveal>
          <div className="grid-3">
            <Reveal className="card card-lift">
              <div className="step-num">1</div>
              <h3 style={{ fontSize: 19, margin: "16px 0 8px" }}>Answer 10 questions</h3>
              <p style={{ color: "var(--text-2)", fontSize: 15, margin: 0 }}>
                Stage, sector, entity type, investment & turnover bands, Udyam status,
                owner profile. No documents needed, no signup.
              </p>
            </Reveal>
            <Reveal delay={1} className="card card-lift">
              <div className="step-num">2</div>
              <h3 style={{ fontSize: 19, margin: "16px 0 8px" }}>Rule engine matches</h3>
              <p style={{ color: "var(--text-2)", fontSize: 15, margin: 0 }}>
                Your answers run against every encoded scheme. You instantly see your
                match count, the total benefit ceiling and one unlocked scheme — free.
              </p>
            </Reveal>
            <Reveal delay={2} className="card card-lift">
              <div className="step-num">3</div>
              <h3 style={{ fontSize: 19, margin: "16px 0 8px" }}>₹499 full report</h3>
              <p style={{ color: "var(--text-2)", fontSize: 15, margin: 0 }}>
                Every matched scheme with benefit amounts, document checklist,
                application portal links, why-you-qualify trace and a last-verified
                date. Plus near-misses: what one fix would unlock.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= SCHEMES ================= */}
      <section className="section" id="schemes">
        <div className="wrap">
          <Reveal className="section-head">
            <div className="section-eyebrow">Coverage</div>
            <h2 className="section-title">
              {central} central schemes. {mh} Maharashtra schemes. Honest about the rest.
            </h2>
            <p className="section-sub">
              Pan-India coverage on day one would be fake. We launch deep on central
              schemes plus one state, with a verified date on every rule — more states
              follow the same playbook.
            </p>
          </Reveal>
        </div>
        <div className="marquee">
          <div className="marquee-track">
            {[...SCHEMES, ...SCHEMES].map((s, i) => (
              <span key={`${s.id}-${i}`} className={`chip ${s.level === "state" ? "chip-cyan" : "chip-saffron"}`}>
                {s.shortName}
              </span>
            ))}
          </div>
        </div>
        <div className="wrap" style={{ marginTop: 28 }}>
          <div className="grid-3">
            <Reveal className="card">
              <div className="chip chip-saffron" style={{ marginBottom: 14 }}>Central · {central}</div>
              <p style={{ color: "var(--text-2)", fontSize: 14.5, margin: 0 }}>
                PMEGP, CGTMSE, MUDRA, Stand-Up India, PM Vishwakarma, PMFME, ZED, LEAN,
                NSIC, procurement & more — the flagship money.
              </p>
            </Reveal>
            <Reveal delay={1} className="card">
              <div className="chip chip-cyan" style={{ marginBottom: 14 }}>Maharashtra · {mh}</div>
              <p style={{ color: "var(--text-2)", fontSize: 14.5, margin: 0 }}>
                CMEGP, Package Scheme of Incentives, seed money, women & SC/ST
                top-ups — the state layer consultants actually bill for.
              </p>
            </Reveal>
            <Reveal delay={2} className="card">
              <div className="chip chip-dim" style={{ marginBottom: 14 }}>Your state · next</div>
              <p style={{ color: "var(--text-2)", fontSize: 14.5, margin: 0 }}>
                Outside Maharashtra you still get every central scheme today. State
                packs ship as they&apos;re encoded and verified — never before.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= TRUST ================= */}
      <section className="section">
        <div className="wrap grid-2">
          <Reveal className="card">
            <div className="section-eyebrow">Why trust the verdict</div>
            <h3 className="section-title" style={{ fontSize: 28 }}>
              Rules you can audit, not vibes
            </h3>
            <ul className="doc-list" style={{ marginTop: 18 }}>
              <li>Every condition is encoded from official portals & guidelines, with source links</li>
              <li>Every scheme card carries a <strong>last-verified</strong> date — stale data is flagged, not hidden</li>
              <li>The report shows the exact conditions you passed, one by one</li>
              <li>Requirements we can&apos;t verify from 10 questions are listed as explicit caveats</li>
            </ul>
          </Reveal>
          <Reveal delay={1} className="card">
            <div className="section-eyebrow">Where the AI sits</div>
            <h3 className="section-title" style={{ fontSize: 28 }}>
              The LLM narrates. It never matches.
            </h3>
            <p style={{ color: "var(--text-2)", fontSize: 15 }}>
              Eligibility comes from a deterministic rule engine over hand-encoded
              scheme data — weeks of grunt work a chatbot wrapper can&apos;t fake. A
              language model only writes the plain-language summary of results the
              engine already computed. It cannot hallucinate you into (or out of) a
              scheme.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <span className="chip chip-green">✓ Deterministic matching</span>
              <span className="chip chip-green">✓ Traceable conditions</span>
              <span className="chip chip-green">✓ Sourced & dated data</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= PRICING ================= */}
      <section className="section" id="pricing">
        <div className="wrap">
          <Reveal className="section-head">
            <div className="section-eyebrow">Pricing</div>
            <h2 className="section-title">One consultant question. 1% of the consultant price.</h2>
          </Reveal>
          <div className="grid-2" style={{ maxWidth: 880 }}>
            <Reveal className="card">
              <h3 style={{ fontSize: 20, marginBottom: 4 }}>Free scan</h3>
              <div className="stat-number" style={{ fontSize: 40 }}>₹0</div>
              <ul className="doc-list" style={{ marginTop: 16 }}>
                <li>Your total match count</li>
                <li>Combined benefit ceiling</li>
                <li>One matched scheme, fully unlocked</li>
              </ul>
              <Link href="/scan" className="btn btn-ghost" style={{ marginTop: 22 }}>
                Start free
              </Link>
            </Reveal>
            <Reveal
              delay={1}
              className="card"
              style={{ borderColor: "rgba(255,153,51,0.5)", boxShadow: "var(--glow-saffron)" }}
            >
              <h3 style={{ fontSize: 20, marginBottom: 4 }}>
                Full report <span className="chip chip-saffron" style={{ marginLeft: 6 }}>most useful</span>
              </h3>
              <div className="stat-number grad-text" style={{ fontSize: 40 }}>
                ₹499
              </div>
              <ul className="doc-list" style={{ marginTop: 16 }}>
                <li>Every matched scheme with benefit amounts</li>
                <li>Document checklist per scheme</li>
                <li>Direct application links & steps</li>
                <li>Why-you-qualify trace + last-verified dates</li>
                <li>Near-misses: what one fix unlocks</li>
                <li>Print-ready PDF</li>
              </ul>
              <Link href="/scan" className="btn btn-primary" style={{ marginTop: 22 }}>
                Scan first, pay after →
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section className="section">
        <div className="wrap" style={{ maxWidth: 760 }}>
          <Reveal className="section-head">
            <div className="section-eyebrow">FAQ</div>
            <h2 className="section-title">Fair questions</h2>
          </Reveal>
          <Reveal>
            <details className="faq-item">
              <summary>Is this a government website?</summary>
              <p className="faq-body">
                No. YojanaScan is an independent screening tool. We encode rules from
                official portals and link you straight to the government application
                pages — we never take your application money.
              </p>
            </details>
            <details className="faq-item">
              <summary>How is this different from asking ChatGPT?</summary>
              <p className="faq-body">
                A chatbot guesses from training data and routinely invents subsidy
                percentages. Here, eligibility is computed by a rule engine over
                hand-encoded conditions with per-scheme verification dates. The model
                only writes prose around results that are already decided.
              </p>
            </details>
            <details className="faq-item">
              <summary>What if a scheme&apos;s rules changed yesterday?</summary>
              <p className="faq-body">
                Every scheme shows its last-verified date, and reports link to the
                official source so you can confirm. Schemes whose budgets lapse get
                marked, not silently dropped.
              </p>
            </details>
            <details className="faq-item">
              <summary>I&apos;m outside Maharashtra — is the report still worth it?</summary>
              <p className="faq-body">
                Yes — central schemes (PMEGP, CGTMSE, MUDRA, ZED, NSIC and more) apply
                across India and carry the largest amounts. You&apos;ll see state
                coverage labelled honestly before you pay.
              </p>
            </details>
            <details className="faq-item">
              <summary>Does eligible mean approved?</summary>
              <p className="faq-body">
                No screening tool can promise approval — banks and implementing
                agencies make the final call. We show you exactly which conditions you
                meet, which we couldn&apos;t verify, and what documents the agency will
                ask for.
              </p>
            </details>
          </Reveal>
        </div>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="section">
        <div className="wrap">
          <Reveal
            className="card"
            style={{ textAlign: "center", padding: "64px 28px", borderColor: "rgba(255,153,51,0.35)" }}
          >
            <h2 className="section-title" style={{ maxWidth: 620, margin: "0 auto 14px" }}>
              Three minutes. <span className="grad-text">Every rupee you qualify for.</span>
            </h2>
            <p className="section-sub" style={{ maxWidth: 520, margin: "0 auto 30px" }}>
              The scan is free and anonymous. Pay only if you want the full report.
            </p>
            <Link href="/scan" className="btn btn-primary btn-lg">
              Run the free scan →
            </Link>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
