"use client";

import { useEffect, useRef, useState } from "react";
import { Block, BlockType, makeBlock, Page } from "@/lib/model";
import { setBlocks } from "@/lib/store";
import BlockRow from "./BlockRow";

export interface FocusRequest {
  id: string;
  pos: number;
}

const LIST_TYPES: BlockType[] = ["bulleted", "numbered", "todo"];

interface SlashItem {
  label: string;
  hint: string;
  keywords: string;
  type: BlockType;
  extra?: Partial<Block>;
}

const SLASH_ITEMS: SlashItem[] = [
  { label: "Text", hint: "Plain paragraph", keywords: "text paragraph plain", type: "paragraph" },
  { label: "Heading 1", hint: "Large section heading", keywords: "heading h1 title", type: "h1" },
  { label: "Heading 2", hint: "Medium section heading", keywords: "heading h2 subtitle", type: "h2" },
  { label: "Heading 3", hint: "Small section heading", keywords: "heading h3", type: "h3" },
  { label: "Bulleted list", hint: "Simple bullet points", keywords: "bullet list ul", type: "bulleted" },
  { label: "Numbered list", hint: "An ordered list", keywords: "number ordered list ol", type: "numbered" },
  { label: "To-do", hint: "Track tasks with a checkbox", keywords: "todo task check checkbox", type: "todo" },
  { label: "Toggle", hint: "Collapsible details", keywords: "toggle collapse details", type: "toggle", extra: { collapsed: false } },
  { label: "Callout", hint: "Make it stand out", keywords: "callout note highlight", type: "callout" },
  { label: "Quote", hint: "Set apart a citation", keywords: "quote blockquote citation", type: "quote" },
  { label: "Code", hint: "Snippet with highlighting", keywords: "code snippet programming", type: "code", extra: { language: "javascript" } },
  { label: "Divider", hint: "A thin horizontal rule", keywords: "divider rule hr separator line", type: "divider" },
  { label: "Image", hint: "Embed an image by URL", keywords: "image picture photo embed", type: "image", extra: { url: "" } },
];

