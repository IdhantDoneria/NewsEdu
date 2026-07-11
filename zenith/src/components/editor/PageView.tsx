import { Image as ImageIcon, Lock, MessageSquareText, Shuffle, Smile } from 'lucide-react';
import { type DragEvent, useCallback, useMemo, useRef, useState } from 'react';
import { editorBus } from '../../lib/bus';
import { placeCaretAtEnd } from '../../lib/caret';
import {
  captureUndo, createBlock, getBlock, getChildren, getPage, moveBlock,
  setCommentsFor, deleteBlock, updatePage, useStore,
} from '../../lib/store';
import { COVER_GRADIENTS } from '../../lib/types';
import { randomPageIcon } from '../../lib/emoji';
import { EmojiPicker } from '../ui/EmojiPicker';
import { Popover } from '../ui/Popover';
import { BlockList } from './BlockList';
import { Backlinks } from './Backlinks';
import { type DropTarget, EditorCtx, type EditorContextValue } from './ctx';
import { placeCaretAtTextOffset } from './editorUtils';
import { placeCaretAtStart } from '../../lib/caret';
import { DatabaseFullPage, RowPropsSection } from '../database/DatabaseView';
import { useEffect } from 'react';

export function PageView({ pageId, inPeek = false }: { pageId: string; inPeek?: boolean }) {
  const page = useStore((s) => s.pages[pageId]);
  useStore((s) => s.pageTick[pageId]);
  const spellcheck = useStore((s) => s.settings.spellcheck);
  const [iconPicker, setIconPicker] = useState<{ x: number; y: number } | null>(null);
  const [coverPicker, setCoverPicker] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());

  const readOnly = !!page?.props.locked;

  const focusBlock = useCallback((id: string, at: 'start' | 'end' | number = 'start') => {
    let tries = 0;
    const attempt = () => {
      const el = refs.current.get(id);
      if (el) {
        if (at === 'start') placeCaretAtStart(el);
        else if (at === 'end') placeCaretAtEnd(el);
        else placeCaretAtTextOffset(el, at);
        return;
      }
      if (++tries < 24) requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  }, []);

  const flatIds = useCallback(() => {
    const out: string[] = [];
    const walk = (parentId: string | null) => {
      for (const b of getChildren(pageId, parentId)) {
        if (b.type === 'columns' || b.type === 'column') {
          walk(b.id);
          continue;
        }
        out.push(b.id);
        if (!b.props.collapsed) walk(b.id);
      }
    };
    walk(null);
    return out;
  }, [pageId]);

  useEffect(() => editorBus.on('focus', ({ blockId, at }) => focusBlock(blockId, at)), [focusBlock]);

  const ctxValue = useMemo<EditorContextValue>(() => ({
    pageId, readOnly, refs: refs.current, focusBlock, flatIds, dropTarget,
  }), [pageId, readOnly, focusBlock, flatIds, dropTarget]);

  // ── drag & drop ────────────────────────────────────────────────────────────
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('zenith/block')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const wrap = (e.target as HTMLElement).closest('.block-wrap[data-block-id]') as HTMLElement | null;
    if (!wrap) { setDropTarget(null); return; }
    const id = wrap.getAttribute('data-block-id')!;
    const rect = wrap.getBoundingClientRect();
    let zone: DropTarget['zone'];
    if (e.clientX > rect.right - 70 && rect.width > 220) zone = 'right';
    else zone = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
    setDropTarget((cur) => (cur?.id === id && cur.zone === zone ? cur : { id, zone }));
  };

  const onDrop = (e: DragEvent) => {
    const dragId = e.dataTransfer.getData('zenith/block');
    e.preventDefault();
    const target = dropTarget;
    setDropTarget(null);
    if (!dragId || !target || dragId === target.id) return;
    const tBlock = getBlock(target.id);
    const dBlock = getBlock(dragId);
    if (!tBlock || !dBlock) return;
    captureUndo(pageId, 'dnd', false);

    if (target.zone === 'right') {
      const parent = tBlock.parentId ? getBlock(tBlock.parentId) : null;
      if (parent?.type === 'column') {
        // already inside columns: drop into a fresh column after this one
        const colsId = parent.parentId!;
        const cols = getChildren(pageId, colsId);
        const i = cols.findIndex((c) => c.id === parent.id);
        const newCol = createBlock(pageId, { parentId: colsId, type: 'column', after: cols[i]?.id });
        moveBlock(dragId, newCol, null);
      } else {
        // wrap target into a 2-column layout
        const colsId = createBlock(pageId, { parentId: tBlock.parentId, after: tBlock.id, type: 'columns' });
        const c1 = createBlock(pageId, { parentId: colsId, type: 'column' });
        const c2 = createBlock(pageId, { parentId: colsId, type: 'column' });
        moveBlock(tBlock.id, c1, null);
        moveBlock(dragId, c2, null);
      }
    } else {
      const siblings = getChildren(pageId, tBlock.parentId).filter((b) => b.id !== dragId);
      const idx = siblings.findIndex((b) => b.id === target.id);
      const afterId = target.zone === 'above' ? (idx > 0 ? siblings[idx - 1].id : null) : target.id;
      moveBlock(dragId, tBlock.parentId, afterId);
    }
    cleanupColumns(pageId);
  };

  if (!page || page.deletedAt) {
    return (
      <div className="empty-state" style={{ height: '60%' }}>
        <div className="big">🕊️</div>
        <div>This page doesn't exist (or rests in the trash).</div>
      </div>
    );
  }

  const isDb = page.type === 'database';
  const cover = page.cover;
  const coverStyle = cover
    ? cover.startsWith('g:')
      ? { backgroundImage: COVER_GRADIENTS[cover.slice(2)] ?? COVER_GRADIENTS.aurum }
      : { backgroundImage: `url(${cover})`, backgroundPositionY: `${page.coverY ?? 50}%` }
    : undefined;

  return (
    <EditorCtx.Provider value={ctxValue}>
      <div
        className="page-view"
        spellCheck={spellcheck}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={(e) => {
          if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.page-view')) setDropTarget(null);
        }}
      >
        {cover && (
          <div className="page-cover" style={coverStyle}>
            {!readOnly && (
              <div className="cover-actions">
                <button className="cover-btn" onClick={(e) => setCoverPicker({ x: e.clientX - 240, y: e.clientY + 10 })}>Change cover</button>
                <button className="cover-btn" onClick={() => updatePage(pageId, { cover: undefined })}>Remove</button>
              </div>
            )}
          </div>
        )}

        <div className={`page-body ${page.props.fullWidth ? 'full-width' : ''} ${page.props.smallText ? 'small-text' : ''} font-${page.props.font ?? 'default'}`}>
          <div className={`page-head ${cover ? 'has-cover' : ''}`}>
            {page.icon && (
              <div className="page-icon-row" style={{ height: cover ? 0 : 'auto' }}>
                <span
                  className={`page-icon ${cover ? 'on-cover' : ''}`}
                  onClick={(e) => !readOnly && setIconPicker({ x: e.clientX - 60, y: e.clientY + 16 })}
                >
                  {page.icon}
                </span>
              </div>
            )}
            {readOnly && (
              <div className="locked-banner"><Lock size={14} /> This page is locked. Unlock it from the ••• menu to edit.</div>
            )}
            {!readOnly && (
              <div className="page-head-actions">
                {!page.icon && (
                  <button onClick={() => updatePage(pageId, { icon: randomPageIcon() })}>
                    <Smile size={15} /> Add icon
                  </button>
                )}
                {!cover && (
                  <button onClick={() => {
                    const keys = Object.keys(COVER_GRADIENTS);
                    updatePage(pageId, { cover: 'g:' + keys[Math.floor(Math.random() * keys.length)] });
                  }}>
                    <ImageIcon size={15} /> Add cover
                  </button>
                )}
                <button onClick={() => setCommentsFor(pageId)}>
                  <MessageSquareText size={15} /> Comment
                </button>
              </div>
            )}

            <TitleEditor
              pageId={pageId}
              title={page.title}
              readOnly={readOnly}
              placeholder={isDb ? 'Untitled database' : 'Untitled'}
              onDown={() => {
                const first = getChildren(pageId, null)[0];
                if (first) focusBlock(first.id, 'start');
                else if (!isDb) focusBlock(createBlock(pageId, {}), 'start');
              }}
            />
          </div>

          {page.databaseId && <RowPropsSection page={page} />}

          {isDb ? (
            <DatabaseFullPage page={page} />
          ) : (
            <>
              <BlockList pageId={pageId} parentId={null} />
              {!readOnly && (
                <div
                  className="page-append-zone"
                  onClick={() => {
                    const blocks = getChildren(pageId, null);
                    const last = blocks[blocks.length - 1];
                    if (last && ['paragraph'].includes(last.type) && !last.html) {
                      focusBlock(last.id, 'start');
                    } else {
                      focusBlock(createBlock(pageId, {}), 'start');
                    }
                  }}
                />
              )}
              <Backlinks pageId={pageId} />
            </>
          )}
        </div>

        {iconPicker && (
          <EmojiPicker
            anchor={iconPicker}
            onClose={() => setIconPicker(null)}
            allowRemove
            onRemove={() => updatePage(pageId, { icon: undefined })}
            onPick={(e) => updatePage(pageId, { icon: e })}
          />
        )}
        {coverPicker && (
          <CoverPicker pageId={pageId} anchor={coverPicker} onClose={() => setCoverPicker(null)} />
        )}
      </div>
    </EditorCtx.Provider>
  );
}

