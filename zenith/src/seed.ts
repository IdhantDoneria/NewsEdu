// ─── First-run seed ───────────────────────────────────────────────────────────
// Runs once after boot. If the workspace is genuinely empty it builds the
// welcome experience — a Welcome page, the Zenith Handbook, and two living
// example pages (Projects, Reading List) — then returns the page id to open.

import { kvGet, kvSet } from './lib/db';
import { createBlock, createPage, updatePage, useStore } from './lib/store';
import { createProjectTracker, createReadingList } from './lib/templates';
import type { BlockType } from './lib/types';

export async function ensureSeed(): Promise<string | null> {
  const seeded = await kvGet<boolean>('seeded');
  if (seeded || Object.keys(useStore.getState().pages).length > 0) return null;
  await kvSet('seeded', true);

  // ── Welcome to Zenith ──────────────────────────────────────────────────────
  const welcome = createPage({ title: 'Welcome to Zenith', icon: '🏔️', cover: 'g:aurum', empty: true });
  updatePage(welcome, { favorite: true });
  const w = (type: BlockType, html = '', props: Record<string, any> = {}, parentId: string | null = null) =>
    createBlock(welcome, { type, html, props, parentId });

  w('h1', 'Welcome to the summit.');
  w('quote', '<i>Peak thought, zero friction — a workspace that stays out of your way.</i>');
  w('callout', 'Press <b>/</b> anywhere — every power lives one keystroke away.', { icon: '✨', bg: 'gold' });

  w('h2', 'Start here');
  w('todo', 'Write a note — click anywhere below and just type');
  w('todo', 'Try <code>/table</code> to conjure a database');
  w('todo', 'Open the command palette with <b>⌘K</b>');
  w('todo', 'Toggle dark mode with <b>⌘⇧L</b>');

  const cols = w('columns');
  const left = createBlock(welcome, { type: 'column', parentId: cols });
  const right = createBlock(welcome, { type: 'column', parentId: cols });
  w('h3', 'Why Zenith', {}, left);
  w('bulleted', '<b>Local-first</b> — your pages live on your machine, instantly', {}, left);
  w('bulleted', 'Blocks for everything: boards, calendars, math, code', {}, left);
  w('bulleted', 'Version history and trash — nothing is truly lost', {}, left);
  w('bulleted', 'AI and cloud sync, only when you invite them', {}, left);
  w('h3', 'It looks like this', {}, right);
  w('code',
    'const day = plan({\n  focus: \'one big thing\',\n  meetings: few,\n  energy: guarded,\n});\n\nship(day); // before sunset',
    { language: 'typescript' }, right);

  w('divider');
  w('h2', 'Explore your workspace');

  // ── Zenith Handbook (subpage of Welcome) ───────────────────────────────────
  const handbook = createPage({ parentId: welcome, title: 'Zenith Handbook', icon: '📖', cover: 'g:midnight', empty: true });
  const h = (type: BlockType, html = '', props: Record<string, any> = {}, parentId: string | null = null) =>
    createBlock(handbook, { type, html, props, parentId });

  h('toc');
  h('paragraph', 'Everything Zenith can do, in five quiet minutes. Each section unfolds.');

  const s1 = h('h2', 'Blocks & markdown', { toggleable: true });
  h('paragraph', 'Type <code>/</code> for the block menu — or skip it and write markdown straight in:', {}, s1);
  h('bulleted', '<code>#</code> <code>##</code> <code>###</code> — headings · <code>-</code> bulleted · <code>1.</code> numbered', {}, s1);
  h('bulleted', '<code>[]</code> — to-do · <code>&gt;</code> — toggle · <code>"</code> — quote · <code>---</code> — divider', {}, s1);
  h('bulleted', '<b>**bold**</b>, <i>*italic*</i>, <code>`code`</code>, <s>~~strike~~</s> as you type', {}, s1);
  h('paragraph', 'Drag the <code>⋮⋮</code> handle to rearrange; drop blocks side by side to make columns.', {}, s1);

  const s2 = h('h2', 'Databases & views', { toggleable: true, collapsed: true });
  h('paragraph', '<code>/table</code>, <code>/board</code>, <code>/gallery</code>, <code>/calendar</code>, <code>/timeline</code> — one dataset, many lenses.', {}, s2);
  h('bulleted', 'Every row is a full page; open it and write', {}, s2);
  h('bulleted', 'Properties: select, multi-select, date, checkbox, number, formula…', {}, s2);
  h('bulleted', 'Filter, sort, and group per view — see <b>Projects</b> for a working board', {}, s2);

  const s3 = h('h2', 'Zenith AI', { toggleable: true, collapsed: true });
  h('paragraph', 'Select any text — or type <code>/ai</code> — to draft, summarise, translate, or continue your thought.', {}, s3);
  h('callout', 'Zenith AI works out of the box — no key, no setup. Just start writing.', { icon: '✨', bg: 'purple' }, s3);

  const s4 = h('h2', 'Cloud sync', { toggleable: true, collapsed: true });
  h('paragraph', 'Zenith is local-first; the cloud is optional. Paste a Firebase config under Settings → <b>Cloud sync</b> and your workspace mirrors across devices.', {}, s4);
  h('paragraph', 'Turn it off any time — your local copy is always complete.', {}, s4);

  const s5 = h('h2', 'Versions & trash', { toggleable: true, collapsed: true });
  h('paragraph', 'Zenith snapshots pages as you work. Open <code>⋯ → Version history</code> to time-travel, restore, or just admire your drafts.', {}, s5);
  h('paragraph', 'Deleted pages rest in <b>Trash</b> until you say otherwise.', {}, s5);

  const s6 = h('h2', 'Shortcuts', { toggleable: true, collapsed: true });
  h('table', '', {
    headerRow: true,
    rows: [
      ['Action', 'Shortcut'],
      ['Command palette', '⌘K'],
      ['Toggle sidebar', '⌘\\'],
      ['Dark mode', '⌘⇧L'],
      ['Undo · redo', '⌘Z · ⌘⇧Z'],
      ['All shortcuts', '⌘/'],
    ],
  }, s6);

  h('divider');
  h('quote', 'The handbook is a page like any other — annotate it, rearrange it, make it yours.');

  // ── Example pages from templates (real, editable) ──────────────────────────
  const projects = createProjectTracker(null);
  updatePage(projects, { title: 'Projects' });
  const reading = createReadingList(null);

  // ── Link the tour from the Welcome page ────────────────────────────────────
  w('childPage', '', { pageId: handbook });
  w('linkPage', '', { pageId: projects });
  w('linkPage', '', { pageId: reading });
  w('paragraph', '');

  return welcome;
}