// Markdown prefixes typed at the start of a block convert its type.
const MD_TRIGGERS: Array<[RegExp, BlockType]> = [
  [/^###\s$/, "h3"],
  [/^##\s$/, "h2"],
  [/^#\s$/, "h1"],
  [/^[-*]\s$/, "bulleted"],
  [/^1[.)]\s$/, "numbered"],
  [/^\[\s?\]\s$/, "todo"],
  [/^>>\s$/, "toggle"],
  [/^>\s$/, "quote"],
  [/^::\s$/, "callout"],
];

export default function Editor({ page }: { page: Page }) {
  const blocks = page.blocks;
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<FocusRequest | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);

  // slash menu state: open when the focused paragraph is exactly "/query"
  const focusedBlock = blocks.find((b) => b.id === focusedId);
  const slashMatch =
    !menuDismissed &&
    focusedBlock?.type === "paragraph" &&
    /^\/\S*$/.test(focusedBlock.text)
      ? focusedBlock
      : undefined;
  const slashQuery = slashMatch ? slashMatch.text.slice(1).toLowerCase() : "";
  const slashItems = slashMatch
    ? SLASH_ITEMS.filter(
        (it) =>
          it.label.toLowerCase().includes(slashQuery) ||
          it.keywords.includes(slashQuery),
      )
    : [];
  const slashOpen = slashItems.length > 0;
  const slashSelected = Math.min(menuIndex, slashItems.length - 1);

  useEffect(() => {
    setMenuIndex(0);
  }, [slashQuery]);

  useEffect(() => {
    const req = pendingFocus.current;
    if (!req) return;
    const el = refs.current.get(req.id);
    if (el) {
      el.focus();
      const pos = Math.min(req.pos, el.value.length);
      el.setSelectionRange(pos, pos);
    }
    pendingFocus.current = null;
  }, [blocks]);

  const commit = (next: Block[], focus?: FocusRequest) => {
    if (focus) pendingFocus.current = focus;
    setBlocks(page.id, next);
  };

  const update = (id: string, patch: Partial<Block>) => {
    commit(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const convertTo = (index: number, type: BlockType, extra: Partial<Block> = {}) => {
    const block = blocks[index];
    if (type === "divider") {
      // a divider is not editable — drop a fresh paragraph in after it
      const fresh = makeBlock();
      const next = [...blocks];
      next[index] = { ...block, type, text: "" };
      next.splice(index + 1, 0, fresh);
      commit(next, { id: fresh.id, pos: 0 });
      return;
    }
    commit(
      blocks.map((b, i) =>
        i === index ? { ...b, type, text: "", ...extra } : b,
      ),
      { id: block.id, pos: 0 },
    );
  };

  const handleText = (index: number, value: string, caret: number) => {
    const block = blocks[index];
    // markdown shortcut: only when the caret sits right after the trigger
    if (block.type === "paragraph" && caret === value.length) {
      if (value === "```") {
        convertTo(index, "code", { language: "javascript" });
        return;
      }
      if (value === "---") {
        convertTo(index, "divider");
        return;
      }
      if (value === "![]") {
        convertTo(index, "image", { url: "" });
        return;
      }
      for (const [re, type] of MD_TRIGGERS) {
        if (re.test(value)) {
          convertTo(index, type, type === "toggle" ? { collapsed: false } : {});
          return;
        }
      }
    }
    if (menuDismissed && !/^\/\S*$/.test(value)) setMenuDismissed(false);
    update(block.id, { text: value });
  };

  const applySlash = (item: SlashItem) => {
    if (!slashMatch) return;
    const index = blocks.findIndex((b) => b.id === slashMatch.id);
    if (index === -1) return;
    convertTo(index, item.type, item.extra ?? {});
  };

  const splitAt = (index: number, caret: number) => {
    const block = blocks[index];
    // Enter on an empty list item exits the list instead of continuing it.
    if (LIST_TYPES.includes(block.type) && block.text.length === 0) {
      commit(
        blocks.map((b, i) => (i === index ? { ...b, type: "paragraph" } : b)),
        { id: block.id, pos: 0 },
      );
      return;
    }
    const before = block.text.slice(0, caret);
    const after = block.text.slice(caret);
    const nextType: BlockType = LIST_TYPES.includes(block.type)
      ? block.type
      : "paragraph";
    const fresh = makeBlock(nextType, after);
    if (nextType === "todo") fresh.checked = false;
    const next = [...blocks];
    next[index] = { ...block, text: before };
    next.splice(index + 1, 0, fresh);
    commit(next, { id: fresh.id, pos: 0 });
  };

  const mergeIntoPrevious = (index: number) => {
    const block = blocks[index];
    // first demote non-paragraph blocks instead of deleting them
    if (block.type !== "paragraph") {
      commit(
        blocks.map((b, i) => (i === index ? { ...b, type: "paragraph" } : b)),
        { id: block.id, pos: 0 },
      );
      return;
    }
    if (index === 0) return;
    const prev = blocks[index - 1];
    // backspacing into a divider removes the divider instead of merging
    if (prev.type === "divider") {
      const next = [...blocks];
      next.splice(index - 1, 1);
      commit(next, { id: block.id, pos: 0 });
      return;
    }
    if (prev.type === "image" || prev.type === "code") {
      // don't merge text into media/code — just move the caret there
      focusNeighbor(index, -1, "end");
      return;
    }
    const junction = prev.text.length;
    const next = [...blocks];
    next[index - 1] = { ...prev, text: prev.text + block.text };
    next.splice(index, 1);
    commit(next, { id: prev.id, pos: junction });
  };

  const removeBlock = (index: number) => {
    const next = blocks.filter((_, i) => i !== index);
    if (next.length === 0) {
      const fresh = makeBlock();
      commit([fresh], { id: fresh.id, pos: 0 });
      return;
    }
    const neighbor = next[Math.max(0, index - 1)];
    commit(next, { id: neighbor.id, pos: 0 });
  };

  // walk past blocks that have no focusable text area (e.g. dividers)
  const focusNeighbor = (index: number, dir: -1 | 1, pos: "start" | "end") => {
    let j = index + dir;
    while (j >= 0 && j < blocks.length) {
      const el = refs.current.get(blocks[j].id);
      if (el) {
        el.focus();
        const p = pos === "start" ? 0 : el.value.length;
        el.setSelectionRange(p, p);
        return true;
      }
      j += dir;
    }
    return false;
  };

  // sequence numbers for numbered lists, reset by any other block type
  const numbering: number[] = [];
  let run = 0;
  for (const b of blocks) {
    run = b.type === "numbered" ? run + 1 : 0;
    numbering.push(run);
  }

  return (
    <div className="pb-32">
      {blocks.map((block, i) => {
        const isSlashHost = slashOpen && slashMatch?.id === block.id;
        return (
          <div key={block.id} className="relative">
            <BlockRow
              block={block}
              number={numbering[i]}
              focused={focusedId === block.id}
              slashActive={isSlashHost}
              onSlashMove={(dir) =>
                setMenuIndex(
                  (m) => (m + dir + slashItems.length) % slashItems.length,
                )
              }
              onSlashApply={() => applySlash(slashItems[slashSelected])}
              onSlashClose={() => setMenuDismissed(true)}
              registerRef={(el) => {
                if (el) refs.current.set(block.id, el);
                else refs.current.delete(block.id);
              }}
              onFocus={() => {
                setFocusedId(block.id);
                setMenuDismissed(false);
              }}
              onBlur={() => setFocusedId((f) => (f === block.id ? null : f))}
              onText={(value, caret) => handleText(i, value, caret)}
              onEnter={(caret) => splitAt(i, caret)}
              onBackspaceAtStart={() => mergeIntoPrevious(i)}
              onArrow={(dir) =>
                focusNeighbor(i, dir, dir === -1 ? "end" : "start")
              }
              onToggleChecked={() =>
                update(block.id, { checked: !block.checked })
              }
              onToggleCollapsed={() =>
                update(block.id, { collapsed: !block.collapsed })
              }
              onBody={(body) => update(block.id, { body })}
              onLanguage={(language) => update(block.id, { language })}
              onSetImage={(url) => update(block.id, { url, text: "" })}
              onRemove={() => removeBlock(i)}
            />
            {isSlashHost && (
              <div className="absolute top-full left-6 z-30 max-h-72 w-72 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] py-1.5 shadow-[var(--shadow-soft)]">
                {slashItems.map((item, idx) => (
                  <button
                    key={item.label}
                    type="button"
                    // mousedown so the textarea doesn't blur first
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applySlash(item);
                    }}
                    onMouseEnter={() => setMenuIndex(idx)}
                    className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                      idx === slashSelected
                        ? "bg-[var(--bg-sunken)] text-[var(--fg)]"
                        : "text-[var(--fg-muted)]"
                    }`}
                  >
                    <span className="flex-1">{item.label}</span>
                    <span className="text-xs text-[var(--fg-faint)]">
                      {item.hint}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div
        className="h-24 cursor-text"
        onClick={() => {
          const last = blocks[blocks.length - 1];
          if (last && last.type === "paragraph" && !last.text) {
            const el = refs.current.get(last.id);
            el?.focus();
            return;
          }
          const fresh = makeBlock();
          commit([...blocks, fresh], { id: fresh.id, pos: 0 });
        }}
      />
    </div>
  );
}
