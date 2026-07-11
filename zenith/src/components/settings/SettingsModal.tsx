import { Cloud, Database, Info, Keyboard, Link2, Moon, Palette, PenLine, Sparkles, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { setSettingsOpen, setShortcutsOpen, updateSettings, useStore } from '../../lib/store';
import { Modal } from '../ui/Modal';
import { AISettingsSection } from '../ai/AISettings';
import { ConnectionsSettingsSection } from '../composio/ConnectionsSettings';
import { DataSettingsSection } from './DataSettings';
import { SyncSettingsSection } from './SyncSettings';

type TabId = 'appearance' | 'editor' | 'ai' | 'connections' | 'sync' | 'data' | 'about';

const TABS: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={15} /> },
  { id: 'editor', label: 'Editor', icon: <PenLine size={15} /> },
  { id: 'ai', label: 'Zenith AI', icon: <Sparkles size={15} /> },
  { id: 'connections', label: 'Connections', icon: <Link2 size={15} /> },
  { id: 'sync', label: 'Cloud sync', icon: <Cloud size={15} /> },
  { id: 'data', label: 'Data & backups', icon: <Database size={15} /> },
  { id: 'about', label: 'About', icon: <Info size={15} /> },
];

export function SettingsModal() {
  const open = useStore((s) => s.settingsOpen);
  const settings = useStore((s) => s.settings);
  const [tabState, setTab] = useState<TabId>('appearance');
  if (!open) return null;
  const tab: TabId = typeof open === 'string' && TABS.some((t) => t.id === open) && tabState === 'appearance'
    ? (open as TabId)
    : tabState;
  const close = () => { setSettingsOpen(false); setTab('appearance'); };

  return (
    <Modal onClose={close}>
      <div style={{ width: 210, background: 'var(--bg-secondary)', padding: 10, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontWeight: 650, fontSize: 14, padding: '8px 10px 12px', letterSpacing: '0.1em' }}>
          ZEN<span style={{ background: 'var(--gold-grad)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>ITH</span>
          <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', letterSpacing: 0 }}> settings</span>
        </div>
        {TABS.map((t) => (
          <button key={t.id} className={`menu-item ${tab === t.id ? 'hl' : ''}`} onClick={() => setTab(t.id)}>
            <span className="mi-icon">{t.icon}</span>
            <span className="mi-label">{t.label}</span>
          </button>
        ))}
        <button className="menu-item" onClick={() => { close(); setShortcutsOpen(true); }}>
          <span className="mi-icon"><Keyboard size={15} /></span>
          <span className="mi-label">Shortcuts</span>
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ fontWeight: 640, fontSize: 15, flex: 1 }}>{TABS.find((t) => t.id === tab)?.label}</div>
          <button className="icon-btn" onClick={close}><X size={17} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {tab === 'appearance' && (
            <>
              <Row title="Theme" desc="Zenith follows your system, or pick a side.">
                <div className="seg">
                  {(['light', 'system', 'dark'] as const).map((t) => (
                    <button key={t} className={settings.theme === t ? 'on' : ''} onClick={() => updateSettings({ theme: t })}>
                      {t === 'dark' && <Moon size={12} style={{ verticalAlign: -1.5, marginRight: 4 }} />}
                      {t[0].toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </Row>
            </>
          )}
          {tab === 'editor' && (
            <>
              <Row title="Spellcheck" desc="Underline misspelled words while writing.">
                <button className={`switch ${settings.spellcheck ? 'on' : ''}`} onClick={() => updateSettings({ spellcheck: !settings.spellcheck })} />
              </Row>
              <Row title="Markdown as you type" desc="**bold**, *italic*, `code`, ~~strike~~, # headings, lists — always on.">
                <span className="chip pill-gold">Built in</span>
              </Row>
            </>
          )}
          {tab === 'ai' && <AISettingsSection />}
          {tab === 'connections' && <ConnectionsSettingsSection />}
          {tab === 'sync' && <SyncSettingsSection />}
          {tab === 'data' && <DataSettingsSection />}
          {tab === 'about' && (
            <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)', maxWidth: 520 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.12em', marginBottom: 4 }}>
                ZEN<span style={{ background: 'var(--gold-grad)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>ITH</span>
              </div>
              <p style={{ marginTop: 0 }}><i>The pinnacle workspace.</i> Peak thought, zero friction.</p>
              <p>
                Zenith is a luxury-grade, local-first workspace: a block editor with databases,
                AI, version history, and optional Google cloud sync. Your data lives in your
                browser's IndexedDB and — when you enable sync — in your own Firebase project.
                Nothing is sent anywhere else, ever.
              </p>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 12.5 }}>Version 1.0 · Crafted with obsessive restraint.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function Row({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 560, fontSize: 14 }}>{title}</div>
        {desc && <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}
