import { ChevronRight, Link2 } from 'lucide-react';
import { useState } from 'react';
import { getBacklinks, openPage, useStore } from '../../lib/store';

export function Backlinks({ pageId }: { pageId: string }) {
  useStore((s) => s.navTick);
  useStore((s) => s.pageTick[pageId]);
  const [open, setOpen] = useState(true);
  const links = getBacklinks(pageId);
  if (!links.length) return null;

  return (
    <div className="backlinks" contentEditable={false}>
      <button className="backlinks-head" onClick={() => setOpen((v) => !v)}>
        <ChevronRight size={14} className="bl-chev" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
        <Link2 size={14} />
        {links.length} linked reference{links.length > 1 ? 's' : ''}
      </button>
      {open && (
        <div className="backlinks-list">
          {links.map((l) => (
            <button key={l.page.id} className="backlinks-item" onClick={() => openPage(l.page.id)}>
              <span className="bl-icon">{l.page.icon ?? '📄'}</span>
              <span className="bl-body">
                <span className="bl-title">{l.page.title || 'Untitled'}</span>
                {l.snippet && <span className="bl-snippet">{l.snippet}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
