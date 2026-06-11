import { NextResponse } from "next/server";
import { buildSetCookieHeader } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", buildSetCookieHeader("", true));
  return res;
}
