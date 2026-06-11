/**
 * Stateless HMAC-derived OTP helpers.
 * No storage required — the 5-minute sliding window is the state.
 *
 * Algorithm:
 *   HMAC-SHA256(secret, "otp:{email}:{windowIndex}")
 *   → take first 8 hex chars → parse as uint32 → mod 1_000_000 → zero-pad to 6 digits
 *
 * Validity: current window OR the immediately preceding one (≈5–10 min total).
 */

import crypto from "node:crypto";

export function getAuthSecret(): string {
  return process.env.AUTH_SECRET ?? "yojanascan-dev-secret";
}

export function currentWindow(now: number = Date.now()): number {
  return Math.floor(now / 300_000); // 5-minute windows
}

export function otpForWindow(
  email: string,
  windowIndex: number,
  secret: string = getAuthSecret()
): string {
  const msg = `otp:${email.toLowerCase().trim()}:${windowIndex}`;
  const hex = crypto.createHmac("sha256", secret).update(msg).digest("hex");
  const n = parseInt(hex.slice(0, 8), 16) % 1_000_000;
  return n.toString().padStart(6, "0");
}

export function generateOtp(
  email: string,
  now: number = Date.now(),
  secret: string = getAuthSecret()
): string {
  return otpForWindow(email, currentWindow(now), secret);
}

export function verifyOtp(
  email: string,
  code: string,
  now: number = Date.now(),
  secret: string = getAuthSecret()
): boolean {
  // Fast-reject malformed input before any crypto
  if (!/^\d{6}$/.test(code)) return false;

  const win = currentWindow(now);
  const current = otpForWindow(email, win, secret);
  const previous = otpForWindow(email, win - 1, secret);

  // timing-safe comparison on fixed-length (6-byte) buffers
  const codeBuf = Buffer.from(code.padStart(6, "0"));
  const currentBuf = Buffer.from(current);
  const previousBuf = Buffer.from(previous);

  const matchCurrent = codeBuf.length === currentBuf.length &&
    crypto.timingSafeEqual(codeBuf, currentBuf);
  const matchPrevious = codeBuf.length === previousBuf.length &&
    crypto.timingSafeEqual(codeBuf, previousBuf);

  return matchCurrent || matchPrevious;
}
