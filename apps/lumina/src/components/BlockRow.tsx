"use client";

import { useEffect, useRef } from "react";
import { Block } from "@/lib/model";
import { highlight } from "@/lib/highlight";

const TYPE_CLASS: Record<string, string> = {
  paragraph: "text-[15px] leading-relaxed",
  h1: "font-[family-name:var(--font-display)] text-3xl leading-snug mt-6",
  h2: "font-[family-name:var(--font-display)] text-2xl leading-snug mt-4",
  h3: "font-[family-name:var(--font-display)] text-xl leading-snug mt-3",
  bulleted: "text-[15px] leading-relaxed",
  numbered: "text-[15px] leading-relaxed",
  todo: "text-[15px] leading-relaxed",
  toggle: "text-[15px] leading-relaxed font-medium",
  callout: "text-[15px] leading-relaxed",
  quote:
    "font-[family-name:var(--font-display)] text-[17px] italic leading-relaxed",
};

const CODE_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "html",
  "css",
  "json",
  "bash",
  "plain",
];

export interface BlockRowProps {
  block: Block;
  /** 1-based position within a run of numbered blocks */
  number: number;
  focused: boolean;
  /** slash command menu is open and anchored to this block */
  slashActive: boolean;
  onSlashMove: (dir: -1 | 1) => void;
  onSlashApply: () => void;
  onSlashClose: () => void;
  registerRef: (el: HTMLTextAreaElement | null) => void;
  onFocus: () => void;
  onBlur: () => void;
  onText: (value: string, caret: number) => void;
  onEnter: (caret: number) => void;
  onBackspaceAtStart: () => void;
  onArrow: (dir: -1 | 1) => boolean;
  onToggleChecked: () => void;
  onToggleCollapsed: () => void;
  onBody: (body: string) => void;
  onLanguage: (language: string) => void;
  onSetImage: (url: string) => void;
  onRemove: () => void;
}

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
}

