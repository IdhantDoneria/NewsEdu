// Consolidated billing function (one Serverless Function, dispatched by ?action
// or the /api/billing/<action> path via rewrite).
// Actions: config, subscribe, verify, webhook, status, cancel.
const { json, readBody, parseCookies, clientIp } = require('./_lib/respond');
const { verifySession } = require('./_lib/crypto');
const { keyId, configured, rzp, verifyPaymentSignature, verifyWebhook } = require('./_lib/razorpay');
const { planIdFor, plansReady, entitlements, PAID } = require('./_lib/plans');
const { getUser, putUser, command } = require('./_lib/store');
const { guard } = require('./_lib/dam');

function actionOf(req) {
  const q = req.query && req.query.action;
  if (q) return Array.isArray(q) ? q[0] : q;
  const m = (req.url || '').split('?')[0].match(/\/api\/billing\/([\w-]+)/);
  return m ? m[1] : '';
}

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
  const action = actionOf(req);

  // ── public ──
  if (action === 'config') {
    return json(res, 200, { enabled: configured(), keyId: keyId(), plansReady: plansReady(), currency: 'INR' });
  }

  // ── webhook (no session; signature/refetch verified) ──
  if (action === 'webhook') {
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    let raw = ''; let event = null;
    try { raw = await readRaw(req); event = raw ? JSON.parse(raw) : (req.body || null); }
    catch { event = req.body || null; }
    if (!event) return json(res, 400, { error: 'bad_event' });
    const sigOk = verifyWebhook(raw, req.headers['x-razorpay-signature']);
    try {
      const subEntity = event?.payload?.subscription?.entity;
      const subId = subEntity?.id;
      if (subId) {
        let status = subEntity.status;
        let notes = subEntity.notes || {};
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
              user.planStatus = 'active'; user.subscriptionId = subId;
            } else if (['cancelled', 'completed', 'expired'].includes(status) || ev === 'subscription.cancelled') {
              user.planStatus = 'cancelled'; user.plan = 'free';
            } else if (['halted', 'paused'].includes(status)) {
              user.planStatus = 'past_due';
            }
            await putUser(user);
          }
        }
      }
    } catch { /* never 500 a webhook */ }
    return json(res, 200, { ok: true });
  }

  // ── status (session, GET) ──
  if (action === 'status') {
    const sess = verifySession(parseCookies(req).zenith_session);
    if (!sess) return json(res, 401, { error: 'unauthenticated' });
    const user = await getUser(sess.email);
    const active = user && (user.planStatus === 'active' || user.planStatus === 'cancelling');
    const plan = active && user.plan ? user.plan : 'free';
    return json(res, 200, { plan, cycle: user?.cycle || null, status: user?.planStatus || 'none', entitlements: entitlements(plan) });
  }

  // ── the rest require a session + POST ──
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const sess = verifySession(parseCookies(req).zenith_session);
  if (!sess) return json(res, 401, { error: 'unauthenticated', message: 'Please sign in first.' });

  if (action === 'subscribe') {
    if (!(await guard(req, res, `subscribe:${clientIp(req)}`, { capacity: 6, refillPerSec: 0.2 }))) return;
    if (!configured()) return json(res, 503, { error: 'not_configured', message: 'Billing is not configured yet.' });
    const { plan, cycle } = await readBody(req);
    const billingCycle = cycle === 'annual' ? 'annual' : 'monthly';
    if (!PAID.includes(plan)) return json(res, 400, { error: 'bad_plan', message: 'Unknown plan.' });
    const planId = planIdFor(plan, billingCycle);
    if (!planId) return json(res, 503, { error: 'no_plan_id', message: `No Razorpay plan id set for ${plan} (${billingCycle}).` });
    try {
      const sub = await rzp('/subscriptions', 'POST', {
        plan_id: planId, total_count: billingCycle === 'annual' ? 10 : 120,
        customer_notify: 1, notes: { email: sess.email, plan, cycle: billingCycle },
      });
      try { await command(['SET', `zenith:sub:${sub.id}`, sess.email]); } catch { /* notes.email fallback */ }
      const user = await getUser(sess.email);
      if (user) { user.pendingSubscriptionId = sub.id; user.pendingPlan = plan; user.pendingCycle = billingCycle; await putUser(user); }
      return json(res, 200, { subscriptionId: sub.id, keyId: keyId(), plan, cycle: billingCycle });
    } catch (e) { return json(res, 502, { error: 'razorpay', message: e.message || 'Could not start checkout.' }); }
  }

  if (action === 'verify') {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, plan, cycle } = await readBody(req);
    if (!verifyPaymentSignature(razorpay_payment_id, razorpay_subscription_id, razorpay_signature)) {
      return json(res, 400, { error: 'invalid_signature', message: 'Payment could not be verified.' });
    }
    if (!PAID.includes(plan)) return json(res, 400, { error: 'bad_plan' });
    const user = await getUser(sess.email);
    if (user) {
      user.plan = plan; user.cycle = cycle === 'annual' ? 'annual' : 'monthly';
      user.planStatus = 'active'; user.subscriptionId = razorpay_subscription_id; user.planSince = Date.now();
      delete user.pendingSubscriptionId; await putUser(user);
    }
    return json(res, 200, { ok: true, plan, status: 'active', entitlements: entitlements(plan) });
  }

  if (action === 'cancel') {
    const user = await getUser(sess.email);
    if (!user?.subscriptionId) return json(res, 400, { error: 'no_subscription', message: 'No active subscription.' });
    if (configured()) {
      try { await rzp(`/subscriptions/${user.subscriptionId}/cancel`, 'POST', { cancel_at_cycle_end: 1 }); }
      catch (e) { return json(res, 502, { error: 'razorpay', message: e.message }); }
    }
    user.planStatus = 'cancelling'; await putUser(user);
    return json(res, 200, { ok: true, status: 'cancelling' });
  }

  return json(res, 404, { error: 'not_found' });
};
