import { Expand, LayoutTemplate, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { kvGet } from './lib/db';
import {
  bootStore, createPage, getPageList, openPage, openPeek, redo, setSearchOpen,
  setShortcutsOpen, setTemplatesOpen, toggleSidebar, undo, updateSettings, useStore,
} from './lib/store';
import { initSync } from './lib/sync';
import { currentSession, loadSession, onAuth, type Session } from './lib/auth';
import { restoreCloudSession } from './lib/cloudAuth';
import { ensureSeed } from './seed';
import { AuthGate } from './components/auth/AuthGate';
import { AIHost } from './components/ai/AIHost';
import { PageView } from './components/editor/PageView';
import { SelectionToolbar } from './components/editor/SelectionToolbar';
import { CommentsPanel } from './components/panels/CommentsPanel';
import { HistoryPanel } from './components/panels/HistoryPanel';
import { SearchPalette } from './components/panels/SearchPalette';
import { ShortcutsHelp } from './components/panels/ShortcutsHelp';
import { TemplatesGallery } from './components/panels/TemplatesGallery';
import { TrashPanel } from './components/panels/TrashPanel';
import { SettingsModal } from './components/settings/SettingsModal';
import { Sidebar } from './components/sidebar/Sidebar';
import { Topbar } from './components/topbar/Topbar';
import { ToastHost } from './components/ui/Toast';
import { timeAgo } from './components/editor/editorUtils';

function pageIdFromHash(): string | null {
  const m = location.hash.match(/^#\/p\/([\w-]+)/);
  return m ? m[1] : null;
}

export default function App() {
  const ready = useStore((s) => s.ready);
  const currentPageId = useStore((s) => s.currentPageId);
  const peekPageId = useStore((s) => s.peekPageId);
  const theme = useStore((s) => s.settings.theme);
  const [booted, setBooted] = useState(false);
  const [session, setSession] = useState<Session | null>(currentSession());

  // auth session (gates the workspace)
  useEffect(() => onAuth(setSession), []);

  // boot
  useEffect(() => {
    void (async () => {
      await bootStore();
      await loadSession();
      if (!currentSession()) await restoreCloudSession();
      setSession(currentSession());
      const seeded = await ensureSeed();
      const fromHash = pageIdFromHash();
      const last = await kvGet<string>('lastPage');
      const state = useStore.getState();
      const valid = (id: string | null | undefined) => !!id && !!state.pages[id] && !state.pages[id].deletedAt;
      const target = valid(fromHash) ? fromHash! : seeded ?? (valid(last) ? last! : null);
      if (target) openPage(target);
      initSync();
      setBooted(true);
    })();
  }, []);

  // theme
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // hash routing
  useEffect(() => {
    const onHash = () => {
      const id = pageIdFromHash();
      if (id && id !== useStore.getState().currentPageId && useStore.getState().pages[id]) {
        useStore.setState({ currentPageId: id, peekPageId: null });
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // scroll to a deep-linked block (#/p/<page>#<blockId>) and flash it
  useEffect(() => {
    const scrollToAnchor = () => {
      const m = location.hash.match(/^#\/p\/[\w-]+#([\w-]+)/);
      if (!m) return;
      const blockId = m[1];
      let tries = 0;
      const attempt = () => {
        const el = document.querySelector(`[data-block-id="${blockId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('block-flash');
          setTimeout(() => el.classList.remove('block-flash'), 1600);
        } else if (++tries < 30) {
          setTimeout(attempt, 100);
        }
      };
      setTimeout(attempt, 180);
    };
    scrollToAnchor();
    window.addEventListener('hashchange', scrollToAnchor);
    return () => window.removeEventListener('hashchange', scrollToAnchor);
  }, [currentPageId, booted]);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'k' || k === 'p') { e.preventDefault(); setSearchOpen(true); }
      else if (e.key === '\\') { e.preventDefault(); toggleSidebar(); }
      else if (k === 'l' && e.shiftKey) {
        e.preventDefault();
        const cur = document.documentElement.dataset.theme;
        updateSettings({ theme: cur === 'dark' ? 'light' : 'dark' });
      }
      else if (e.key === '/') { e.preventDefault(); setShortcutsOpen(true); }
      else if (k === 'z' && !e.shiftKey) {
        const inEditor = (e.target as HTMLElement)?.closest?.('.page-view');
        if (inEditor) { e.preventDefault(); undo(); }
      }
      else if ((k === 'z' && e.shiftKey) || k === 'y') {
        const inEditor = (e.target as HTMLElement)?.closest?.('.page-view');
        if (inEditor) { e.preventDefault(); redo(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!ready || !booted) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.22em' }}>
            ZEN<span style={{ background: 'var(--gold-grad)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>ITH</span>
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, marginTop: 6 }}>ascending…</div>
        </div>
      </div>
    );
  }

  if (!session) return <AuthGate />;

  return (
    <div className="app">
      <Sidebar />
      <div className="app-main">
        <Topbar />
        <div className="app-content">
          {currentPageId ? <PageView pageId={currentPageId} /> : <Landing />}
        </div>
      </div>

      {peekPageId && (
        <>
          <div className="peek-overlay" onClick={() => openPeek(null)} />
          <div className="peek">
            <div className="peek-bar">
              <button className="icon-btn" title="Open as full page" onClick={() => { const id = peekPageId; openPeek(null); openPage(id); }}>
                <Expand size={16} />
              </button>
              <span style={{ flex: 1 }} />
              <button className="icon-btn" onClick={() => openPeek(null)}><X size={17} /></button>
            </div>
            <div className="peek-scroll">
              <PageView pageId={peekPageId} inPeek />
            </div>
          </div>
        </>
      )}

      <SelectionToolbar />
      <AIHost />
      <SearchPalette />
      <TrashPanel />
      <TemplatesGallery />
      <ShortcutsHelp />
      <CommentsPanel />
      <HistoryPanel />
      <SettingsModal />
      <ToastHost />
    </div>
  );
}

function Landing() {
  useStore((s) => s.navTick);
  const recents = Object.values(useStore.getState().pages)
    .filter((p) => !p.deletedAt && !p.databaseId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);
  void getPageList;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '11vh 32px 60px' }}>
      <div style={{ fontSize: 40, fontWeight: 750, letterSpacing: '0.18em', lineHeight: 1 }}>
        ZEN<span style={{ background: 'var(--gold-grad)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>ITH</span>
      </div>
      <div style={{ color: 'var(--text-secondary)', marginTop: 10, fontSize: 15.5 }}>
        The pinnacle workspace. Peak thought, zero friction.
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
        <button className="btn gold" onClick={() => openPage(createPage({}))}>
          <Plus size={15} /> New page
        </button>
        <button className="btn" onClick={() => setTemplatesOpen(true)}>
          <LayoutTemplate size={15} /> Start from a template
        </button>
      </div>
      {recents.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <div className="menu-title" style={{ paddingLeft: 0 }}>Jump back in</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {recents.map((p) => (
              <button key={p.id} className="btn" style={{ justifyContent: 'flex-start', padding: '10px 12px' }} onClick={() => openPage(p.id)}>
                <span style={{ fontSize: 16 }}>{p.icon ?? '📄'}</span>
                <span style={{ minWidth: 0, textAlign: 'left' }}>
                  <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title || 'Untitled'}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{timeAgo(p.updatedAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
