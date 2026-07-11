import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { Popover } from '../ui/Popover';

/** searchable list of workspace pages (optionally databases only) */
export function PagePickerMenu({ anchor, onPick, onClose, databasesOnly = false }: {
  anchor: { x: number; y: number; y2?: number };
  onPick: (pageId: string) => void;
  onClose: () => void;
  databasesOnly?: boolean;
}) {
  const pages = useStore((s) => s.pages);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return Object.values(pages)
      .filter((p) => !p.deletedAt && !p.databaseId)
      .filter((p) => (databasesOnly ? p.type === 'database' : true))
      .filter((p) => !s || (p.title || 'untitled').toLowerCase().includes(s))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 24);
  }, [pages, q, databasesOnly]);

  return (
    <Popover anchor={anchor} onClose={onClose} width={320} autoFocus>
      <div style={{ padding: '10px 10px 0' }}>
        <input
          className="text-input"
          placeholder={databasesOnly ? 'Search databases…' : 'Search pages…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && list[0]) onPick(list[0].id);
            e.stopPropagation();
          }}
        />
      </div>
      <div className="menu" style={{ maxHeight: 320, overflowY: 'auto' }}>
        {list.length === 0 && (
          <div style={{ padding: 12, color: 'var(--text-tertiary)', fontSize: 13.5 }}>
            {databasesOnly ? 'No databases yet. Create one with /table.' : 'No pages found.'}
          </div>
        )}
        {list.map((p) => (
          <button key={p.id} className="menu-item" onClick={() => onPick(p.id)}>
            <span className="mi-icon">{p.icon ?? (p.type === 'database' ? '🗂️' : '📄')}</span>
            <span className="mi-label">{p.title || 'Untitled'}</span>
          </button>
        ))}
      </div>
    </Popover>
  );
}
