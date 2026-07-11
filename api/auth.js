// Consolidated auth function (one Serverless Function, dispatched by ?action or
// the /api/auth/<action> path via rewrite). Actions: signup, login, me, logout.
const { json, readBody, parseCookies, setCookie, clearCookie, clientIp } = require('./_lib/respond');
const { hashPassword, verifyPassword, signSession, verifySession, authSecret } = require('./_lib/crypto');
const { getUser, putUser } = require('./_lib/store');
const { guard } = require('./_lib/dam');
const { sendEmail, TEMPLATES } = require('./_lib/email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function actionOf(req) {
  const q = req.query && req.query.action;
  if (q) return Array.isArray(q) ? q[0] : q;
  const m = (req.url || '').split('?')[0].match(/\/api\/auth\/([\w-]+)/);
  return m ? m[1] : '';
}

module.exports = async (req, res) => {
  const action = actionOf(req);

  if (action === 'me') {
    const token = parseCookies(req).zenith_session;
    const payload = token ? verifySession(token) : null;
    if (!payload) return json(res, 401, { error: 'unauthenticated' });
    return json(res, 200, { user: { email: payload.email, name: payload.name }, provider: 'cloud' });
  }
  if (action === 'logout') { clearCookie(res, 'zenith_session'); return json(res, 200, { ok: true }); }

  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  if (action === 'signup') {
    if (!(await guard(req, res, `signup:${clientIp(req)}`, { capacity: 5, refillPerSec: 0.1 }))) return;
    if (!authSecret()) return json(res, 503, { error: 'not_configured', message: 'Cloud auth is not configured (set AUTH_SECRET). The app uses local accounts until then.' });
    const { name, email, password } = await readBody(req);
    const mail = String(email || '').trim().toLowerCase();
    if (!name || !String(name).trim()) return json(res, 400, { error: 'invalid', message: 'Please enter your name.' });
    if (!EMAIL_RE.test(mail)) return json(res, 400, { error: 'invalid', message: 'Please enter a valid email.' });
    if (!password || String(password).length < 8) return json(res, 400, { error: 'invalid', message: 'Password must be at least 8 characters.' });
    try {
      if (await getUser(mail)) return json(res, 409, { error: 'exists', message: 'An account with this email already exists.' });
      const user = { email: mail, name: String(name).trim(), passwordHash: hashPassword(String(password)), subscribed: true, createdAt: Date.now() };
      await putUser(user);
      setCookie(res, 'zenith_session', signSession({ email: user.email, name: user.name }));
      try { const t = TEMPLATES.welcome(user.name, user.email); void sendEmail({ to: user.email, subject: t.subject, html: t.html }); } catch { /* ignore */ }
      return json(res, 200, { user: { email: user.email, name: user.name }, provider: 'cloud' });
    } catch { return json(res, 500, { error: 'server', message: 'Could not create the account. Please try again.' }); }
  }

  if (action === 'login') {
    if (!(await guard(req, res, `login:${clientIp(req)}`, { capacity: 8, refillPerSec: 0.2 }))) return;
    if (!authSecret()) return json(res, 503, { error: 'not_configured', message: 'Cloud auth is not configured. The app uses local accounts until then.' });
    const { email, password } = await readBody(req);
    const mail = String(email || '').trim().toLowerCase();
    try {
      const user = await getUser(mail);
      const ok = user ? verifyPassword(String(password || ''), user.passwordHash) : false;
      if (!user || !ok) return json(res, 401, { error: 'invalid', message: 'Incorrect email or password.' });
      setCookie(res, 'zenith_session', signSession({ email: user.email, name: user.name }));
      return json(res, 200, { user: { email: user.email, name: user.name }, provider: 'cloud' });
    } catch { return json(res, 500, { error: 'server', message: 'Could not sign you in. Please try again.' }); }
  }

  return json(res, 404, { error: 'not_found' });
};
