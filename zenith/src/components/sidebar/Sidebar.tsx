import {
  ChevronRight, ChevronsLeft, Copy, FileText, LayoutTemplate, MoreHorizontal,
  Plus, Search, Settings, SquarePen, Star, StarOff, Trash2,
} from 'lucide-react';
import { LogOut, Settings as SettingsIcon2 } from 'lucide-react';
import { type DragEvent, useEffect, useState } from 'react';
import {
  createPage, deletePage, duplicatePage, getFavorites, getPageList, getRecents, movePage,
  openPage, setSearchOpen, setSettingsOpen, setSidebarWidth, setTemplatesOpen,
  setTrashOpen, toggleFavorite, toggleSidebar, useStore,
} from '../../lib/store';
import { currentSession, onAuth, signOut, type Session } from '../../lib/auth';
import { cloudLogout } from '../../lib/cloudAuth';
import { signOut as googleSignOut } from '../../lib/sync';
import type { PageDoc } from '../../lib/types';
import { Popover } from '../ui/Popover';
import { toast } from '../ui/Toast';

type PageDrop = { id: string; zone: 'above' | 'below' | 'inside' } | null;

export function Sidebar() {
  const open = useStore((s) => s.sidebarOpen);
  const width = useStore((s) => s.sidebarWidth);
  useStore((s) => s.navTick);
  const [drop, setDrop] = useState<PageDrop>(null);

  const favorites = getFavorites();
  const roots = getPageList(null);

  const onDragOverItem = (e: DragEvent, p: PageDoc) => {
    if (!e.dataTransfer.types.includes('zenith/page')) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const zone = y < rect.height * 0.3 ? 'above' : y > rect.height * 0.7 ? 'below' : 'inside';
    setDrop((cur) => (cur?.id === p.id && cur.zone === zone ? cur : { id: p.id, zone }));
  };

  const onDropItem = (e: DragEvent, p: PageDoc) => {
    e.preventDefault();
    e.stopPropagation();
    const dragId = e.dataTransfer.getData('zenith/page');
    const d = drop;
    setDrop(null);
    if (!dragId || dragId === p.id || !d) return;
    if (d.zone === 'inside') {
      movePage(dragId, p.id);
    } else {
      const siblings = getPageList(p.parentId);
      const idx = siblings.findIndex((x) => x.id === p.id);
      const beforeId = d.zone === 'above' ? p.id : siblings[idx + 1]?.id ?? null;
      movePage(dragId, p.parentId, beforeId);
    }
  };

  return (
    <aside className={`sidebar ${open ? '' : 'closed'}`} style={{ width, ['--sb-w' as any]: `${width}px` }}>
      <div className="sidebar-head">
        <div className="workspace-brand">
          <span className="brand-logo">
            <svg viewBox="0 0 64 64"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E6C87A"/><stop offset="1" stopColor="#B68A36"/></linearGradient></defs><path d="M14 18h36L22 46h28" fill="none" stroke="url(#bg)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span className="brand-name">ZEN<span className="accent">ITH</span></span>
        </div>
        <button className="icon-btn" title="New page" onClick={() => openPage(createPage({}))}>
          <SquarePen size={17} />
        </button>
        <button className="icon-btn" title="Close sidebar (⌘\)" onClick={toggleSidebar}>
          <ChevronsLeft size={18} />
        </button>
      </div>

      <div className="sidebar-scroll">
        <div>
          <div className="nav-item" onClick={() => setSearchOpen(true)}>
            <span className="nav-icon"><Search size={16} /></span>
            <span className="nav-label">Search</span>
            <span className="kbd">⌘K</span>
          </div>
          <div className="nav-item" onClick={() => setTemplatesOpen(true)}>
            <span className="nav-icon"><LayoutTemplate size={16} /></span>
            <span className="nav-label">Templates</span>
          </div>
          <div className="nav-item" onClick={() => setSettingsOpen(true)}>
            <span className="nav-icon"><Settings size={16} /></span>
            <span className="nav-label">Settings</span>
          </div>
        </div>

        {favorites.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Favorites</div>
            {favorites.map((p) => (
              <PageTreeItem key={'fav' + p.id} page={p} depth={0} drop={drop}
                onDragOverItem={onDragOverItem} onDropItem={onDropItem} viaFavorites />
            ))}
          </div>
        )}

        <RecentSection />

        <div
          className="sidebar-section"
          onDragOver={(e) => {
            // allow dropping at workspace root (move to top level, end)
            if (e.dataTransfer.types.includes('zenith/page') && e.target === e.currentTarget) e.preventDefault();
          }}
          onDrop={(e) => {
            if (e.target !== e.currentTarget) return;
            const dragId = e.dataTransfer.getData('zenith/page');
            if (dragId) movePage(dragId, null);
            setDrop(null);
          }}
        >
          <div className="sidebar-section-title">
            Workspace
            <button className="icon-btn small add-btn" title="Add a page" onClick={() => openPage(createPage({}))}>
              <Plus size={14} />
            </button>
          </div>
          {roots.length === 0 && <div className="nav-empty-hint">No pages yet</div>}
          {roots.map((p) => (
            <PageTreeItem key={p.id} page={p} depth={0} drop={drop}
              onDragOverItem={onDragOverItem} onDropItem={onDropItem} />
          ))}
          <div className="nav-item" style={{ color: 'var(--text-tertiary)' }} onClick={() => openPage(createPage({}))}>
            <span className="nav-icon"><Plus size={16} /></span>
            <span className="nav-label">New page</span>
          </div>
        </div>
      </div>

      <div className="sidebar-foot">
        <div className="nav-item" onClick={() => setTrashOpen(true)}>
          <span className="nav-icon"><Trash2 size={16} /></span>
          <span className="nav-label">Trash</span>
        </div>
        <AccountChip />
      </div>

      <div
        className="sidebar-resizer"
        onPointerDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startW = width;
          const move = (ev: PointerEvent) => setSidebarWidth(startW + ev.clientX - startX);
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
      />
    </aside>
  );
}

