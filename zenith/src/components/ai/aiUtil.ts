// ─── Zenith AI helpers: page context, prompts, markdown → blocks ─────────────

import type { AIRequest } from '../../lib/bus';
import {
  captureUndo, createBlock, getBlock, getChildren, getPage, updateBlock,
} from '../../lib/store';
import type { Block, BlockType } from '../../lib/types';

export const SYSTEM_PROMPT =
  'You are Zenith AI, a precise writing assistant inside a personal workspace. ' +
  'Be concise, structured, markdown-formatted. No preamble.';

const CONTEXT_CAP = 6000;

// ─── text extraction ─────────────────────────────────────────────────────────

/** strip tags from inline block html via DOM */
export function plainText(html: string): string {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent ?? '';
}

function blockText(b: Block): string {
  switch (b.type) {
    case 'code': return b.html; // code blocks store raw text
    case 'math': return String(b.props.tex ?? '');
    case 'table': {
      const rows = b.props.rows as string[][] | undefined;
      return rows ? rows.map((r) => r.map(plainText).join(' | ')).join('\n') : '';
    }
    case 'divider': case 'image': case 'video': case 'embed': case 'bookmark':
    case 'childPage': case 'linkPage': case 'childDatabase': case 'toc':
      return '';
    default: return plainText(b.html);
  }
}

function mdPrefix(b: Block): string {
  switch (b.type) {
    case 'h1': return '# ';
    case 'h2': return '## ';
    case 'h3': return '### ';
    case 'bulleted': return '- ';
    case 'numbered': return '1. ';
    case 'todo': return b.props.checked ? '- [x] ' : '- [ ] ';
    case 'quote': return '> ';
    default: return '';
  }
}

/**
 * Title + flattened block text of a page (markdown-ish), capped at ~6000 chars.
 * When beforeBlockId is given, only content above that block is included.
 */
export function buildPageContext(pageId: string, beforeBlockId?: string): string {
  const page = getPage(pageId);
  const out: string[] = [];
  if (page?.title) out.push(`Page title: ${page.title}`);
  let size = out.length ? out[0].length : 0;
  let stop = false;

  const walk = (parentId: string | null) => {
    if (stop) return;
    for (const b of getChildren(pageId, parentId)) {
      if (beforeBlockId && b.id === beforeBlockId) { stop = true; return; }
      if (size > CONTEXT_CAP) { stop = true; return; }
      const text = blockText(b).trim();
      if (text) {
        const line = mdPrefix(b) + text;
        out.push(line);
        size += line.length + 1;
      }
      walk(b.id);
      if (stop) return;
    }
  };
  walk(null);

  let ctx = out.join('\n');
  if (ctx.length > CONTEXT_CAP) ctx = ctx.slice(0, CONTEXT_CAP) + '…';
  return ctx;
}

/** last non-empty prose block above blockId (or in the whole page) — for "Improve last paragraph" */
export function lastTextBlockAbove(pageId: string, blockId?: string): { id: string; text: string } | null {
  const PROSE: BlockType[] = ['paragraph', 'quote', 'callout', 'bulleted', 'numbered', 'todo'];
  let found: { id: string; text: string } | null = null;
  let stop = false;
  const walk = (parentId: string | null) => {
    if (stop) return;
    for (const b of getChildren(pageId, parentId)) {
      if (blockId && b.id === blockId) { stop = true; return; }
      if (PROSE.includes(b.type)) {
        const text = plainText(b.html).trim();
        if (text) found = { id: b.id, text };
      }
      walk(b.id);
      if (stop) return;
    }
  };
  walk(null);
  return found;
}

// ─── prompt building ─────────────────────────────────────────────────────────