function TitleEditor({ pageId, title, readOnly, placeholder, onDown }: {
  pageId: string; title: string; readOnly: boolean; placeholder: string; onDown: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el && el.textContent !== title) el.textContent = title;
  }, [title, pageId]);
  return (
    <div
      ref={ref}
      className="page-title"
      contentEditable={!readOnly}
      suppressContentEditableWarning
      data-ph={placeholder}
      onInput={(e) => updatePage(pageId, { title: e.currentTarget.textContent ?? '' })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault();
          onDown();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\n+/g, ' '));
      }}
    />
  );
}

/** delete empty columns; unwrap single-column layouts */
export function cleanupColumns(pageId: string): void {
  let changed = true;
  while (changed) {
    changed = false;
    const tops = collectByType(pageId, 'columns');
    for (const cols of tops) {
      const colChildren = getChildren(pageId, cols.id).filter((c) => c.type === 'column');
      for (const col of colChildren) {
        if (getChildren(pageId, col.id).length === 0) {
          deleteBlock(col.id);
          changed = true;
        }
      }
      const remaining = getChildren(pageId, cols.id).filter((c) => c.type === 'column');
      if (remaining.length <= 1) {
        if (remaining.length === 1) {
          let after: string | null = cols.id;
          for (const child of getChildren(pageId, remaining[0].id)) {
            moveBlock(child.id, cols.parentId, after);
            after = child.id;
          }
        }
        deleteBlock(cols.id);
        changed = true;
      }
    }
  }
}

