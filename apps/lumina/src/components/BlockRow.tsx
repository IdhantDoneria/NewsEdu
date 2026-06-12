"use client";

import { useEffect, useRef } from "react";
import { Block } from "@/lib/model";

const TYPE_CLASS: Record<string, string> = {
  paragraph: "text-[15px] leading-relaxed",
  h1: "font-[family-name:var(--font-display)] text-3xl leading-snug mt-6",
  h2: "font-[family-name:var(--font-display)] text-2xl leading-snug mt-4",
  h3: "font-[family-name:var(--font-display)] text-xl leading-snug mt-3",
  bulleted: "text-[15px] leading-relaxed",
  numbered: "text-[15px] leading-relaxed",
  todo: "text-[15px] leading-relaxed",
};

interface Props {
  block: Block;
  /** 1-based position within a run of numbered blocks */
  number: number;
  focused: boolean;
  registerRef: (el: HTMLTextAreaElement | null) => void;
  onFocus: () => void;
  onBlur: () => void;
  onText: (value: string, caret: number) => void;
  onEnter: (caret: number) => void;
  onBackspaceAtStart: () => void;
  onArrow: (dir: -1 | 1) => boolean;
  onToggleChecked: () => void;
}

export default function BlockRow({
  block,
  number,
  focused,
  registerRef,
  onFocus,
  onBlur,
  onText,
  onEnter,
  onBackspaceAtStart,
  onArrow,
  onToggleChecked,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(resize, [block.text, block.type]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const caret = el.selectionStart;
    const collapsed = el.selectionStart === el.selectionEnd;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onEnter(caret);
    } else if (e.key === "Backspace" && collapsed && caret === 0) {
      e.preventDefault();
      onBackspaceAtStart();
    } else if (e.key === "ArrowUp" && collapsed) {
      // only leave the block when the caret is on its first line
      if (!el.value.slice(0, caret).includes("\n")) {
        if (onArrow(-1)) e.preventDefault();
      }
    } else if (e.key === "ArrowDown" && collapsed) {
      if (!el.value.slice(caret).includes("\n")) {
        if (onArrow(1)) e.preventDefault();
      }
    }
  };

  const prefix =
    block.type === "bulleted" ? (
      <span className="w-6 shrink-0 pt-[3px] text-center select-none text-[var(--fg-muted)]">
        •
      </span>
    ) : block.type === "numbered" ? (
      <span className="w-6 shrink-0 pt-[3px] text-center text-sm tabular-nums select-none text-[var(--fg-muted)]">
        {number}.
      </span>
    ) : block.type === "todo" ? (
      <button
        type="button"
        aria-label={block.checked ? "Mark not done" : "Mark done"}
        onClick={onToggleChecked}
        className={`mt-[5px] h-4 w-4 shrink-0 rounded-[4px] border text-[10px] leading-none transition-colors ${
          block.checked
            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
            : "border-[var(--fg-faint)] hover:border-[var(--accent)]"
        }`}
      >
        {block.checked ? "✓" : ""}
      </button>
    ) : null;

  return (
    <div className="group flex items-start gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-[var(--bg-sunken)]/50">
      {prefix}
      <textarea
        ref={(el) => {
          ref.current = el;
          registerRef(el);
        }}
        rows={1}
        value={block.text}
        placeholder={
          focused
            ? block.type === "paragraph"
              ? "Write, or try “# ”, “- ”, “[] ”…"
              : "Heading"
            : ""
        }
        onChange={(e) => onText(e.target.value, e.target.selectionStart)}
        onInput={resize}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-[var(--fg-faint)] ${TYPE_CLASS[block.type] ?? TYPE_CLASS.paragraph} ${
          block.type === "todo" && block.checked
            ? "text-[var(--fg-faint)] line-through"
            : ""
        }`}
      />
    </div>
  );
}
