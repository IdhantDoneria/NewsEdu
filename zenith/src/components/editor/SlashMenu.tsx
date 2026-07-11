import { useEffect, useMemo, useRef, useState } from 'react';
import { openAI } from '../../lib/bus';
import { captureUndo, createBlock, createPage, updateBlock } from '../../lib/store';
import type { Block as BlockDoc, BlockType, DbSchema, ViewType } from '../../lib/types';
import { uid } from '../../lib/id';
import { Popover } from '../ui/Popover';
import { SLASH_ITEMS, type SlashItem } from './blockMeta';
import { useEditor } from './ctx';
import { fmtDate } from './editorUtils';
import { PagePickerMenu } from './PagePicker';

export function defaultDbSchema(viewType: ViewType): DbSchema {
  const titleId = uid();
  const statusId = uid();
  const dateId = uid();
  return {
    titlePropId: titleId,
    properties: [
      { id: titleId, name: 'Name', type: 'title' },
      {
        id: statusId, name: 'Status', type: 'select',
        options: [
          { id: uid(), name: 'Not started', color: 'gray' },
          { id: uid(), name: 'In progress', color: 'blue' },
          { id: uid(), name: 'Done', color: 'green' },
        ],
      },
      { id: dateId, name: 'Date', type: 'date' },
    ],
    views: [{
      id: uid(), name: defaultViewName(viewType), type: viewType,
      filters: [], filterMode: 'and', sorts: [],
      groupByPropId: viewType === 'board' ? statusId : undefined,
      hiddenProps: [], layout: viewType === 'calendar' || viewType === 'timeline' ? { dateProp: dateId } : {},
    }],
  };
}

function defaultViewName(t: ViewType): string {
  return { table: 'Table', board: 'Board', gallery: 'Gallery', list: 'List', calendar: 'Calendar', timeline: 'Timeline' }[t];
}