export default function BlockRow(props: BlockRowProps) {
  const { block } = props;
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (block.type !== "code") autoResize(ref.current);
  }, [block.text, block.type]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const caret = el.selectionStart;
    const collapsed = el.selectionStart === el.selectionEnd;

    if (props.slashActive) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        props.onSlashMove(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        props.onSlashMove(-1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        props.onSlashApply();
        return;
      }
      if (e.key === "Escape") {
        props.onSlashClose();
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      if (block.type === "code") return; // newline inside the code block
      e.preventDefault();
      if (block.type === "image" && !block.url) {
        const url = el.value.trim();
        if (url) props.onSetImage(url);
        return;
      }
      props.onEnter(caret);
    } else if (e.key === "Backspace" && collapsed && caret === 0) {
      e.preventDefault();
      props.onBackspaceAtStart();
    } else if (e.key === "ArrowUp" && collapsed) {
      // only leave the block when the caret is on its first line
      if (!el.value.slice(0, caret).includes("\n")) {
        if (props.onArrow(-1)) e.preventDefault();
      }
    } else if (e.key === "ArrowDown" && collapsed) {
      if (!el.value.slice(caret).includes("\n")) {
        if (props.onArrow(1)) e.preventDefault();
      }
    }
  };

  const setRefs = (el: HTMLTextAreaElement | null) => {
    ref.current = el;
    props.registerRef(el);
  };

  const textarea = (extra: string, placeholder: string) => (
    <textarea
      ref={setRefs}
      rows={1}
      value={block.text}
      placeholder={placeholder}
      onChange={(e) => props.onText(e.target.value, e.target.selectionStart)}
      onInput={(e) => block.type !== "code" && autoResize(e.currentTarget)}
      onKeyDown={handleKeyDown}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      className={`w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-[var(--fg-faint)] ${extra}`}
    />
  );

  // ------------------------------------------------------------- divider
  if (block.type === "divider") {
    return (
      <div className="group relative flex items-center px-1 py-3">
        <hr className="w-full border-t border-[var(--line)]" />
        <button
          type="button"
          aria-label="Remove divider"
          onClick={props.onRemove}
          className="absolute right-0 hidden rounded px-1 text-xs text-[var(--fg-faint)] group-hover:block hover:text-red-400"
        >
          ×
        </button>
      </div>
    );
  }

  // --------------------------------------------------------------- image
  if (block.type === "image") {
    if (!block.url) {
      return (
        <div className="my-1 rounded-lg border border-dashed border-[var(--line)] bg-[var(--bg-sunken)]/60 px-4 py-3">
          {textarea(
            "text-sm",
            "Paste an image URL, then press Enter",
          )}
        </div>
      );
    }
    return (
      <figure className="group relative my-2">
        {/* user-supplied remote URL — next/image needs a domain allowlist */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={block.url}
          alt={block.text || "Image"}
          className="max-h-[480px] rounded-lg shadow-[var(--shadow-soft)]"
        />
        <figcaption className="mt-1">
          {textarea("text-xs text-[var(--fg-muted)]", "Add a caption…")}
        </figcaption>
        <button
          type="button"
          aria-label="Remove image"
          onClick={props.onRemove}
          className="absolute top-2 right-2 hidden rounded-md bg-black/50 px-2 py-0.5 text-xs text-white group-hover:block"
        >
          Remove
        </button>
      </figure>
    );
  }

  // ---------------------------------------------------------------- code
  if (block.type === "code") {
    const lang = block.language ?? "javascript";
    const shared =
      "font-[family-name:var(--font-mono)] text-[13px] leading-relaxed whitespace-pre-wrap break-words";
    return (
      <div className="group my-2 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg-sunken)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-1.5">
          <select
            value={lang}
            onChange={(e) => props.onLanguage(e.target.value)}
            aria-label="Code language"
            className="bg-transparent text-xs text-[var(--fg-muted)] outline-none"
          >
            {CODE_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Remove code block"
            onClick={props.onRemove}
            className="hidden text-xs text-[var(--fg-faint)] group-hover:block hover:text-red-400"
          >
            ×
          </button>
        </div>
        <div className="relative">
          {/* highlighted layer behind a transparent-text textarea */}
          <pre
            aria-hidden
            className={`${shared} px-4 py-3`}
            dangerouslySetInnerHTML={{
              __html:
                (lang === "plain"
                  ? block.text
                      .replace(/&/g, "&amp;")
                      .replace(/</g, "&lt;")
                  : highlight(block.text, lang)) + "\n",
            }}
          />
          <textarea
            ref={setRefs}
            value={block.text}
            spellCheck={false}
            placeholder=""
            onChange={(e) =>
              props.onText(e.target.value, e.target.selectionStart)
            }
            onKeyDown={handleKeyDown}
            onFocus={props.onFocus}
            onBlur={props.onBlur}
            className={`${shared} absolute inset-0 h-full w-full resize-none bg-transparent px-4 py-3 text-transparent caret-[var(--fg)] outline-none`}
          />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------- toggle
  if (block.type === "toggle") {
    return (
      <div className="px-1 py-0.5">
        <div className="flex items-start gap-1">
          <button
            type="button"
            aria-label={block.collapsed ? "Expand" : "Collapse"}
            onClick={props.onToggleCollapsed}
            className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-[var(--fg-muted)] transition-transform duration-200 hover:bg-[var(--bg-sunken)] ${
              block.collapsed ? "" : "rotate-90"
            }`}
          >
            ▶
          </button>
          {textarea(TYPE_CLASS.toggle, "Toggle")}
        </div>
        {!block.collapsed && (
          <div className="ml-6 border-l border-[var(--line)] pl-3">
            <textarea
              rows={1}
              value={block.body ?? ""}
              placeholder="Hidden details…"
              onChange={(e) => {
                props.onBody(e.target.value);
                autoResize(e.currentTarget);
              }}
              ref={(el) => autoResize(el)}
              className="w-full resize-none overflow-hidden bg-transparent text-[14px] leading-relaxed text-[var(--fg-muted)] outline-none placeholder:text-[var(--fg-faint)]"
            />
          </div>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------- callout
  if (block.type === "callout") {
    return (
      <div className="my-2 flex items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--bg-sunken)] px-4 py-3">
        <span className="mt-0.5 select-none text-[var(--accent)]">✦</span>
        {textarea(TYPE_CLASS.callout, "Something worth noting…")}
      </div>
    );
  }

  // ---------------------------------------------------------------- text
  const prefix =
    block.type === "bulleted" ? (
      <span className="w-6 shrink-0 pt-[3px] text-center select-none text-[var(--fg-muted)]">
        •
      </span>
    ) : block.type === "numbered" ? (
      <span className="w-6 shrink-0 pt-[3px] text-center text-sm tabular-nums select-none text-[var(--fg-muted)]">
        {props.number}.
      </span>
    ) : block.type === "todo" ? (
      <button
        type="button"
        aria-label={block.checked ? "Mark not done" : "Mark done"}
        onClick={props.onToggleChecked}
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
    <div
      className={`group flex items-start gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-[var(--bg-sunken)]/50 ${
        block.type === "quote"
          ? "border-l-2 border-[var(--fg)] pl-4"
          : ""
      }`}
    >
      {prefix}
      {textarea(
        `${TYPE_CLASS[block.type] ?? TYPE_CLASS.paragraph} ${
          block.type === "todo" && block.checked
            ? "text-[var(--fg-faint)] line-through"
            : ""
        }`,
        props.focused
          ? block.type === "paragraph"
            ? "Write, or type “/” for blocks…"
            : "Heading"
          : "",
      )}
    </div>
  );
}
