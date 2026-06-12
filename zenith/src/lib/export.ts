import { db } from './db';
import { uid } from './id';
import { orderBetween } from './order';
import {
  createBlock, createPage, getChildren, getPage, getPageList, getRows, updateBlock,
} from './store';
import type { Block, PageDoc } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Export: page → Markdown / HTML, workspace → JSON. Import: Markdown / JSON.
// ─────────────────────────────────────────────────────────────────────────────

function htmlToText(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent ?? '';
}

function htmlToMd(html: string): string {
  let s = html;
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<(b|strong)>(.*?)<\/\1>/gi, '**$2**');
  s = s.replace(/<(i|em)>(.*?)<\/\1>/gi, '*$2*');
  s = s.replace(/<(s|strike|del)>(.*?)<\/\1>/gi, '~~$2~~');
  s = s.replace(/<code>(.*?)<\/code>/gi, '`$1`');
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  s = s.replace(/<u>(.*?)<\/u>/gi, '$1');
  s = s.replace(/<[^>]+>/g, '');
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}

function blockToMd(b: Block, depth: number, listIndex?: number): string {
  const pad = '  '.repeat(depth);
  const text = htmlToMd(b.html);
  switch (b.type) {
    case 'h1': return `# ${text}`;
    case 'h2': return `## ${text}`;
    case 'h3': return `### ${text}`;
    case 'bulleted': return `${pad}- ${text}`;
    case 'numbered': return `${pad}${listIndex ?? 1}. ${text}`;
    case 'todo': return `${pad}- [${b.props.checked ? 'x' : ' '}] ${text}`;
    case 'toggle': return `${pad}- ${text}`;
    case 'quote': return `> ${text}`;
    case 'callout': return `> ${b.props.icon ?? '💡'} ${text}`;
    case 'divider': return `---`;
    case 'code': return '```' + (b.props.language ?? '') + '\n' + htmlToText(b.html) + '\n```';
    case 'image': return `![${b.props.caption ?? ''}](${(b.props.src ?? '').slice(0, 200000)})`;
    case 'bookmark': case 'embed': case 'video': return `[${b.props.caption || b.props.url}](${b.props.url})`;
    case 'math': return `$$\n${b.props.tex ?? ''}\n$$`;
    case 'table': {
      const rows: string[][] = b.props.rows ?? [];
      if (!rows.length) return '';
      const md = rows.map((r) => `| ${r.map(htmlToMd).join(' | ')} |`);
      md.splice(1, 0, `| ${rows[0].map(() => '---').join(' | ')} |`);
      return md.join('\n');
    }
    case 'childPage': case 'linkPage': {
      const p = b.props.pageId ? getPage(b.props.pageId) : null;
      return `📄 **${p?.title ?? 'Untitled'}**`;
    }
    case 'childDatabase': {
      const p = b.props.pageId ? getPage(b.props.pageId) : null;
      return `🗂 **${p?.title ?? 'Database'}**`;
    }
    case 'toc': return '*Table of contents*';
    default: return text;
  }
}

