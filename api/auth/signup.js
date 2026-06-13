// POST /api/auth/signup  { name, email, password } → sets session cookie
const { json, readBody, setCookie, clientIp } = require('../_lib/respond');
const { hashPassword, signSession, authSecret } = require('../_lib/crypto');
const { getUser, putUser } = require('../_lib/store');
const { guard } = require('../_lib/dam');
const { sendEmail, TEMPLATES } = require('../_lib/email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  // backend dam — throttle account creation per IP
  if (!(await guard(req, res, `signup:${clientIp(req)}`, { capacity: 5, refillPerSec: 0.1 }))) return;

  if (!authSecret()) return json(res, 503, { error: 'not_configured', message: 'Cloud auth is not configured (set AUTH_SECRET). The app uses local accounts until then.' });

  const { name, email, password } = await readBody(req);
  const mail = String(email || '').trim().toLowerCase();
  if (!name || !String(name).trim()) return json(res, 400, { error: 'invalid', message: 'Please enter your name.' });
  if (!EMAIL_RE.test(mail)) return json(res, 400, { error: 'invalid', message: 'Please enter a valid email.' });
  if (!password || String(password).length < 8) return json(res, 400, { error: 'invalid', message: 'Password must be at least 8 characters.' });

  try {
    if (await getUser(mail)) return json(res, 409, { error: 'exists', message: 'An account with this email already exists.' });
    const user = {
      email: mail,
      name: String(name).trim(),
      passwordHash: hashPassword(String(password)),
      subscribed: true,
      createdAt: Date.now(),
    };
    await putUser(user);

    const token = signSession({ email: user.email, name: user.name });
    setCookie(res, 'zenith_session', token);

    // fire-and-forget welcome email (never blocks signup)
    try {
      const t = TEMPLATES.welcome(user.name, user.email);
      void sendEmail({ to: user.email, subject: t.subject, html: t.html });
    } catch { /* ignore */ }

    return json(res, 200, { user: { email: user.email, name: user.name }, provider: 'cloud' });
  } catch (e) {
    return json(res, 500, { error: 'server', message: 'Could not create the account. Please try again.' });
  }
};
