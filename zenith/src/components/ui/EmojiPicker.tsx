import { useMemo, useState } from 'react';
import { EMOJI_GROUPS, searchEmoji } from '../../lib/emoji';
import { type Anchor, Popover } from './Popover';

export function EmojiPicker({
  anchor, onPick, onClose, allowRemove = false, onRemove,
}: {
  anchor: Anchor;
  onPick: (emoji: string) => void;
  onClose: () => void;
  allowRemove?: boolean;
  onRemove?: () => void;
}) {
  const [q, setQ] = useState('');
  const results = useMemo(() => (q ? searchEmoji(q) : null), [q]);

  return (
    <Popover anchor={anchor} onClose={onClose} width={332} autoFocus>
      <div style={{ padding: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="text-input"
            placeholder="Search emoji…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {allowRemove && (
            <button className="btn small" onClick={() => { onRemove?.(); onClose(); }}>Remove</button>
          )}
        </div>
        <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 8 }}>
          {results ? (
            <EmojiGrid items={results.map((r) => r.e)} onPick={(e) => { onPick(e); onClose(); }} />
          ) : (
            EMOJI_GROUPS.map((g) => (
              <div key={g.name}>
                <div className="menu-title">{g.name}</div>
                <EmojiGrid items={g.items.map((i) => i.e)} onPick={(e) => { onPick(e); onClose(); }} />
              </div>
            ))
          )}
        </div>
      </div>
    </Popover>
  );
}

function EmojiGrid({ items, onPick }: { items: string[]; onPick: (e: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)' }}>
      {items.map((e, i) => (
        <button
          key={i}
          onClick={() => onPick(e)}
          style={{
            border: 'none', background: 'none', fontSize: 20, padding: '4px 0',
            cursor: 'pointer', borderRadius: 6, lineHeight: 1.3,
          }}
          onMouseEnter={(ev) => ((ev.target as HTMLElement).style.background = 'var(--bg-hover)')}
          onMouseLeave={(ev) => ((ev.target as HTMLElement).style.background = 'none')}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
