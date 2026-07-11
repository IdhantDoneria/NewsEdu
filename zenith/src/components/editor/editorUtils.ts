// Higher-level editing helpers shared by Block / toolbar / paste handling.

export function textLen(html: string): number {
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent ?? '').length;
}

export function placeCaretAtTextOffset(el: HTMLElement, offset: number): void {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node: Text | null = null;
  while (walker.nextNode()) {
    const t = walker.currentNode as Text;
    if (remaining <= t.length) { node = t; break; }
    remaining -= t.length;
    node = t;
  }
  const range = document.createRange();
  if (node) {
    range.setStart(node, Math.min(remaining, node.length));
  } else {
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** inline markdown autoformat: **bold**, *italic*, `code`, ~~strike~~ applied as you type */
export function tryInlineFormat(el: HTMLElement): boolean {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    const text = pre.toString();
    const rules: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
      [/\*\*([^*\n]+)\*\*$/, (m) => `<b>${esc(m[1])}</b>`],
      [/(?<![*\w])\*([^*\n]+)\*$/, (m) => `<i>${esc(m[1])}</i>`],
      [/~~([^~\n]+)~~$/, (m) => `<s>${esc(m[1])}</s>`],
      [/`([^`\n]+)`$/, (m) => `<code>${esc(m[1])}</code>`],
    ];
    for (const [re, fmt] of rules) {
      const m = text.match(re);
      if (m && m[1].trim()) {
        const len = m[0].length;
        for (let i = 0; i < len; i++) (sel as any).modify('extend', 'backward', 'character');
        document.execCommand('insertHTML', false, fmt(m) + '​');
        return true;
      }
    }
  } catch { /* never break typing */ }
  return false;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const URL_RE = /^https?:\/\/[^\s]+$/i;

export function youTubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

/** keep only safe inline markup from pasted html */
export function sanitizeInlineHtml(html: string): string {
  const root = document.createElement('div');
  root.innerHTML = html;
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { out.push(esc(node.textContent ?? '')); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const open = (t: string, attrs = '') => out.push(`<${t}${attrs}>`);
    const close = (t: string) => out.push(`</${t}>`);
    const map: Record<string, string> = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', del: 's', code: 'code' };
    if (tag === 'br') { out.push('<br>'); return; }
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? '';
      open('a', ` href="${href.replace(/"/g, '&quot;')}"`);
      el.childNodes.forEach(walk);
      close('a');
      return;
    }
    const mapped = map[tag];
    if (mapped) { open(mapped); el.childNodes.forEach(walk); close(mapped); return; }
    el.childNodes.forEach(walk);
    if (['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'tr'].includes(tag)) out.push('\n');
  };
  root.childNodes.forEach(walk);
  return out.join('');
}

export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function fmtDate(ts: number | string | Date, withTime = false): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleString(undefined, opts);
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(ts);
}
