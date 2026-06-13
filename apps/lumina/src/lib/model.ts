// Core data model for the Lumina workspace.
// Pure types and helpers only — no browser APIs here.

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bulleted"
  | "numbered"
  | "todo"
  | "toggle"
  | "callout"
  | "quote"
  | "code"
  | "divider"
  | "image";

export interface Block {
  id: string;
  type: BlockType;
  text: string;
  /** to-do blocks */
  checked?: boolean;
  /** toggle blocks */
  collapsed?: boolean;
  /** toggle blocks — the hidden body shown when expanded */
  body?: string;
  /** code blocks */
  language?: string;
  /** image blocks */
  url?: string;
}

export type PropertyType = "text" | "select" | "date" | "checkbox";

export interface DatabaseProperty {
  id: string;
  name: string;
  type: PropertyType;
  /** options for `select` properties */
  options?: string[];
}

export interface DatabaseRow {
  id: string;
  /** propertyId -> raw value (string for text/select/date, "true"/"" for checkbox) */
  values: Record<string, string>;
}

export interface Database {
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
}

export type PageKind = "document" | "database";

export interface Page {
  id: string;
  title: string;
  /** emoji shown next to the title */
  icon: string;
  parentId: string | null;
  kind: PageKind;
  blocks: Block[];
  database?: Database;
  createdAt: number;
  updatedAt: number;
}

export interface Workspace {
  /** ordered — array position is sidebar order within each parent */
  pages: Page[];
  currentPageId: string | null;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function makeBlock(type: BlockType = "paragraph", text = ""): Block {
  return { id: uid(), type, text };
}

export function makePage(parentId: string | null = null, kind: PageKind = "document"): Page {
  const now = Date.now();
  return {
    id: uid(),
    title: "",
    icon: kind === "database" ? "▦" : "◌",
    parentId,
    kind,
    blocks: [makeBlock()],
    database:
      kind === "database"
        ? {
            properties: [
              { id: uid(), name: "Name", type: "text" },
              { id: uid(), name: "Done", type: "checkbox" },
            ],
            rows: [],
          }
        : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function emptyWorkspace(): Workspace {
  return { pages: [], currentPageId: null };
}

export function childrenOf(ws: Workspace, parentId: string | null): Page[] {
  return ws.pages.filter((p) => p.parentId === parentId);
}

export function pageById(ws: Workspace, id: string | null): Page | undefined {
  if (!id) return undefined;
  return ws.pages.find((p) => p.id === id);
}

/** ancestors of a page, root first, excluding the page itself */
export function breadcrumbOf(ws: Workspace, id: string): Page[] {
  const trail: Page[] = [];
  let cur = pageById(ws, id);
  while (cur && cur.parentId) {
    const parent = pageById(ws, cur.parentId);
    if (!parent) break;
    trail.unshift(parent);
    cur = parent;
  }
  return trail;
}

/** ids of a page and all of its descendants */
export function subtreeIds(ws: Workspace, id: string): Set<string> {
  const ids = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of ws.pages) {
      if (p.parentId && ids.has(p.parentId) && !ids.has(p.id)) {
        ids.add(p.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function pageTitle(p: Page): string {
  return p.title.trim() || "Untitled";
}
