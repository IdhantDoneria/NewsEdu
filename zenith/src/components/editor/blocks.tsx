import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import plaintext from 'highlight.js/lib/languages/plaintext';
import 'highlight.js/styles/atom-one-dark.css';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useRef, useState } from 'react';
import { getCaretRect } from '../../lib/caret';
import { captureUndo, createBlock, deleteBlock, getChildren, updateBlock, useStore } from '../../lib/store';
import type { Block as BlockDoc } from '../../lib/types';
import { Popover } from '../ui/Popover';
import { useEditor } from './ctx';
import { fileToDataURL, URL_RE, youTubeEmbed } from './editorUtils';

const LANGS = ['plaintext', 'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'json', 'html', 'css', 'bash', 'sql', 'markdown', 'yaml', 'php', 'ruby', 'swift', 'kotlin'];
hljs.registerLanguage('javascript', javascript); hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python); hljs.registerLanguage('java', java);
hljs.registerLanguage('c', c); hljs.registerLanguage('cpp', cpp); hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('go', go); hljs.registerLanguage('rust', rust); hljs.registerLanguage('json', json);
hljs.registerLanguage('html', xml); hljs.registerLanguage('css', css); hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sql', sql); hljs.registerLanguage('markdown', markdown); hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('php', php); hljs.registerLanguage('ruby', ruby); hljs.registerLanguage('swift', swift);
hljs.registerLanguage('kotlin', kotlin); hljs.registerLanguage('plaintext', plaintext);

// ─── Code ────────────────────────────────────────────────────────────────────

