"use client";

/**
 * The 10-question intake. Fully driven by lib/questions.ts — single-choice
 * questions auto-advance, multi-choice confirm with Next. Keyboard: 1–9
 * select, Enter advances, ← goes back. Answers land in sessionStorage and
 * /results runs the engine client-side.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ANSWERS_KEY, PAID_KEY, QUESTIONS } from "@/lib/questions";

type Draft = Record<string, string | string[]>;

export default function ScanPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({});
  const [shake, setShake] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = QUESTIONS[step];
  const total = QUESTIONS.length;
  const selected = draft[q.id];
  const selectedArr = useMemo(
    () => (Array.isArray(selected) ? selected : selected ? [selected] : []),
    [selected]
  );

  useEffect(() => {
    // A fresh scan invalidates any previous purchase state.
    sessionStorage.removeItem(PAID_KEY);
  }, []);

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    []
  );

  const finish = useCallback(
    (answers: Draft) => {
      sessionStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
      router.push("/results");
    },
    [router]
  );

  const goNext = useCallback(
    (next: Draft) => {
      if (step === total - 1) finish(next);
      else setStep((s) => s + 1);
    },
    [step, total, finish]
  );

  const choose = useCallback(
    (value: string) => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);

      if (!q.multi) {
        const next = { ...draft, [q.id]: value };
        setDraft(next);
        // brief beat so the selection state is visible before advancing
        advanceTimer.current = setTimeout(() => goNext(next), 240);
        return;
      }

      let values = Array.isArray(draft[q.id]) ? [...(draft[q.id] as string[])] : [];
      if (q.exclusiveValue && value === q.exclusiveValue) {
        values = values.includes(value) ? [] : [value];
      } else {
        if (q.exclusiveValue) values = values.filter((v) => v !== q.exclusiveValue);
        values = values.includes(value)
          ? values.filter((v) => v !== value)
          : [...values, value];
      }
      setDraft({ ...draft, [q.id]: values });
    },
    [draft, q, goNext]
  );

  const next = useCallback(() => {
    if (selectedArr.length === 0) {
      setShake(true);
      setTimeout(() => setShake(false), 450);
      return;
    }
    goNext(draft);
  }, [selectedArr, draft, goNext]);

  const back = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
        if ((e.target as HTMLElement)?.tagName !== "INPUT") {
          e.preventDefault();
          back();
        }
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < q.options.length) choose(q.options[idx].value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, choose, q]);

  const progress = ((step + 1) / total) * 100;

  return (
    <main className="wizard">
      <div>
        <div className="progress-track" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={total}>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-meta">
          <span>
            Question {step + 1} of {total}
          </span>
          <span>~{Math.max(total - step, 1) * 12}s left</span>
        </div>
      </div>

      <div className="q-stage">
        <div className={`q-card ${shake ? "shake" : ""}`} key={q.id}>
          <h1 className="q-title">{q.title}</h1>
          {q.subtitle && <p className="q-sub">{q.subtitle}</p>}
          <div className="opt-grid">
            {q.options.map((opt, i) => {
              const isSel = selectedArr.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  className={`opt ${isSel ? "selected" : ""}`}
                  onClick={() => choose(opt.value)}
                  aria-pressed={isSel}
                >
                  <span className="opt-icon" aria-hidden>
                    {opt.icon}
                  </span>
                  <span>
                    <span className="opt-label">{opt.label}</span>
                    {opt.hint && <div className="opt-hint">{opt.hint}</div>}
                  </span>
                  <span className="opt-check" aria-hidden>
                    ✓
                  </span>
                  <span className="opt-hint" style={{ marginLeft: 6 }} aria-hidden>
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="wizard-nav">
        <button className="btn btn-ghost btn-sm" onClick={back} disabled={step === 0}>
          ← Back
        </button>
        <span className="kbd-hint">
          <kbd>1</kbd>–<kbd>{Math.min(q.options.length, 9)}</kbd> select · <kbd>Enter</kbd> next
        </span>
        {q.multi ? (
          <button className="btn btn-primary" onClick={next}>
            {step === total - 1 ? "See my matches →" : "Next →"}
          </button>
        ) : (
          <span style={{ width: 92 }} />
        )}
      </div>
    </main>
  );
}
