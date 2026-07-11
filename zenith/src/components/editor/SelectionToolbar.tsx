import { Baseline, Bold, Code, Italic, Link2, Sparkles, Strikethrough, Underline } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { openAI } from '../../lib/bus';
import { selectionInsideEditor } from '../../lib/caret';
import { captureUndo, getBlock, updateBlockHtml } from '../../lib/store';
import { BLOCK_COLORS } from '../../lib/types';
import { Popover } from '../ui/Popover';

interface Pos { x: number; y: number; y2: number }

function blockFromSelection(): { id: string; el: HTMLElement } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.getRangeAt(0).commonAncestorContainer;
  const el = (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement);
  const rich = el?.closest('[data-rich-text]') as HTMLElement | null;
  const wrap = el?.closest('[data-block-id]') as HTMLElement | null;
  if (!rich || !wrap) return null;
  return { id: wrap.getAttribute('data-block-id')!, el: rich };
}

function syncBlock() {
  const ctx = blockFromSelection();
  if (!ctx) return;
  updateBlockHtml(ctx.id, ctx.el.innerHTML);
}

function exec(cmd: string, val?: string) {
  const ctx = blockFromSelection();
  if (ctx) {
    const blk = getBlock(ctx.id);
    if (blk) captureUndo(blk.pageId, 'format', false);
  }
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand(cmd, false, val);
  syncBlock();
}

function execCss(cmd: string, val: string) {
  const ctx = blockFromSelection();
  if (ctx) {
    const blk = getBlock(ctx.id);
    if (blk) captureUndo(blk.pageId, 'format', false);
  }
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand(cmd, false, val);
  document.execCommand('styleWithCSS', false, 'false');
  syncBlock();
}

