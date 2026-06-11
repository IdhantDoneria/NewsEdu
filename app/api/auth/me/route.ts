import { NextRequest, NextResponse } from "next/server";
import { openSession, COOKIE_NAME } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue) {
    return NextResponse.json({ email: null, paid: false });
  }

  const session = openSession(cookieValue);
  if (!session) {
    return NextResponse.json({ email: null, paid: false });
  }

  return NextResponse.json({ email: session.email, paid: session.paid });
}
