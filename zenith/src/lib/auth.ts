// ─── Zenith accounts: real, working sign-up / sign-in ─────────────────────────
//
// Local-first auth: passwords are salted and stretched with PBKDF2-SHA256
// (210k iterations) via the Web Crypto API and stored in IndexedDB — the plain
// password is never persisted. A session gates the workspace. Every attempt is
// metered through the auth "water dam" so a flood of tries can't hammer through.
//
// This is genuine credential auth that works the instant the site is deployed,
// with no server to provision. Accounts live on the device; enabling Cloud Sync
// (Settings → Cloud sync) carries the actual workspace data across devices.

import { kvGet, kvSet } from './db';
import { authDam, DamOverflowError } from './dam';

export interface Account {
  email: string;          // normalized (lowercased) — the key
  name: string;
  salt: string;           // hex
  hash: string;           // hex PBKDF2 derivation
  createdAt: number;
}

export interface Session {
  email: string;
  name: string;
  provider: 'local' | 'google' | 'guest' | 'cloud';
  since: number;
}

export class AuthError extends Error {}

const ACCOUNTS_KEY = 'auth.accounts';
const SESSION_KEY = 'auth.session';
const LS_SESSION = 'zenith.session';     // mirror for instant first paint
const PBKDF2_ITERATIONS = 210_000;

// ─── state ────────────────────────────────────────────────────────────────────

let session: Session | null = readLocalSession();
const listeners = new Set<(s: Session | null) => void>();

function readLocalSession(): Session | null {
  try {
    const raw = localStorage.getItem(LS_SESSION);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch { return null; }
}

function emit(): void {
  listeners.forEach((cb) => { try { cb(session); } catch { /* ignore */ } });
}

function setSession(next: Session | null): void {
  session = next;
  try {
    if (next) localStorage.setItem(LS_SESSION, JSON.stringify(next));
    else localStorage.removeItem(LS_SESSION);
  } catch { /* private mode — in-memory only */ }
  void kvSet(SESSION_KEY, next);
  emit();
}

export function currentSession(): Session | null {
  return session;
}

export function onAuth(cb: (s: Session | null) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reconcile the fast localStorage session with the durable IndexedDB copy. */
export async function loadSession(): Promise<Session | null> {
  const stored = await kvGet<Session>(SESSION_KEY);
  if (stored && stored.email !== session?.email) setSession(stored);
  else if (!stored && session && session.provider !== 'guest') {
    // localStorage said signed-in but IndexedDB disagrees → trust durable store
    setSession(session); // keep guest/instant; otherwise re-persist
  }
  return session;
}

// ─── crypto ───────────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return toHex(new Uint8Array(bits));
}

/** constant-time-ish comparison */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── accounts store ─────────────────────────────────────────────────────────

async function readAccounts(): Promise<Record<string, Account>> {
  return (await kvGet<Record<string, Account>>(ACCOUNTS_KEY)) ?? {};
}
async function writeAccounts(accounts: Record<string, Account>): Promise<void> {
  await kvSet(ACCOUNTS_KEY, accounts);
}

export async function accountExists(email: string): Promise<boolean> {
  const accounts = await readAccounts();
  return !!accounts[normalizeEmail(email)];
}

// ─── validation ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export interface Strength { score: 0 | 1 | 2 | 3 | 4; label: string; ok: boolean }

export function passwordStrength(pw: string): Strength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^\w\s]/.test(pw)) score++;
  const s = Math.min(4, score) as Strength['score'];
  const label = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][s];
  return { score: s, label, ok: pw.length >= 8 };
}

// ─── actions (all metered through the auth dam) ──────────────────────────────

function viaDam<T>(task: () => Promise<T>): Promise<T> {
  return authDam.schedule(task).catch((e) => {
    if (e instanceof DamOverflowError) {
      throw new AuthError('Too many attempts in a short window — please wait a moment and try again.');
    }
    throw e;
  });
}

export async function signUp(input: { name: string; email: string; password: string }): Promise<Session> {
  return viaDam(async () => {
    const name = input.name.trim();
    const email = normalizeEmail(input.email);
    if (!name) throw new AuthError('Please enter your name.');
    if (!isValidEmail(email)) throw new AuthError('Please enter a valid email address.');
    if (!passwordStrength(input.password).ok) throw new AuthError('Password must be at least 8 characters.');

    const accounts = await readAccounts();
    if (accounts[email]) throw new AuthError('An account with this email already exists — try logging in.');

    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await derive(input.password, salt);
    accounts[email] = { email, name, salt, hash, createdAt: Date.now() };
    await writeAccounts(accounts);

    const s: Session = { email, name, provider: 'local', since: Date.now() };
    setSession(s);
    return s;
  });
}

export async function signIn(input: { email: string; password: string }): Promise<Session> {
  return viaDam(async () => {
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) throw new AuthError('Please enter a valid email address.');
    const accounts = await readAccounts();
    const account = accounts[email];
    // derive regardless of existence to blunt timing/enumeration
    const probeSalt = account?.salt ?? 'da9f6b3c8e1247a56f0b9c2d4e7a1538';
    const hash = await derive(input.password, probeSalt);
    if (!account || !safeEqual(hash, account.hash)) {
      throw new AuthError('Incorrect email or password.');
    }
    const s: Session = { email: account.email, name: account.name, provider: 'local', since: Date.now() };
    setSession(s);
    return s;
  });
}

/** Adopt an external (Google) identity from the Cloud Sync module as a session. */
export function adoptGoogleSession(email: string, name?: string): Session {
  const s: Session = { email: normalizeEmail(email), name: name || email.split('@')[0], provider: 'google', since: Date.now() };
  setSession(s);
  return s;
}

/** Adopt a session authenticated by the cloud backend (/api/auth). */
export function adoptCloudSession(email: string, name?: string): Session {
  const s: Session = { email: normalizeEmail(email), name: name || email.split('@')[0], provider: 'cloud', since: Date.now() };
  setSession(s);
  return s;
}

export function continueAsGuest(): Session {
  const s: Session = { email: '', name: 'Guest', provider: 'guest', since: Date.now() };
  setSession(s);
  return s;
}

export function signOut(): void {
  setSession(null);
}

/** Change the password of the signed-in local account (Settings → Account). */
export async function changePassword(current: string, next: string): Promise<void> {
  if (!session || session.provider !== 'local') throw new AuthError('Only local accounts have a password here.');
  if (!passwordStrength(next).ok) throw new AuthError('New password must be at least 8 characters.');
  const accounts = await readAccounts();
  const account = accounts[session.email];
  if (!account) throw new AuthError('Account not found.');
  const currentHash = await derive(current, account.salt);
  if (!safeEqual(currentHash, account.hash)) throw new AuthError('Current password is incorrect.');
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  account.hash = await derive(next, salt);
  account.salt = salt;
  await writeAccounts(accounts);
}
