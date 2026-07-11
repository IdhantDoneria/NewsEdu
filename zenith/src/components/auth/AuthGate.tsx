import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  AuthError, adoptGoogleSession, continueAsGuest, isValidEmail, passwordStrength,
  signIn, signUp,
} from '../../lib/auth';
import {
  backendStatus, cloudLogin, cloudSignup, NotConfiguredError, type BackendStatus,
} from '../../lib/cloudAuth';
import { authDam } from '../../lib/dam';
import { useStore } from '../../lib/store';
import { getSyncStatus, signIn as googleSignIn } from '../../lib/sync';
import { toast } from '../ui/Toast';
import './auth.css';

type Mode = 'login' | 'signup';

export function AuthGate() {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<BackendStatus | null>(null);
  const hasFirebase = useStore((s) => !!s.settings.firebaseConfig);

  const strength = passwordStrength(password);

  useEffect(() => { void backendStatus().then(setBackend); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup' && password !== confirm) throw new AuthError('Passwords do not match.');
      const useCloud = backend?.auth === true;
      try {
        if (useCloud && mode === 'signup') { await cloudSignup({ name, email, password }); toast('Welcome to Zenith ✦'); }
        else if (useCloud) { await cloudLogin({ email, password }); }
        else throw new NotConfiguredError('local');
      } catch (cloudErr) {
        // cloud unavailable / not configured → fall back to local-first accounts
        if (cloudErr instanceof NotConfiguredError || cloudErr instanceof TypeError) {
          if (mode === 'signup') { await signUp({ name, email, password }); toast('Welcome to Zenith ✦'); }
          else { await signIn({ email, password }); }
        } else {
          throw cloudErr;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await googleSignIn();
      const u = getSyncStatus().user;
      if (u?.email) adoptGoogleSession(u.email, u.name);
      else throw new AuthError('Google sign-in did not complete.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = isValidEmail(email) && password.length >= 8 && (mode === 'login' || (name.trim() && password === confirm));

  return (
    <div className="auth-screen">
      <aside className="auth-brand">
        <div className="auth-brand-top">
          <div className="auth-logo">
            <svg viewBox="0 0 64 64" width="30" height="30"><defs><linearGradient id="ag" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E6C87A" /><stop offset="1" stopColor="#B68A36" /></linearGradient></defs><path d="M14 18h36L22 46h28" fill="none" stroke="url(#ag)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="auth-wordmark">ZEN<span className="accent">ITH</span></span>
          </div>
        </div>
        <div className="auth-brand-mid">
          <h1>The pinnacle<br />workspace.</h1>
          <p>Notes, docs, databases and AI — in one beautifully minimal place. Peak thought, zero friction.</p>
          <ul className="auth-points">
            <li>✶ A block editor for absolutely everything</li>
            <li>✶ Databases: table, board, calendar, timeline</li>
            <li>✶ AI that drafts, summarizes and translates</li>
            <li>✶ Local-first, with optional cloud sync</li>
          </ul>
        </div>
        <DamShield />
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-tabs">
            <button className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(null); }}>Log in</button>
            <button className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setError(null); }}>Sign up</button>
          </div>

          <h2 className="auth-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="auth-sub">{mode === 'login' ? 'Log in to reach your summit.' : 'A workspace that compounds your work.'}</p>

          <form onSubmit={submit} className="auth-form">
            {mode === 'signup' && (
              <label className="auth-field">
                <User size={16} />
                <input placeholder="Your name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
              </label>
            )}
            <label className="auth-field">
              <Mail size={16} />
              <input type="email" placeholder="you@example.com" value={email} autoFocus={mode === 'login'} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="auth-field">
              <Lock size={16} />
              <input type={show ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="auth-eye" onClick={() => setShow((v) => !v)} tabIndex={-1}>
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </label>

            {mode === 'signup' && password.length > 0 && (
              <div className="auth-strength">
                <div className="bars">
                  {[0, 1, 2, 3].map((i) => <span key={i} className={i < strength.score ? `on s${strength.score}` : ''} />)}
                </div>
                <span className="lbl">{strength.label}</span>
              </div>
            )}

            {mode === 'signup' && (
              <label className="auth-field">
                <Lock size={16} />
                <input type={show ? 'text' : 'password'} placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </label>
            )}

            {error && <div className="auth-error">{error}</div>}

            <button className="btn gold auth-submit" type="submit" disabled={!canSubmit || busy}>
              {busy ? <Loader2 size={16} className="spin" /> : null}
              {mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>

          <div className="auth-divider"><span>or</span></div>

          <div className="auth-alts">
            {hasFirebase && (
              <button className="btn auth-google" onClick={onGoogle} disabled={busy}>
                <GoogleMark /> Continue with Google
              </button>
            )}
            <button className="btn auth-ghost" onClick={() => continueAsGuest()} disabled={busy}>
              Continue without an account
            </button>
          </div>

          <p className="auth-fine">
            {mode === 'login' ? 'New here? ' : 'Already have an account? '}
            <a onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
              {mode === 'login' ? 'Create one' : 'Log in'}
            </a>
            {' · '}
            {backend?.auth
              ? 'Secured by the Zenith cloud backend.'
              : 'Accounts are stored securely on this device.'}
          </p>
        </div>
      </main>
    </div>
  );
}

/** Live readout of the backend "water dam" — overflow protection, made visible. */
function DamShield() {
  const [, force] = useState(0);
  useEffect(() => {
    const offs = [authDam.onChange(() => force((n) => n + 1))];
    const t = setInterval(() => force((n) => n + 1), 1500);
    return () => { offs.forEach((o) => o()); clearInterval(t); };
  }, []);
  const m = authDam.metrics();
  return (
    <div className="auth-shield" title="Requests are metered through a rate-limiting reservoir so a surge of traffic can't overwhelm the backend.">
      <ShieldCheck size={15} />
      <span>Overflow shield active</span>
      <span className="auth-shield-level"><span style={{ width: `${Math.min(100, m.level * 100)}%` }} /></span>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.6z" />
      <path fill="#FBBC05" d="M10.5 28.3c-.5-1.5-.8-3-.8-4.8s.3-3.3.8-4.8l-7.9-6.1C1 16 0 19.9 0 24s1 8 2.6 11.4l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.5-5.7l-7.1-5.5c-2 1.3-4.5 2.1-8.4 2.1-6.4 0-11.7-3.7-13.5-8.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
