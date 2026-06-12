// Caret / selection utilities for the contenteditable block editor.

export function isCaretAtStart(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length === 0;
}

export function isCaretAtEnd(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const post = range.cloneRange();
  post.selectNodeContents(el);
  post.setStart(range.endContainer, range.endOffset);
  return post.toString().length === 0;
}

export function placeCaretAtStart(el: HTMLElement): void {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function placeCaretAtEnd(el: HTMLElement): void {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** split element content at caret; returns [beforeHTML, afterHTML] */
export function splitAtCaret(el: HTMLElement): [string, string] {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return [el.innerHTML, ''];
  const range = sel.getRangeAt(0);
  const before = document.createRange();
  before.selectNodeContents(el);
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.selectNodeContents(el);
  after.setStart(range.endContainer, range.endOffset);
  const beforeFrag = before.cloneContents();
  const afterFrag = after.cloneContents();
  const a = document.createElement('div');
  a.appendChild(beforeFrag);
  const b = document.createElement('div');
  b.appendChild(afterFrag);
  return [a.innerHTML, b.innerHTML];
}

export function getCaretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  let rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    // empty element: use container element rect
    const node = range.startContainer;
    const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    if (el) rect = el.getBoundingClientRect();
  }
  return rect;
}

/** plain text before the caret inside el (used for markdown shortcuts + slash) */
export function textBeforeCaret(el: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString();
}

/** delete N chars immediately before caret (for stripping md tokens like "# ") */
export function deleteBeforeCaret(n: number): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return;
  for (let i = 0; i < n; i++) {
    (sel as any).modify?.('extend', 'backward', 'character');
  }
  document.execCommand('delete');
}

export function selectionInsideEditor(): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const node = sel.getRangeAt(0).commonAncestorContainer;
  const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  return !!el?.closest('[data-rich-text]');
}