export function CodeBlock({ block }: { block: BlockDoc }) {
  const ctx = useEditor();
  const [langMenu, setLangMenu] = useState<{ x: number; y: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const code = block.html;
  const lang = block.props.language ?? 'plaintext';
  let highlighted = '';
  try {
    highlighted = hljs.highlight(code || ' ', { language: LANGS.includes(lang) ? lang : 'plaintext' }).value;
  } catch {
    highlighted = code.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  return (
    <div className="code-block" contentEditable={false}>
      <div className="code-head">
        <button className="code-lang" onClick={(e) => setLangMenu({ x: e.clientX, y: e.clientY + 10 })}>
          {lang}
        </button>
        <button
          className="code-lang"
          onClick={() => { navigator.clipboard.writeText(code); }}
        >
          Copy
        </button>
      </div>
      <div className="code-area" style={{ minHeight: 60 }}>
        <pre aria-hidden><code dangerouslySetInnerHTML={{ __html: highlighted + '\n' }} /></pre>
        <textarea
          ref={taRef}
          value={code}
          spellCheck={false}
          readOnly={ctx.readOnly}
          onChange={(e) => {
            captureUndo(ctx.pageId, 'code');
            updateBlock(block.id, { html: e.target.value }, { silent: false });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const ta = e.currentTarget;
              const { selectionStart: s, selectionEnd: en, value } = ta;
              ta.value = value.slice(0, s) + '  ' + value.slice(en);
              ta.selectionStart = ta.selectionEnd = s + 2;
              updateBlock(block.id, { html: ta.value });
            }
            if (e.key === 'Backspace' && code === '') {
              e.preventDefault();
              captureUndo(ctx.pageId, 'del', false);
              updateBlock(block.id, { type: 'paragraph', html: '' });
              ctx.focusBlock(block.id, 'start');
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              const nid = createBlock(ctx.pageId, { parentId: block.parentId, after: block.id });
              ctx.focusBlock(nid, 'start');
            }
            e.stopPropagation();
          }}
        />
      </div>
      {langMenu && (
        <Popover anchor={langMenu} onClose={() => setLangMenu(null)} width={180}>
          <div className="menu">
            {LANGS.map((l) => (
              <button key={l} className="menu-item" onClick={() => { updateBlock(block.id, { props: { language: l } }); setLangMenu(null); }}>
                <span className="mi-label">{l}</span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

// ─── Image ───────────────────────────────────────────────────────────────────

const WIDTHS = ['s', 'm', 'l', 'full'] as const;

export function ImageBlock({ block }: { block: BlockDoc }) {
  const ctx = useEditor();
  const [urlOpen, setUrlOpen] = useState<{ x: number; y: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const src = block.props.src as string | undefined;
  const width = (block.props.width as string) ?? 'l';

  if (!src) {
    return (
      <div contentEditable={false}>
        <div className="media-placeholder" onClick={(e) => setUrlOpen({ x: e.clientX - 80, y: e.clientY + 12 })}>
          🖼️&nbsp; Add an image — upload or paste a link
        </div>
        <input
          ref={fileRef} type="file" accept="image/*" hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) updateBlock(block.id, { props: { src: await fileToDataURL(f) } });
          }}
        />
        {urlOpen && (
          <MediaUrlPopover
            anchor={urlOpen}
            onClose={() => setUrlOpen(null)}
            placeholder="Paste an image URL…"
            actionLabel="Embed image"
            onSubmit={(url) => updateBlock(block.id, { props: { src: url } })}
            onUpload={() => fileRef.current?.click()}
          />
        )}
      </div>
    );
  }

  return (
    <div contentEditable={false}>
      <figure className={`media-figure w-${width}`} style={{ margin: 0 }}>
        <img src={src} alt={block.props.caption ?? ''} />
        <div className="media-toolbar">
          <button onClick={() => {
            const i = WIDTHS.indexOf(width as any);
            updateBlock(block.id, { props: { width: WIDTHS[(i + 1) % WIDTHS.length] } });
          }}>↔ {width}</button>
          <button onClick={() => { captureUndo(ctx.pageId, 'del', false); deleteBlock(block.id); }}>✕</button>
        </div>
        <div
          className="media-caption"
          contentEditable={!ctx.readOnly}
          suppressContentEditableWarning
          onBlur={(e) => updateBlock(block.id, { props: { caption: e.currentTarget.textContent ?? '' } }, { silent: true })}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {block.props.caption ?? ''}
        </div>
      </figure>
    </div>
  );
}

// ─── Bookmark / Video / Embed ────────────────────────────────────────────────

function MediaUrlPopover({ anchor, onClose, onSubmit, placeholder, actionLabel, onUpload }: {
  anchor: { x: number; y: number };
  onClose: () => void;
  onSubmit: (url: string) => void;
  placeholder: string;
  actionLabel: string;
  onUpload?: () => void;
}) {
  const [val, setVal] = useState('');
  return (
    <Popover anchor={anchor} onClose={onClose} width={340} autoFocus>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          className="text-input" placeholder={placeholder} value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && val.trim()) { onSubmit(val.trim()); onClose(); } }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary small" disabled={!URL_RE.test(val.trim())} onClick={() => { onSubmit(val.trim()); onClose(); }}>
            {actionLabel}
          </button>
          {onUpload && <button className="btn small" onClick={() => { onUpload(); onClose(); }}>Upload file</button>}
        </div>
      </div>
    </Popover>
  );
}

export function BookmarkBlock({ block }: { block: BlockDoc }) {
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null);
  const url = block.props.url as string | undefined;
  if (!url) {
    return (
      <div contentEditable={false}>
        <div className="media-placeholder" onClick={(e) => setOpen({ x: e.clientX - 80, y: e.clientY + 12 })}>
          🔖&nbsp; Add a web bookmark
        </div>
        {open && (
          <MediaUrlPopover anchor={open} onClose={() => setOpen(null)} placeholder="https://…"
            actionLabel="Create bookmark" onSubmit={(u) => updateBlock(block.id, { props: { url: u } })} />
        )}
      </div>
    );
  }
  let host = url;
  try { host = new URL(url).hostname; } catch { /* keep raw */ }
  return (
    <div contentEditable={false}>
      <a className="bookmark-card" href={url} target="_blank" rel="noopener noreferrer">
        <div className="bookmark-info">
          <div className="bookmark-title">{block.props.caption || host}</div>
          <div className="bookmark-url">
            <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`} alt="" />
            {url}
          </div>
        </div>
      </a>
    </div>
  );
}

export function VideoBlock({ block }: { block: BlockDoc }) {
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null);
  const url = block.props.url as string | undefined;
  if (!url) {
    return (
      <div contentEditable={false}>
        <div className="media-placeholder" onClick={(e) => setOpen({ x: e.clientX - 80, y: e.clientY + 12 })}>
          🎬&nbsp; Embed a video (YouTube or file URL)
        </div>
        {open && (
          <MediaUrlPopover anchor={open} onClose={() => setOpen(null)} placeholder="YouTube or video URL…"
            actionLabel="Embed video" onSubmit={(u) => updateBlock(block.id, { props: { url: u } })} />
        )}
      </div>
    );
  }
  const yt = youTubeEmbed(url);
  return (
    <div contentEditable={false}>
      {yt ? (
        <iframe className="embed-frame" src={yt} style={{ aspectRatio: '16/9', border: 'none' }} allowFullScreen title="video" />
      ) : (
        <video controls src={url} style={{ width: '100%', borderRadius: 8 }} />
      )}
    </div>
  );
}

export function EmbedBlock({ block }: { block: BlockDoc }) {
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null);
  const url = block.props.url as string | undefined;
  if (!url) {
    return (
      <div contentEditable={false}>
        <div className="media-placeholder" onClick={(e) => setOpen({ x: e.clientX - 80, y: e.clientY + 12 })}>
          🌐&nbsp; Embed a link (Figma, Maps, anything)
        </div>
        {open && (
          <MediaUrlPopover anchor={open} onClose={() => setOpen(null)} placeholder="https://…"
            actionLabel="Embed link" onSubmit={(u) => updateBlock(block.id, { props: { url: u } })} />
        )}
      </div>
    );
  }
  return (
    <div contentEditable={false}>
      <iframe className="embed-frame" src={youTubeEmbed(url) ?? url} style={{ height: block.props.height ?? 360, border: 'none' }} title="embed" />
    </div>
  );
}

// ─── Table (simple) ──────────────────────────────────────────────────────────

export function TableBlock({ block }: { block: BlockDoc }) {
  const ctx = useEditor();
  const rows: string[][] = block.props.rows ?? [['', ''], ['', '']];
  const headerRow = block.props.headerRow ?? true;

  const setRows = (r: string[][]) => updateBlock(block.id, { props: { rows: r } }, { silent: true });

  return (
    <div contentEditable={false}>
      <div className="tbl-wrap">
        <table className="tbl">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={headerRow && ri === 0 ? 'hdr' : ''}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    contentEditable={!ctx.readOnly}
                    suppressContentEditableWarning
                    dangerouslySetInnerHTML={{ __html: cell }}
                    onBlur={(e) => {
                      const next = rows.map((r) => [...r]);
                      next[ri][ci] = e.currentTarget.innerHTML;
                      setRows(next);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        const cells = e.currentTarget.closest('table')!.querySelectorAll('td');
                        const idx = Array.from(cells).indexOf(e.currentTarget);
                        const next = cells[idx + (e.shiftKey ? -1 : 1)] as HTMLElement | undefined;
                        next?.focus();
                      }
                    }}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!ctx.readOnly && (
        <div className="tbl-actions">
          <button className="btn small" onClick={() => { captureUndo(ctx.pageId, 'tbl', false); setRows([...rows.map((r) => [...r]), rows[0].map(() => '')]); }}>+ Row</button>
          <button className="btn small" onClick={() => { captureUndo(ctx.pageId, 'tbl', false); setRows(rows.map((r) => [...r, ''])); }}>+ Column</button>
          <button className="btn small" disabled={rows.length <= 1} onClick={() => setRows(rows.slice(0, -1))}>− Row</button>
          <button className="btn small" disabled={rows[0].length <= 1} onClick={() => setRows(rows.map((r) => r.slice(0, -1)))}>− Column</button>
          <button className="btn small" onClick={() => updateBlock(block.id, { props: { headerRow: !headerRow } })}>
            {headerRow ? 'No header' : 'Header row'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Math ────────────────────────────────────────────────────────────────────

export function MathBlock({ block }: { block: BlockDoc }) {
  const ctx = useEditor();
  const [edit, setEdit] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState(block.props.tex ?? '');
  const tex = block.props.tex as string | undefined;
  let rendered = '';
  let error = false;
  if (tex) {
    try {
      rendered = katex.renderToString(tex, { displayMode: true, throwOnError: true });
    } catch {
      error = true;
    }
  }
  return (
    <div contentEditable={false}>
      <div
        className="math-block"
        onClick={(e) => {
          if (ctx.readOnly) return;
          setDraft(tex ?? '');
          setEdit({ x: e.clientX - 160, y: e.clientY + 14 });
        }}
      >
        {tex
          ? error
            ? <span style={{ color: 'var(--red)' }}>Invalid TeX: {tex}</span>
            : <span dangerouslySetInnerHTML={{ __html: rendered }} />
          : <span className="math-empty">∑ Click to add a TeX equation</span>}
      </div>
      {edit && (
        <Popover anchor={edit} onClose={() => setEdit(null)} width={420} autoFocus>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              className="text-input" rows={3} value={draft} spellCheck={false}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 13, resize: 'vertical' }}
              placeholder="E = mc^2"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  updateBlock(block.id, { props: { tex: draft } });
                  setEdit(null);
                }
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>⌘/Ctrl + Enter to apply</span>
              <button className="btn primary small" onClick={() => { updateBlock(block.id, { props: { tex: draft } }); setEdit(null); }}>
                Done
              </button>
            </div>
          </div>
        </Popover>
      )}
    </div>
  );
}

// ─── Table of contents ───────────────────────────────────────────────────────

export function TocBlock({ block }: { block: BlockDoc }) {
  useStore((s) => s.pageTick[block.pageId]); // refresh when page changes
  const headings: { id: string; level: number; text: string }[] = [];
  const walk = (parentId: string | null) => {
    for (const b of getChildren(block.pageId, parentId)) {
      if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') {
        const el = document.createElement('div');
        el.innerHTML = b.html;
        headings.push({ id: b.id, level: Number(b.type[1]), text: el.textContent || 'Untitled heading' });
      }
      walk(b.id);
    }
  };
  walk(null);
  return (
    <div className="toc-block" contentEditable={false}>
      {headings.length === 0 && <span style={{ color: 'var(--text-tertiary)', fontSize: 13.5 }}>Add headings to build a table of contents.</span>}
      {headings.map((h) => (
        <a
          key={h.id}
          className="toc-item"
          style={{ paddingLeft: 6 + (h.level - 1) * 18, textDecoration: h.level === 1 ? 'none' : undefined }}
          onClick={() => {
            document.querySelector(`[data-block-id="${h.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        >
          {h.text}
        </a>
      ))}
    </div>
  );
}

export { getCaretRect };
