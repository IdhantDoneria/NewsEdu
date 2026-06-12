"use client";

import Link from "next/link";
import { childrenOf, pageTitle } from "@/lib/model";
import { createPage, deletePage, openPage, useWorkspace } from "@/lib/store";

export default function Sidebar() {
  const ws = useWorkspace();
  const roots = childrenOf(ws, null);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-sunken)]">
      <div className="flex items-center justify-between px-4 py-4">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-sm tracking-[0.18em] uppercase text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]"
        >
          Lumina
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        <p className="px-2 pt-2 pb-1 text-[10px] tracking-[0.22em] uppercase text-[var(--fg-faint)]">
          Pages
        </p>
        {roots.length === 0 && (
          <p className="px-2 py-1 text-xs text-[var(--fg-faint)]">No pages yet.</p>
        )}
        {roots.map((p) => (
          <div
            key={p.id}
            className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
              ws.currentPageId === p.id
                ? "bg-[var(--bg-raised)] text-[var(--fg)] shadow-[var(--shadow-soft)]"
                : "text-[var(--fg-muted)] hover:bg-[var(--bg-raised)]/60"
            }`}
          >
            <button
              type="button"
              onClick={() => openPage(p.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span className="w-5 text-center">{p.icon}</span>
              <span className="truncate">{pageTitle(p)}</span>
            </button>
            <button
              type="button"
              aria-label={`Delete ${pageTitle(p)}`}
              onClick={() => deletePage(p.id)}
              className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--fg-faint)] transition-colors group-hover:flex hover:text-red-400"
            >
              ×
            </button>
          </div>
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
      </div>
    </aside>
  );
}
