// POST /api/auth/login  { email, password } → sets session cookie
const { json, readBody, setCookie, clientIp } = require('../_lib/respond');
const { verifyPassword, signSession, authSecret } = require('../_lib/crypto');
const { getUser } = require('../_lib/store');
const { guard } = require('../_lib/dam');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  // backend dam — throttle login attempts per IP (brute-force guard)
  if (!guard(req, res, `login:${clientIp(req)}`, { capacity: 8, refillPerSec: 0.2 })) return;

  if (!authSecret()) return json(res, 503, { error: 'not_configured', message: 'Cloud auth is not configured. The app uses local accounts until then.' });

  const { email, password } = await readBody(req);
  const mail = String(email || '').trim().toLowerCase();
  try {
    const user = await getUser(mail);
    // verify regardless to blunt timing/enumeration
    const ok = user ? verifyPassword(String(password || ''), user.passwordHash) : false;
    if (!user || !ok) return json(res, 401, { error: 'invalid', message: 'Incorrect email or password.' });

    const token = signSession({ email: user.email, name: user.name });
    setCookie(res, 'zenith_session', token);
    return json(res, 200, { user: { email: user.email, name: user.name }, provider: 'cloud' });
  } catch (e) {
    return json(res, 500, { error: 'server', message: 'Could not sign you in. Please try again.' });
  }
};
