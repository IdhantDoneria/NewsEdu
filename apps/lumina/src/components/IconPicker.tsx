"use client";

import { useEffect, useRef, useState } from "react";

const ICONS = [
  "◌", "✦", "✧", "❖", "◆", "▣", "▦", "✷", "☼", "☾",
  "✎", "✓", "♔", "♖", "⚑", "❝", "∞", "♪", "☕", "✈",
  "🌿", "🌙", "🔥", "💎", "📒", "📌", "🗂️", "🧭", "🏛️", "🎞️",
];

export default function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Change page icon"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg p-1 text-5xl leading-none transition-transform duration-200 hover:scale-110"
      >
        {value}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-20 mt-2 grid w-64 grid-cols-10 gap-1 rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] p-3 shadow-[var(--shadow-soft)]">
          {ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => {
                onChange(icon);
                setOpen(false);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-sm transition-colors hover:bg-[var(--bg-sunken)]"
            >
              {icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
