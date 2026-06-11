import { NextRequest, NextResponse } from "next/server";
import { verifyOtp } from "@/lib/auth/otp";
import { sealSession, openSession, buildSetCookieHeader, COOKIE_NAME } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { email?: unknown; otp?: unknown };
  const rawEmail = typeof body.email === "string" ? body.email : "";
  const email = rawEmail.toLowerCase().trim();
  const code = typeof body.otp === "string" ? body.otp : "";

  if (!email || !code) {
    return NextResponse.json({ ok: false, error: "invalid_otp" }, { status: 400 });
  }

  if (!verifyOtp(email, code)) {
    return NextResponse.json({ ok: false, error: "invalid_otp" }, { status: 400 });
  }

  // Preserve paid:true if there's an existing valid session with it
  const existingCookie = req.cookies.get(COOKIE_NAME)?.value;
  const existing = existingCookie ? openSession(existingCookie) : null;
  const paid = existing?.email === email && existing.paid === true;

  const sealed = sealSession({ email, paid, iat: Date.now() });
  const setCookie = buildSetCookieHeader(sealed);

  const res = NextResponse.json({ ok: true, email });
  res.headers.set("Set-Cookie", setCookie);
  return res;
}
