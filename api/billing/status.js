// GET /api/billing/status — current user's plan + entitlements
const { json, parseCookies } = require('../_lib/respond');
const { verifySession } = require('../_lib/crypto');
const { getUser } = require('../_lib/store');
const { entitlements } = require('../_lib/plans');

module.exports = async (req, res) => {
  const sess = verifySession(parseCookies(req).zenith_session);
  if (!sess) return json(res, 401, { error: 'unauthenticated' });
  const user = await getUser(sess.email);
  const active = user && (user.planStatus === 'active' || user.planStatus === 'cancelling');
  const plan = active && user.plan ? user.plan : 'free';
  return json(res, 200, {
    plan,
    cycle: user?.cycle || null,
    status: user?.planStatus || 'none',
    entitlements: entitlements(plan),
  });
};
