import { useEffect, useState } from 'react';
import { currentSession, type Session } from '../../lib/auth';
import {
  composioConfig, connectToolkit, disconnectConnection, listConnections,
  type Connection, type Toolkit,
} from '../../lib/composio';
import { Row } from '../settings/SettingsModal';

export function ConnectionsSettingsSection() {
  const [session] = useState<Session | null>(currentSession());
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [toolkits, setToolkits] = useState<Toolkit[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canUse = !!session && session.provider !== 'guest';

  const refresh = async () => {
    try {
      const cfg = await composioConfig();
      setEnabled(cfg.enabled);
      setToolkits(cfg.toolkits);
      if (cfg.enabled && session && session.provider !== 'guest') {
        setConnections(await listConnections());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load connected apps.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async (slug: string) => {
    setBusy(slug);
    setError(null);
    try {
      await connectToolkit(slug);
      setConnections(await listConnections());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect.');
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (id: string, slug: string) => {
    if (!window.confirm(`Disconnect ${slug}?`)) return;
    setBusy(slug);
    setError(null);
    try {
      await disconnectConnection(id);
      setConnections(await listConnections());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <p style={{ fontSize: 13.5, color: 'var(--text-tertiary)' }}>Loading…</p>;
  }

  if (!enabled) {
    return (
      <p style={{ fontSize: 13.5, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
        Connected apps aren't set up for this workspace yet — ask whoever runs this deployment to
        add a Composio API key.
      </p>
    );
  }

  if (!canUse) {
    return (
      <p style={{ fontSize: 13.5, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
        Create an account first to connect apps (Settings → Cloud sync, or sign up from the
        welcome screen) — connections are tied to your account.
      </p>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.6, margin: '0 0 12px' }}>
        Connect your tools so Zenith AI can look things up and take action for you — try{' '}
        <b>“Manage tasks with connected apps”</b> from the AI menu on any page. Anything that
        changes something outside Zenith always asks for confirmation first.
      </p>
      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
      {toolkits.map((t) => {
        const conn = connections.find((c) => c.toolkit === t.slug && c.status === 'ACTIVE');
        return (
          <Row key={t.slug} title={t.name} desc={t.ready ? undefined : 'Not set up by the workspace owner'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`chip ${conn ? 'pill-green' : 'pill-gray'}`}>{conn ? 'Connected' : 'Not connected'}</span>
              {conn ? (
                <button className="btn small" disabled={busy === t.slug} onClick={() => disconnect(conn.id, t.slug)}>
                  {busy === t.slug ? '…' : 'Disconnect'}
                </button>
              ) : (
                <button
                  className="btn small" disabled={!t.ready || busy === t.slug}
                  title={t.ready ? undefined : 'Not set up by the workspace owner'}
                  onClick={() => connect(t.slug)}
                >
                  {busy === t.slug ? 'Connecting…' : 'Connect'}
                </button>
              )}
            </div>
          </Row>
        );
      })}
    </div>
  );
}
