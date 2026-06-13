"use client";

import { useEffect, useState } from "react";
import { loadWorkspace, useWorkspace } from "@/lib/store";
import { pageById } from "@/lib/model";
import CommandPalette from "./CommandPalette";
import Sidebar from "./Sidebar";
import PageView from "./PageView";

export default function Workspace() {
  const ws = useWorkspace();
  const [ready, setReady] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    loadWorkspace();
    setReady(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-xs tracking-[0.3em] uppercase text-[var(--fg-faint)]">
        Lumina
      </div>
    );
  }

  const current = pageById(ws, ws.currentPageId);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar onSearch={() => setPaletteOpen(true)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <main className="flex-1 overflow-y-auto bg-[var(--bg)]">
        {current ? (
          <PageView key={current.id} page={current} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--fg-faint)]">
            Select a page, or create one from the sidebar.
          </div>
        )}
      </main>
    </div>
  );
}
