"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { childrenOf, Page, pageTitle, Workspace } from "@/lib/model";
import { createPage, deletePage, exportWorkspaceJSON, importWorkspaceJSON, openPage, useWorkspace } from "@/lib/store";
import ThemeToggle from "./ThemeToggle";

function PageNode({
  ws,
  page,
  depth,
  expanded,
  toggle,
}: {
  ws: Workspace;
  page: Page;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  const kids = childrenOf(ws, page.id);
  const open = expanded.has(page.id);

  return (
    <div>
      <div
        style={{ paddingLeft: `${depth * 14}px` }}
        className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors ${
          ws.currentPageId === page.id
            ? "bg-[var(--bg-raised)] text-[var(--fg)] shadow-[var(--shadow-soft)]"
            : "text-[var(--fg-muted)] hover:bg-[var(--bg-raised)]/60"
        }`}
      >
        <button
          type="button"
          aria-label={open ? "Collapse" : "Expand"}
          onClick={() => toggle(page.id)}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] text-[var(--fg-faint)] transition-transform duration-200 hover:text-[var(--fg)] ${
            open ? "rotate-90" : ""
          } ${kids.length === 0 ? "opacity-0 group-hover:opacity-60" : ""}`}
        >
          ▶
        </button>
        <button
          type="button"
          onClick={() => openPage(page.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <span className="w-5 shrink-0 text-center">{page.icon}</span>
          <span className="truncate">{pageTitle(page)}</span>
        </button>
        <button
          type="button"
          aria-label={`Add sub-page to ${pageTitle(page)}`}
          onClick={() => {
            if (!open) toggle(page.id);
            createPage(page.id);
          }}
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--fg-faint)] transition-colors group-hover:flex hover:text-[var(--accent)]"
        >
          ＋
        </button>
        <button
          type="button"
          aria-label={`Delete ${pageTitle(page)}`}
          onClick={() => deletePage(page.id)}
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--fg-faint)] transition-colors group-hover:flex hover:text-red-400"
        >
          ×
        </button>
      </div>
      {open &&
        kids.map((k) => (
          <PageNode
            key={k.id}
            ws={ws}
            page={k}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
          />
        ))}
      {open && kids.length === 0 && (
        <p
          style={{ paddingLeft: `${(depth + 1) * 14 + 28}px` }}
          className="py-1 text-xs text-[var(--fg-faint)]"
        >
          No pages inside
        </p>
      )}
    </div>
  );
}

export default function Sidebar({ onSearch }: { onSearch: () => void }) {
  const ws = useWorkspace();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const roots = childrenOf(ws, null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importWorkspaceJSON(reader.result as string);
        setImportError(null);
      } catch {
        setImportError("Could not read backup — file may be corrupted.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-sunken)]">
      <div className="flex items-center justify-between px-4 py-4">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-sm tracking-[0.18em] uppercase text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]"
        >
          Lumina
        </Link>
        <ThemeToggle />
      </div>

      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={onSearch}
          className="flex w-full items-center justify-between rounded-md border border-[var(--line)] bg-[var(--bg-raised)]/60 px-3 py-1.5 text-sm text-[var(--fg-faint)] transition-colors hover:border-[var(--accent)] hover:text-[var(--fg-muted)]"
        >
          <span>Search…</span>
          <kbd className="text-[10px] tracking-wider">⌘K</kbd>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        <p className="px-2 pt-2 pb-1 text-[10px] tracking-[0.22em] uppercase text-[var(--fg-faint)]">
          Pages
        </p>
        {roots.length === 0 && (
          <p className="px-2 py-1 text-xs text-[var(--fg-faint)]">No pages yet.</p>
        )}
        {roots.map((p) => (
          <PageNode
            key={p.id}
            ws={ws}
            page={p}
            depth={0}
            expanded={expanded}
            toggle={toggle}
          />
        ))}
      </nav>

      <div className="border-t border-[var(--line)] p-2">
        <button
          type="button"
          onClick={() => createPage(null)}
          className="w-full rounded-md px-2 py-2 text-left text-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-raised)] hover:text-[var(--fg)]"
        >
          ＋ New page
        </button>
        <button
          type="button"
          onClick={() => createPage(null, "database")}
          className="w-full rounded-md px-2 py-2 text-left text-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-raised)] hover:text-[var(--fg)]"
        >
          ▦ New database
        </button>
        <div className="mt-1 border-t border-[var(--line)] pt-1">
          <button
            type="button"
            onClick={exportWorkspaceJSON}
            className="w-full rounded-md px-2 py-1.5 text-left text-xs text-[var(--fg-faint)] transition-colors hover:bg-[var(--bg-raised)] hover:text-[var(--fg-muted)]"
          >
            ↓ Export backup
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-md px-2 py-1.5 text-left text-xs text-[var(--fg-faint)] transition-colors hover:bg-[var(--bg-raised)] hover:text-[var(--fg-muted)]"
          >
            ↑ Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          {importError && (
            <p className="px-2 py-1 text-[10px] text-red-400">{importError}</p>
          )}
        </div>
      </div>
    </aside>
  );
}