export function exportPageMarkdown(pageId: string): string {
  const page = getPage(pageId);
  if (!page) return '';
  const lines: string[] = [`# ${page.icon ? page.icon + ' ' : ''}${page.title || 'Untitled'}`, ''];
  let numIdx = 0;
  const walk = (parentId: string | null, depth: number) => {
    for (const b of getChildren(pageId, parentId)) {
      if (b.type === 'numbered') numIdx++; else numIdx = 0;
      if (b.type === 'columns' || b.type === 'column') { walk(b.id, depth); continue; }
      lines.push(blockToMd(b, depth, numIdx || undefined));
      if (!['bulleted', 'numbered', 'todo', 'toggle'].includes(b.type)) lines.push('');
      walk(b.id, depth + 1);
    }
  };
  walk(null, 0);
  if (page.type === 'database') {
    const schema = page.dbSchema;
    const rows = getRows(pageId);
    if (schema) {
      const props = schema.properties;
      lines.push(`| ${props.map((p) => p.name).join(' | ')} |`);
      lines.push(`| ${props.map(() => '---').join(' | ')} |`);
      for (const r of rows) {
        lines.push(`| ${props.map((p) => {
          if (p.type === 'title') return r.title;
          const v = r.rowProps?.[p.id];
          if (v == null) return '';
          if (Array.isArray(v)) return v.join(', ');
          return String(v);
        }).join(' | ')} |`);
      }
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function exportPageHTML(pageId: string): string {
  const page = getPage(pageId);
  if (!page) return '';
  const parts: string[] = [];
  const walk = (parentId: string | null) => {
    const children = getChildren(pageId, parentId);
    let listBuf: string[] = [];
    let listTag = '';
    const flush = () => {
      if (listBuf.length) parts.push(`<${listTag}>` + listBuf.join('') + `</${listTag}>`);
      listBuf = []; listTag = '';
    };
    for (const b of children) {
      const tag = b.type === 'bulleted' ? 'ul' : b.type === 'numbered' ? 'ol' : '';
      if (tag) {
        if (listTag && listTag !== tag) flush();
        listTag = tag;
        listBuf.push(`<li>${b.html}</li>`);
        continue;
      }
      flush();
      switch (b.type) {
        case 'h1': parts.push(`<h1>${b.html}</h1>`); break;
        case 'h2': parts.push(`<h2>${b.html}</h2>`); break;
        case 'h3': parts.push(`<h3>${b.html}</h3>`); break;
        case 'todo': parts.push(`<p>${b.props.checked ? '☑' : '☐'} ${b.html}</p>`); break;
        case 'quote': parts.push(`<blockquote>${b.html}</blockquote>`); break;
        case 'callout': parts.push(`<div style="background:#f4f1ea;border-radius:8px;padding:12px 16px">${b.props.icon ?? '💡'} ${b.html}</div>`); break;
        case 'divider': parts.push('<hr/>'); break;
        case 'code': parts.push(`<pre><code>${b.html}</code></pre>`); break;
        case 'image': parts.push(`<img src="${b.props.src ?? ''}" style="max-width:100%"/>`); break;
        case 'bookmark': case 'embed': case 'video': parts.push(`<p><a href="${b.props.url}">${b.props.url}</a></p>`); break;
        case 'math': parts.push(`<pre>${b.props.tex ?? ''}</pre>`); break;
        case 'table': {
          const rows: string[][] = b.props.rows ?? [];
          parts.push('<table border="1" cellspacing="0" cellpadding="6">' +
            rows.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') + '</table>');
          break;
        }
        default: parts.push(`<p>${b.html}</p>`);
      }
      walk(b.id);
    }
    flush();
  };
  walk(null);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${page.title || 'Untitled'}</title>
<style>body{font-family:-apple-system,Segoe UI,sans-serif;max-width:720px;margin:48px auto;padding:0 24px;color:#2f2c26;line-height:1.6}h1,h2,h3{line-height:1.25}blockquote{border-left:3px solid #2f2c26;margin:0;padding-left:16px}pre{background:#f6f5f2;padding:14px;border-radius:8px;overflow:auto}</style>
</head><body><h1>${page.icon ? page.icon + ' ' : ''}${page.title || 'Untitled'}</h1>${parts.join('\n')}</body></html>`;
}

// ─── workspace JSON ──────────────────────────────────────────────────────────

export async function exportWorkspaceJSON(): Promise<string> {
  const [pages, blocks, comments] = await Promise.all([
    db.pages.toArray(), db.blocks.toArray(), db.comments.toArray(),
  ]);
  return JSON.stringify({ app: 'zenith', version: 1, exportedAt: Date.now(), pages, blocks, comments }, null, 2);
}

export async function importWorkspaceJSON(json: string, mode: 'merge' | 'replace' = 'merge'): Promise<number> {
  const data = JSON.parse(json);
  if (data.app !== 'zenith' || !Array.isArray(data.pages)) throw new Error('Not a Zenith backup file');
  if (mode === 'replace') {
    await Promise.all([db.pages.clear(), db.blocks.clear(), db.comments.clear()]);
  }
  await db.pages.bulkPut(data.pages);
  await db.blocks.bulkPut(data.blocks ?? []);
  await db.comments.bulkPut(data.comments ?? []);
  location.reload();
  return data.pages.length;
}

// ─── markdown import ─────────────────────────────────────────────────────────

function mdInline(s: string): string {
  let out = s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  return out;
}

export function importMarkdown(name: string, md: string, parentId: string | null): string {
  const title = name.replace(/\.(md|markdown|txt)$/i, '');
  const pageId = createPage({ parentId, title, empty: true });
  const lines = md.split(/\r?\n/);
  let i = 0;
  // skip leading H1 if it matches a title-like first line
  if (lines[0]?.startsWith('# ')) { i = 1; }
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
      i++;
      createBlock(pageId, { type: 'code', html: buf.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;'), props: { language: lang || 'plaintext' } });
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      createBlock(pageId, { type: (`h${m[1].length}`) as any, html: mdInline(m[2]) });
    } else if ((m = line.match(/^\s*-\s+\[( |x|X)\]\s+(.*)$/))) {
      createBlock(pageId, { type: 'todo', html: mdInline(m[2]), props: { checked: m[1].toLowerCase() === 'x' } });
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      createBlock(pageId, { type: 'bulleted', html: mdInline(m[1]) });
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      createBlock(pageId, { type: 'numbered', html: mdInline(m[1]) });
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      createBlock(pageId, { type: 'quote', html: mdInline(m[1]) });
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      createBlock(pageId, { type: 'divider' });
    } else if ((m = line.match(/^!\[(.*?)\]\((.+?)\)$/))) {
      createBlock(pageId, { type: 'image', props: { src: m[2], caption: m[1] } });
    } else {
      createBlock(pageId, { type: 'paragraph', html: mdInline(line) });
    }
    i++;
  }
  return pageId;
}

// ─── download helper ─────────────────────────────────────────────────────────

export function downloadFile(name: string, content: string, type = 'text/plain'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFileName(s: string): string {
  return (s || 'Untitled').replace(/[^\w\d-_ ]+/g, '').slice(0, 60).trim() || 'Untitled';
}
