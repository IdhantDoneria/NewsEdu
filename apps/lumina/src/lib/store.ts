"use client";

// Client-side workspace store with a localStorage persistence layer.
// A tiny external store (useSyncExternalStore) — no state library needed.

import { useSyncExternalStore } from "react";
import {
  Block,
  Page,
  Workspace,
  emptyWorkspace,
  makePage,
  pageById,
  subtreeIds,
} from "./model";

const STORAGE_KEY = "lumina.workspace.v1";

let state: Workspace = emptyWorkspace();
let loaded = false;
const listeners = new Set<() => void>();

// Stable server/first-render snapshot so SSR HTML matches the first client
// render; real data arrives via loadWorkspace() after mount.
const EMPTY = emptyWorkspace();

function emit() {
  for (const l of listeners) l();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full or unavailable — keep working in memory
    }
  }, 150);
}

function setState(next: Workspace) {
  state = next;
  persist();
  emit();
}

export function loadWorkspace() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Workspace;
      if (parsed && Array.isArray(parsed.pages)) {
        state = parsed;
      }
    }
  } catch {
    // corrupt payload — start fresh rather than crash
  }
  if (state.pages.length === 0) {
    const welcome = makePage(null);
    welcome.title = "Welcome to Lumina";
    welcome.icon = "✦";
    welcome.blocks = [
      {
        id: welcome.blocks[0].id,
        type: "paragraph",
        text: "A quieter place to think. Create a page from the sidebar, give it an icon, and start writing.",
      },
    ];
    state = { pages: [welcome], currentPageId: welcome.id };
  }
  emit();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getWorkspace(): Workspace {
  return state;
}

export function useWorkspace(): Workspace {
  return useSyncExternalStore(subscribe, getWorkspace, () => EMPTY);
}

// ---------------------------------------------------------------- actions

function touch(p: Page): Page {
  return { ...p, updatedAt: Date.now() };
}

export function createPage(parentId: string | null = null, kind: Page["kind"] = "document"): Page {
  const page = makePage(parentId, kind);
  setState({
    ...state,
    pages: [...state.pages, page],
    currentPageId: page.id,
  });
  return page;
}

export function updatePage(id: string, patch: Partial<Omit<Page, "id">>) {
  setState({
    ...state,
    pages: state.pages.map((p) => (p.id === id ? touch({ ...p, ...patch }) : p)),
  });
}

export function deletePage(id: string) {
  const doomed = subtreeIds(state, id);
  const parentId = pageById(state, id)?.parentId ?? null;
  const pages = state.pages.filter((p) => !doomed.has(p.id));
  let currentPageId = state.currentPageId;
  if (currentPageId && doomed.has(currentPageId)) {
    currentPageId = parentId ?? pages[0]?.id ?? null;
  }
  setState({ ...state, pages, currentPageId });
}

export function openPage(id: string | null) {
  setState({ ...state, currentPageId: id });
}

export function setBlocks(pageId: string, blocks: Block[]) {
  setState({
    ...state,
    pages: state.pages.map((p) => (p.id === pageId ? touch({ ...p, blocks }) : p)),
  });
}

export function exportWorkspaceJSON(): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lumina-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importWorkspaceJSON(json: string): void {
  try {
    const parsed = JSON.parse(json) as Workspace;
    if (parsed && Array.isArray(parsed.pages)) {
      setState(parsed);
    }
  } catch {
    throw new Error("Invalid Lumina backup file.");
  }
}

/** Export a single page as plain Markdown. */
export function exportPageMarkdown(pageId: string): void {
  const page = pageById(state, pageId);
  if (!page) return;

  const lines: string[] = [`# ${page.title || "Untitled"}`, ""];
  for (const b of page.blocks) {
    switch (b.type) {
      case "h1": lines.push(`# ${b.text}`, ""); break;
      case "h2": lines.push(`## ${b.text}`, ""); break;
      case "h3": lines.push(`### ${b.text}`, ""); break;
      case "bulleted": lines.push(`- ${b.text}`); break;
      case "numbered": lines.push(`1. ${b.text}`); break;
      case "todo": lines.push(`- [${b.checked ? "x" : " "}] ${b.text}`); break;
      case "quote": lines.push(`> ${b.text}`, ""); break;
      case "callout": lines.push(`> **Note:** ${b.text}`, ""); break;
      case "code": lines.push("```" + (b.language ?? ""), b.text, "```", ""); break;
      case "divider": lines.push("---", ""); break;
      case "image": lines.push(`![${b.text || "image"}](${b.url ?? ""})`, ""); break;
      case "toggle": lines.push(`**${b.text}**`, b.body ? `  ${b.body}` : "", ""); break;
      default: if (b.text) lines.push(b.text, "");
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(page.title || "untitled").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
