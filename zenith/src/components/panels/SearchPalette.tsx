import { CornerDownLeft, FileText, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchWorkspace } from '../../lib/search';
import { createPage, openPage, setSearchOpen, useStore } from '../../lib/store';
import { timeAgo } from '../editor/editorUtils';

export function SearchPalette() {
  const open = useStore((s) => s.searchOpen);
  const [q, setQ] = useState('');
  const [hl, setHl] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => (open ? searchWorkspace(q) : []), [q, open]);

  useEffect(() => {
    if (open) {
      setQ('');
      setHl(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);
  useEffect(() => setHl(0), [q]);

  if (!open) return null;

  const close = () => setSearchOpen(false);
  const pick = (id: string) => { openPage(id); close(); };

  return createPortal(
    <div className="modal-overlay" style={{ alignItems: 'flex-start', display: 'flex', justifyContent: 'center', paddingTop: '14vh' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div style={{
        width: 'min(620px, calc(100vw - 48px))', background: 'var(--bg)', borderRadius: 12,
        boxShadow: 'var(--shadow-modal)', overflow: 'hidden', animation: 'modal-in 0.16s var(--ease)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
          <Search size={17} style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, or type to create…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 16.5, color: 'var(--text)' }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              else if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, hits.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
              else if (e.key === 'Enter') {
                e.preventDefault();
                if (hits[hl]) pick(hits[hl].page.id);
                else if (q.trim()) { pick(createPage({ title: q.trim() })); }
              }
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: 6 }}>
          {!q && <div className="menu-title">Recent</div>}
          {hits.map((h, i) => (
            <button
              key={h.page.id}
              className={`menu-item ${i === hl ? 'hl' : ''}`}
              style={{ padding: '8px 10px' }}
              onMouseEnter={() => setHl(i)}
              onClick={() => pick(h.page.id)}
            >
              <span className="mi-icon" style={{ fontSize: 16 }}>
                {h.page.icon ?? (h.page.type === 'database' ? '🗂️' : <FileText size={16} />)}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="mi-label" style={{ display: 'block', fontWeight: 530 }}>{h.page.title || 'Untitled'}</span>
                {h.excerpt && <span className="mi-desc" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.excerpt}</span>}
              </span>
              <span className="mi-hint">{timeAgo(h.page.updatedAt)}</span>
            </button>
          ))}
          {q.trim() && (
            <button className={`menu-item ${hl >= hits.length ? 'hl' : ''}`} onClick={() => pick(createPage({ title: q.trim() }))}>
              <span className="mi-icon"><CornerDownLeft size={15} /></span>
              <span className="mi-label">Create page “{q.trim()}”</span>
            </button>
          )}
          {!q.trim() && hits.length === 0 && (
            <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13.5 }}>Your workspace is empty — create your first page.</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
