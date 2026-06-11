import { NextRequest, NextResponse } from "next/server";
import { generateOtp } from "@/lib/auth/otp";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// In-memory rate limiter: max 3 requests per email per 15 min.
// Module-level Map is fine for V1 (single process / serverless warm instance).
// ---------------------------------------------------------------------------

interface RateBucket {
  count: number;
  resetAt: number; // epoch ms
}

const rateBuckets = new Map<string, RateBucket>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 3;

function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(email);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(email, { count: 1, resetAt: now + WINDOW_MS });
    return true; // allowed
  }
  if (bucket.count >= MAX_PER_WINDOW) return false; // blocked
  bucket.count += 1;
  return true;
}

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// ---------------------------------------------------------------------------
// Gmail SMTP send via nodemailer (lazy import — no hard dep at module level)
// ---------------------------------------------------------------------------

async function sendGmailOtp(email: string, otp: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodemailer = (await import("nodemailer")) as typeof import("nodemailer");

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Your YojanaScan code</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#0e0e12;padding:24px 32px;">
              <span style="font-size:22px;font-weight:700;color:#ffffff;">
                <span style="color:#ff9933;">₹</span>YojanaScan
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111111;">
                Your sign-in code
              </h1>
              <p style="margin:0;font-size:14px;color:#555555;line-height:1.5;">
                Use this 6-digit code to sign in to YojanaScan.
                It&apos;s valid for <strong>10 minutes</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;">
              <div style="background:#f8f8f8;border-radius:10px;padding:20px;text-align:center;border:1px solid #ebebeb;">
                <span style="font-size:42px;font-weight:700;letter-spacing:12px;color:#111111;font-variant-numeric:tabular-nums;">
                  ${otp}
                </span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px;">
              <p style="margin:0;font-size:13px;color:#888888;line-height:1.5;">
                Didn&apos;t request this code? You can safely ignore this email —
                no account changes were made.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8f8f8;border-top:1px solid #ebebeb;padding:16px 32px;">
              <p style="margin:0;font-size:12px;color:#aaaaaa;text-align:center;">
                YojanaScan &mdash; Government scheme eligibility engine for Indian MSMEs
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `Your YojanaScan sign-in code: ${otp}\n\nThis code is valid for 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.`;

  await transporter.sendMail({
    from: `"YojanaScan" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `Your YojanaScan code: ${otp}`,
    text: textBody,
    html: htmlBody,
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/request-otp
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { email?: unknown };
  const rawEmail = typeof body.email === "string" ? body.email : "";
  const email = rawEmail.toLowerCase().trim();

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "invalid_email" },
      { status: 400 }
    );
  }

  if (!checkRateLimit(email)) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 }
    );
  }

  const otp = generateOtp(email);

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (gmailUser && gmailPass) {
    try {
      await sendGmailOtp(email, otp);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "send_failed",
          message: "Could not send the code. Check the address or try again.",
        },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, mode: "gmail" });
  }

  // Demo mode — no Gmail env vars; return the code in the response
  return NextResponse.json({ ok: true, mode: "demo", devOtp: otp });
}
