// POST /api/billing/cancel — cancel the subscription at the end of the cycle
const { json, parseCookies } = require('../_lib/respond');
const { verifySession } = require('../_lib/crypto');
const { rzp, configured } = require('../_lib/razorpay');
const { getUser, putUser } = require('../_lib/store');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const sess = verifySession(parseCookies(req).zenith_session);
  if (!sess) return json(res, 401, { error: 'unauthenticated' });
  const user = await getUser(sess.email);
  if (!user?.subscriptionId) return json(res, 400, { error: 'no_subscription', message: 'No active subscription.' });
  if (configured()) {
    try { await rzp(`/subscriptions/${user.subscriptionId}/cancel`, 'POST', { cancel_at_cycle_end: 1 }); }
    catch (e) { return json(res, 502, { error: 'razorpay', message: e.message }); }
  }
  user.planStatus = 'cancelling';
  await putUser(user);
  return json(res, 200, { ok: true, status: 'cancelling' });
};
