import { NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

const PRICE_PAISE = 499 * 100;

/**
 * Creates a payment order for the ₹499 report.
 * With Razorpay keys configured: creates a real order via the Orders API.
 * Without keys: returns a demo token so the flow stays fully exercisable.
 */
export async function POST() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    const token = `demo.${crypto.randomBytes(12).toString("hex")}`;
    return NextResponse.json({ mode: "demo", token });
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: PRICE_PAISE,
      currency: "INR",
      receipt: `ys_${Date.now()}`,
      notes: { product: "yojanascan-report-v1" },
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "order_failed" }, { status: 502 });
  }

  const order = (await res.json()) as { id: string; amount: number };
  return NextResponse.json({
    mode: "razorpay",
    keyId,
    orderId: order.id,
    amount: order.amount,
  });
}
