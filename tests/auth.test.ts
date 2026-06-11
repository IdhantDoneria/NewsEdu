/**
 * Pure unit tests for lib/auth/otp.ts and lib/auth/session.ts.
 * Uses a fixed secret and fixed timestamps — no Next.js imports.
 */

import { describe, expect, it } from "vitest";
import {
  currentWindow,
  generateOtp,
  otpForWindow,
  verifyOtp,
} from "../lib/auth/otp";
import { openSession, sealSession } from "../lib/auth/session";
import type { SessionPayload } from "../lib/auth/session";

const SECRET = "test-secret-fixed";
const EMAIL = "test@example.com";
// A fixed point in time: 2025-01-15T10:07:00.000Z → window = floor(1736935620000 / 300000) = 5789785
const NOW_MS = 1736935620000;
const WINDOW = Math.floor(NOW_MS / 300_000); // 5789785

// ---------------------------------------------------------------------------
// OTP helpers
// ---------------------------------------------------------------------------

describe("currentWindow", () => {
  it("returns an integer bucket for the given epoch ms", () => {
    const w = currentWindow(NOW_MS);
    expect(w).toBe(WINDOW);
    expect(Number.isInteger(w)).toBe(true);
  });

  it("advances by 1 after 5 minutes", () => {
    expect(currentWindow(NOW_MS + 300_000)).toBe(WINDOW + 1);
  });
});

describe("otpForWindow", () => {
  it("produces a 6-digit string", () => {
    const code = otpForWindow(EMAIL, WINDOW, SECRET);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("is deterministic — same inputs always produce the same code", () => {
    const a = otpForWindow(EMAIL, WINDOW, SECRET);
    const b = otpForWindow(EMAIL, WINDOW, SECRET);
    expect(a).toBe(b);
  });

  it("differs for a different email", () => {
    const a = otpForWindow(EMAIL, WINDOW, SECRET);
    const b = otpForWindow("other@example.com", WINDOW, SECRET);
    expect(a).not.toBe(b);
  });

  it("differs for a different window", () => {
    const a = otpForWindow(EMAIL, WINDOW, SECRET);
    const b = otpForWindow(EMAIL, WINDOW + 1, SECRET);
    expect(a).not.toBe(b);
  });

  it("differs for a different secret", () => {
    const a = otpForWindow(EMAIL, WINDOW, SECRET);
    const b = otpForWindow(EMAIL, WINDOW, "another-secret");
    expect(a).not.toBe(b);
  });

  it("normalises email — lowercase + trimmed gives same code", () => {
    const a = otpForWindow(EMAIL, WINDOW, SECRET);
    const b = otpForWindow("  TEST@EXAMPLE.COM  ", WINDOW, SECRET);
    expect(a).toBe(b);
  });
});

describe("generateOtp", () => {
  it("delegates to otpForWindow for the current window", () => {
    const code = generateOtp(EMAIL, NOW_MS, SECRET);
    expect(code).toBe(otpForWindow(EMAIL, WINDOW, SECRET));
  });
});

describe("verifyOtp", () => {
  it("accepts the current window's code", () => {
    const code = otpForWindow(EMAIL, WINDOW, SECRET);
    expect(verifyOtp(EMAIL, code, NOW_MS, SECRET)).toBe(true);
  });

  it("accepts the previous window's code (≤10 min grace)", () => {
    const prevCode = otpForWindow(EMAIL, WINDOW - 1, SECRET);
    expect(verifyOtp(EMAIL, prevCode, NOW_MS, SECRET)).toBe(true);
  });

  it("rejects a code from two windows ago", () => {
    const oldCode = otpForWindow(EMAIL, WINDOW - 2, SECRET);
    expect(verifyOtp(EMAIL, oldCode, NOW_MS, SECRET)).toBe(false);
  });

  it("rejects a wrong code", () => {
    const code = otpForWindow(EMAIL, WINDOW, SECRET);
    const wrong = code === "000000" ? "000001" : "000000";
    expect(verifyOtp(EMAIL, wrong, NOW_MS, SECRET)).toBe(false);
  });

  it("rejects malformed input — fewer than 6 digits", () => {
    expect(verifyOtp(EMAIL, "12345", NOW_MS, SECRET)).toBe(false);
  });

  it("rejects malformed input — non-numeric characters", () => {
    expect(verifyOtp(EMAIL, "abc123", NOW_MS, SECRET)).toBe(false);
  });

  it("rejects malformed input — empty string", () => {
    expect(verifyOtp(EMAIL, "", NOW_MS, SECRET)).toBe(false);
  });

  it("rejects malformed input — 7 digits (too long)", () => {
    expect(verifyOtp(EMAIL, "1234567", NOW_MS, SECRET)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

describe("sealSession / openSession", () => {
  const payload: SessionPayload = {
    email: "user@example.com",
    paid: false,
    iat: NOW_MS,
  };

  it("round-trips a payload correctly", () => {
    const cookie = sealSession(payload, SECRET);
    const opened = openSession(cookie, SECRET);
    expect(opened).not.toBeNull();
    expect(opened!.email).toBe(payload.email);
    expect(opened!.paid).toBe(payload.paid);
    expect(opened!.iat).toBe(payload.iat);
  });

  it("round-trips a paid session", () => {
    const paidPayload: SessionPayload = { ...payload, paid: true };
    const cookie = sealSession(paidPayload, SECRET);
    const opened = openSession(cookie, SECRET);
    expect(opened).not.toBeNull();
    expect(opened!.paid).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const cookie = sealSession(payload, SECRET);
    // Flip a character in the encoded section (before the dot)
    const dot = cookie.lastIndexOf(".");
    const tampered = cookie.slice(0, dot - 1) + "X" + cookie.slice(dot);
    expect(openSession(tampered, SECRET)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const cookie = sealSession(payload, SECRET);
    const dot = cookie.lastIndexOf(".");
    const tamperedSig = cookie.slice(0, dot + 1) + "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    expect(openSession(tamperedSig, SECRET)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const cookie = sealSession(payload, "other-secret");
    expect(openSession(cookie, SECRET)).toBeNull();
  });

  it("rejects a plain base64url string with no signature dot", () => {
    expect(openSession("anJhbmRvbQ", SECRET)).toBeNull();
  });

  it("rejects a structurally invalid payload (missing paid field)", () => {
    // Craft a cookie signed with the right secret but wrong shape
    const raw = Buffer.from(JSON.stringify({ email: "a@b.com", iat: 1 })).toString("base64url");
    const sig = require("node:crypto").createHmac("sha256", SECRET).update(raw).digest("base64url");
    expect(openSession(`${raw}.${sig}`, SECRET)).toBeNull();
  });
});
