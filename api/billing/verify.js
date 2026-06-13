// POST /api/billing/verify  { razorpay_payment_id, razorpay_subscription_id,
//   razorpay_signature, plan, cycle } → confirms the checkout & activates the plan
const { json, readBody, parseCookies } = require('../_lib/respond');
const { verifySession } = require('../_lib/crypto');
const { verifyPaymentSignature } = require('../_lib/razorpay');
const { entitlements, PAID } = require('../_lib/plans');
const { getUser, putUser } = require('../_lib/store');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const sess = verifySession(parseCookies(req).zenith_session);
  if (!sess) return json(res, 401, { error: 'unauthenticated' });

  const body = await readBody(req);
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, plan, cycle } = body;
  if (!verifyPaymentSignature(razorpay_payment_id, razorpay_subscription_id, razorpay_signature)) {
    return json(res, 400, { error: 'invalid_signature', message: 'Payment could not be verified.' });
  }
  if (!PAID.includes(plan)) return json(res, 400, { error: 'bad_plan' });

  const user = await getUser(sess.email);
  if (user) {
    user.plan = plan;
    user.cycle = cycle === 'annual' ? 'annual' : 'monthly';
    user.planStatus = 'active';
    user.subscriptionId = razorpay_subscription_id;
    user.planSince = Date.now();
    delete user.pendingSubscriptionId;
    await putUser(user);
  }
  return json(res, 200, { ok: true, plan, status: 'active', entitlements: entitlements(plan) });
};
