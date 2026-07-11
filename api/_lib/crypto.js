// Password hashing (scrypt) + signed session tokens (HMAC-SHA256). Node crypto
// only — no dependencies. Passwords are NEVER stored in plaintext.
const { scryptSync, randomBytes, timingSafeEqual, createHmac } = require('crypto');

const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  let candidate;
  try { candidate = scryptSync(password, salt, SCRYPT_KEYLEN); } catch { return false; }
  const known = Buffer.from(hash, 'hex');
  if (known.length !== candidate.length) return false;
  return timingSafeEqual(known, candidate);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJSON(obj) { return b64url(JSON.stringify(obj)); }
function fromB64urlJSON(s) {
  try { return JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); }
  catch { return null; }
}

function authSecret() {
  return process.env.AUTH_SECRET || process.env.JWT_SECRET || '';
}

/** Stateless signed session token: base64url(payload).base64url(hmac). */
function signSession(payload, ttlSeconds = 60 * 60 * 24 * 30) {
  const secret = authSecret();
  if (!secret) throw new Error('AUTH_SECRET not configured');
  const body = { ...payload, iat: Date.now(), exp: Date.now() + ttlSeconds * 1000 };
  const data = b64urlJSON(body);
  const sig = b64url(createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

function verifySession(token) {
  const secret = authSecret();
  if (!secret || !token || token.indexOf('.') < 0) return null;
  const [data, sig] = token.split('.');
  const expected = b64url(createHmac('sha256', secret).update(data).digest());
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = fromB64urlJSON(data);
  if (!payload || (payload.exp && payload.exp < Date.now())) return null;
  return payload;
}

/** Opaque token for unsubscribe / verify links, bound to an email. */
function emailToken(email, purpose) {
  const secret = authSecret() || 'zenith-fallback';
  return b64url(createHmac('sha256', secret).update(`${purpose}:${email.toLowerCase()}`).digest()).slice(0, 32);
}

module.exports = {
  hashPassword, verifyPassword, signSession, verifySession, emailToken, authSecret,
};
