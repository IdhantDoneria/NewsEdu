"use client";

/**
 * Stateless email-OTP sign-in / sign-up.
 *
 * Step 1 — enter email, press "Send code".
 * Step 2 — enter 6-digit OTP (auto-advance, full-paste, auto-submit).
 *
 * On success: router.replace(next || "/")
 */

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./login.module.css";

// ---------------------------------------------------------------------------
// Inner component that uses useSearchParams (must be inside a Suspense boundary)
// ---------------------------------------------------------------------------

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";

  // ---- Step 1 state ----
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // ---- Step 2 state ----
  const [step, setStep] = useState<1 | 2>(1);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const digitRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null, null, null]);

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const id = setInterval(() => {
      setResendCountdown((c) => {
        if (c <= 1) { clearInterval(id); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [resendCountdown]);

  // ---------------------------------------------------------------------------
  // Step 1 — request OTP
  // ---------------------------------------------------------------------------

  const sendCode = useCallback(async (emailToUse: string) => {
    const norm = emailToUse.toLowerCase().trim();
    if (!norm || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(norm)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailError(null);
    setSending(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: norm }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        mode?: string;
        devOtp?: string;
        error?: string;
        message?: string;
      };

      if (!data.ok) {
        if (data.error === "rate_limited") {
          setEmailError("Too many attempts. Please wait 15 minutes before trying again.");
        } else if (data.error === "send_failed") {
          setEmailError(data.message ?? "Could not send the code. Check the address or try again.");
        } else {
          setEmailError("Invalid email address.");
        }
        return;
      }

      setDevOtp(data.mode === "demo" ? (data.devOtp ?? null) : null);
      setDigits(["", "", "", "", "", ""]);
      setOtpError(null);
      setStep(2);
      setResendCountdown(30);
      // Focus first digit on next tick
      requestAnimationFrame(() => digitRefs.current[0]?.focus());
    } catch {
      setEmailError("Network error — please try again.");
    } finally {
      setSending(false);
    }
  }, []);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendCode(email);
  };

  // ---------------------------------------------------------------------------
  // Step 2 — digit inputs
  // ---------------------------------------------------------------------------

  const handleDigitKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[idx] === "" && idx > 0) {
        // Move focus to previous input on empty backspace
        e.preventDefault();
        const prev = digitRefs.current[idx - 1];
        if (prev) {
          prev.focus();
          setDigits((d) => { const n = [...d]; n[idx - 1] = ""; return n; });
        }
      }
    }
  };

  const handleDigitInput = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "");

    // Handle paste of 6 digits
    if (val.length === 6) {
      const newDigits = val.split("");
      setDigits(newDigits);
      digitRefs.current[5]?.focus();
      // auto-submit
      void submitOtp(newDigits.join(""));
      return;
    }

    // Handle paste of partial or single digit
    if (val.length > 1) {
      const partial = val.slice(0, 6 - idx);
      const newDigits = [...digits];
      for (let i = 0; i < partial.length && idx + i < 6; i++) {
        newDigits[idx + i] = partial[i];
      }
      setDigits(newDigits);
      const nextIdx = Math.min(idx + partial.length, 5);
      digitRefs.current[nextIdx]?.focus();
      if (newDigits.every((d) => d !== "")) {
        void submitOtp(newDigits.join(""));
      }
      return;
    }

    // Single digit
    if (val.length === 1) {
      const newDigits = [...digits];
      newDigits[idx] = val;
      setDigits(newDigits);
      if (idx < 5) {
        digitRefs.current[idx + 1]?.focus();
      }
      // auto-submit when all filled
      if (newDigits.every((d) => d !== "")) {
        void submitOtp(newDigits.join(""));
      }
    } else {
      // cleared
      const newDigits = [...digits];
      newDigits[idx] = "";
      setDigits(newDigits);
    }
  };

  const submitOtp = useCallback(async (code: string) => {
    if (code.length !== 6 || !/^\d{6}$/.test(code)) return;
    setOtpError(null);
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim(), otp: code }),
      });
      const data = (await res.json()) as { ok: boolean; email?: string; error?: string };
      if (data.ok) {
        router.replace(nextPath);
      } else {
        setOtpError("That code didn't match. Codes expire after 10 minutes.");
        setDigits(["", "", "", "", "", ""]);
        requestAnimationFrame(() => digitRefs.current[0]?.focus());
      }
    } catch {
      setOtpError("Network error — please try again.");
    } finally {
      setVerifying(false);
    }
  }, [email, nextPath, router]);

  const handleResend = () => {
    void sendCode(email);
  };

  const handleChangeEmail = () => {
    setStep(1);
    setDigits(["", "", "", "", "", ""]);
    setOtpError(null);
    setDevOtp(null);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={styles.page}>
      <div className={`card ${styles.card}`}>
        {step === 1 ? (
          <form onSubmit={handleEmailSubmit} noValidate>
            <h1 className={styles.heading}>Sign in or create your account</h1>
            <p className={styles.sub}>
              One field. Your email is your account — we&apos;ll send a 6-digit code.
            </p>

            <div className={styles.field}>
              <label htmlFor="email-input" className={styles.label}>
                Email address
              </label>
              <input
                id="email-input"
                type="email"
                autoComplete="email"
                inputMode="email"
                className={styles.input}
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                placeholder="you@example.com"
                disabled={sending}
                required
              />
            </div>

            {emailError && (
              <div className={styles.error} role="alert">
                {emailError}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%", minHeight: 44 }}
              disabled={sending}
            >
              {sending ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <div>
            <h1 className={styles.heading}>Check your inbox</h1>
            <p className={styles.codeSent}>
              Code sent to{" "}
              <span className={styles.codeSentEmail}>{email.toLowerCase().trim()}</span>
            </p>

            {devOtp && (
              <div className={styles.demoRow}>
                <span className="chip chip-cyan">
                  Demo mode — your code: {devOtp}
                </span>
              </div>
            )}

            <div
              className={styles.digitRow}
              role="group"
              aria-label="6-digit sign-in code"
            >
              {digits.map((d, idx) => (
                <input
                  key={idx}
                  ref={(el) => { digitRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={6}
                  autoComplete={idx === 0 ? "one-time-code" : "off"}
                  aria-label={`Digit ${idx + 1} of 6`}
                  className={styles.digit}
                  value={d}
                  onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                  onChange={(e) => handleDigitInput(idx, e)}
                  disabled={verifying}
                />
              ))}
            </div>

            {verifying && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                <div className="spinner" />
              </div>
            )}

            {otpError && (
              <div className={styles.error} role="alert">
                {otpError}
              </div>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.resend}
                onClick={handleResend}
                disabled={resendCountdown > 0 || sending}
              >
                {resendCountdown > 0
                  ? `Resend code in ${resendCountdown}s`
                  : sending
                  ? "Sending…"
                  : "Resend code"}
              </button>

              <button
                type="button"
                className={styles.changeEmail}
                onClick={handleChangeEmail}
              >
                Use a different email
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export — Suspense boundary required for useSearchParams in App Router
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div className="spinner" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
