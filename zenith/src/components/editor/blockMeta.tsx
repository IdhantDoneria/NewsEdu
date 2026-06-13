import {
  Type, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo, ChevronRight,
  Quote, Lightbulb, Minus, Code2, Image, Bookmark, Film, AppWindow, Table2,
  FileText, Link2, ListTree, Sigma, Database, Sparkles, Columns2, MousePointerClick,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { BlockType } from '../../lib/types';

export interface BlockMeta {
  type: BlockType;
  label: string;
  desc: string;
  icon: ReactNode;
  keywords: string;
  /** carries editable inline text */
  textish: boolean;
  /** children allowed (indent / toggle) */
  canChildren: boolean;
}

const I = (C: any) => <C size={17} strokeWidth={1.8} />;

export const BLOCK_META: Record<string, BlockMeta> = {
  paragraph: { type: 'paragraph', label: 'Text', desc: 'Plain text. Just start writing.', icon: I(Type), keywords: 'text plain paragraph p', textish: true, canChildren: true },
  h1: { type: 'h1', label: 'Heading 1', desc: 'Large section heading.', icon: I(Heading1), keywords: 'h1 heading title big #', textish: true, canChildren: true },
  h2: { type: 'h2', label: 'Heading 2', desc: 'Medium section heading.', icon: I(Heading2), keywords: 'h2 heading sub ##', textish: true, canChildren: true },
  h3: { type: 'h3', label: 'Heading 3', desc: 'Small section heading.', icon: I(Heading3), keywords: 'h3 heading small ###', textish: true, canChildren: true },
  bulleted: { type: 'bulleted', label: 'Bulleted list', desc: 'Simple bulleted list.', icon: I(List), keywords: 'bullet list ul -', textish: true, canChildren: true },
  numbered: { type: 'numbered', label: 'Numbered list', desc: 'Numbered list.', icon: I(ListOrdered), keywords: 'number ordered ol 1.', textish: true, canChildren: true },
  todo: { type: 'todo', label: 'To-do list', desc: 'Track tasks with checkboxes.', icon: I(ListTodo), keywords: 'todo task check checkbox []', textish: true, canChildren: true },
  toggle: { type: 'toggle', label: 'Toggle list', desc: 'Hide and show nested content.', icon: I(ChevronRight), keywords: 'toggle collapse expand >', textish: true, canChildren: true },
  quote: { type: 'quote', label: 'Quote', desc: 'Capture a quotation.', icon: I(Quote), keywords: 'quote blockquote cite "', textish: true, canChildren: true },
  callout: { type: 'callout', label: 'Callout', desc: 'Make text stand out.', icon: I(Lightbulb), keywords: 'callout banner highlight info note', textish: true, canChildren: false },
  divider: { type: 'divider', label: 'Divider', desc: 'Visually divide sections.', icon: I(Minus), keywords: 'divider rule hr ---', textish: false, canChildren: false },
  code: { type: 'code', label: 'Code', desc: 'Code snippet with highlighting.', icon: I(Code2), keywords: 'code snippet ``` programming', textish: false, canChildren: false },
  image: { type: 'image', label: 'Image', desc: 'Upload or embed an image.', icon: I(Image), keywords: 'image picture photo upload img', textish: false, canChildren: false },
  bookmark: { type: 'bookmark', label: 'Web bookmark', desc: 'Save a link as a visual card.', icon: I(Bookmark), keywords: 'bookmark link url web card', textish: false, canChildren: false },
  video: { type: 'video', label: 'Video', desc: 'Embed a video (YouTube & more).', icon: I(Film), keywords: 'video youtube vimeo film', textish: false, canChildren: false },
  embed: { type: 'embed', label: 'Embed', desc: 'Embed any site in a frame.', icon: I(AppWindow), keywords: 'embed iframe maps figma site', textish: false, canChildren: false },
  table: { type: 'table', label: 'Table', desc: 'Simple table of cells.', icon: I(Table2), keywords: 'table grid cells rows', textish: false, canChildren: false },
  childPage: { type: 'childPage', label: 'Page', desc: 'Embed a sub-page inside this page.', icon: I(FileText), keywords: 'page subpage child new', textish: false, canChildren: false },
  linkPage: { type: 'linkPage', label: 'Link to page', desc: 'Link to an existing page.', icon: I(Link2), keywords: 'link page mention existing', textish: false, canChildren: false },
  toc: { type: 'toc', label: 'Table of contents', desc: 'Outline of headings on this page.', icon: I(ListTree), keywords: 'toc contents outline headings', textish: false, canChildren: false },
  math: { type: 'math', label: 'Math equation', desc: 'Display a TeX equation.', icon: I(Sigma), keywords: 'math tex latex equation formula', textish: false, canChildren: false },
  childDatabase: { type: 'childDatabase', label: 'Database', desc: 'Table, board, calendar & more.', icon: I(Database), keywords: 'database table board kanban calendar gallery list timeline collection', textish: false, canChildren: false },
  columns: { type: 'columns', label: 'Columns', desc: 'Side-by-side layout.', icon: I(Columns2), keywords: 'columns layout side', textish: false, canChildren: true },
  column: { type: 'column', label: 'Column', desc: '', icon: I(Columns2), keywords: '', textish: false, canChildren: true },
  button: { type: 'button', label: 'Button', desc: 'A button that inserts a block or opens a page.', icon: I(MousePointerClick), keywords: 'button action template insert click', textish: false, canChildren: false },
};

export const TEXTISH = (t: string) => !!BLOCK_META[t]?.textish;

export const TURN_INTO_TYPES: BlockType[] = [
  'paragraph', 'h1', 'h2', 'h3', 'bulleted', 'numbered', 'todo', 'toggle', 'quote', 'callout', 'code',
];

export interface SlashItem {
  id: string;
  label: string;
  desc: string;
  icon: ReactNode;
  keywords: string;
  group: string;
}

export const SLASH_ITEMS: SlashItem[] = [
  { id: 'ai', label: 'Ask AI', desc: 'Write, summarize, brainstorm with AI.', icon: <Sparkles size={17} strokeWidth={1.8} color="var(--gold)" />, keywords: 'ai ask write generate magic assistant', group: 'AI' },
  ...(['paragraph', 'h1', 'h2', 'h3', 'bulleted', 'numbered', 'todo', 'toggle', 'quote', 'callout', 'divider'] as BlockType[])
    .map((t) => ({ id: t, label: BLOCK_META[t].label, desc: BLOCK_META[t].desc, icon: BLOCK_META[t].icon, keywords: BLOCK_META[t].keywords, group: 'Basic blocks' })),
  { id: 'childPage', label: 'Page', desc: BLOCK_META.childPage.desc, icon: BLOCK_META.childPage.icon, keywords: BLOCK_META.childPage.keywords, group: 'Basic blocks' },
  { id: 'linkPage', label: 'Link to page', desc: BLOCK_META.linkPage.desc, icon: BLOCK_META.linkPage.icon, keywords: BLOCK_META.linkPage.keywords, group: 'Basic blocks' },
  { id: 'toggleH1', label: 'Toggle heading 1', desc: 'Collapsible large heading.', icon: BLOCK_META.h1.icon, keywords: 'toggle heading h1 collapse', group: 'Basic blocks' },
  { id: 'toggleH2', label: 'Toggle heading 2', desc: 'Collapsible medium heading.', icon: BLOCK_META.h2.icon, keywords: 'toggle heading h2 collapse', group: 'Basic blocks' },
  { id: 'toggleH3', label: 'Toggle heading 3', desc: 'Collapsible small heading.', icon: BLOCK_META.h3.icon, keywords: 'toggle heading h3 collapse', group: 'Basic blocks' },
  { id: 'table-db', label: 'Table view', desc: 'Database table on this page.', icon: BLOCK_META.childDatabase.icon, keywords: 'table database grid rows db', group: 'Database' },
  { id: 'board-db', label: 'Board view', desc: 'Kanban board on this page.', icon: BLOCK_META.childDatabase.icon, keywords: 'board kanban database db', group: 'Database' },
  { id: 'gallery-db', label: 'Gallery view', desc: 'Card gallery on this page.', icon: BLOCK_META.childDatabase.icon, keywords: 'gallery cards database db', group: 'Database' },
  { id: 'list-db', label: 'List view', desc: 'Minimal list database.', icon: BLOCK_META.childDatabase.icon, keywords: 'list database db', group: 'Database' },
  { id: 'calendar-db', label: 'Calendar view', desc: 'Calendar database on this page.', icon: BLOCK_META.childDatabase.icon, keywords: 'calendar month database db', group: 'Database' },
  { id: 'timeline-db', label: 'Timeline view', desc: 'Timeline / gantt database.', icon: BLOCK_META.childDatabase.icon, keywords: 'timeline gantt database db', group: 'Database' },
  { id: 'linked-db', label: 'Linked view of database', desc: 'A live view of an existing database.', icon: BLOCK_META.childDatabase.icon, keywords: 'linked database view existing', group: 'Database' },
  ...(['image', 'bookmark', 'video', 'embed', 'code', 'math', 'table'] as BlockType[])
    .map((t) => ({ id: t, label: BLOCK_META[t].label, desc: BLOCK_META[t].desc, icon: BLOCK_META[t].icon, keywords: BLOCK_META[t].keywords, group: 'Media & advanced' })),
  { id: 'toc', label: 'Table of contents', desc: BLOCK_META.toc.desc, icon: BLOCK_META.toc.icon, keywords: BLOCK_META.toc.keywords, group: 'Media & advanced' },
  { id: 'button', label: 'Button', desc: BLOCK_META.button.desc, icon: BLOCK_META.button.icon, keywords: BLOCK_META.button.keywords, group: 'Media & advanced' },
  { id: 'columns2', label: '2 columns', desc: 'Two side-by-side columns.', icon: BLOCK_META.columns.icon, keywords: 'columns two layout', group: 'Media & advanced' },
  { id: 'columns3', label: '3 columns', desc: 'Three side-by-side columns.', icon: BLOCK_META.columns.icon, keywords: 'columns three layout', group: 'Media & advanced' },
  { id: 'date', label: 'Date mention', desc: "Insert today's date inline.", icon: BLOCK_META.divider.icon, keywords: 'date today now mention @', group: 'Media & advanced' },
];
