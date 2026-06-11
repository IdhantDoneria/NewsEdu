import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { openSession, sealSession, buildSetCookieHeader, COOKIE_NAME } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * Verifies the Razorpay payment signature (HMAC-SHA256 of "order_id|payment_id"
 * with the key secret) and mints an opaque unlock token. V1 keeps no database;
 * the token is the receipt. Production hardening: persist payments and gate
 * the report server-side.
 */
export async function POST(req: NextRequest) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 400 });
  }

  const body = (await req.json()) as {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  };
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const valid =
    expected.length === razorpay_signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));

  if (!valid) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  const token = crypto
    .createHmac("sha256", keySecret)
    .update(`paid:${razorpay_payment_id}`)
    .digest("hex");

  const res = NextResponse.json({ ok: true, token: `rzp.${token}` });

  // If a session cookie exists, re-seal it with paid:true
  const existingCookie = req.cookies.get(COOKIE_NAME)?.value;
  if (existingCookie) {
    const session = openSession(existingCookie);
    if (session) {
      const sealed = sealSession({ ...session, paid: true });
      res.headers.set("Set-Cookie", buildSetCookieHeader(sealed));
    }
  }

  return res;
}