function RecentSection() {
  useStore((s) => s.recents);
  useStore((s) => s.currentPageId);
  useStore((s) => s.navTick);
  const recents = getRecents(5);
  if (!recents.length) return null;
  return (
    <div className="sidebar-section">
      <div className="sidebar-section-title">Recent</div>
      {recents.map((p) => (
        <div key={'rec' + p.id} className="nav-item" onClick={() => openPage(p.id)}>
          <span className="nav-icon" style={{ fontSize: 14.5 }}>{p.icon ?? (p.type === 'database' ? '🗂️' : <FileText size={15} />)}</span>
          <span className="nav-label">{p.title || 'Untitled'}</span>
        </div>
      ))}
    </div>
  );
}

function AccountChip() {
  const [session, setSession] = useState<Session | null>(currentSession());
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => onAuth(setSession), []);
  if (!session) return null;
  const label = session.provider === 'guest' ? 'Guest' : session.name || session.email;
  const initial = (session.name || session.email || 'G').trim()[0]?.toUpperCase() ?? 'G';
  return (
    <>
      <div className="nav-item" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY - 90 })}>
        <span className="nav-icon">
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--gold-grad)', color: '#1d1709', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{initial}</span>
        </span>
        <span className="nav-label">{label}</span>
      </div>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} width={220}>
          <div className="menu">
            <div style={{ padding: '8px 10px 6px' }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{session.name || 'Guest'}</div>
              {session.email && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{session.email}</div>}
              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2, textTransform: 'capitalize' }}>{session.provider} account</div>
            </div>
            <div className="menu-sep" />
            <button className="menu-item" onClick={() => { setMenu(null); setSettingsOpen(true); }}>
              <span className="mi-icon"><SettingsIcon2 size={15} /></span><span className="mi-label">Settings</span>
            </button>
            <button className="menu-item" onClick={() => {
              if (session.provider === 'google') void googleSignOut().catch(() => {});
              if (session.provider === 'cloud') void cloudLogout();
              else signOut();
              setMenu(null);
            }}>
              <span className="mi-icon"><LogOut size={15} /></span>
              <span className="mi-label">{session.provider === 'guest' ? 'Exit guest mode' : 'Log out'}</span>
            </button>
          </div>
        </Popover>
      )}
    </>
  );
}

