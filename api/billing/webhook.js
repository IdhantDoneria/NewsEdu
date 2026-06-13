// POST /api/billing/webhook — Razorpay subscription/payment events.
// Verified by signature (X-Razorpay-Signature over the raw body); if the raw
// body isn't available we re-fetch the subscription from Razorpay as the
// authority before mutating anything. Always returns 200 quickly.
const { json } = require('../_lib/respond');
const { verifyWebhook, rzp, configured } = require('../_lib/razorpay');
const { getUser, putUser, command } = require('../_lib/store');

function readRaw(req) {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 2_000_000) req.destroy(); });
    req.on('end', () => resolve(d));
    req.on('error', () => resolve(''));
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  let raw = '';
  let event = null;
  try { raw = await readRaw(req); event = raw ? JSON.parse(raw) : (req.body || null); }
  catch { event = req.body || null; }
  if (!event) return json(res, 400, { error: 'bad_event' });

  const sig = req.headers['x-razorpay-signature'];
  const sigOk = verifyWebhook(raw, sig);

  try {
    const subEntity = event?.payload?.subscription?.entity;
    const subId = subEntity?.id;
    if (subId) {
      let status = subEntity.status;
      let notes = subEntity.notes || {};
      // If signature didn't verify, re-fetch from Razorpay (authenticated) as the source of truth.
      if (!sigOk) {
        if (!configured()) return json(res, 401, { error: 'unverified' });
        try { const fresh = await rzp(`/subscriptions/${subId}`); status = fresh.status; notes = fresh.notes || notes; }
        catch { return json(res, 401, { error: 'unverified' }); }
      }
      let email = notes.email;
      if (!email) { try { email = await command(['GET', `zenith:sub:${subId}`]); } catch { /* none */ } }
      if (email) {
        const user = await getUser(email);
        if (user) {
          const ev = event.event || '';
          if (['active', 'authenticated'].includes(status) || ev === 'subscription.charged' || ev === 'subscription.activated') {
            user.plan = notes.plan || user.pendingPlan || user.plan || 'pro';
            user.cycle = notes.cycle || user.pendingCycle || user.cycle || 'monthly';
            user.planStatus = 'active';
            user.subscriptionId = subId;
          } else if (['cancelled', 'completed', 'expired'].includes(status) || ev === 'subscription.cancelled') {
            user.planStatus = 'cancelled';
            user.plan = 'free';
          } else if (['halted', 'paused'].includes(status)) {
            user.planStatus = 'past_due';
          }
          await putUser(user);
        }
      }
    }
  } catch { /* never 500 a webhook — Razorpay would retry-storm */ }

  return json(res, 200, { ok: true });
};
