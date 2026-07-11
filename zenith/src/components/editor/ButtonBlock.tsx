import { MousePointerClick, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { captureUndo, createBlock, openPage, updateBlock, useStore } from '../../lib/store';
import type { Block as BlockDoc, BlockType } from '../../lib/types';
import { Popover } from '../ui/Popover';
import { PagePickerMenu } from './PagePicker';
import { useEditor } from './ctx';

const INSERTABLE: Array<{ type: BlockType; label: string }> = [
  { type: 'todo', label: 'To-do' },
  { type: 'paragraph', label: 'Text' },
  { type: 'bulleted', label: 'Bullet' },
  { type: 'h2', label: 'Heading' },
  { type: 'quote', label: 'Quote' },
  { type: 'callout', label: 'Callout' },
];

export function ButtonBlock({ block }: { block: BlockDoc }) {
  const ctx = useEditor();
  const page = useStore((s) => (block.props.pageId ? s.pages[block.props.pageId] : undefined));
  const [cfg, setCfg] = useState<{ x: number; y: number } | null>(null);
  const [pagePick, setPagePick] = useState<{ x: number; y: number } | null>(null);

  const label = block.props.label || 'New button';
  const mode = (block.props.mode as 'insert' | 'link') ?? 'insert';
  const gold = block.props.color === 'gold';

  const run = () => {
    if (ctx.readOnly) return;
    if (mode === 'link') {
      if (block.props.pageId) openPage(block.props.pageId);
      return;
    }
    captureUndo(ctx.pageId, 'button', false);
    const nid = createBlock(ctx.pageId, {
      parentId: block.parentId, after: block.id,
      type: (block.props.insert as BlockType) || 'todo',
      props: block.props.insert === 'callout' ? { icon: '💡' } : {},
    });
    ctx.focusBlock(nid, 'start');
  };

  return (
    <div contentEditable={false}>
      <div className="zbutton-wrap">
        <button className={`zbutton ${gold ? 'gold' : ''}`} onClick={run}>
          <MousePointerClick size={14} /> {label}
        </button>
        {!ctx.readOnly && (
          <span className="zbutton-cog" title="Configure" onClick={(e) => setCfg({ x: e.clientX - 150, y: e.clientY + 12 })}>
            <Settings2 size={15} />
          </span>
        )}
      </div>

      {cfg && (
        <Popover anchor={cfg} onClose={() => setCfg(null)} width={250}>
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              className="text-input" placeholder="Button label" autoFocus defaultValue={block.props.label ?? ''}
              onChange={(e) => updateBlock(block.id, { props: { label: e.target.value } }, { silent: true })}
            />
            <div className="seg">
              <button className={mode === 'insert' ? 'on' : ''} onClick={() => updateBlock(block.id, { props: { mode: 'insert' } })}>Insert block</button>
              <button className={mode === 'link' ? 'on' : ''} onClick={() => updateBlock(block.id, { props: { mode: 'link' } })}>Open page</button>
            </div>
            {mode === 'insert' ? (
              <div>
                <div className="menu-title" style={{ paddingLeft: 2 }}>Inserts</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {INSERTABLE.map((it) => (
                    <button key={it.type} className={`btn small ${(block.props.insert ?? 'todo') === it.type ? 'gold' : ''}`}
                      onClick={() => updateBlock(block.id, { props: { insert: it.type } })}>{it.label}</button>
                  ))}
                </div>
              </div>
            ) : (
              <button className="btn small" onClick={(e) => setPagePick({ x: e.clientX - 150, y: e.clientY + 12 })}>
                {page ? `→ ${page.title || 'Untitled'}` : 'Choose a page…'}
              </button>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={gold} onChange={(e) => updateBlock(block.id, { props: { color: e.target.checked ? 'gold' : 'default' } })} />
              Gold style
            </label>
          </div>
        </Popover>
      )}
      {pagePick && (
        <PagePickerMenu anchor={pagePick} onClose={() => setPagePick(null)}
          onPick={(pid) => { updateBlock(block.id, { props: { pageId: pid } }); setPagePick(null); }} />
      )}
    </div>
  );
}
