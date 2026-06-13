// POST /api/billing/subscribe  { plan, cycle } → creates a Razorpay subscription
const { json, readBody, parseCookies, clientIp } = require('../_lib/respond');
const { verifySession } = require('../_lib/crypto');
const { configured, rzp, keyId } = require('../_lib/razorpay');
const { planIdFor, PAID } = require('../_lib/plans');
const { getUser, putUser, command } = require('../_lib/store');
const { guard } = require('../_lib/dam');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!(await guard(req, res, `subscribe:${clientIp(req)}`, { capacity: 6, refillPerSec: 0.2 }))) return;

  const sess = verifySession(parseCookies(req).zenith_session);
  if (!sess) return json(res, 401, { error: 'unauthenticated', message: 'Please sign in before upgrading.' });
  if (!configured()) return json(res, 503, { error: 'not_configured', message: 'Billing is not configured yet.' });

  const { plan, cycle } = await readBody(req);
  const billingCycle = cycle === 'annual' ? 'annual' : 'monthly';
  if (!PAID.includes(plan)) return json(res, 400, { error: 'bad_plan', message: 'Unknown plan.' });
  const planId = planIdFor(plan, billingCycle);
  if (!planId) return json(res, 503, { error: 'no_plan_id', message: `No Razorpay plan id set for ${plan} (${billingCycle}).` });

  try {
    const sub = await rzp('/subscriptions', 'POST', {
      plan_id: planId,
      total_count: billingCycle === 'annual' ? 10 : 120,
      customer_notify: 1,
      notes: { email: sess.email, plan, cycle: billingCycle },
    });
    try { await command(['SET', `zenith:sub:${sub.id}`, sess.email]); } catch { /* webhook can still use notes.email */ }
    const user = await getUser(sess.email);
    if (user) {
      user.pendingSubscriptionId = sub.id;
      user.pendingPlan = plan;
      user.pendingCycle = billingCycle;
      await putUser(user);
    }
    return json(res, 200, { subscriptionId: sub.id, keyId: keyId(), plan, cycle: billingCycle });
  } catch (e) {
    return json(res, 502, { error: 'razorpay', message: e.message || 'Could not start checkout.' });
  }
};
