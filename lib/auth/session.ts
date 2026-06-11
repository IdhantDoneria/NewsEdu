/**
 * Signed-cookie session helpers — no external deps.
 *
 * Cookie format:  base64url(JSON payload) . HMAC-SHA256(secret, base64url(JSON))
 *
 * 30-day maxAge, httpOnly, sameSite "lax", path "/",
 * secure in production (NODE_ENV === "production").
 *
 * Does NOT import any Next.js server modules so this file is safe to unit-test
 * in a plain Node/vitest environment.
 */

import crypto from "node:crypto";
import { getAuthSecret } from "./otp";

export interface SessionPayload {
  email: string;
  paid: boolean;
  iat: number; // Date.now() at seal time
}

const COOKIE_NAME = "ys_session";
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function toBase64Url(s: string): string {
  return Buffer.from(s).toString("base64url");
}

function fromBase64Url(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

function sign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function sealSession(
  payload: SessionPayload,
  secret: string = getAuthSecret()
): string {
  const encoded = toBase64Url(JSON.stringify(payload));
  const sig = sign(encoded, secret);
  return `${encoded}.${sig}`;
}

export function openSession(
  cookieValue: string,
  secret: string = getAuthSecret()
): SessionPayload | null {
  const dot = cookieValue.lastIndexOf(".");
  if (dot === -1) return null;

  const encoded = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);

  // Timing-safe signature comparison
  const expected = sign(encoded, secret);
  const sigBuf = Buffer.from(sig, "base64url");
  const expBuf = Buffer.from(expected, "base64url");
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  // Decode and shape-check
  try {
    const raw = fromBase64Url(encoded);
    const payload = JSON.parse(raw) as unknown;
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as Record<string, unknown>).email !== "string" ||
      typeof (payload as Record<string, unknown>).paid !== "boolean" ||
      typeof (payload as Record<string, unknown>).iat !== "number"
    ) {
      return null;
    }
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie-string builder (no Next dependency — usable anywhere)
// ---------------------------------------------------------------------------

export function buildSetCookieHeader(
  value: string,
  clear = false
): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const maxAge = clear ? 0 : MAX_AGE;
  const val = clear ? "" : value;
  return `${COOKIE_NAME}=${val}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export { COOKIE_NAME };
