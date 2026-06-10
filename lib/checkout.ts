"use client";

/**
 * Checkout orchestration. Two modes, decided server-side by /api/checkout:
 *  - "razorpay": real ₹499 order; opens Razorpay Checkout, then verifies the
 *    payment signature server-side (/api/verify) before unlocking.
 *  - "demo": no keys configured; simulates a successful payment so the full
 *    product flow can be exercised end-to-end. Demo unlocks are labelled in
 *    the report.
 *
 * Resolves with an unlock token to store in sessionStorage.
 */

interface CheckoutInit {
  mode: "razorpay" | "demo";
  token?: string;
  keyId?: string;
  orderId?: string;
  amount?: number;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Razorpay. Check your connection and try again."));
    document.body.appendChild(s);
  });
}

export async function startCheckout(): Promise<string> {
  const res = await fetch("/api/checkout", { method: "POST" });
  if (!res.ok) throw new Error("Could not start checkout. Try again in a moment.");
  const init = (await res.json()) as CheckoutInit;

  if (init.mode === "demo") {
    // Simulated processing beat so the flow feels real in demo mode.
    await new Promise((r) => setTimeout(r, 1100));
    return init.token!;
  }

  await loadRazorpayScript();

  return new Promise<string>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: init.keyId,
      order_id: init.orderId,
      amount: init.amount,
      currency: "INR",
      name: "YojanaScan",
      description: "Full eligibility report",
      theme: { color: "#ff9933" },
      modal: {
        ondismiss: () => reject(new Error("Checkout closed before payment.")),
      },
      handler: async (resp: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        try {
          const verify = await fetch("/api/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(resp),
          });
          const data = (await verify.json()) as { ok: boolean; token?: string };
          if (verify.ok && data.ok && data.token) resolve(data.token);
          else reject(new Error("Payment could not be verified. If money was deducted it will auto-refund."));
        } catch {
          reject(new Error("Payment verification failed. If money was deducted it will auto-refund."));
        }
      },
    });
    rzp.open();
  });
}
