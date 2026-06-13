import {
  Check, Cloud, Copy, ExternalLink, LogOut, RefreshCw, ShieldCheck, Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import {
  getSyncStatus, onSyncStatus, pushAll, removeFirebaseConfig, saveFirebaseConfig,
  setSyncEnabled, signIn, signOut, type SyncInfo,
} from '../../lib/sync';
import { timeAgo } from '../editor/editorUtils';
import { toast } from '../ui/Toast';
import { Row } from './SettingsModal';

// ─── Cloud sync settings — "your workspace follows you" ─────────────────────
// The user brings their own (free) Firebase project; Zenith mirrors the
// workspace into their Firestore behind Google sign-in. Local stays primary.

const RULES_SNIPPET = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}`;

function useSyncInfo(): SyncInfo {
  const [info, setInfo] = useState<SyncInfo>(getSyncStatus());
  useEffect(() => onSyncStatus(setInfo), []);
  return info;
}

function StatusChip({ info }: { info: SyncInfo }) {
  switch (info.state) {
    case 'connecting': return <span className="chip pill-blue">Connecting…</span>;
    case 'syncing': return <span className="chip pill-blue">Syncing…</span>;
    case 'synced':
      return (
        <span className="chip pill-green">
          <Check size={12} /> Synced{info.lastSync ? ` · ${timeAgo(info.lastSync)}` : ''}
        </span>
      );
    case 'error': return <span className="chip pill-red">Error</span>;
    default: return <span className="chip pill-gray">Off</span>;
  }
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 4.3-5.35 4.3a6.3 6.3 0 1 1 0-12.6c1.6 0 3.05.6 4.15 1.6l2.1-2.1A9.46 9.46 0 0 0 12 2.55a9.45 9.45 0 1 0 0 18.9c5.45 0 9.05-3.85 9.05-9.25 0-.7-.05-1.1-.15-1.7z"
      />
    </svg>
  );
}

function copyText(text: string, label: string): void {
  void navigator.clipboard?.writeText(text)
    .then(() => toast(`${label} copied`))
    .catch(() => toast('Could not copy — select and copy manually'));
}

export function SyncSettingsSection() {
  const settings = useStore((s) => s.settings);
  const info = useSyncInfo();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const hasConfig = !!settings.firebaseConfig;
  const enabled = !!settings.syncEnabled;

  const run = (label: string, fn: () => Promise<void>, okMsg?: string) => {
    setBusy(true);
    fn()
      .then(() => { if (okMsg) toast(okMsg); })
      .catch((e: any) => toast(`${label}: ${e?.message ?? e}`))
      .finally(() => setBusy(false));
  };

  return (
    <div style={{ maxWidth: 600 }}>
      {/* ── Hero: status + identity ── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 13, padding: '15px 17px',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-secondary)', marginBottom: 20,
        }}
      >
        {info.user?.photo ? (
          <img
            src={info.user.photo} alt="" referrerPolicy="no-referrer"
            style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              display: 'grid', placeItems: 'center',
              background: 'var(--gold-soft)', color: 'var(--gold)',
            }}
          >
            {info.user ? <span style={{ fontWeight: 600 }}>{(info.user.name ?? info.user.email ?? '?')[0]?.toUpperCase()}</span> : <Cloud size={17} />}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontWeight: 620, fontSize: 14 }}>Cloud sync</span>
            <StatusChip info={info} />
          </div>
          <div
            style={{
              fontSize: 12.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              color: info.state === 'error' ? 'var(--red)' : 'var(--text-tertiary)',
            }}
          >
            {info.state === 'error'
              ? info.error ?? 'Something went wrong'
              : info.user
                ? `${info.user.name ? info.user.name + ' · ' : ''}${info.user.email}`
                : hasConfig
                  ? 'Your own Firebase project is configured.'
                  : 'Live mirror of this workspace in your own Firebase project.'}
          </div>
        </div>
        {info.user && (
          <button className="btn small" disabled={busy} onClick={() => run('Sign out', signOut, 'Signed out')}>
            <LogOut size={13} /> Sign out
          </button>
        )}
      </div>

      {!hasConfig ? (
        <>
          {/* ── 3-step setup card ── */}
          <div
            style={{
              border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
              padding: '18px 20px', marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 620, fontSize: 14, marginBottom: 4 }}>Bring your own cloud — three minutes, free forever</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginBottom: 14 }}>
              Zenith syncs to a Firebase project that belongs to you. No Zenith servers, no account with us.
            </div>
            {[
              <>Open <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', fontWeight: 550 }}>console.firebase.google.com <ExternalLink size={11} style={{ verticalAlign: -1 }} /></a> and create a project — the free Spark plan is plenty.</>,
              <>In <b>Build → Authentication</b>, enable the <b>Google</b> sign-in provider. Then in <b>Build → Firestore Database</b>, create a database.</>,
              <>In <b>Project settings → Your apps</b>, add a <b>Web app</b> and copy the <code>firebaseConfig</code> object — paste it below.</>,
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '7px 0' }}>
                <span
                  style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: 'var(--gold-grad)', color: '#1d1709', fontSize: 12, fontWeight: 700,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{step}</span>
              </div>
            ))}

            <textarea
              className="text-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              rows={7}
              placeholder={'const firebaseConfig = {\n  apiKey: "AIza…",\n  authDomain: "your-app.firebaseapp.com",\n  projectId: "your-app",\n  …\n};   ← paste JSON or the JS snippet, both work'}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, resize: 'vertical', marginTop: 12, lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                className="btn gold"
                disabled={busy || !draft.trim()}
                onClick={() => run('Save config', async () => {
                  await saveFirebaseConfig(draft);
                  setDraft('');
                }, 'Configuration saved — now enable sync and sign in')}
              >
                <ShieldCheck size={15} /> Validate &amp; save
              </button>
            </div>
          </div>

          {/* ── Security rules helper ── */}
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 560 }}>
            Recommended Firestore security rules
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            Paste into <b>Firestore Database → Rules</b> so only you can read your data.
          </div>
          <RulesBlock />
        </>
      ) : (
        <>
          <Row title="Enable cloud sync" desc="Mirror every page, block and comment to your Firestore — live, on every device.">
            <button
              className={`switch ${enabled ? 'on' : ''}`}
              aria-label="Enable cloud sync"
              disabled={busy}
              onClick={() => run('Sync', () => setSyncEnabled(!enabled))}
            />
          </Row>

          {enabled && !info.user && (
            <Row title="Sign in" desc="Connect the Google account this workspace should follow.">
              <button
                className="btn gold"
                disabled={busy || info.state === 'connecting'}
                onClick={() => run('Sign in', signIn, 'Signed in — syncing your workspace')}
              >
                <GoogleG /> Sign in with Google
              </button>
            </Row>
          )}

          <Row title="Sync now" desc="Force-push the entire local workspace to the cloud.">
            <button
              className="btn small"
              disabled={busy || !enabled || !info.user || info.state === 'syncing' || info.state === 'connecting'}
              onClick={() => run('Sync now', pushAll, 'Workspace pushed to your cloud')}
            >
              <RefreshCw size={13} /> Sync now
            </button>
          </Row>

          <Row title="Security rules" desc="One-time Firestore rule so only your account can touch the data.">
            <button className="btn small" onClick={() => copyText(RULES_SNIPPET, 'Security rules')}>
              <Copy size={13} /> Copy rules
            </button>
          </Row>

          <Row title="Remove configuration" desc="Forget this Firebase project and stop syncing. Local data stays untouched.">
            <button
              className="btn small danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Remove the Firebase configuration? Sync stops and you are signed out. Nothing local is deleted.')) return;
                run('Remove config', removeFirebaseConfig, 'Configuration removed — sync is off');
              }}
            >
              <Trash2 size={13} /> Remove
            </button>
          </Row>

          <div
            style={{
              display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 18,
              fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.55,
            }}
          >
            <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--gold)' }} />
            <span>
              Privacy: your workspace is written only to <b>your own</b> Firebase project, under your Google
              account. Zenith has no servers and never sees your data.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function RulesBlock() {
  return (
    <div style={{ position: 'relative' }}>
      <pre
        style={{
          margin: 0, background: 'var(--bg-code)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '13px 15px', overflow: 'auto',
          fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)',
        }}
      >
        {RULES_SNIPPET}
      </pre>
      <button
        className="btn small"
        style={{ position: 'absolute', top: 8, right: 8 }}
        onClick={() => copyText(RULES_SNIPPET, 'Security rules')}
      >
        <Copy size={13} /> Copy
      </button>
    </div>
  );
}
