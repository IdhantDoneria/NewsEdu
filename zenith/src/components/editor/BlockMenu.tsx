import { Copy, Link2, MessageSquare, Paintbrush, Repeat2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  addComment, captureUndo, deleteBlock, duplicateBlock, setCommentsFor, updateBlock,
} from '../../lib/store';
import type { Block as BlockDoc, BlockType } from '../../lib/types';
import { BLOCK_COLORS } from '../../lib/types';
import { Popover } from '../ui/Popover';
import { toast } from '../ui/Toast';
import { BLOCK_META, TURN_INTO_TYPES } from './blockMeta';
import { useEditor } from './ctx';

type Pane = 'main' | 'turnInto' | 'color';

export function BlockMenu({ block, anchor, onClose }: {
  block: BlockDoc;
  anchor: { x: number; y: number };
  onClose: () => void;
}) {
  const ctx = useEditor();
  const [pane, setPane] = useState<Pane>('main');

  return (
    <Popover anchor={anchor} onClose={onClose} width={260}>
      {pane === 'main' && (
        <div className="menu">
          <button className="menu-item" onClick={() => setPane('turnInto')}>
            <span className="mi-icon"><Repeat2 size={16} /></span>
            <span className="mi-label">Turn into</span>
            <span className="mi-hint">›</span>
          </button>
          <button className="menu-item" onClick={() => setPane('color')}>
            <span className="mi-icon"><Paintbrush size={16} /></span>
            <span className="mi-label">Color</span>
            <span className="mi-hint">›</span>
          </button>
          <div className="menu-sep" />
          <button
            className="menu-item"
            onClick={() => {
              captureUndo(ctx.pageId, 'dup', false);
              duplicateBlock(block.id);
              onClose();
            }}
          >
            <span className="mi-icon"><Copy size={16} /></span>
            <span className="mi-label">Duplicate</span>
            <span className="mi-hint">⌘D</span>
          </button>
          <button
            className="menu-item"
            onClick={() => {
              const el = ctx.refs.get(block.id);
              const text = el?.textContent?.slice(0, 60);
              setCommentsFor(ctx.pageId);
              if (text) addComment(ctx.pageId, `Re “${text}${(el?.textContent?.length ?? 0) > 60 ? '…' : ''}”: `, block.id);
              onClose();
            }}
          >
            <span className="mi-icon"><MessageSquare size={16} /></span>
            <span className="mi-label">Comment</span>
          </button>
          <button
            className="menu-item"
            onClick={() => {
              const url = `${location.origin}${location.pathname}#/p/${ctx.pageId}#${block.id}`;
              navigator.clipboard.writeText(url);
              toast('Link to block copied');
              onClose();
            }}
          >
            <span className="mi-icon"><Link2 size={16} /></span>
            <span className="mi-label">Copy link to block</span>
          </button>
          <div className="menu-sep" />
          <button
            className="menu-item danger"
            onClick={() => {
              captureUndo(ctx.pageId, 'delete', false);
              deleteBlock(block.id);
              onClose();
            }}
          >
            <span className="mi-icon"><Trash2 size={16} /></span>
            <span className="mi-label">Delete</span>
            <span className="mi-hint">Del</span>
          </button>
        </div>
      )}

      {pane === 'turnInto' && (
        <div className="menu">
          <div className="menu-title">Turn into</div>
          {TURN_INTO_TYPES.map((t) => (
            <button
              key={t}
              className="menu-item"
              onClick={() => {
                captureUndo(ctx.pageId, 'turn', false);
                const props: any = t === 'callout' ? { icon: '💡' } : t === 'code' ? { language: 'plaintext' } : {};
                updateBlock(block.id, { type: t as BlockType, props });
                onClose();
              }}
            >
              <span className="mi-icon">{BLOCK_META[t].icon}</span>
              <span className="mi-label">{BLOCK_META[t].label}</span>
              {block.type === t && <span className="mi-hint">✓</span>}
            </button>
          ))}
        </div>
      )}

      {pane === 'color' && (
        <div className="menu">
          <div className="menu-title">Text color</div>
          {BLOCK_COLORS.map((c) => (
            <button
              key={c}
              className="menu-item"
              onClick={() => { updateBlock(block.id, { props: { color: c } }); onClose(); }}
            >
              <span className="mi-icon" style={{ fontWeight: 700, color: c === 'default' ? 'var(--text)' : `var(--${c})` }}>A</span>
              <span className="mi-label" style={{ textTransform: 'capitalize' }}>{c}</span>
              {(block.props.color ?? 'default') === c && <span className="mi-hint">✓</span>}
            </button>
          ))}
          <div className="menu-sep" />
          <div className="menu-title">Background</div>
          {BLOCK_COLORS.map((c) => (
            <button
              key={c}
              className="menu-item"
              onClick={() => { updateBlock(block.id, { props: { bg: c } }); onClose(); }}
            >
              <span className="mi-icon">
                <span className="dot" style={{ width: 14, height: 14, borderRadius: 4, background: c === 'default' ? 'transparent' : `var(--tint-${c})`, border: '1px solid var(--border)' , display: 'inline-block' }} />
              </span>
              <span className="mi-label" style={{ textTransform: 'capitalize' }}>{c} background</span>
              {(block.props.bg ?? 'default') === c && <span className="mi-hint">✓</span>}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
