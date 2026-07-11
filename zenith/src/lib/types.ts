// ─── Zenith core types ────────────────────────────────────────────────────────

export type BlockType =
  | 'paragraph'
  | 'h1' | 'h2' | 'h3'
  | 'bulleted' | 'numbered' | 'todo' | 'toggle'
  | 'quote' | 'callout' | 'divider'
  | 'code' | 'image' | 'bookmark' | 'embed' | 'video'
  | 'table' | 'columns' | 'column'
  | 'childPage' | 'linkPage' | 'toc' | 'math'
  | 'childDatabase' | 'button';

export interface Block {
  id: string;
  pageId: string;
  /** parent block id for nesting (toggles, list indents, columns); null = top level */
  parentId: string | null;
  /** fractional index — lexicographic sort within siblings */
  order: string;
  type: BlockType;
  /** inline HTML content for text-ish blocks */
  html: string;
  /**
   * type-specific props:
   * todo: { checked }            callout: { icon, color }
   * code: { language, caption }  image: { src, width ('s'|'m'|'l'|'full'|px), caption }
   * bookmark/embed/video: { url, caption }
   * table: { rows: string[][], headerRow, headerCol }
   * childPage/linkPage: { pageId }
   * childDatabase: { pageId, viewId? }   toggle headings: h1-h3 + { toggleable, collapsed }
   * math: { tex }                any block: { color, bg }
   */
  props: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

// ─── Database (collection) schema ────────────────────────────────────────────

export type PropertyType =
  | 'title' | 'text' | 'number' | 'select' | 'multiSelect' | 'status'
  | 'date' | 'checkbox' | 'url' | 'email' | 'phone'
  | 'formula' | 'relation' | 'rollup' | 'file' | 'createdTime' | 'updatedTime';

export interface SelectOption { id: string; name: string; color: string }

/** how a rollup / column-calculation reduces a set of values */
export type Aggregation =
  | 'show' | 'count' | 'countValues' | 'countUnique' | 'countEmpty' | 'countNotEmpty'
  | 'percentEmpty' | 'percentNotEmpty' | 'sum' | 'average' | 'median' | 'min' | 'max'
  | 'range' | 'earliest' | 'latest' | 'checked' | 'unchecked' | 'percentChecked';

export interface RollupConfig {
  relationPropId: string;            // a relation property on THIS database
  targetPropId: string;             // a property on the related database
  agg: Aggregation;
}

export interface PropertyDef {
  id: string;
  name: string;
  type: PropertyType;
  options?: SelectOption[];          // select / multiSelect / status
  formula?: string;                  // formula expression
  numberFormat?: 'plain' | 'commas' | 'percent' | 'usd' | 'eur' | 'inr';
  relationDatabaseId?: string;       // relation target
  rollup?: RollupConfig;             // rollup configuration
}

export type ViewType = 'table' | 'board' | 'gallery' | 'list' | 'calendar' | 'timeline';

export interface FilterRule {
  id: string;
  propId: string;
  op: 'contains' | 'notContains' | 'is' | 'isNot' | 'isEmpty' | 'isNotEmpty'
    | 'gt' | 'lt' | 'gte' | 'lte' | 'before' | 'after' | 'checked' | 'unchecked';
  value?: any;
}

export interface SortRule { id: string; propId: string; dir: 'asc' | 'desc' }

export interface ViewDef {
  id: string;
  name: string;
  type: ViewType;
  filters: FilterRule[];
  /** 'and' | 'or' combination for filters */
  filterMode: 'and' | 'or';
  sorts: SortRule[];
  groupByPropId?: string;            // board grouping / table grouping
  hiddenProps: string[];
  /** view-specific layout opts: { cardSize, dateProp, endDateProp, showTitleOnly... } */
  layout: Record<string, any>;
}

export interface DbSchema {
  properties: PropertyDef[];
  views: ViewDef[];
  /** property id used as title (always exists) */
  titlePropId: string;
}

// ─── Pages ───────────────────────────────────────────────────────────────────

export interface PageDoc {
  id: string;
  /** parent page id (sidebar hierarchy); null = workspace root */
  parentId: string | null;
  /** when set, this page is a row of that database */
  databaseId: string | null;
  type: 'page' | 'database';
  title: string;
  icon?: string;                     // emoji
  cover?: string;                    // css gradient token "g:NAME" or url
  coverY?: number;                   // 0..100 reposition
  props: {
    fullWidth?: boolean;
    smallText?: boolean;
    font?: 'default' | 'serif' | 'mono';
    locked?: boolean;
  };
  dbSchema?: DbSchema;               // when type === 'database'
  /** property values when this page is a database row: propId -> value */
  rowProps?: Record<string, any>;
  favorite?: boolean;
  order: string;                     // fractional index among siblings
  deletedAt: number | null;          // soft delete (trash)
  createdAt: number;
  updatedAt: number;
}

export interface CommentDoc {
  id: string;
  pageId: string;
  blockId?: string;
  text: string;
  resolved: boolean;
  author: string;                    // display name ("You" or synced user)
  createdAt: number;
  updatedAt: number;
}

export interface Snapshot {
  id: string;
  pageId: string;
  ts: number;
  title: string;
  /** serialized { page: PageDoc, blocks: Block[] } */
  data: string;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  spellcheck: boolean;
  /** AI: model preference only — the API key lives server-side, never in Settings */
  aiModel?: string;
  /** Cloud sync (Firebase web config JSON pasted by user) */
  firebaseConfig?: string;
  syncEnabled?: boolean;
  /** misc */
  lastBackupAt?: number;
  onboarded?: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  spellcheck: true,
  aiModel: 'gemini-2.0-flash',
};

// ─── Misc shared ─────────────────────────────────────────────────────────────

export const SELECT_COLORS = [
  'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red', 'gold',
] as const;

export const BLOCK_COLORS = [
  'default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red',
] as const;

export const COVER_GRADIENTS: Record<string, string> = {
  aurum: 'linear-gradient(135deg,#2b2418 0%,#8a6a2f 55%,#e6c87a 100%)',
  midnight: 'linear-gradient(135deg,#0f1226 0%,#2b3a67 60%,#5c7cfa 100%)',
  porcelain: 'linear-gradient(135deg,#f5f3ef 0%,#e3ded2 60%,#c8bfa9 100%)',
  forest: 'linear-gradient(135deg,#0c1f17 0%,#1f5138 60%,#5cba8d 100%)',
  bordeaux: 'linear-gradient(135deg,#26060e 0%,#641b2e 60%,#c2566f 100%)',
  graphite: 'linear-gradient(135deg,#17181c 0%,#3a3d45 60%,#787f8c 100%)',
  champagne: 'linear-gradient(135deg,#f7e8c9 0%,#e9cf9b 50%,#c9a25c 100%)',
  azure: 'linear-gradient(135deg,#e8f4fd 0%,#a8d4f5 55%,#5aa7e8 100%)',
};
