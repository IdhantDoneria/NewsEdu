import { create } from 'zustand';
import { db, kvGet, kvSet } from './db';
import { uid } from './id';
import { orderBetween, compareOrder } from './order';
import { storeEvents } from './events';
import {
  DEFAULT_SETTINGS,
  type Block, type BlockType, type CommentDoc, type DbSchema, type PageDoc,
  type Settings, type Snapshot,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Zenith store: whole workspace in memory, write-through to IndexedDB (Dexie),
// change feed for the sync layer, page-scoped undo/redo, version snapshots.
// ─────────────────────────────────────────────────────────────────────────────

export interface ZenithState {
  ready: boolean;
  pages: Record<string, PageDoc>;
  blocks: Record<string, Block>;
  comments: Record<string, CommentDoc>;
  settings: Settings;

  /** monotonically increasing tick per page — components subscribe to re-render */
  pageTick: Record<string, number>;
  /** bumps when the set/ordering/titles of pages change (sidebar) */
  navTick: number;
  /** most-recently-opened page ids (most recent first) */
  recents: string[];

  // ui state
  currentPageId: string | null;
  peekPageId: string | null;          // side-peek (database rows)
  sidebarOpen: boolean;
  sidebarWidth: number;
  searchOpen: boolean;
  settingsOpen: boolean | string;     // false | true | section id
  trashOpen: boolean;
  templatesOpen: boolean;
  shortcutsOpen: boolean;
  historyFor: string | null;          // pageId whose version history panel is open
  commentsFor: string | null;         // pageId whose comments panel is open
}

type Mut = Partial<ZenithState>;

const now = () => Date.now();

// ─── undo/redo ───────────────────────────────────────────────────────────────

interface UndoEntry {
  pageId: string;
  page: PageDoc;
  blocks: Block[];
  label?: string;
  at: number;
}
const undoStack: UndoEntry[] = [];
const redoStack: UndoEntry[] = [];
const UNDO_CAP = 120;
let lastUndoPush = 0;

// ─── snapshots (version history) ────────────────────────────────────────────
const SNAP_DEBOUNCE = 90_000; // at most one auto-snapshot per page per 90s
const lastSnapAt: Record<string, number> = {};

// ─── persistence helpers (write-through + change feed) ───────────────────────

function persistPage(p: PageDoc, remote = false) {
  void db.pages.put(p);
  storeEvents.emit('change', { table: 'pages', id: p.id, doc: p, remote });
}
function persistBlock(b: Block, remote = false) {
  void db.blocks.put(b);
  storeEvents.emit('change', { table: 'blocks', id: b.id, doc: b, remote });
}
function persistComment(c: CommentDoc, remote = false) {
  void db.comments.put(c);
  storeEvents.emit('change', { table: 'comments', id: c.id, doc: c, remote });
}
function removeBlockRow(id: string, remote = false) {
  void db.blocks.delete(id);
  storeEvents.emit('change', { table: 'blocks', id, doc: null, remote });
}
function removePageRow(id: string, remote = false) {
  void db.pages.delete(id);
  storeEvents.emit('change', { table: 'pages', id, doc: null, remote });
}
function removeCommentRow(id: string, remote = false) {
  void db.comments.delete(id);
  storeEvents.emit('change', { table: 'comments', id, doc: null, remote });
}

export const useStore = create<ZenithState>(() => ({
  ready: false,
  pages: {},
  blocks: {},
  comments: {},
  settings: { ...DEFAULT_SETTINGS },
  pageTick: {},
  navTick: 0,
  recents: [],
  currentPageId: null,
  peekPageId: null,
  sidebarOpen: true,
  sidebarWidth: 260,
  searchOpen: false,
  settingsOpen: false,
  trashOpen: false,
  templatesOpen: false,
  shortcutsOpen: false,
  historyFor: null,
  commentsFor: null,
}));

const set = (mut: Mut | ((s: ZenithState) => Mut)) => useStore.setState(mut as any);
const get = () => useStore.getState();

function bumpPage(pageId: string, extra: Mut = {}) {
  set((s) => ({ ...extra, pageTick: { ...s.pageTick, [pageId]: (s.pageTick[pageId] ?? 0) + 1 } }));
}
function bumpNav(extra: Mut = {}) {
  set((s) => ({ ...extra, navTick: s.navTick + 1 }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

export async function bootStore(): Promise<void> {
  const [pagesArr, blocksArr, commentsArr, settings, recents] = await Promise.all([
    db.pages.toArray(),
    db.blocks.toArray(),
    db.comments.toArray(),
    kvGet<Settings>('settings'),
    kvGet<string[]>('recents'),
  ]);
  const pages: Record<string, PageDoc> = {};
  for (const p of pagesArr) pages[p.id] = p;
  const blocks: Record<string, Block> = {};
  for (const b of blocksArr) blocks[b.id] = b;
  const comments: Record<string, CommentDoc> = {};
  for (const c of commentsArr) comments[c.id] = c;
  set({
    pages, blocks, comments,
    settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
    recents: (recents ?? []).filter((id) => pages[id] && !pages[id].deletedAt),
    ready: true,
  });
  storeEvents.emit('ready', undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries (plain helpers — use inside components with the page/nav ticks)
// ─────────────────────────────────────────────────────────────────────────────

export const getPage = (id: string): PageDoc | undefined => get().pages[id];
export const getBlock = (id: string): Block | undefined => get().blocks[id];

/** ordered, non-deleted child *blocks* of a parent within a page */
export function getChildren(pageId: string, parentId: string | null): Block[] {
  const out: Block[] = [];
  const blocks = get().blocks;
  for (const id in blocks) {
    const b = blocks[id];
    if (b.pageId === pageId && b.parentId === parentId) out.push(b);
  }
  return out.sort(compareOrder);
}

export function getPageBlockCount(pageId: string): number {
  const blocks = get().blocks;
  let n = 0;
  for (const id in blocks) if (blocks[id].pageId === pageId) n++;
  return n;
}

/** ordered, live child *pages* in the sidebar tree (excludes db rows) */
export function getPageList(parentId: string | null): PageDoc[] {
  const out: PageDoc[] = [];
  const pages = get().pages;
  for (const id in pages) {
    const p = pages[id];
    if (p.parentId === parentId && !p.deletedAt && !p.databaseId) out.push(p);
  }
  return out.sort(compareOrder);
}

/** live rows of a database */
export function getRows(databaseId: string): PageDoc[] {
  const out: PageDoc[] = [];
  const pages = get().pages;
  for (const id in pages) {
    const p = pages[id];
    if (p.databaseId === databaseId && !p.deletedAt) out.push(p);
  }
  return out.sort(compareOrder);
}

export function getFavorites(): PageDoc[] {
  const out: PageDoc[] = [];
  const pages = get().pages;
  for (const id in pages) {
    const p = pages[id];
    if (p.favorite && !p.deletedAt) out.push(p);
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export function getTrashed(): PageDoc[] {
  const out: PageDoc[] = [];
  const pages = get().pages;
  for (const id in pages) {
    const p = pages[id];
    if (p.deletedAt && !p.databaseId) out.push(p);
  }
  return out.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

/** breadcrumb chain root→page */
export function getAncestry(pageId: string): PageDoc[] {
  const chain: PageDoc[] = [];
  let cur = getPage(pageId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    const upId = cur.databaseId ?? cur.parentId;
    cur = upId ? getPage(upId) : undefined;
  }
  return chain;
}

export function getComments(pageId: string): CommentDoc[] {
  const out: CommentDoc[] = [];
  const comments = get().comments;
  for (const id in comments) if (comments[id].pageId === pageId) out.push(comments[id]);
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

/** pages that @mention or link to this page ("Linked references") */
export function getBacklinks(pageId: string): Array<{ page: PageDoc; blockId: string; snippet: string }> {
  const out: Array<{ page: PageDoc; blockId: string; snippet: string }> = [];
  const { blocks, pages } = get();
  const seen = new Set<string>();
  const needle = `data-page-id="${pageId}"`;
  for (const id in blocks) {
    const b = blocks[id];
    if (b.pageId === pageId) continue;
    const owner = pages[b.pageId];
    if (!owner || owner.deletedAt) continue;
    const isLink = b.type === 'linkPage' && b.props?.pageId === pageId;
    const isMention = typeof b.html === 'string' && b.html.includes(needle);
    if (!isLink && !isMention) continue;
    if (seen.has(b.pageId)) continue;       // one reference per source page
    seen.add(b.pageId);
    const div = document.createElement('div');
    div.innerHTML = b.html || '';
    out.push({ page: owner, blockId: b.id, snippet: (div.textContent || '').trim().slice(0, 140) });
  }
  return out.sort((a, b) => b.page.updatedAt - a.page.updatedAt);
}

export function isDescendantPage(maybeChild: string, ancestor: string): boolean {
  let cur = getPage(maybeChild);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    if (cur.id === ancestor) return true;
    seen.add(cur.id);
    const upId = cur.databaseId ?? cur.parentId;
    cur = upId ? getPage(upId) : undefined;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Undo / redo (page-scoped block+page snapshots)
// ─────────────────────────────────────────────────────────────────────────────

function blocksOfPage(pageId: string): Block[] {
  const out: Block[] = [];
  const blocks = get().blocks;
  for (const id in blocks) if (blocks[id].pageId === pageId) out.push(blocks[id]);
  return out;
}

/** capture page state for undo. merge=true coalesces rapid typing into one entry */
export function captureUndo(pageId: string, label?: string, merge = true) {
  const page = getPage(pageId);
  if (!page) return;
  const t = now();
  if (merge && undoStack.length > 0) {
    const top = undoStack[undoStack.length - 1];
    if (top.pageId === pageId && t - lastUndoPush < 900) { lastUndoPush = t; return; }
  }
  undoStack.push({
    pageId,
    page: structuredClone(page),
    blocks: structuredClone(blocksOfPage(pageId)),
    label,
    at: t,
  });
  if (undoStack.length > UNDO_CAP) undoStack.shift();
  redoStack.length = 0;
  lastUndoPush = t;
  maybeAutoSnapshot(pageId);
}

function applyEntry(entry: UndoEntry) {
  const s = get();
  const pages = { ...s.pages, [entry.page.id]: entry.page };
  const blocks = { ...s.blocks };
  // remove blocks currently in page, then re-add captured
  for (const id in blocks) {
    if (blocks[id].pageId === entry.pageId) {
      removeBlockRow(id);
      delete blocks[id];
    }
  }
  for (const b of entry.blocks) {
    blocks[b.id] = b;
    persistBlock(b);
  }
  persistPage(entry.page);
  set({ pages, blocks });
  bumpPage(entry.pageId);
  bumpNav();
}

export function undo(): void {
  const entry = undoStack.pop();
  if (!entry) return;
  const cur: UndoEntry = {
    pageId: entry.pageId,
    page: structuredClone(getPage(entry.pageId)!),
    blocks: structuredClone(blocksOfPage(entry.pageId)),
    at: now(),
  };
  if (!cur.page) return;
  redoStack.push(cur);
  applyEntry(entry);
}

export function redo(): void {
  const entry = redoStack.pop();
  if (!entry) return;
  undoStack.push({
    pageId: entry.pageId,
    page: structuredClone(getPage(entry.pageId)!),
    blocks: structuredClone(blocksOfPage(entry.pageId)),
    at: now(),
  });
  applyEntry(entry);
}

// ─────────────────────────────────────────────────────────────────────────────
// Version history snapshots
// ─────────────────────────────────────────────────────────────────────────────

function maybeAutoSnapshot(pageId: string) {
  const t = now();
  if (t - (lastSnapAt[pageId] ?? 0) < SNAP_DEBOUNCE) return;
  lastSnapAt[pageId] = t;
  void saveSnapshot(pageId);
}

export async function saveSnapshot(pageId: string): Promise<void> {
  const page = getPage(pageId);
  if (!page) return;
  const snap: Snapshot = {
    id: uid(),
    pageId,
    ts: now(),
    title: page.title || 'Untitled',
    data: JSON.stringify({ page, blocks: blocksOfPage(pageId) }),
  };
  await db.snapshots.put(snap);
  // keep most recent 40 per page
  const all = await db.snapshots.where('pageId').equals(pageId).sortBy('ts');
  if (all.length > 40) await db.snapshots.bulkDelete(all.slice(0, all.length - 40).map((s) => s.id));
}

export async function listSnapshots(pageId: string): Promise<Snapshot[]> {
  const all = await db.snapshots.where('pageId').equals(pageId).sortBy('ts');
  return all.reverse();
}

export async function restoreSnapshot(snapId: string): Promise<void> {
  const snap = await db.snapshots.get(snapId);
  if (!snap) return;
  const { page, blocks } = JSON.parse(snap.data) as { page: PageDoc; blocks: Block[] };
  captureUndo(page.id, 'restore version', false);
  applyEntry({ pageId: page.id, page, blocks, at: now() });
}

// ─────────────────────────────────────────────────────────────────────────────
// Page mutations
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePageOpts {
  parentId?: string | null;
  databaseId?: string | null;
  type?: 'page' | 'database';
  title?: string;
  icon?: string;
  cover?: string;
  props?: PageDoc['props'];
  dbSchema?: DbSchema;
  rowProps?: Record<string, any>;
  /** place after this sibling page id */
  after?: string;
  /** skip creating the initial empty paragraph */
  empty?: boolean;
}

export function createPage(opts: CreatePageOpts = {}): string {
  const t = now();
  const parentId = opts.parentId ?? null;
  const databaseId = opts.databaseId ?? null;
  const siblings = databaseId ? getRows(databaseId) : getPageList(parentId);
  let order: string;
  if (opts.after) {
    const i = siblings.findIndex((p) => p.id === opts.after);
    order = orderBetween(siblings[i]?.order ?? null, siblings[i + 1]?.order ?? null);
  } else {
    order = orderBetween(siblings[siblings.length - 1]?.order ?? null, null);
  }
  const page: PageDoc = {
    id: uid(),
    parentId,
    databaseId,
    type: opts.type ?? 'page',
    title: opts.title ?? '',
    icon: opts.icon,
    cover: opts.cover,
    props: opts.props ?? {},
    dbSchema: opts.dbSchema,
    rowProps: opts.rowProps,
    order,
    deletedAt: null,
    createdAt: t,
    updatedAt: t,
  };
  set((s) => ({ pages: { ...s.pages, [page.id]: page } }));
  persistPage(page);
  if (!opts.empty && page.type === 'page') {
    createBlock(page.id, { type: 'paragraph' });
  }
  bumpNav();
  return page.id;
}

export function updatePage(id: string, patch: Partial<PageDoc>): void {
  const cur = getPage(id);
  if (!cur) return;
  const next: PageDoc = {
    ...cur,
    ...patch,
    props: patch.props ? { ...cur.props, ...patch.props } : cur.props,
    rowProps: patch.rowProps ? { ...(cur.rowProps ?? {}), ...patch.rowProps } : cur.rowProps,
    updatedAt: now(),
  };
  set((s) => ({ pages: { ...s.pages, [id]: next } }));
  persistPage(next);
  bumpPage(id);
  bumpNav();
}

/** replace the database schema (views/properties) wholesale */
export function updateDbSchema(id: string, schema: DbSchema): void {
  const cur = getPage(id);
  if (!cur) return;
  const next = { ...cur, dbSchema: schema, updatedAt: now() };
  set((s) => ({ pages: { ...s.pages, [id]: next } }));
  persistPage(next);
  bumpPage(id);
}

export function movePage(id: string, newParentId: string | null, beforeId?: string | null): void {
  const page = getPage(id);
  if (!page) return;
  if (newParentId && (newParentId === id || isDescendantPage(newParentId, id))) return;
  const siblings = getPageList(newParentId).filter((p) => p.id !== id);
  let order: string;
  if (beforeId) {
    const i = siblings.findIndex((p) => p.id === beforeId);
    order = orderBetween(siblings[i - 1]?.order ?? null, siblings[i]?.order ?? null);
  } else {
    order = orderBetween(siblings[siblings.length - 1]?.order ?? null, null);
  }
  const next = { ...page, parentId: newParentId, databaseId: null, order, updatedAt: now() };
  set((s) => ({ pages: { ...s.pages, [id]: next } }));
  persistPage(next);
  bumpNav();
}

/** soft delete to trash (descendants stay attached; hidden because ancestor is trashed) */
export function deletePage(id: string): void {
  const page = getPage(id);
  if (!page) return;
  const t = now();
  const toTrash = [id, ...descendantPageIds(id)];
  set((s) => {
    const pages = { ...s.pages };
    for (const pid of toTrash) {
      if (pages[pid]) {
        pages[pid] = { ...pages[pid], deletedAt: t, updatedAt: t };
        persistPage(pages[pid]);
      }
    }
    return { pages };
  });
  const st = get();
  if (st.currentPageId && toTrash.includes(st.currentPageId)) set({ currentPageId: null });
  if (st.peekPageId && toTrash.includes(st.peekPageId)) set({ peekPageId: null });
  bumpNav();
}

export function restorePage(id: string): void {
  const page = getPage(id);
  if (!page) return;
  const ids = [id, ...descendantPageIds(id)];
  set((s) => {
    const pages = { ...s.pages };
    for (const pid of ids) {
      if (pages[pid]?.deletedAt) {
        pages[pid] = { ...pages[pid], deletedAt: null, updatedAt: now() };
        persistPage(pages[pid]);
      }
    }
    // if restored under a trashed/missing parent, move to root
    const p = pages[id];
    if (p.parentId && (!pages[p.parentId] || pages[p.parentId].deletedAt)) {
      pages[id] = { ...p, parentId: null, databaseId: null };
      persistPage(pages[id]);
    }
    return { pages };
  });
  bumpNav();
}

export function destroyPage(id: string): void {
  const ids = [id, ...descendantPageIds(id)];
  set((s) => {
    const pages = { ...s.pages };
    const blocks = { ...s.blocks };
    const comments = { ...s.comments };
    for (const pid of ids) {
      delete pages[pid];
      removePageRow(pid);
      for (const bid in blocks) {
        if (blocks[bid].pageId === pid) { delete blocks[bid]; removeBlockRow(bid); }
      }
      for (const cid in comments) {
        if (comments[cid].pageId === pid) { delete comments[cid]; removeCommentRow(cid); }
      }
      void db.snapshots.where('pageId').equals(pid).delete();
    }
    return { pages, blocks, comments };
  });
  bumpNav();
}

export function descendantPageIds(id: string): string[] {
  const out: string[] = [];
  const pages = get().pages;
  const walk = (pid: string) => {
    for (const cid in pages) {
      const p = pages[cid];
      if (p.parentId === pid || p.databaseId === pid) { out.push(cid); walk(cid); }
    }
  };
  walk(id);
  return out;
}

export function toggleFavorite(id: string): void {
  const p = getPage(id);
  if (p) updatePage(id, { favorite: !p.favorite });
}

/** reorder a database row before another row (or to the end when null) */
export function moveRow(rowId: string, beforeRowId: string | null): void {
  const row = getPage(rowId);
  if (!row || !row.databaseId) return;
  const sibs = getRows(row.databaseId).filter((r) => r.id !== rowId);
  let order: string;
  if (beforeRowId) {
    const i = sibs.findIndex((r) => r.id === beforeRowId);
    order = orderBetween(sibs[i - 1]?.order ?? null, sibs[i]?.order ?? null);
  } else {
    order = orderBetween(sibs[sibs.length - 1]?.order ?? null, null);
  }
  updatePage(rowId, { order });
}

export function duplicatePage(id: string, intoParent?: string | null): string {
  const src = getPage(id);
  if (!src) return id;
  const map = new Map<string, string>(); // old page id -> new page id
  const clonePage = (pid: string, parentId: string | null, databaseId: string | null, titleSuffix = ''): string => {
    const p = getPage(pid)!;
    const newId = uid();
    map.set(pid, newId);
    const siblings = databaseId ? getRows(databaseId) : getPageList(parentId);
    const t = now();
    const cloned: PageDoc = {
      ...structuredClone(p),
      id: newId,
      parentId,
      databaseId,
      title: p.title + titleSuffix,
      favorite: false,
      order: orderBetween(siblings[siblings.length - 1]?.order ?? null, null),
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    };
    set((s) => ({ pages: { ...s.pages, [newId]: cloned } }));
    persistPage(cloned);
    // clone blocks (preserve structure; remap nested child pages afterwards)
    const idMap = new Map<string, string>();
    const all = blocksOfPage(pid);
    for (const b of all) idMap.set(b.id, uid());
    for (const b of all) {
      const nb: Block = {
        ...structuredClone(b),
        id: idMap.get(b.id)!,
        pageId: newId,
        parentId: b.parentId ? idMap.get(b.parentId) ?? null : null,
        createdAt: t,
        updatedAt: t,
      };
      set((s) => ({ blocks: { ...s.blocks, [nb.id]: nb } }));
      persistBlock(nb);
    }
    // recurse into child pages & rows
    for (const child of getPageList(pid)) clonePage(child.id, newId, null);
    if (p.type === 'database') for (const row of getRows(pid)) clonePage(row.id, newId, newId);
    return newId;
  };
  const newId = clonePage(id, intoParent !== undefined ? intoParent : src.parentId, src.databaseId, ' (copy)');
  // remap childPage / childDatabase / linkPage block pointers to cloned pages
  set((s) => {
    const blocks = { ...s.blocks };
    for (const bid in blocks) {
      const b = blocks[bid];
      const ref = b.props?.pageId;
      if (ref && map.has(ref) && map.has(b.pageId === id ? id : b.pageId)) {
        // only remap inside the cloned tree
      }
      if (ref && map.has(ref) && [...map.values()].includes(b.pageId)) {
        blocks[bid] = { ...b, props: { ...b.props, pageId: map.get(ref)! } };
        persistBlock(blocks[bid]);
      }
    }
    return { blocks };
  });
  bumpNav();
  return newId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block mutations
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateBlockOpts {
  parentId?: string | null;
  type?: BlockType;
  html?: string;
  props?: Record<string, any>;
  /** position: after/before sibling block id */
  after?: string | null;
  before?: string | null;
}

export function createBlock(pageId: string, opts: CreateBlockOpts = {}): string {
  const t = now();
  const parentId = opts.parentId ?? null;
  const siblings = getChildren(pageId, parentId);
  let order: string;
  if (opts.after) {
    const i = siblings.findIndex((b) => b.id === opts.after);
    order = orderBetween(siblings[i]?.order ?? null, siblings[i + 1]?.order ?? null);
  } else if (opts.before) {
    const i = siblings.findIndex((b) => b.id === opts.before);
    order = orderBetween(siblings[i - 1]?.order ?? null, siblings[i]?.order ?? null);
  } else {
    order = orderBetween(siblings[siblings.length - 1]?.order ?? null, null);
  }
  const block: Block = {
    id: uid(),
    pageId,
    parentId,
    order,
    type: opts.type ?? 'paragraph',
    html: opts.html ?? '',
    props: opts.props ?? {},
    createdAt: t,
    updatedAt: t,
  };
  set((s) => ({ blocks: { ...s.blocks, [block.id]: block } }));
  persistBlock(block);
  bumpPage(pageId);
  return block.id;
}

export function updateBlock(
  id: string,
  patch: Partial<Pick<Block, 'html' | 'type' | 'props' | 'parentId' | 'order'>>,
  opts: { silent?: boolean } = {},
): void {
  const cur = getBlock(id);
  if (!cur) return;
  const next: Block = {
    ...cur,
    ...patch,
    props: patch.props ? { ...cur.props, ...patch.props } : cur.props,
    updatedAt: now(),
  };
  set((s) => ({ blocks: { ...s.blocks, [id]: next } }));
  persistBlock(next);
  if (!opts.silent) bumpPage(cur.pageId);
}

/** html-only update during typing: persists without re-rendering the page */
export function updateBlockHtml(id: string, html: string): void {
  updateBlock(id, { html }, { silent: true });
}

export function moveBlock(id: string, newParentId: string | null, afterId: string | null): void {
  const b = getBlock(id);
  if (!b) return;
  // prevent dropping into own subtree
  let p = newParentId;
  while (p) {
    if (p === id) return;
    p = getBlock(p)?.parentId ?? null;
  }
  const siblings = getChildren(b.pageId, newParentId).filter((x) => x.id !== id);
  let order: string;
  if (afterId) {
    const i = siblings.findIndex((x) => x.id === afterId);
    order = orderBetween(siblings[i]?.order ?? null, siblings[i + 1]?.order ?? null);
  } else {
    order = orderBetween(null, siblings[0]?.order ?? null);
  }
  updateBlock(id, { parentId: newParentId, order });
}

export function deleteBlock(id: string): void {
  const b = getBlock(id);
  if (!b) return;
  const ids = [id, ...descendantBlockIds(id)];
  set((s) => {
    const blocks = { ...s.blocks };
    for (const bid of ids) {
      const blk = blocks[bid];
      if (blk?.type === 'childPage' || blk?.type === 'childDatabase') {
        const pid = blk.props?.pageId;
        if (pid && s.pages[pid]) setTimeout(() => deletePage(pid), 0);
      }
      delete blocks[bid];
      removeBlockRow(bid);
    }
    return { blocks };
  });
  bumpPage(b.pageId);
}

export function descendantBlockIds(id: string): string[] {
  const out: string[] = [];
  const blocks = get().blocks;
  const walk = (bid: string) => {
    for (const cid in blocks) {
      if (blocks[cid].parentId === bid) { out.push(cid); walk(cid); }
    }
  };
  walk(id);
  return out;
}

export function duplicateBlock(id: string): string {
  const src = getBlock(id);
  if (!src) return id;
  const t = now();
  const idMap = new Map<string, string>();
  const ids = [id, ...descendantBlockIds(id)];
  for (const bid of ids) idMap.set(bid, uid());
  const siblings = getChildren(src.pageId, src.parentId);
  const i = siblings.findIndex((b) => b.id === id);
  const rootOrder = orderBetween(src.order, siblings[i + 1]?.order ?? null);
  set((s) => {
    const blocks = { ...s.blocks };
    for (const bid of ids) {
      const b = s.blocks[bid];
      const nb: Block = {
        ...structuredClone(b),
        id: idMap.get(bid)!,
        parentId: bid === id ? b.parentId : idMap.get(b.parentId!) ?? null,
        order: bid === id ? rootOrder : b.order,
        createdAt: t,
        updatedAt: t,
      };
      // duplicating an embedded page block duplicates the page
      if ((nb.type === 'childPage' || nb.type === 'childDatabase') && nb.props.pageId) {
        const newPid = duplicatePage(nb.props.pageId);
        nb.props = { ...nb.props, pageId: newPid };
      }
      blocks[nb.id] = nb;
      persistBlock(nb);
    }
    return { blocks };
  });
  bumpPage(src.pageId);
  return idMap.get(id)!;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────────────────────

export function addComment(pageId: string, text: string, blockId?: string): string {
  const t = now();
  const c: CommentDoc = {
    id: uid(), pageId, blockId, text, resolved: false, author: 'You',
    createdAt: t, updatedAt: t,
  };
  set((s) => ({ comments: { ...s.comments, [c.id]: c } }));
  persistComment(c);
  bumpPage(pageId);
  return c.id;
}

export function updateComment(id: string, patch: Partial<CommentDoc>): void {
  const cur = get().comments[id];
  if (!cur) return;
  const next = { ...cur, ...patch, updatedAt: now() };
  set((s) => ({ comments: { ...s.comments, [id]: next } }));
  persistComment(next);
  bumpPage(cur.pageId);
}

export function deleteComment(id: string): void {
  const cur = get().comments[id];
  if (!cur) return;
  set((s) => {
    const comments = { ...s.comments };
    delete comments[id];
    return { comments };
  });
  removeCommentRow(id);
  bumpPage(cur.pageId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings + UI actions
// ─────────────────────────────────────────────────────────────────────────────

export function updateSettings(patch: Partial<Settings>): void {
  const next = { ...get().settings, ...patch };
  set({ settings: next });
  void kvSet('settings', next);
}

export function openPage(id: string | null): void {
  if (id) {
    const recents = [id, ...get().recents.filter((r) => r !== id)].slice(0, 12);
    set({ currentPageId: id, peekPageId: null, recents });
    location.hash = `/p/${id}`;
    void kvSet('lastPage', id);
    void kvSet('recents', recents);
  } else {
    set({ currentPageId: null, peekPageId: null });
    location.hash = '/';
  }
}

export function getRecents(limit = 6): PageDoc[] {
  const { recents, pages, currentPageId } = get();
  const out: PageDoc[] = [];
  for (const id of recents) {
    if (id === currentPageId) continue;
    const p = pages[id];
    if (p && !p.deletedAt && !p.databaseId) out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

export const openPeek = (id: string | null) => set({ peekPageId: id });
export const toggleSidebar = () => set((s) => ({ sidebarOpen: !s.sidebarOpen }));
export const setSidebarWidth = (w: number) => set({ sidebarWidth: Math.min(420, Math.max(200, w)) });
export const setSearchOpen = (v: boolean) => set({ searchOpen: v });
export const setSettingsOpen = (v: boolean | string) => set({ settingsOpen: v });
export const setTrashOpen = (v: boolean) => set({ trashOpen: v });
export const setTemplatesOpen = (v: boolean) => set({ templatesOpen: v });
export const setShortcutsOpen = (v: boolean) => set({ shortcutsOpen: v });
export const setHistoryFor = (pageId: string | null) => set({ historyFor: pageId });
export const setCommentsFor = (pageId: string | null) => set({ commentsFor: pageId });

// ─────────────────────────────────────────────────────────────────────────────
// Remote application (called by the sync layer; never echoes back into sync)
// ─────────────────────────────────────────────────────────────────────────────

export function applyRemote(table: 'pages' | 'blocks' | 'comments', id: string, doc: any | null): void {
  if (table === 'pages') {
    set((s) => {
      const pages = { ...s.pages };
      if (doc === null) { delete pages[id]; void db.pages.delete(id); }
      else { pages[id] = doc; void db.pages.put(doc); }
      return { pages };
    });
    if (doc) bumpPage(id);
    bumpNav();
  } else if (table === 'blocks') {
    let pageId: string | undefined;
    set((s) => {
      const blocks = { ...s.blocks };
      pageId = (doc ?? s.blocks[id])?.pageId;
      if (doc === null) { delete blocks[id]; void db.blocks.delete(id); }
      else { blocks[id] = doc; void db.blocks.put(doc); }
      return { blocks };
    });
    if (pageId) bumpPage(pageId);
  } else {
    set((s) => {
      const comments = { ...s.comments };
      if (doc === null) { delete comments[id]; void db.comments.delete(id); }
      else { comments[id] = doc; void db.comments.put(doc); }
      return { comments };
    });
  }
}

// expose for power users / debugging
if (typeof window !== 'undefined') (window as any).__zenith = { useStore, db };
