"use client";

/**
 * Free teaser: match count, combined benefit ceiling, ONE unlocked scheme.
 * Everything else stays blurred behind the ₹499 paywall. The scan runs
 * entirely client-side — answers never leave the browser until checkout.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { runScan, formatINR } from "@/lib/engine/evaluate";
import type { IntakeAnswers, ScanResult } from "@/lib/engine/types";
import type { Scheme } from "@/lib/engine/types";
import { ANSWERS_KEY, PAID_KEY } from "@/lib/questions";
import { startCheckout } from "@/lib/checkout";
import schemesJson from "@/data/schemes.json";

const SCHEMES = schemesJson as unknown as Scheme[];

export default function ResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [ringIn, setRingIn] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(ANSWERS_KEY);
    if (!raw) {
      router.replace("/scan");
      return;
    }
    try {
      const answers = JSON.parse(raw) as IntakeAnswers;
      setResult(runScan(SCHEMES, answers));
      requestAnimationFrame(() => setTimeout(() => setRingIn(true), 150));
    } catch {
      router.replace("/scan");
    }
  }, [router]);

  const eligible = result?.eligible ?? [];
  const top = eligible[0];
  const locked = eligible.slice(1);
  const ringPct = useMemo(
    () => (result ? Math.round((eligible.length / SCHEMES.length) * 100) : 0),
    [result, eligible.length]
  );

  const pay = async () => {
    setPaying(true);
    setPayError(null);
    try {
      const token = await startCheckout();
      sessionStorage.setItem(PAID_KEY, token);
      router.push("/report");
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Payment did not complete. No money was taken — try again.");
      setPaying(false);
    }
  };

  if (!result) {
    return (
      <main className="wizard" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" />
      </main>
    );
  }

  const C = 2 * Math.PI * 74;

  return (
    <main className="wrap" style={{ paddingBottom: 60 }}>
      <section className="results-hero">
        <div className="score-ring-wrap">
          <svg width="168" height="168" viewBox="0 0 168 168">
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ffc46b" />
                <stop offset="100%" stopColor="#ff7a1f" />
              </linearGradient>
            </defs>
            <circle className="score-ring-bg" cx="84" cy="84" r="74" fill="none" strokeWidth="10" />
            <circle
              className="score-ring-fg"
              cx="84"
              cy="84"
              r="74"
              fill="none"
              strokeWidth="10"
              strokeDasharray={C}
              strokeDashoffset={ringIn ? C * (1 - Math.max(ringPct, 4) / 100) : C}
            />
          </svg>
          <div className="score-ring-label">
            <div>
              <div className="stat-number" style={{ fontSize: 52 }}>{eligible.length}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.1em", marginTop: -6 }}>
                MATCHES
              </div>
            </div>
          </div>
        </div>

        <h1 className="section-title" style={{ maxWidth: 640, margin: "0 auto 10px" }}>
          You match <span className="grad-text">{eligible.length} of {SCHEMES.length}</span> encoded schemes
        </h1>
        <p className="section-sub" style={{ maxWidth: 560, margin: "0 auto" }}>
          Combined benefit ceiling across your matches:{" "}
          <strong style={{ color: "var(--gold)" }}>{formatINR(result.totalMaxValue)}</strong>
          {result.nearMisses.length > 0 && (
            <> · plus {result.nearMisses.length} near-miss{result.nearMisses.length > 1 ? "es" : ""} one fix away</>
          )}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
          <span className="chip chip-green">✓ Deterministic match — not AI guesswork</span>
          <span className="chip">Verified rules · sourced links</span>
        </div>
      </section>

      {eligible.length === 0 ? (
        <div className="card" style={{ maxWidth: 620, margin: "30px auto", textAlign: "center", padding: 40 }}>
          <h2 style={{ fontSize: 22, marginBottom: 10 }}>No hard matches — but look at the near-misses</h2>
          <p style={{ color: "var(--text-2)" }}>
            {result.nearMisses.length > 0
              ? `${result.nearMisses.length} scheme(s) reject you on exactly one condition (often just Udyam registration — free, 15 minutes). Re-run the scan after fixing it.`
              : "Based on your answers, none of the currently encoded schemes apply. Try re-running with different needs selected, or check back as coverage grows."}
          </p>
          <Link href="/scan" className="btn btn-primary" style={{ marginTop: 18 }}>
            Re-run the scan
          </Link>
        </div>
      ) : (
        <>
          {/* Unlocked top match */}
          {top && (
            <div style={{ maxWidth: 720, margin: "26px auto 0" }}>
              <div className="section-eyebrow" style={{ textAlign: "center" }}>
                Your top match — free preview
              </div>
              <div className="card scheme-card" style={{ borderColor: "rgba(47,214,163,0.45)" }}>
                <div className="scheme-card-head">
                  <div>
                    <div className="scheme-name">{top.scheme.name}</div>
                    <div className="scheme-authority">{top.scheme.authority}</div>
                  </div>
                  <span className={`chip ${top.scheme.level === "state" ? "chip-cyan" : "chip-saffron"}`}>
                    {top.scheme.level === "state" ? "Maharashtra" : "Central"}
                  </span>
                </div>
                <div className="benefit-value">{top.scheme.benefit.maxValue > 0 ? `up to ${formatINR(top.scheme.benefit.maxValue)}` : "Credit / facilitation benefit"}</div>
                <p className="scheme-benefit" style={{ margin: 0 }}>{top.scheme.benefit.headline}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="verified-badge">✓ rules verified {top.scheme.lastVerified}</span>
                  <a href={top.scheme.applyUrl} target="_blank" rel="noopener noreferrer" className="chip chip-cyan">
                    Official portal ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Locked remainder */}
          {locked.length > 0 && (
            <div style={{ maxWidth: 720, margin: "22px auto 0", display: "grid", gap: 14 }}>
              {locked.map((r) => (
                <div key={r.scheme.id} className="card scheme-card locked-card">
                  <div className="locked-blur">
                    <div className="scheme-card-head">
                      <div>
                        <div className="scheme-name">{r.scheme.name.replace(/[A-Za-zऀ-ॿ]/g, "█")}</div>
                        <div className="scheme-authority">{r.scheme.authority}</div>
                      </div>
                    </div>
                    <p className="scheme-benefit" style={{ margin: 0 }}>{r.scheme.benefit.headline}</p>
                  </div>
                  <div className="locked-overlay">
                    <span className="lock-icon">🔒</span>
                    <span>
                      {r.scheme.level === "state" ? "Maharashtra" : "Central"} ·{" "}
                      {r.scheme.benefit.maxValue > 0 ? `up to ${formatINR(r.scheme.benefit.maxValue)}` : "support scheme"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Paywall */}
          <div style={{ maxWidth: 720, margin: "26px auto 0" }}>
            <div className="paywall">
              <div>
                <div className="price-tag">
                  <span className="price-strike">₹2,999</span>₹499
                </div>
                <div style={{ color: "var(--text-2)", fontSize: 14 }}>
                  Full report: every match, amounts, documents, links, near-misses. Print-ready.
                </div>
                {payError && (
                  <div style={{ color: "var(--danger)", fontSize: 13.5, marginTop: 6 }}>{payError}</div>
                )}
              </div>
              <button className="btn btn-primary btn-lg" onClick={pay} disabled={paying}>
                {paying ? "Opening checkout…" : `Unlock all ${eligible.length} matches →`}
              </button>
            </div>
            <p style={{ textAlign: "center", color: "var(--text-3)", fontSize: 13, marginTop: 14 }} className="no-print">
              Secured by Razorpay · UPI, cards, netbanking · Instant access
            </p>
          </div>
        </>
      )}
    </main>
  );
}
