// Razorpay REST helper + signature verification (no SDK, Node crypto only).
const crypto = require('crypto');

function keyId() { return process.env.RAZORPAY_KEY_ID || ''; }
function keySecret() { return process.env.RAZORPAY_KEY_SECRET || ''; }
function configured() { return !!keyId() && !!keySecret(); }

async function rzp(path, method = 'GET', body) {
  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString('base64');
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data?.error?.description || `Razorpay error ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

function safeEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

/** Checkout handler signature: HMAC_SHA256(payment_id + "|" + subscription_id, key_secret). */
function verifyPaymentSignature(paymentId, subscriptionId, signature) {
  if (!keySecret() || !paymentId || !subscriptionId || !signature) return false;
  const expected = crypto.createHmac('sha256', keySecret()).update(`${paymentId}|${subscriptionId}`).digest('hex');
  return safeEq(expected, signature);
}

/** Webhook signature: HMAC_SHA256(rawBody, webhook_secret). */
function verifyWebhook(raw, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  if (!secret || !raw || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return safeEq(expected, signature);
}

module.exports = { keyId, keySecret, configured, rzp, verifyPaymentSignature, verifyWebhook };
