"use client";

import { useEffect, useRef, useState } from "react";
import { Page, pageTitle, Workspace } from "@/lib/model";
import { openPage, useWorkspace } from "@/lib/store";

interface Result {
  page: Page;
  /** matching body text, when the hit was not in the title */
  snippet?: string;
}

function search(ws: Workspace, query: string): Result[] {
  const q = query.trim().toLowerCase();
  const results: Result[] = [];
  for (const page of ws.pages) {
    if (!q) {
      results.push({ page });
      continue;
    }
    if (pageTitle(page).toLowerCase().includes(q)) {
      results.push({ page });
      continue;
    }
    let snippet: string | undefined;
    for (const b of page.blocks) {
      const haystacks = [b.text, b.body ?? ""];
      const hit = haystacks.find((t) => t.toLowerCase().includes(q));
      if (hit) {
        const at = hit.toLowerCase().indexOf(q);
        snippet = `${at > 24 ? "…" : ""}${hit.slice(Math.max(0, at - 24), at + 56)}`;
        break;
      }
    }
    if (!snippet && page.database) {
      for (const row of page.database.rows) {
        const hit = Object.values(row.values).find((v) =>
          v.toLowerCase().includes(q),
        );
        if (hit) {
          snippet = hit.slice(0, 80);
          break;
        }
      }
    }
    if (snippet !== undefined) results.push({ page, snippet });
  }
  // recently edited first
  results.sort((a, b) => b.page.updatedAt - a.page.updatedAt);
  return results.slice(0, 20);
}

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ws = useWorkspace();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      // focus after the panel mounts
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const results = search(ws, query);
  const pick = (r: Result) => {
    openPage(r.page.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[16vh] backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label="Search pages"
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-rise w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow-soft)]"
        style={{ animationDuration: "0.25s" }}
      >
        <input
          ref={inputRef}
          value={query}
          placeholder="Search pages and content…"
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((s) => Math.min(s + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter" && results[selected]) {
              pick(results[selected]);
            }
          }}
          className="w-full border-b border-[var(--line)] bg-transparent px-5 py-4 text-[15px] outline-none placeholder:text-[var(--fg-faint)]"
        />
        <div className="max-h-80 overflow-y-auto py-1.5">
          {results.length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-[var(--fg-faint)]">
              Nothing found for “{query}”.
            </p>
          )}
          {results.map((r, idx) => (
            <button
              key={r.page.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              onMouseEnter={() => setSelected(idx)}
              className={`flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors ${
                idx === selected
                  ? "bg-[var(--bg-sunken)]"
                  : ""
              }`}
            >
              <span className="w-5 shrink-0 text-center">{r.page.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {pageTitle(r.page)}
                </span>
                {r.snippet && (
                  <span className="block truncate text-xs text-[var(--fg-faint)]">
                    {r.snippet}
                  </span>
                )}
              </span>
              {r.page.kind === "database" && (
                <span className="text-[10px] tracking-widest text-[var(--fg-faint)] uppercase">
                  table
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="border-t border-[var(--line)] px-5 py-2 text-[10px] tracking-wide text-[var(--fg-faint)]">
          ↑↓ navigate · Enter open · Esc close
        </p>
      </div>
    </div>
  );
}