/** actionId is e.g. 'improve', 'tone:Casual', 'translate:Hindi', 'custom' */
export function buildPrompt(actionId: string, req: AIRequest, custom = ''): { system: string; prompt: string } {
  const system = SYSTEM_PROMPT;
  const sel = (req.selection ?? '').trim();
  const sep = actionId.indexOf(':');
  const kind = sep >= 0 ? actionId.slice(0, sep) : actionId;
  const arg = sep >= 0 ? actionId.slice(sep + 1) : '';
  const title = getPage(req.pageId)?.title || 'Untitled';

  if (sel) {
    const base = `Selected text from the page "${title}":\n"""\n${sel}\n"""\n\n`;
    const tail = '\n\nReturn only the resulting text — no quotes around it, no commentary.';
    switch (kind) {
      case 'improve':
        return { system, prompt: base + 'Improve the writing: clearer, tighter, better flow. Keep the meaning, language and approximate length.' + tail };
      case 'fix':
        return { system, prompt: base + 'Fix all spelling, grammar and punctuation mistakes. Change nothing else.' + tail };
      case 'shorter':
        return { system, prompt: base + 'Rewrite this at roughly half the length, keeping every key point.' + tail };
      case 'longer':
        return { system, prompt: base + 'Expand this with more depth and detail — roughly twice as long, same tone and language.' + tail };
      case 'summarize':
        return { system, prompt: base + 'Summarize the selection in a few crisp sentences (or short bullets if it is list-like).' + tail };
      case 'tone':
        return { system, prompt: base + `Rewrite this in a ${arg.toLowerCase()} tone. Keep the meaning and approximate length.` + tail };
      case 'translate':
        return { system, prompt: base + `Translate this into ${arg}. Preserve meaning, tone and inline formatting.` + tail };
      case 'explain':
        return { system, prompt: base + 'Explain this simply: what it means and why it matters. A short paragraph, plus bullets only if genuinely helpful.' };
      default:
        return { system, prompt: base + (custom || kind) };
    }
  }

  const ctx = buildPageContext(req.pageId, kind === 'continue' ? req.blockId : undefined);
  const base = ctx
    ? `Page content (markdown-ish):\n"""\n${ctx}\n"""\n\n`
    : `The page "${title}" is currently empty.\n\n`;
  switch (kind) {
    case 'continue':
      return { system, prompt: base + 'Continue writing from exactly where the content ends. Match the voice, language and topic. Write only the next passage — never repeat existing text.' };
    case 'summarize-page':
      return { system, prompt: base + 'Summarize this page: 2–3 sentences of essence, then the key points as a short bulleted list.' };
    case 'improve-last': {
      const last = lastTextBlockAbove(req.pageId, req.blockId);
      return {
        system,
        prompt: `From the page "${title}", improve the following paragraph — clearer, tighter, better flow; keep the meaning and approximate length:\n"""\n${last?.text ?? ''}\n"""\n\nReturn only the improved paragraph.`,
      };
    }
    case 'brainstorm':
      return { system, prompt: base + 'Brainstorm 8–12 sharp, varied ideas related to this page, as a bulleted list — each idea a few words plus a short rationale.' };
    case 'outline':
      return { system, prompt: base + 'Create a well-structured outline for this page: "## " section headings, each with 2–4 concise bullets.' };
    case 'actions':
      return { system, prompt: base + 'Extract every action item, commitment or follow-up as a markdown todo list ("- [ ] item"). If none exist, propose sensible next steps the same way.' };
    case 'tasks':
      return { system, prompt: base + (custom || 'Look at this page and use the connected apps to help with whatever needs doing — send a message, create an event, file an issue, add a task, whichever fits best.') };
    default:
      return { system, prompt: base + (custom || kind) };
  }
}

// ─── markdown → blocks ───────────────────────────────────────────────────────

