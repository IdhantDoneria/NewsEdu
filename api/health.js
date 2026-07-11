// GET /api/health — reports which backend capabilities are configured, so the
// frontend can feature-detect cloud auth vs. local fallback.
const { json } = require('./_lib/respond');
const { authSecret } = require('./_lib/crypto');
const { isPersistent } = require('./_lib/store');
const { isConfigured: emailConfigured } = require('./_lib/email');

module.exports = async (req, res) => {
  return json(res, 200, {
    ok: true,
    service: 'zenith-api',
    auth: !!authSecret(),                 // cloud signup/login available
    store: isPersistent() ? 'persistent' : 'ephemeral',
    email: emailConfigured(),             // daily campaigns can send
    ai: !!process.env.GEMINI_API_KEY,     // Zenith AI available (server-side key)
    composio: !!process.env.COMPOSIO_API_KEY, // connected-apps / task management available
    time: new Date().toISOString(),
  });
};
