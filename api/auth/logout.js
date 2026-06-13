// POST /api/auth/logout → clears the session cookie
const { json, clearCookie } = require('../_lib/respond');

module.exports = async (req, res) => {
  clearCookie(res, 'zenith_session');
  return json(res, 200, { ok: true });
};
