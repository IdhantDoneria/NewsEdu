// GET /api/billing/config — public billing capability + checkout key (no secrets)
const { json } = require('../_lib/respond');
const { keyId, configured } = require('../_lib/razorpay');
const { plansReady } = require('../_lib/plans');

module.exports = async (req, res) => {
  return json(res, 200, {
    enabled: configured(),
    keyId: keyId(),                 // publishable key — safe for the client
    plansReady: plansReady(),
    currency: 'INR',
  });
};