function toggleInlineCode() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const parent = range.commonAncestorContainer.nodeType === 1
    ? (range.commonAncestorContainer as HTMLElement)
    : range.commonAncestorContainer.parentElement;
  const ctx = blockFromSelection();
  if (ctx) {
    const blk = getBlock(ctx.id);
    if (blk) captureUndo(blk.pageId, 'format', false);
  }
  if (parent?.closest('code')) {
    const codeEl = parent.closest('code')!;
    const text = codeEl.textContent ?? '';
    const r = document.createRange();
    r.selectNode(codeEl);
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand('insertHTML', false, text.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  } else {
    const div = document.createElement('div');
    div.appendChild(range.cloneContents());
    const text = (div.textContent ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    document.execCommand('insertHTML', false, `<code>${text}</code>`);
  }
  syncBlock();
}

export function SelectionToolbar() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [selText, setSelText] = useState('');
  const savedRange = useRef<Range | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !selectionInsideEditor()) {
          if (!linkOpen && !colorOpen) setPos(null);
          return;
        }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width < 1) { setPos(null); return; }
        setSelText(sel.toString());
        setPos({ x: rect.left, y: Math.max(50, rect.top - 44), y2: rect.bottom + 8 });
      });
    };
    document.addEventListener('selectionchange', update);
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || !selectionInsideEditor()) return;
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); exec('bold'); }
      else if (k === 'i') { e.preventDefault(); exec('italic'); }
      else if (k === 'u') { e.preventDefault(); exec('underline'); }
      else if (k === 's' && e.shiftKey) { e.preventDefault(); exec('strikeThrough'); }
      else if (k === 'e') { e.preventDefault(); toggleInlineCode(); }
      else if (k === 'k') {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) { e.preventDefault(); saveRange(); setLinkOpen(true); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
    };
  }, [linkOpen, colorOpen]);

  const saveRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange();
  };
  const restoreRange = () => {
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  if (!pos) return null;

  return (
    <>
      <div
        ref={barRef}
        className="sel-toolbar"
        style={{ left: Math.min(pos.x, window.innerWidth - 360), top: pos.y }}
        onMouseDown={(e) => e.preventDefault() /* keep selection */}
      >
        <button
          className="tb ai"
          onClick={() => {
            const blk = blockFromSelection();
            const blkDoc = blk ? getBlock(blk.id) : null;
            if (blkDoc) {
              openAI({
                anchor: { x: pos.x, y: pos.y2, y2: pos.y - 8 },
                pageId: blkDoc.pageId,
                blockId: blkDoc.id,
                selection: selText,
              });
            }
            setPos(null);
          }}
        >
          <Sparkles size={14} /> Ask AI
        </button>
        <div className="tb-sep" />
        <button className="tb" title="Bold (⌘B)" onClick={() => exec('bold')}><Bold size={15} /></button>
        <button className="tb" title="Italic (⌘I)" onClick={() => exec('italic')}><Italic size={15} /></button>
        <button className="tb" title="Underline (⌘U)" onClick={() => exec('underline')}><Underline size={15} /></button>
        <button className="tb" title="Strikethrough (⌘⇧S)" onClick={() => exec('strikeThrough')}><Strikethrough size={15} /></button>
        <button className="tb" title="Code (⌘E)" onClick={toggleInlineCode}><Code size={15} /></button>
        <div className="tb-sep" />
        <button className="tb" title="Link (⌘K)" onClick={() => { saveRange(); setLinkOpen(true); }}><Link2 size={15} /></button>
        <button className="tb" title="Color" onClick={() => { saveRange(); setColorOpen(true); }}><Baseline size={15} /></button>
      </div>

      {linkOpen && (
        <Popover anchor={{ x: pos.x, y: pos.y + 38 }} onClose={() => setLinkOpen(false)} width={320} autoFocus>
          <div style={{ padding: 10 }}>
            <input
              className="text-input"
              placeholder="Paste a link and press Enter…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const url = (e.target as HTMLInputElement).value.trim();
                  if (url) {
                    restoreRange();
                    exec('createLink', /^https?:|^mailto:|^#/.test(url) ? url : `https://${url}`);
                  }
                  setLinkOpen(false);
                  setPos(null);
                }
                e.stopPropagation();
              }}
            />
          </div>
        </Popover>
      )}

      {colorOpen && (
        <Popover anchor={{ x: pos.x, y: pos.y + 38 }} onClose={() => setColorOpen(false)} width={220}>
          <div className="menu">
            <div className="menu-title">Text color</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '2px 8px 8px' }}>
              <button className="icon-btn" title="Default" onClick={() => { restoreRange(); execCss('foreColor', 'inherit'); setColorOpen(false); }}>
                <span style={{ fontWeight: 700 }}>A</span>
              </button>
              {BLOCK_COLORS.slice(1).map((c) => (
                <button key={c} className="icon-btn" title={c} onClick={() => {
                  restoreRange();
                  const probe = document.createElement('span');
                  probe.style.color = `var(--${c})`;
                  document.body.appendChild(probe);
                  const resolved = getComputedStyle(probe).color;
                  probe.remove();
                  execCss('foreColor', resolved);
                  setColorOpen(false);
                }}>
                  <span style={{ fontWeight: 700, color: `var(--${c})` }}>A</span>
                </button>
              ))}
            </div>
            <div className="menu-title">Highlight</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '2px 8px 8px' }}>
              <button className="icon-btn" title="None" onClick={() => { restoreRange(); execCss('hiliteColor', 'transparent'); setColorOpen(false); }}>
                <span className="dot" style={{ width: 16, height: 16, border: '1px solid var(--border-strong)', borderRadius: 4, background: 'transparent' }} />
              </button>
              {BLOCK_COLORS.slice(1).map((c) => (
                <button key={c} className="icon-btn" title={c} onClick={() => {
                  restoreRange();
                  const probe = document.createElement('span');
                  probe.style.color = `var(--tint-${c})`;
                  document.body.appendChild(probe);
                  const resolved = getComputedStyle(probe).color;
                  probe.remove();
                  execCss('hiliteColor', resolved);
                  setColorOpen(false);
                }}>
                  <span className="dot" style={{ width: 16, height: 16, borderRadius: 4, background: `var(--tint-${c})`, border: '1px solid var(--border)' }} />
                </button>
              ))}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}