export function SlashMenu({ block, anchor, onClose }: {
  block: BlockDoc;
  anchor: { x: number; y: number; y2?: number };
  onClose: () => void;
}) {
  const ctx = useEditor();
  const [q, setQ] = useState('');
  const [hl, setHl] = useState(0);
  const [pagePicker, setPagePicker] = useState<'link' | 'linkedDb' | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return SLASH_ITEMS;
    return SLASH_ITEMS.filter((it) => it.label.toLowerCase().includes(s) || it.keywords.includes(s));
  }, [q]);

  useEffect(() => setHl(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.menu-item.hl')?.scrollIntoView({ block: 'nearest' });
  }, [hl]);

  const run = (item: SlashItem) => {
    captureUndo(ctx.pageId, 'slash', false);
    const basicTypes: BlockType[] = ['paragraph', 'h1', 'h2', 'h3', 'bulleted', 'numbered', 'todo', 'toggle', 'quote', 'callout', 'divider', 'image', 'bookmark', 'video', 'embed', 'code', 'math', 'table', 'toc', 'button'];

    if (basicTypes.includes(item.id as BlockType)) {
      const props: any = item.id === 'code' ? { language: 'plaintext' }
        : item.id === 'table' ? { rows: [['', ''], ['', '']], headerRow: true }
        : item.id === 'callout' ? { icon: '💡' }
        : item.id === 'button' ? { label: 'New button', mode: 'insert', insert: 'todo' } : {};
      updateBlock(block.id, { type: item.id as BlockType, props });
      if (['paragraph', 'h1', 'h2', 'h3', 'bulleted', 'numbered', 'todo', 'toggle', 'quote', 'callout'].includes(item.id)) {
        ctx.focusBlock(block.id, 'end');
      }
      onClose();
      return;
    }

    switch (item.id) {
      case 'ai': {
        onClose();
        openAI({ anchor, pageId: ctx.pageId, blockId: block.id });
        return;
      }
      case 'toggleH1': case 'toggleH2': case 'toggleH3': {
        updateBlock(block.id, { type: ('h' + item.id.slice(-1)) as BlockType, props: { toggleable: true } });
        ctx.focusBlock(block.id, 'end');
        onClose();
        return;
      }
      case 'childPage': {
        const pid = createPage({ parentId: ctx.pageId, title: '' });
        updateBlock(block.id, { type: 'childPage', html: '', props: { pageId: pid } });
        onClose();
        import('../../lib/store').then((m) => m.openPage(pid));
        return;
      }
      case 'linkPage': { setPagePicker('link'); return; }
      case 'linked-db': { setPagePicker('linkedDb'); return; }
      case 'date': {
        onClose();
        const el = ctx.refs.get(block.id);
        el?.focus();
        document.execCommand('insertHTML', false,
          `<span class="zmention" contenteditable="false">📅 ${fmtDate(Date.now())}</span>&nbsp;`);
        return;
      }
      case 'columns2': case 'columns3': {
        const n = item.id === 'columns2' ? 2 : 3;
        const colsId = createBlock(ctx.pageId, { parentId: block.parentId, after: block.id, type: 'columns' });
        let firstChild = '';
        for (let i = 0; i < n; i++) {
          const colId = createBlock(ctx.pageId, { parentId: colsId, type: 'column' });
          const pid = createBlock(ctx.pageId, { parentId: colId, type: 'paragraph' });
          if (i === 0) firstChild = pid;
        }
        ctx.focusBlock(firstChild, 'start');
        onClose();
        return;
      }
      default: {
        // database views: table-db, board-db, gallery-db, list-db, calendar-db, timeline-db
        const m = item.id.match(/^(table|board|gallery|list|calendar|timeline)-db$/);
        if (m) {
          const viewType = m[1] as ViewType;
          const dbId = createPage({
            parentId: ctx.pageId, type: 'database', title: '',
            dbSchema: defaultDbSchema(viewType), empty: true,
          });
          updateBlock(block.id, { type: 'childDatabase', html: '', props: { pageId: dbId } });
          onClose();
          return;
        }
        onClose();
      }
    }
  };

  if (pagePicker) {
    return (
      <PagePickerMenu
        anchor={anchor}
        databasesOnly={pagePicker === 'linkedDb'}
        onClose={onClose}
        onPick={(pid) => {
          if (pagePicker === 'link') {
            updateBlock(block.id, { type: 'linkPage', html: '', props: { pageId: pid } });
          } else {
            updateBlock(block.id, { type: 'childDatabase', html: '', props: { pageId: pid, linked: true } });
          }
          onClose();
        }}
      />
    );
  }

  let lastGroup = '';
  return (
    <Popover anchor={anchor} onClose={onClose} className="slash-menu">
      <div style={{ padding: '10px 10px 0' }}>
        <input
          className="text-input"
          placeholder="Filter… (e.g. heading, board, ai)"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, items.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (items[hl]) run(items[hl]); }
            else if (e.key === 'Escape') { onClose(); }
            e.stopPropagation();
          }}
        />
      </div>
      <div className="menu" ref={listRef} style={{ maxHeight: 380, overflowY: 'auto' }}>
        {items.length === 0 && <div style={{ padding: 12, color: 'var(--text-tertiary)', fontSize: 13.5 }}>No results</div>}
        {items.map((it, i) => {
          const showGroup = it.group !== lastGroup;
          lastGroup = it.group;
          return (
            <div key={it.id}>
              {showGroup && <div className="menu-title">{it.group}</div>}
              <button className={`menu-item ${i === hl ? 'hl' : ''}`} onMouseEnter={() => setHl(i)} onClick={() => run(it)}>
                <span className="slash-icon">{it.icon}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="mi-label" style={{ display: 'block', fontWeight: 520 }}>{it.label}</span>
                  <span className="mi-desc" style={{ display: 'block' }}>{it.desc}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </Popover>
  );
}
