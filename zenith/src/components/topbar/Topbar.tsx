import {
  ChevronsRight, Clock, Copy, CornerUpRight, Download, History, Lock, LockOpen, Menu as MenuIcon,
  MessageSquareText, MoreHorizontal, Star, Trash2, Type,
} from 'lucide-react';
import { useState } from 'react';
import {
  captureUndo, deletePage, duplicatePage, getAncestry, getChildren, movePage, openPage,
  setCommentsFor, setHistoryFor, toggleFavorite, toggleSidebar, updatePage, useStore,
} from '../../lib/store';
import { PagePickerMenu } from '../editor/PagePicker';
import { downloadFile, exportPageHTML, exportPageMarkdown, safeFileName } from '../../lib/export';
import { timeAgo } from '../editor/editorUtils';
import { Popover } from '../ui/Popover';
import { toast } from '../ui/Toast';

export function Topbar() {
  const pageId = useStore((s) => s.currentPageId);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  useStore((s) => s.navTick);
  useStore((s) => (pageId ? s.pageTick[pageId] : 0));
  const page = useStore((s) => (pageId ? s.pages[pageId] : undefined));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [share, setShare] = useState<{ x: number; y: number } | null>(null);

  const crumbs = pageId ? getAncestry(pageId) : [];

  return (
    <div className="topbar">
      {!sidebarOpen && (
        <button className="icon-btn" title="Open sidebar (⌘\)" onClick={toggleSidebar}>
          <MenuIcon size={17} />
        </button>
      )}
      <div className="breadcrumbs">
        {crumbs.map((c, i) => (
          <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
            {i > 0 && <span className="crumb-sep">/</span>}
            <span className="crumb" onClick={() => openPage(c.id)}>
              {c.icon ? `${c.icon} ` : ''}{c.title || 'Untitled'}
            </span>
          </span>
        ))}
      </div>

      {page && (
        <div className="topbar-actions">
          <span className="edited-hint" title={new Date(page.updatedAt).toLocaleString()}>
            <Clock size={12} style={{ verticalAlign: -1.5, marginRight: 4 }} />
            {timeAgo(page.updatedAt)}
          </span>
          <button className="btn small" onClick={(e) => setShare({ x: e.clientX - 240, y: e.clientY + 14 })}>
            Share
          </button>
          <button className="icon-btn" title="Comments" onClick={() => setCommentsFor(page.id)}>
            <MessageSquareText size={17} />
          </button>
          <button
            className={`icon-btn ${page.favorite ? 'active' : ''}`}
            title={page.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => toggleFavorite(page.id)}
          >
            <Star size={17} fill={page.favorite ? 'currentColor' : 'none'} />
          </button>
          <button className="icon-btn" title="More" onClick={(e) => setMenu({ x: e.clientX - 250, y: e.clientY + 14 })}>
            <MoreHorizontal size={18} />
          </button>
        </div>
      )}

      {menu && page && <PageMenu pageId={page.id} anchor={menu} onClose={() => setMenu(null)} />}
      {share && page && (
        <Popover anchor={share} onClose={() => setShare(null)} width={300}>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Share “{page.title || 'Untitled'}”</div>
            <button className="btn small" onClick={() => {
              navigator.clipboard.writeText(`${location.origin}${location.pathname}#/p/${page.id}`);
              toast('Link copied — anyone using this workspace can open it');
              setShare(null);
            }}>
              <Copy size={14} /> Copy workspace link
            </button>
            <button className="btn small" onClick={() => {
              downloadFile(`${safeFileName(page.title)}.html`, exportPageHTML(page.id), 'text/html');
              setShare(null);
            }}>
              <Download size={14} /> Export as standalone HTML
            </button>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Tip: host the exported HTML anywhere to publish this page.
            </div>
          </div>
        </Popover>
      )}
    </div>
  );
}

