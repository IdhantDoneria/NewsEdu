// GET /api/auth/me → { user } if a valid session cookie is present, else 401
const { json, parseCookies } = require('../_lib/respond');
const { verifySession } = require('../_lib/crypto');

module.exports = async (req, res) => {
  const token = parseCookies(req).zenith_session;
  const payload = token ? verifySession(token) : null;
  if (!payload) return json(res, 401, { error: 'unauthenticated' });
  return json(res, 200, { user: { email: payload.email, name: payload.name }, provider: 'cloud' });
};
