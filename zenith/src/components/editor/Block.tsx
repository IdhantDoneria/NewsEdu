import { ChevronRight, GripVertical, Plus } from 'lucide-react';
import { type ClipboardEvent, type KeyboardEvent, useRef, useState } from 'react';
import {
  deleteBeforeCaret, isCaretAtEnd, isCaretAtStart, splitAtCaret, getCaretRect, textBeforeCaret,
} from '../../lib/caret';
import {
  captureUndo, createBlock, deleteBlock, duplicateBlock, getBlock, getChildren,
  moveBlock, updateBlock, updateBlockHtml,
} from '../../lib/store';
import { EmojiPicker } from '../ui/EmojiPicker';
import type { Block as BlockDoc } from '../../lib/types';
import { TEXTISH } from './blockMeta';
import { BlockList } from './BlockList';
import { BlockMenu } from './BlockMenu';
import { useEditor } from './ctx';
import {
  fileToDataURL, placeCaretAtTextOffset, sanitizeInlineHtml, textLen, tryInlineFormat, URL_RE,
} from './editorUtils';
import { RichText } from './RichText';
import { SlashMenu } from './SlashMenu';
import { MentionMenu, type MentionChoice } from './MentionMenu';
import {
  BookmarkBlock, CodeBlock, EmbedBlock, ImageBlock, MathBlock, TableBlock, TocBlock, VideoBlock,
} from './blocks';
import { PageChipBlock } from './PageChip';
import { ButtonBlock } from './ButtonBlock';
import { DatabaseBlock } from '../database/DatabaseBlock';

const MD_MAP: Record<string, { type: BlockDoc['type']; props?: any }> = {
  '#': { type: 'h1' }, '##': { type: 'h2' }, '###': { type: 'h3' },
  '-': { type: 'bulleted' }, '*': { type: 'bulleted' },
  '1.': { type: 'numbered' },
  '[]': { type: 'todo' }, '[ ]': { type: 'todo' },
  '>': { type: 'toggle' }, '"': { type: 'quote' },
};