export function PageMenu({ pageId, anchor, onClose }: { pageId: string; anchor: { x: number; y: number }; onClose: () => void }) {
  const page = useStore((s) => s.pages[pageId]);
  const [moveOpen, setMoveOpen] = useState(false);
  if (!page) return null;
  if (moveOpen) {
    return (
      <PagePickerMenu
        anchor={anchor}
        onClose={onClose}
        onPick={(target) => {
          movePage(pageId, target);
          toast('Page moved');
          onClose();
        }}
      />
    );
  }
  const set = (patch: Parameters<typeof updatePage>[1]) => updatePage(pageId, patch);

  const wordCount = (() => {
    let words = 0;
    const walk = (parentId: string | null) => {
      for (const b of getChildren(pageId, parentId)) {
        const el = document.createElement('div');
        el.innerHTML = b.html;
        words += (el.textContent ?? '').split(/\s+/).filter(Boolean).length;
        walk(b.id);
      }
    };
    walk(null);
    return words;
  })();

  return (
    <Popover anchor={anchor} onClose={onClose} width={270}>
      <div className="menu">
        <div className="menu-title">Style</div>
        <div style={{ display: 'flex', gap: 6, padding: '2px 8px 8px' }}>
          {(['default', 'serif', 'mono'] as const).map((f) => (
            <button
              key={f}
              className="btn small"
              style={{
                flex: 1, flexDirection: 'column', gap: 2, paddingTop: 6, paddingBottom: 6,
                borderColor: (page.props.font ?? 'default') === f ? 'var(--gold)' : undefined,
              }}
              onClick={() => set({ props: { font: f } })}
            >
              <Type size={15} style={{ fontFamily: 'serif' }} />
              <span style={{ fontSize: 11.5, textTransform: 'capitalize' }}>{f}</span>
            </button>
          ))}
        </div>
        <ToggleRow label="Small text" on={!!page.props.smallText} onToggle={() => set({ props: { smallText: !page.props.smallText } })} />
        <ToggleRow label="Full width" on={!!page.props.fullWidth} onToggle={() => set({ props: { fullWidth: !page.props.fullWidth } })} />
        <div className="menu-sep" />
        <button className="menu-item" onClick={() => { set({ props: { locked: !page.props.locked } }); onClose(); }}>
          <span className="mi-icon">{page.props.locked ? <LockOpen size={15} /> : <Lock size={15} />}</span>
          <span className="mi-label">{page.props.locked ? 'Unlock page' : 'Lock page'}</span>
        </button>
        <button className="menu-item" onClick={() => { const nid = duplicatePage(pageId); onClose(); openPage(nid); }}>
          <span className="mi-icon"><Copy size={15} /></span>
          <span className="mi-label">Duplicate</span>
        </button>
        <button className="menu-item" onClick={() => setMoveOpen(true)}>
          <span className="mi-icon"><CornerUpRight size={15} /></span>
          <span className="mi-label">Move to…</span>
          <span className="mi-hint">›</span>
        </button>
        <button className="menu-item" onClick={() => { setHistoryFor(pageId); onClose(); }}>
          <span className="mi-icon"><History size={15} /></span>
          <span className="mi-label">Version history</span>
        </button>
        <div className="menu-sep" />
        <button className="menu-item" onClick={() => {
          downloadFile(`${safeFileName(page.title)}.md`, exportPageMarkdown(pageId), 'text/markdown');
          onClose();
        }}>
          <span className="mi-icon"><Download size={15} /></span>
          <span className="mi-label">Export as Markdown</span>
        </button>
        <button className="menu-item" onClick={() => {
          downloadFile(`${safeFileName(page.title)}.html`, exportPageHTML(pageId), 'text/html');
          onClose();
        }}>
          <span className="mi-icon"><Download size={15} /></span>
          <span className="mi-label">Export as HTML</span>
        </button>
        <div className="menu-sep" />
        <button className="menu-item danger" onClick={() => {
          captureUndo(pageId, 'trash', false);
          deletePage(pageId);
          onClose();
          toast('Moved to trash', 'Undo', () => import('../../lib/store').then((m) => m.restorePage(pageId)));
        }}>
          <span className="mi-icon"><Trash2 size={15} /></span>
          <span className="mi-label">Move to trash</span>
        </button>
        <div className="menu-sep" />
        <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{wordCount.toLocaleString()} words</span>
          <span><ChevronsRight size={11} style={{ verticalAlign: -1.5 }} /> created {timeAgo(page.createdAt)}</span>
        </div>
      </div>
    </Popover>
  );
}

function ToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="menu-item" onClick={onToggle} style={{ cursor: 'pointer' }}>
      <span className="mi-label">{label}</span>
      <button className={`switch ${on ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onToggle(); }} />
    </div>
  );
}