function PageTreeItem({ page, depth, drop, onDragOverItem, onDropItem, viaFavorites = false }: {
  page: PageDoc;
  depth: number;
  drop: PageDrop;
  onDragOverItem: (e: DragEvent, p: PageDoc) => void;
  onDropItem: (e: DragEvent, p: PageDoc) => void;
  viaFavorites?: boolean;
}) {
  const currentId = useStore((s) => s.currentPageId);
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const children = getPageList(page.id);
  const d = !viaFavorites && drop?.id === page.id ? drop : null;

  return (
    <>
      <div
        className={[
          'nav-item',
          currentId === page.id ? 'active' : '',
          d?.zone === 'above' ? 'nav-drop-above' : '',
          d?.zone === 'below' ? 'nav-drop-below' : '',
          d?.zone === 'inside' ? 'nav-drop-inside' : '',
        ].join(' ')}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={!viaFavorites}
        onDragStart={(e) => {
          e.dataTransfer.setData('zenith/page', page.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => onDragOverItem(e, page)}
        onDrop={(e) => onDropItem(e, page)}
        onClick={() => openPage(page.id)}
      >
        <span
          className={`chevron ${expanded ? 'open' : ''}`}
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          <ChevronRight size={14} />
        </span>
        <span className="nav-icon" style={{ fontSize: 14.5 }}>
          {page.icon ?? (page.type === 'database' ? '🗂️' : <FileText size={15} />)}
        </span>
        <span className="nav-label">{page.title || 'Untitled'}</span>
        <span className="nav-actions">
          <button
            className="icon-btn small"
            title="More"
            onClick={(e) => { e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY + 8 }); }}
          >
            <MoreHorizontal size={14} />
          </button>
          <button
            className="icon-btn small"
            title="Add a page inside"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
              openPage(createPage({ parentId: page.id }));
            }}
          >
            <Plus size={14} />
          </button>
        </span>
      </div>

      {expanded && (
        children.length === 0
          ? <div className="nav-empty-hint" style={{ paddingLeft: 30 + depth * 14 }}>No pages inside</div>
          : children.map((c) => (
            <PageTreeItem key={c.id} page={c} depth={depth + 1} drop={drop}
              onDragOverItem={onDragOverItem} onDropItem={onDropItem} />
          ))
      )}

      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} width={220}>
          <div className="menu">
            <button className="menu-item" onClick={() => { toggleFavorite(page.id); setMenu(null); }}>
              <span className="mi-icon">{page.favorite ? <StarOff size={15} /> : <Star size={15} />}</span>
              <span className="mi-label">{page.favorite ? 'Remove from favorites' : 'Add to favorites'}</span>
            </button>
            <button className="menu-item" onClick={() => {
              const nid = duplicatePage(page.id);
              setMenu(null);
              openPage(nid);
            }}>
              <span className="mi-icon"><Copy size={15} /></span>
              <span className="mi-label">Duplicate</span>
            </button>
            <button className="menu-item" onClick={() => {
              navigator.clipboard.writeText(`${location.origin}${location.pathname}#/p/${page.id}`);
              toast('Link copied to clipboard');
              setMenu(null);
            }}>
              <span className="mi-icon"><FileText size={15} /></span>
              <span className="mi-label">Copy link</span>
            </button>
            <div className="menu-sep" />
            <button className="menu-item danger" onClick={() => {
              deletePage(page.id);
              setMenu(null);
              toast('Moved to trash', 'Undo', () => import('../../lib/store').then((m) => m.restorePage(page.id)));
            }}>
              <span className="mi-icon"><Trash2 size={15} /></span>
              <span className="mi-label">Move to trash</span>
            </button>
          </div>
        </Popover>
      )}
    </>
  );
}
