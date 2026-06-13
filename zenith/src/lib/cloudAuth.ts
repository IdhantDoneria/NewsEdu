// ─── Client for the Zenith cloud backend (/api) ──────────────────────────────
// Talks to the serverless auth API when it's configured, and reports its status
// so the UI can feature-detect cloud accounts vs. the local-first fallback.

import { adoptCloudSession, signOut as localSignOut } from './auth';

export interface BackendStatus {
  reachable: boolean;
  auth: boolean;                       // cloud signup/login available (AUTH_SECRET set)
  store: 'persistent' | 'ephemeral' | 'unknown';
  email: boolean;                      // daily campaigns can send (RESEND_API_KEY set)
}

/** thrown when the cloud backend exists but isn't configured for auth */
export class NotConfiguredError extends Error {}

let cached: BackendStatus | null = null;

export async function backendStatus(force = false): Promise<BackendStatus> {
  if (cached && !force) return cached;
  try {
    const res = await fetch('/api/health', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('health ' + res.status);
    const j = await res.json();
    cached = {
      reachable: true,
      auth: !!j.auth,
      store: j.store ?? 'unknown',
      email: !!j.email,
    };
  } catch {
    cached = { reachable: false, auth: false, store: 'unknown', email: false };
  }
  return cached;
}

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (res.status === 503 || data?.error === 'not_configured') {
    throw new NotConfiguredError(data?.message || 'Cloud backend not configured');
  }
  if (!res.ok) {
    const err = new Error(data?.message || `Request failed (${res.status})`);
    throw err;
  }
  return data;
}

export async function cloudSignup(input: { name: string; email: string; password: string }) {
  const data = await post('/api/auth/signup', input);
  adoptCloudSession(data.user.email, data.user.name);
  return data.user;
}

export async function cloudLogin(input: { email: string; password: string }) {
  const data = await post('/api/auth/login', input);
  adoptCloudSession(data.user.email, data.user.name);
  return data.user;
}

export async function cloudLogout(): Promise<void> {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); }
  catch { /* ignore */ }
  localSignOut();
}

/** On boot: if a server session cookie is valid, adopt it (keeps cloud login sticky). */
export async function restoreCloudSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!res.ok) return false;
    const j = await res.json();
    if (j?.user?.email) { adoptCloudSession(j.user.email, j.user.name); return true; }
  } catch { /* offline / not configured */ }
  return false;
}