export interface ParsedBlock { type: BlockType; html: string; props: Record<string, any> }

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** escape HTML, then **bold** `code` *italic* → <b>/<code>/<i> */
export function inlineMd(s: string): string {
  return escapeHtml(s)
    .split(/(`[^`\n]+`)/g)
    .map((part) => {
      if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
        return `<code>${part.slice(1, -1)}</code>`;
      }
      return part
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, '<i>$1</i>');
    })
    .join('');
}

export function parseMarkdownBlocks(md: string): ParsedBlock[] {
  const out: ParsedBlock[] = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const fence = lines[i].match(/^\s*```([\w+#-]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++; // skip closing fence
      out.push({ type: 'code', html: code.join('\n'), props: { language: fence[1] || 'plaintext' } });
      continue;
    }
    const t = lines[i].trim();
    i++;
    if (!t) continue; // skip blank lines
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(#{1,3})\s+(.+)$/))) {
      out.push({ type: `h${m[1].length}` as BlockType, html: inlineMd(m[2]), props: {} });
    } else if ((m = t.match(/^#{4,6}\s+(.+)$/))) {
      out.push({ type: 'h3', html: inlineMd(m[1]), props: {} });
    } else if ((m = t.match(/^[-*]\s+\[( |x|X)\]\s+(.+)$/))) {
      out.push({ type: 'todo', html: inlineMd(m[2]), props: { checked: m[1].toLowerCase() === 'x' } });
    } else if ((m = t.match(/^[-*•]\s+(.+)$/))) {
      out.push({ type: 'bulleted', html: inlineMd(m[1]), props: {} });
    } else if ((m = t.match(/^\d+[.)]\s+(.+)$/))) {
      out.push({ type: 'numbered', html: inlineMd(m[1]), props: {} });
    } else if ((m = t.match(/^>\s?(.*)$/))) {
      out.push({ type: 'quote', html: inlineMd(m[1]), props: {} });
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      out.push({ type: 'divider', html: '', props: {} });
    } else {
      out.push({ type: 'paragraph', html: inlineMd(t), props: {} });
    }
  }
  return out;
}

/** strip a single wrapping ``` fence, if the whole result is fenced */
function stripFences(s: string): string {
  const m = s.trim().match(/^```[\w+#-]*\n([\s\S]*?)\n?```$/);
  return m ? m[1] : s.trim();
}

/** flatten an AI result to inline html (for in-place selection replacement) */
function inlineFromResult(result: string): string {
  const lines = stripFences(result)
    .split('\n')
    .map((l) => l.trim().replace(/^(?:#{1,6}|>|[-*•]|\d+[.)])\s+/, '').replace(/^\[(?: |x|X)\]\s*/, ''))
    .filter(Boolean);
  return lines.map(inlineMd).join('<br>');
}

// ─── applying results to the document ────────────────────────────────────────

/**
 * Parse the result into blocks and insert them after `afterBlockId`
 * (or append at the end of the page when absent). Returns inserted count.
 */
export function insertBlocksBelow(pageId: string, afterBlockId: string | undefined, result: string): number {
  const parsed = parseMarkdownBlocks(result.trim());
  if (!parsed.length) return 0;
  const anchor = afterBlockId ? getBlock(afterBlockId) : undefined;
  const parentId = anchor ? anchor.parentId : null;
  captureUndo(pageId, 'ai', false);
  let prev: string | undefined = anchor?.id;
  for (const p of parsed) {
    prev = createBlock(pageId, { parentId, after: prev, type: p.type, html: p.html, props: p.props });
  }
  return parsed.length;
}

/** Replace a block's content with the parsed result (extra blocks go after it). */
export function replaceBlockWith(pageId: string, blockId: string, result: string): boolean {
  const block = getBlock(blockId);
  if (!block) return false;
  const parsed = parseMarkdownBlocks(result.trim());
  if (!parsed.length) return false;
  captureUndo(pageId, 'ai', false);
  const [first, ...rest] = parsed;
  updateBlock(blockId, { type: first.type, html: first.html, props: first.props });
  let prev = blockId;
  for (const p of rest) {
    prev = createBlock(pageId, { parentId: block.parentId, after: prev, type: p.type, html: p.html, props: p.props });
  }
  return true;
}

/**
 * Swap the selected substring inside the source block's html with the result.
 * Locates the selection in the block's textContent and splices the DOM range.
 * Returns false when it can't be matched — caller should fall back gracefully.
 */
export function replaceSelectionIn(
  pageId: string,
  blockId: string | undefined,
  selection: string,
  result: string,
): boolean {
  if (!blockId || !selection) return false;
  const block = getBlock(blockId);
  if (!block || typeof block.html !== 'string') return false;

  // code blocks store raw text — plain splice
  if (block.type === 'code') {
    const idx = block.html.indexOf(selection);
    if (idx < 0) return false;
    captureUndo(pageId, 'ai', false);
    updateBlock(blockId, {
      html: block.html.slice(0, idx) + stripFences(result) + block.html.slice(idx + selection.length),
    });
    return true;
  }

  const root = document.createElement('div');
  root.innerHTML = block.html;
  const total = root.textContent ?? '';
  const idx = total.indexOf(selection);
  if (idx < 0) return false;

  const locate = (offset: number): { node: Text; off: number } | null => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let run = 0;
    while (walker.nextNode()) {
      const t = walker.currentNode as Text;
      if (offset <= run + t.length) return { node: t, off: offset - run };
      run += t.length;
    }
    return null;
  };
  const start = locate(idx);
  const end = locate(idx + selection.length);
  if (!start || !end) return false;

  try {
    const range = document.createRange();
    range.setStart(start.node, start.off);
    range.setEnd(end.node, end.off);
    range.deleteContents();
    const tmp = document.createElement('span');
    tmp.innerHTML = inlineFromResult(result);
    for (const n of Array.from(tmp.childNodes).reverse()) range.insertNode(n);
    root.normalize();
  } catch {
    return false;
  }
  captureUndo(pageId, 'ai', false);
  updateBlock(blockId, { html: root.innerHTML });
  return true;
}

/** block types whose html is editable text (eligible for "Replace block") */
export const TEXTY_TYPES: readonly BlockType[] = [
  'paragraph', 'h1', 'h2', 'h3', 'bulleted', 'numbered', 'todo', 'toggle', 'quote', 'callout', 'code',
];