export function Block({ block, listIndex = 1, depth = 0 }: { block: BlockDoc; listIndex?: number; depth?: number }) {
  const ctx = useEditor();
  const [slashFor, setSlashFor] = useState<{ x: number; y: number; y2?: number } | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [mentionFor, setMentionFor] = useState<{ x: number; y: number; y2?: number; trigger: string } | null>(null);
  const mentionRange = useRef<Range | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const openMention = (trigger: string) => {
    const sel = window.getSelection();
    mentionRange.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const r = getCaretRect();
    setMentionFor(r ? { x: r.left, y: r.bottom + 6, y2: r.top - 6, trigger } : { x: 300, y: 300, trigger });
  };

  const resolveMention = (choice: MentionChoice) => {
    const el = ctx.refs.get(b.id);
    const trigger = mentionFor?.trigger ?? '@';
    setMentionFor(null);
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && mentionRange.current) { sel.removeAllRanges(); sel.addRange(mentionRange.current); }
    if (choice.type === 'dismiss') {
      document.execCommand('insertText', false, trigger); // put the typed character back
    } else if (choice.type === 'page') {
      const icon = choice.icon ? `${choice.icon} ` : '';
      const safe = choice.title.replace(/</g, '&lt;');
      document.execCommand('insertHTML', false,
        `<span class="zmention" data-page-id="${choice.pageId}" contenteditable="false">${icon}${safe}</span>&nbsp;`);
    } else {
      document.execCommand('insertHTML', false,
        `<span class="zmention" contenteditable="false">📅 ${choice.text}</span>&nbsp;`);
    }
    captureUndo(ctx.pageId, 'mention', false);
    updateBlockHtml(b.id, el.innerHTML);
  };

  const b = block;
  const meta = TEXTISH(b.type);
  const collapsed = !!b.props.collapsed;

  // ── keyboard engine ────────────────────────────────────────────────────────
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, el: HTMLDivElement) => {
    if (ctx.readOnly) { e.preventDefault(); return; }
    const mod = e.metaKey || e.ctrlKey;

    if (e.key === '/' && !mod && window.getSelection()?.isCollapsed) {
      e.preventDefault();
      const r = getCaretRect();
      setSlashFor(r ? { x: r.left, y: r.bottom + 6, y2: r.top - 6 } : { x: 300, y: 300 });
      return;
    }

    if (e.key === '@' && !mod && window.getSelection()?.isCollapsed) {
      e.preventDefault();
      openMention('@');
      return;
    }
    if (e.key === '[' && !mod && window.getSelection()?.isCollapsed) {
      if (textBeforeCaret(el).endsWith('[')) {   // second bracket → Notion-style [[
        e.preventDefault();
        deleteBeforeCaret(1);
        openMention('[[');
        return;
      }
    }

    if (e.key === ' ' && !mod) {
      const before = textBeforeCaret(el);
      const map = MD_MAP[before];
      if (map && b.type !== map.type) {
        e.preventDefault();
        captureUndo(ctx.pageId, 'md', false);
        deleteBeforeCaret(before.length);
        updateBlock(b.id, { type: map.type, props: map.props ?? {}, html: el.innerHTML === '<br>' ? '' : el.innerHTML });
        ctx.focusBlock(b.id, 'start');
        return;
      }
      if (before === '---') {
        e.preventDefault();
        captureUndo(ctx.pageId, 'md', false);
        updateBlock(b.id, { type: 'divider', html: '' });
        const nid = createBlock(ctx.pageId, { parentId: b.parentId, after: b.id });
        ctx.focusBlock(nid, 'start');
        return;
      }
      if (before === '```') {
        e.preventDefault();
        captureUndo(ctx.pageId, 'md', false);
        updateBlock(b.id, { type: 'code', html: '', props: { language: 'plaintext' } });
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      captureUndo(ctx.pageId, 'enter', false);
      const [before, after] = splitAtCaret(el);
      const empty = textLen(el.innerHTML) === 0;

      // empty list-ish item: convert to paragraph / outdent
      if (empty && ['bulleted', 'numbered', 'todo', 'toggle'].includes(b.type)) {
        if (b.parentId && getBlock(b.parentId)?.type !== 'column') {
          const parent = getBlock(b.parentId)!;
          moveBlock(b.id, parent.parentId, parent.id);
        } else {
          updateBlock(b.id, { type: 'paragraph' });
        }
        ctx.focusBlock(b.id, 'start');
        return;
      }

      // toggle expanded: new child on top
      if ((b.type === 'toggle' || b.props.toggleable) && !collapsed && isCaretAtEnd(el)) {
        const first = getChildren(b.pageId, b.id)[0];
        const nid = createBlock(ctx.pageId, { parentId: b.id, before: first?.id ?? null });
        ctx.focusBlock(nid, 'start');
        return;
      }

      const keepType = ['bulleted', 'numbered', 'todo'].includes(b.type);
      const newType = keepType ? b.type : 'paragraph';
      if (isCaretAtStart(el) && !empty) {
        // push current down: empty block above
        createBlock(ctx.pageId, { parentId: b.parentId, before: b.id, type: newType });
        ctx.focusBlock(b.id, 'start');
        return;
      }
      updateBlock(b.id, { html: before });
      const nid = createBlock(ctx.pageId, {
        parentId: b.parentId, after: b.id, type: newType, html: after,
        props: newType === 'todo' ? { checked: false } : {},
      });
      ctx.focusBlock(nid, 'start');
      return;
    }

    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      return;
    }

    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (!sel?.isCollapsed || !isCaretAtStart(el)) return;
      e.preventDefault();
      captureUndo(ctx.pageId, 'merge', false);
      if (b.type !== 'paragraph') {
        updateBlock(b.id, { type: 'paragraph', props: { toggleable: false } });
        ctx.focusBlock(b.id, 0);
        return;
      }
      if (b.parentId && getBlock(b.parentId)?.type !== 'column') {
        const parent = getBlock(b.parentId)!;
        moveBlock(b.id, parent.parentId, parent.id);
        ctx.focusBlock(b.id, 0);
        return;
      }
      // merge into previous visible block
      const flat = ctx.flatIds();
      const i = flat.indexOf(b.id);
      const prevId = i > 0 ? flat[i - 1] : null;
      if (!prevId) return;
      const prev = getBlock(prevId);
      if (!prev) return;
      if (TEXTISH(prev.type)) {
        const offset = textLen(prev.html);
        // adopt children
        for (const child of getChildren(b.pageId, b.id)) {
          moveBlock(child.id, prev.id, getChildren(b.pageId, prev.id).pop()?.id ?? null);
        }
        updateBlock(prev.id, { html: prev.html + el.innerHTML });
        deleteBlock(b.id);
        ctx.focusBlock(prev.id, offset);
      } else if (textLen(el.innerHTML) === 0) {
        deleteBlock(b.id);
        const prevEl = ctx.refs.get(prevId);
        prevEl?.focus();
      }
      return;
    }

    if (e.key === 'Delete') {
      if (!isCaretAtEnd(el)) return;
      const flat = ctx.flatIds();
      const i = flat.indexOf(b.id);
      const nextId = i >= 0 && i < flat.length - 1 ? flat[i + 1] : null;
      if (!nextId) return;
      const next = getBlock(nextId);
      if (!next || !TEXTISH(next.type)) return;
      e.preventDefault();
      captureUndo(ctx.pageId, 'merge', false);
      const offset = textLen(el.innerHTML);
      for (const child of getChildren(b.pageId, next.id)) {
        moveBlock(child.id, b.id, getChildren(b.pageId, b.id).pop()?.id ?? null);
      }
      updateBlock(b.id, { html: el.innerHTML + next.html });
      deleteBlock(next.id);
      ctx.focusBlock(b.id, offset);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      captureUndo(ctx.pageId, 'indent', false);
      const offset = textBeforeCaret(el).length;
      if (e.shiftKey) {
        if (b.parentId && getBlock(b.parentId)?.type !== 'column') {
          const parent = getBlock(b.parentId)!;
          const target = parent.type === 'column' ? getBlock(parent.parentId!) : parent;
          if (target) moveBlock(b.id, target.parentId, target.id);
          ctx.focusBlock(b.id, offset);
        }
      } else {
        const siblings = getChildren(b.pageId, b.parentId);
        const i = siblings.findIndex((x) => x.id === b.id);
        const prevSib = i > 0 ? siblings[i - 1] : null;
        if (prevSib && TEXTISH(prevSib.type)) {
          const last = getChildren(b.pageId, prevSib.id).pop();
          moveBlock(b.id, prevSib.id, last?.id ?? null);
          if (prevSib.props.collapsed) updateBlock(prevSib.id, { props: { collapsed: false } });
          ctx.focusBlock(b.id, offset);
        }
      }
      return;
    }

    if (e.key === 'ArrowUp' && !e.shiftKey && !mod) {
      const r = getCaretRect();
      const elr = el.getBoundingClientRect();
      if (isCaretAtStart(el) || (r && r.top - elr.top < 9)) {
        const prev = nearestTextish(ctx.flatIds(), b.id, -1);
        if (prev) { e.preventDefault(); ctx.focusBlock(prev, 'end'); }
      }
      return;
    }
    if (e.key === 'ArrowDown' && !e.shiftKey && !mod) {
      const r = getCaretRect();
      const elr = el.getBoundingClientRect();
      if (isCaretAtEnd(el) || (r && elr.bottom - r.bottom < 9)) {
        const next = nearestTextish(ctx.flatIds(), b.id, +1);
        if (next) { e.preventDefault(); ctx.focusBlock(next, 'start'); }
      }
      return;
    }
    if (e.key === 'ArrowLeft' && isCaretAtStart(el) && !e.shiftKey) {
      const prev = nearestTextish(ctx.flatIds(), b.id, -1);
      if (prev) { e.preventDefault(); ctx.focusBlock(prev, 'end'); }
      return;
    }
    if (e.key === 'ArrowRight' && isCaretAtEnd(el) && !e.shiftKey) {
      const next = nearestTextish(ctx.flatIds(), b.id, +1);
      if (next) { e.preventDefault(); ctx.focusBlock(next, 'start'); }
      return;
    }

    if (mod && e.key.toLowerCase() === 'd' && !e.shiftKey) {
      e.preventDefault();
      captureUndo(ctx.pageId, 'dup', false);
      const nid = duplicateBlock(b.id);
      ctx.focusBlock(nid, 'end');
      return;
    }
    if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      captureUndo(ctx.pageId, 'move', false);
      const siblings = getChildren(b.pageId, b.parentId);
      const i = siblings.findIndex((x) => x.id === b.id);
      const offset = textBeforeCaret(el).length;
      if (e.key === 'ArrowUp' && i > 0) moveBlock(b.id, b.parentId, siblings[i - 2]?.id ?? null);
      if (e.key === 'ArrowDown' && i < siblings.length - 1) moveBlock(b.id, b.parentId, siblings[i + 1].id);
      ctx.focusBlock(b.id, offset);
      return;
    }

    // inline markdown autoformat triggers
    if (['*', '`', '~'].includes(e.key)) {
      setTimeout(() => {
        if (tryInlineFormat(el)) updateBlockHtml(b.id, el.innerHTML);
      }, 0);
    }
  };

  const onPaste = async (e: ClipboardEvent<HTMLDivElement>, el: HTMLDivElement) => {
    if (ctx.readOnly) return;
    const dt = e.clipboardData;
    const img = Array.from(dt.files).find((f) => f.type.startsWith('image/'));
    if (img) {
      e.preventDefault();
      const src = await fileToDataURL(img);
      captureUndo(ctx.pageId, 'paste', false);
      createBlock(ctx.pageId, { parentId: b.parentId, after: b.id, type: 'image', props: { src, width: 'l' } });
      return;
    }
    const plain = dt.getData('text/plain');
    if (!plain) return;
    e.preventDefault();
    captureUndo(ctx.pageId, 'paste', false);
    if (URL_RE.test(plain.trim()) && !window.getSelection()?.isCollapsed) {
      document.execCommand('createLink', false, plain.trim());
      updateBlockHtml(b.id, el.innerHTML);
      return;
    }
    if (URL_RE.test(plain.trim()) && textLen(el.innerHTML) === 0) {
      updateBlock(b.id, { type: 'bookmark', props: { url: plain.trim() }, html: '' });
      return;
    }
    const lines = plain.replace(/\r/g, '').split('\n');
    if (lines.length === 1) {
      const html = dt.getData('text/html');
      if (html) {
        const safe = sanitizeInlineHtml(html).replace(/\n+$/g, '').replace(/\n/g, '<br>');
        document.execCommand('insertHTML', false, safe);
      } else {
        document.execCommand('insertText', false, plain);
      }
      updateBlockHtml(b.id, el.innerHTML);
      return;
    }
    // multi-line: first line into caret, rest become blocks
    document.execCommand('insertText', false, lines[0]);
    updateBlockHtml(b.id, el.innerHTML);
    let afterId = b.id;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      let type: BlockDoc['type'] = 'paragraph';
      let html = line;
      let props: any = {};
      let m;
      if ((m = line.match(/^(#{1,3})\s+(.*)/))) { type = `h${m[1].length}` as any; html = m[2]; }
      else if ((m = line.match(/^\s*-\s+\[( |x)\]\s+(.*)/))) { type = 'todo'; html = m[2]; props = { checked: m[1] === 'x' }; }
      else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { type = 'bulleted'; html = m[1]; }
      else if ((m = line.match(/^\s*\d+\.\s+(.*)/))) { type = 'numbered'; html = m[1]; }
      else if ((m = line.match(/^>\s?(.*)/))) { type = 'quote'; html = m[1]; }
      afterId = createBlock(ctx.pageId, {
        parentId: b.parentId, after: afterId, type,
        html: html.replace(/&/g, '&amp;').replace(/</g, '&lt;'), props,
      });
    }
    ctx.focusBlock(afterId, 'end');
  };

  const onChange = (html: string) => {
    captureUndo(ctx.pageId, 'type');
    updateBlockHtml(b.id, html);
  };

  // ── rendering ────────────────────────────────────────────────────────────
  const tint = b.props.bg && b.props.bg !== 'default' ? `tint-${b.props.bg}` : '';
  const fg = b.props.color && b.props.color !== 'default' ? `fg-${b.props.color}` : '';
  const dt = ctx.dropTarget?.id === b.id ? ctx.dropTarget : null;

  const richText = (cls = '', ph = "Write something, or press '/' for commands…") => (
    <RichText
      html={b.html}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      className={`${cls} ${fg}`}
      placeholder={ph}
      readOnly={ctx.readOnly}
      registerEl={(el) => {
        if (el) ctx.refs.set(b.id, el);
        else ctx.refs.delete(b.id);
      }}
    />
  );

  const toggleArrow = (b.type === 'toggle' || b.props.toggleable) && (
    <button
      className={`toggle-arrow ${collapsed ? '' : 'open'}`}
      onClick={() => updateBlock(b.id, { props: { collapsed: !collapsed } })}
      tabIndex={-1}
    >
      <ChevronRight size={16} strokeWidth={2.2} />
    </button>
  );

  let content: JSX.Element;
  switch (b.type) {
    case 'h1': case 'h2': case 'h3':
      content = b.props.toggleable
        ? <div style={{ display: 'flex', gap: 4 }}>{toggleArrow}<div style={{ flex: 1, minWidth: 0 }}>{richText('', `Heading ${b.type[1]}`)}</div></div>
        : richText('', `Heading ${b.type[1]}`);
      break;
    case 'bulleted':
      content = <><div className="list-marker" /><div className="list-body">{richText('', 'List item')}</div></>;
      break;
    case 'numbered':
      content = <><div className="list-marker">{listIndex}.</div><div className="list-body">{richText('', 'List item')}</div></>;
      break;
    case 'todo':
      content = (
        <>
          <input
            type="checkbox"
            className="todo-check"
            checked={!!b.props.checked}
            onChange={(e) => { captureUndo(ctx.pageId, 'check', false); updateBlock(b.id, { props: { checked: e.target.checked } }); }}
          />
          <div className="list-body">{richText('', 'To-do')}</div>
        </>
      );
      break;
    case 'toggle':
      content = <>{toggleArrow}<div className="list-body">{richText('', 'Toggle')}</div></>;
      break;
    case 'quote':
      content = richText('', 'Empty quote');
      break;
    case 'callout':
      content = (
        <>
          <CalloutIcon block={b} />
          <div className="callout-body">{richText('', 'Type something…')}</div>
        </>
      );
      break;
    case 'divider':
      content = <hr />;
      break;
    case 'code': content = <CodeBlock block={b} />; break;
    case 'image': content = <ImageBlock block={b} />; break;
    case 'bookmark': content = <BookmarkBlock block={b} />; break;
    case 'video': content = <VideoBlock block={b} />; break;
    case 'embed': content = <EmbedBlock block={b} />; break;
    case 'table': content = <TableBlock block={b} />; break;
    case 'math': content = <MathBlock block={b} />; break;
    case 'toc': content = <TocBlock block={b} />; break;
    case 'childPage': case 'linkPage': content = <PageChipBlock block={b} />; break;
    case 'button': content = <ButtonBlock block={b} />; break;
    case 'childDatabase': content = <DatabaseBlock block={b} />; break;
    case 'columns':
      content = (
        <>
          {getChildren(b.pageId, b.id).map((col) => (
            <div className="col" key={col.id}>
              <BlockList pageId={b.pageId} parentId={col.id} depth={depth + 1} />
            </div>
          ))}
        </>
      );
      break;
    case 'column':
      content = <BlockList pageId={b.pageId} parentId={b.id} depth={depth + 1} />;
      break;
    default:
      content = richText('', depth === 0 ? "Write something, or press '/' for commands…" : 'Continue…');
  }

  const showChildren =
    !collapsed &&
    b.type !== 'columns' && b.type !== 'column' &&
    (b.type === 'toggle' || b.props.toggleable || TEXTISH(b.type));
  const children = showChildren ? getChildren(b.pageId, b.id) : [];
  const isEmptyToggle = (b.type === 'toggle' || b.props.toggleable) && !collapsed && children.length === 0;

  return (
    <div className="block-wrap" data-block-id={b.id} ref={wrapRef}>
      <div className={`block-row b-${b.type} ${tint} ${b.type === 'todo' && b.props.checked ? 'done' : ''}`} style={{ position: 'relative' }}>
        {dt?.zone === 'above' && <div className="drop-line" style={{ top: -2 }} />}
        {dt?.zone === 'below' && <div className="drop-line" style={{ bottom: -2 }} />}
        {dt?.zone === 'right' && <div className="drop-line right" style={{ right: -4 }} />}
        {!ctx.readOnly && (
          <div className="block-controls" contentEditable={false}>
            <button
              className="ctl"
              title="Add block below (⌥: above)"
              onClick={(e) => {
                captureUndo(ctx.pageId, 'add', false);
                const nid = e.altKey
                  ? createBlock(ctx.pageId, { parentId: b.parentId, before: b.id })
                  : createBlock(ctx.pageId, { parentId: b.parentId, after: b.id });
                ctx.focusBlock(nid, 'start');
              }}
            >
              <Plus size={16} />
            </button>
            <button
              className="ctl drag"
              title="Drag to move; click for menu"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('zenith/block', b.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={(e) => setMenuAnchor({ x: e.clientX - 6, y: e.clientY + 8 })}
            >
              <GripVertical size={15} />
            </button>
          </div>
        )}
        <div className="block-content">{content}</div>
      </div>

      {children.length > 0 && (
        <div className={b.type === 'toggle' || b.props.toggleable ? 'toggle-children' : 'block-children'}>
          <BlockList pageId={b.pageId} parentId={b.id} depth={depth + 1} />
        </div>
      )}
      {isEmptyToggle && (
        <div className="toggle-children">
          <div
            className="empty-toggle"
            onClick={() => {
              const nid = createBlock(ctx.pageId, { parentId: b.id });
              ctx.focusBlock(nid, 'start');
            }}
          >
            Empty toggle. Click to add content.
          </div>
        </div>
      )}

      {slashFor && <SlashMenu block={b} anchor={slashFor} onClose={() => setSlashFor(null)} />}
      {mentionFor && <MentionMenu anchor={mentionFor} parentPageId={ctx.pageId} onChoose={resolveMention} />}
      {menuAnchor && <BlockMenu block={b} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} />}
    </div>
  );
}

function nearestTextish(flat: string[], id: string, dir: 1 | -1): string | null {
  let i = flat.indexOf(id);
  if (i < 0) return null;
  i += dir;
  while (i >= 0 && i < flat.length) {
    const blk = getBlock(flat[i]);
    if (blk && TEXTISH(blk.type)) return flat[i];
    i += dir;
  }
  return null;
}

function CalloutIcon({ block }: { block: BlockDoc }) {
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <span
        className="callout-icon"
        contentEditable={false}
        onClick={(e) => setOpen({ x: e.clientX - 10, y: e.clientY + 12 })}
      >
        {block.props.icon ?? '💡'}
      </span>
      {open && (
        <EmojiPicker
          anchor={open}
          onClose={() => setOpen(null)}
          onPick={(emoji) => updateBlock(block.id, { props: { icon: emoji } })}
        />
      )}
    </>
  );
}
