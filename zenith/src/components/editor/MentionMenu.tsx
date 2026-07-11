// Inline @ / [[ mention menu — link pages, mention dates, or create a page,
// the way Notion does. Renders a searchable popover at the caret.
import { CalendarDays, CornerDownLeft, FileText, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPage, useStore } from '../../lib/store';
import { Popover } from '../ui/Popover';
import { fmtDate } from './editorUtils';

export type MentionChoice =
  | { type: 'page'; pageId: string; title: string; icon?: string }
  | { type: 'date'; text: string }
  | { type: 'dismiss' };

const DATE_PRESETS: Array<{ label: string; offset: number }> = [
  { label: 'Today', offset: 0 },
  { label: 'Tomorrow', offset: 1 },
  { label: 'Yesterday', offset: -1 },
  { label: 'In a week', offset: 7 },
];

export function MentionMenu({ anchor, parentPageId, onChoose }: {
  anchor: { x: number; y: number; y2?: number };
  parentPageId: string;
  onChoose: (c: MentionChoice) => void;
}) {
  const pages = useStore((s) => s.pages);
  const [q, setQ] = useState('');
  const [hl, setHl] = useState(0);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return Object.values(pages)
      .filter((p) => !p.deletedAt && !p.databaseId)
      .filter((p) => !s || (p.title || 'untitled').toLowerCase().includes(s))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8);
  }, [pages, q]);

  const dateMatches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return DATE_PRESETS.filter((d) => !s || d.label.toLowerCase().includes(s));
  }, [q]);

  // flattened selectable rows for keyboard nav: dates, pages, create
  const rows: Array<() => void> = [];
  dateMatches.forEach((d) => rows.push(() => {
    const date = new Date();
    date.setDate(date.getDate() + d.offset);
    onChoose({ type: 'date', text: fmtDate(date.getTime()) });
  }));
  results.forEach((p) => rows.push(() => onChoose({ type: 'page', pageId: p.id, title: p.title || 'Untitled', icon: p.icon })));
  const showCreate = q.trim().length > 0;
  if (showCreate) rows.push(() => {
    const id = createPage({ parentId: parentPageId, title: q.trim() });
    onChoose({ type: 'page', pageId: id, title: q.trim() });
  });

  return (
    <Popover anchor={anchor} onClose={() => onChoose({ type: 'dismiss' })} width={300}>
      <div style={{ padding: '8px 8px 0' }}>
        <input
          className="text-input" autoFocus placeholder="Mention a page or date…"
          value={q} onChange={(e) => { setQ(e.target.value); setHl(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, rows.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); rows[hl]?.(); }
            else if (e.key === 'Escape') { onChoose({ type: 'dismiss' }); }
            e.stopPropagation();
          }}
        />
      </div>
      <div className="menu" style={{ maxHeight: 320, overflowY: 'auto' }}>
        {dateMatches.length > 0 && <div className="menu-title">Dates</div>}
        {dateMatches.map((d, i) => (
          <button key={d.label} className={`menu-item ${hl === i ? 'hl' : ''}`} onMouseEnter={() => setHl(i)} onClick={() => rows[i]()}>
            <span className="mi-icon"><CalendarDays size={15} /></span>
            <span className="mi-label">{d.label}</span>
            <span className="mi-hint">{(() => { const x = new Date(); x.setDate(x.getDate() + d.offset); return fmtDate(x.getTime()); })()}</span>
          </button>
        ))}
        {results.length > 0 && <div className="menu-title">Link to page</div>}
        {results.map((p, i) => {
          const idx = dateMatches.length + i;
          return (
            <button key={p.id} className={`menu-item ${hl === idx ? 'hl' : ''}`} onMouseEnter={() => setHl(idx)} onClick={() => rows[idx]()}>
              <span className="mi-icon">{p.icon ?? <FileText size={15} />}</span>
              <span className="mi-label">{p.title || 'Untitled'}</span>
            </button>
          );
        })}
        {showCreate && (
          <button
            className={`menu-item ${hl === rows.length - 1 ? 'hl' : ''}`}
            onMouseEnter={() => setHl(rows.length - 1)}
            onClick={() => rows[rows.length - 1]()}
          >
            <span className="mi-icon"><Plus size={15} /></span>
            <span className="mi-label">New page “{q.trim()}”</span>
            <span className="mi-hint"><CornerDownLeft size={12} /></span>
          </button>
        )}
        {rows.length === 0 && <div style={{ padding: 12, color: 'var(--text-tertiary)', fontSize: 13 }}>No matches</div>}
      </div>
    </Popover>
  );
}
