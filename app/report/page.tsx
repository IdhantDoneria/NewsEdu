"use client";

/**
 * The ₹499 report. Gated by the unlock token from checkout (V1: client-side
 * gate, documented in README). Re-runs the deterministic scan and renders the
 * full deliverable: per-scheme benefits, why-you-qualify traces, document
 * checklists, application steps, sources, last-verified dates, near-misses.
 * Print stylesheet turns this page into the PDF.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { runScan, formatINR } from "@/lib/engine/evaluate";
import type { IntakeAnswers, ScanResult } from "@/lib/engine/types";
import type { Scheme } from "@/lib/engine/types";
import { ANSWERS_KEY, PAID_KEY, QUESTIONS } from "@/lib/questions";
import schemesJson from "@/data/schemes.json";

const SCHEMES = schemesJson as unknown as Scheme[];

function profileSummary(answers: IntakeAnswers): string {
  const parts: string[] = [];
  for (const q of QUESTIONS) {
    const v = answers[q.id];
    const values = Array.isArray(v) ? v : [v];
    const labels = q.options.filter((o) => values.includes(o.value as never)).map((o) => o.label);
    if (labels.length) parts.push(labels.join(", "));
  }
  return parts.join(" · ");
}

function templateNarration(result: ScanResult): string {
  const top = result.eligible
    .slice(0, 3)
    .map((r) => r.scheme.shortName)
    .join(", ");
  const nm = result.nearMisses.length;
  return (
    `Based on your answers, your business clears the hard eligibility conditions for ` +
    `${result.eligible.length} government schemes, with a combined benefit ceiling of ` +
    `${formatINR(result.totalMaxValue)}. The standout opportunities for you are ${top || "listed below"}. ` +
    `Each card below shows exactly why you qualify, the documents the implementing agency will ask for, ` +
    `and the official portal to apply on — no consultant needed.` +
    (nm
      ? ` You also have ${nm} near-miss${nm > 1 ? "es" : ""}: scheme${nm > 1 ? "s" : ""} blocked by a single ` +
        `condition, listed at the end with the fix that unlocks ${nm > 1 ? "them" : "it"}.`
      : "")
  );
}

export default function ReportPage() {
  const router = useRouter();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [answers, setAnswers] = useState<IntakeAnswers | null>(null);
  const [demo, setDemo] = useState(false);
  const [narration, setNarration] = useState<string | null>(null);
  const [narrationSource, setNarrationSource] = useState<"claude" | "template">("template");

  useEffect(() => {
    const token = sessionStorage.getItem(PAID_KEY);
    const raw = sessionStorage.getItem(ANSWERS_KEY);
    if (!token || !raw) {
      router.replace(raw ? "/results" : "/scan");
      return;
    }
    setDemo(token.startsWith("demo."));
    try {
      const parsed = JSON.parse(raw) as IntakeAnswers;
      setAnswers(parsed);
      setResult(runScan(SCHEMES, parsed));
    } catch {
      router.replace("/scan");
    }
  }, [router]);

  useEffect(() => {
    if (!result || !answers) return;
    const controller = new AbortController();
    fetch("/api/narrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        profile: profileSummary(answers),
        matchCount: result.eligible.length,
        totalMaxValue: formatINR(result.totalMaxValue),
        schemes: result.eligible.map((r) => ({
          name: r.scheme.name,
          benefit: r.scheme.benefit.headline,
        })),
        nearMisses: result.nearMisses.map((r) => ({
          name: r.scheme.name,
          fix: r.failedConditions[0] ?? "",
        })),
      }),
    })
      .then((r) => r.json())
      .then((d: { narration: string | null; source: string }) => {
        if (d.narration) {
          setNarration(d.narration);
          setNarrationSource("claude");
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [result, answers]);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
    []
  );

  if (!result || !answers) {
    return (
      <main className="wizard" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" />
      </main>
    );
  }

  return (
    <main className="report-wrap">
      {/* Header */}
      <div className="report-card" style={{ borderColor: "rgba(255,153,51,0.4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div className="section-eyebrow">YojanaScan · Eligibility Report</div>
            <h1 className="font-display" style={{ fontSize: 34, margin: "6px 0 8px" }}>
              {result.eligible.length} scheme matches · up to{" "}
              <span className="grad-text">{formatINR(result.totalMaxValue)}</span>
            </h1>
            <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>
              Generated {today} · deterministic rule-engine verdict · every scheme carries its
              last-verified date and official source
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} className="no-print">
            {demo && <span className="chip chip-cyan">Demo unlock — no payment taken</span>}
            <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
              Download PDF ⬇
            </button>
          </div>
        </div>
        <div className="report-section-label">Your profile</div>
        <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>{profileSummary(answers)}</p>
      </div>

      {/* Narration */}
      <div className="report-card">
        <div className="narration">
          {(narration ?? templateNarration(result)).split("\n\n").map((p, i) => (
            <p key={i} style={{ margin: i === 0 ? "0 0 10px" : 0 }}>{p}</p>
          ))}
        </div>
        <p style={{ color: "var(--text-3)", fontSize: 12, margin: "10px 0 0" }}>
          {narrationSource === "claude"
            ? "Summary narrated by Claude from the engine's verdict — the model cannot alter eligibility."
            : "Deterministic summary. Set ANTHROPIC_API_KEY for a Claude-narrated opening — narration never alters eligibility."}
        </p>
      </div>

      {/* Matched schemes */}
      {result.eligible.map((r, idx) => (
        <div key={r.scheme.id} className="report-card">
          <div className="report-h">
            <span className="step-num" style={{ flexShrink: 0 }}>{idx + 1}</span>
            <span>{r.scheme.name}</span>
            <span className={`chip ${r.scheme.level === "state" ? "chip-cyan" : "chip-saffron"}`}>
              {r.scheme.level === "state" ? "Maharashtra" : "Central"}
            </span>
          </div>
          <div className="scheme-authority" style={{ marginTop: 6 }}>{r.scheme.authority}</div>

          <div className="report-section-label">Benefit</div>
          <div className="benefit-value">
            {r.scheme.benefit.maxValue > 0 ? `up to ${formatINR(r.scheme.benefit.maxValue)}` : "Credit / facilitation benefit"}
          </div>
          <p className="scheme-benefit" style={{ margin: "4px 0 8px" }}>{r.scheme.benefit.headline}</p>
          <ul className="doc-list">
            {r.scheme.benefit.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
          {r.scheme.benefit.maxValue > 0 && (
            <p style={{ color: "var(--text-3)", fontSize: 12.5, margin: "8px 0 0" }}>
              Ceiling assumes: {r.scheme.benefit.maxValueNote}
            </p>
          )}

          <div className="report-section-label">Why you qualify</div>
          <ul className="trace-list">
            {r.trace.filter((t) => t.passed).map((t, i) => (
              <li key={i} className="trace-pass">{t.label}</li>
            ))}
          </ul>

          {r.scheme.softChecks.length > 0 && (
            <>
              <div className="report-section-label">Verify before applying</div>
              <ul className="doc-list">
                {r.scheme.softChecks.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}

          <div className="report-section-label">Documents checklist</div>
          <ul className="doc-list">
            {r.scheme.documents.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>

          <div className="report-section-label">How to apply</div>
          <ol style={{ color: "var(--text-2)", fontSize: 14.5, margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
            {r.scheme.applySteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
            <a href={r.scheme.applyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
              Apply on official portal ↗
            </a>
            <span className="verified-badge">✓ rules verified {r.scheme.lastVerified}</span>
            <span className="chip chip-dim">confidence: {r.scheme.confidence}</span>
          </div>

          <div className="report-section-label">Sources</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {r.scheme.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--cyan)", fontSize: 13, wordBreak: "break-all" }}
              >
                {s.official ? "🏛 " : "🔗 "}
                {s.url}
              </a>
            ))}
          </div>
          {r.scheme.notes && (
            <p style={{ color: "var(--text-3)", fontSize: 12.5, margin: "12px 0 0" }}>{r.scheme.notes}</p>
          )}
        </div>
      ))}

      {/* Near misses */}
      {result.nearMisses.length > 0 && (
        <div className="report-card" style={{ borderColor: "rgba(94,196,255,0.4)" }}>
          <div className="report-h">🔓 One fix away — {result.nearMisses.length} more scheme{result.nearMisses.length > 1 ? "s" : ""}</div>
          <p style={{ color: "var(--text-2)", fontSize: 14.5 }}>
            These schemes reject you on exactly one condition. Fix it and re-run your scan.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {result.nearMisses.map((r) => (
              <div key={r.scheme.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <strong>{r.scheme.name}</strong>
                <div style={{ color: "var(--text-2)", fontSize: 14, marginTop: 4 }}>
                  {r.scheme.benefit.headline}
                </div>
                <ul className="trace-list" style={{ marginTop: 8 }}>
                  <li className="trace-fail">Blocked by: {r.failedConditions[0]}</li>
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="report-card" style={{ background: "transparent" }}>
        <p style={{ color: "var(--text-3)", fontSize: 12.5, margin: 0 }}>
          YojanaScan is an independent screening tool, not a government agency. This report
          reflects scheme rules as encoded on the verification dates shown; final eligibility and
          sanction rest with the implementing agency and lender. Scheme budgets are finite and
          windows open and close — apply early. Nothing here is financial or legal advice.
        </p>
      </div>
    </main>
  );
}