function collectByType(pageId: string, type: string) {
  const out = [] as ReturnType<typeof getChildren>;
  const walk = (parentId: string | null) => {
    for (const b of getChildren(pageId, parentId)) {
      if (b.type === type) out.push(b);
      walk(b.id);
    }
  };
  walk(null);
  return out;
}

function CoverPicker({ pageId, anchor, onClose }: { pageId: string; anchor: { x: number; y: number }; onClose: () => void }) {
  const page = getPage(pageId);
  const [url, setUrl] = useState('');
  return (
    <Popover anchor={anchor} onClose={onClose} width={380}>
      <div style={{ padding: 12 }}>
        <div className="menu-title" style={{ paddingLeft: 0 }}>Gradients</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {Object.entries(COVER_GRADIENTS).map(([name, grad]) => (
            <button
              key={name}
              title={name}
              onClick={() => { updatePage(pageId, { cover: 'g:' + name }); onClose(); }}
              style={{ height: 44, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', backgroundImage: grad }}
            />
          ))}
        </div>
        <div className="menu-title" style={{ paddingLeft: 0, marginTop: 10 }}>Image URL</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="text-input" placeholder="https://images.unsplash.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn small" disabled={!/^https?:/.test(url)} onClick={() => { updatePage(pageId, { cover: url }); onClose(); }}>Set</button>
        </div>
        {page?.cover && !page.cover.startsWith('g:') && (
          <>
            <div className="menu-title" style={{ paddingLeft: 0, marginTop: 10 }}>Position</div>
            <input
              type="range" min={0} max={100} defaultValue={page.coverY ?? 50}
              style={{ width: '100%' }}
              onChange={(e) => updatePage(pageId, { coverY: Number(e.target.value) })}
            />
          </>
        )}
        <button className="btn small" style={{ marginTop: 10 }} onClick={(e) => {
          const shuffle = Object.keys(COVER_GRADIENTS);
          updatePage(pageId, { cover: 'g:' + shuffle[Math.floor(Math.random() * shuffle.length)] });
        }}>
          <Shuffle size={13} /> Surprise me
        </button>
      </div>
    </Popover>
  );
}
