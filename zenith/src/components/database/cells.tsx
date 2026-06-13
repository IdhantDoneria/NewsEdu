// Per-type property value editors + read-only renderers, shared by table cells,
// board/gallery/list cards and the row-page property section.
// NOTE: popovers never nest (the outer would close on inner clicks) — flows that
// need a second level swap screens inside one popover instead.
import {
  ArrowLeft, ArrowUpRight, Check, ExternalLink, Mail, MoreHorizontal,
  Phone as PhoneIcon, Plus, Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { captureUndo, getPage, getRows, openPeek, updatePage } from '../../lib/store';
import type { DbSchema, PageDoc, PropertyDef, SelectOption } from '../../lib/types';
import { SELECT_COLORS } from '../../lib/types';
import { type Anchor, anchorFromEl, Popover } from '../ui/Popover';
import { fileToDataURL } from '../editor/editorUtils';
import {
  addSelectOption, computeFormula, deleteSelectOption, displayValue, formatDate,
  formatDateTime, formatFormulaResult, formatNumber, optionById, patchSelectOption,
  storedValue, toISODate,
} from './queries';

function setRowProp(row: PageDoc, prop: PropertyDef, value: any): void {
  captureUndo(row.id, `edit ${prop.name}`, false);
  updatePage(row.id, { rowProps: { [prop.id]: value } });
}

// ─── read-only value rendering (cards, list rows) ────────────────────────────

export function ValueDisplay({ row, prop, schema }: { row: PageDoc; prop: PropertyDef; schema: DbSchema }) {
  const v = storedValue(row, prop);
  switch (prop.type) {
    case 'select': case 'status': {
      const o = optionById(prop, v);
      return o ? <span className={`chip pill-${o.color}`}>{o.name}</span> : null;
    }
    case 'multiSelect': {
      const ids: string[] = Array.isArray(v) ? v : [];
      if (!ids.length) return null;
      return (
        <span className="chips">
          {ids.map((id) => {
            const o = optionById(prop, id);
            return o ? <span key={id} className={`chip pill-${o.color}`}>{o.name}</span> : null;
          })}
        </span>
      );
    }
    case 'checkbox':
      return <span className={`dbc-check ${v ? 'on' : ''}`}>{v ? <Check size={11} /> : null}</span>;
    case 'relation': {
      const ids: string[] = Array.isArray(v) ? v : [];
      if (!ids.length) return null;
      return (
        <span className="chips">
          {ids.map((id) => {
            const p = getPage(id);
            if (!p) return null;
            return (
              <span
                key={id}
                className="chip rel-chip"
                onClick={(e) => { e.stopPropagation(); openPeek(id); }}
              >
                {p.icon ? `${p.icon} ` : ''}{p.title || 'Untitled'}
              </span>
            );
          })}
        </span>
      );
    }
    case 'url': {
      if (!v) return null;
      return <span className="dbc-link">{String(v).replace(/^https?:\/\/(www\.)?/, '')}</span>;
    }
    case 'file': {
      const arr: Array<{ name: string; url: string }> = Array.isArray(v) ? v : [];
      if (!arr.length) return null;
      return (
        <span className="chips">
          {arr.map((f, i) => (
            <a key={i} className="chip rel-chip" href={f.url} download={f.name} onClick={(e) => e.stopPropagation()}>{f.name}</a>
          ))}
        </span>
      );
    }
    case 'formula': {
      const r = computeFormula(row, prop, schema);
      const err = typeof r === 'string' && r.startsWith('⚠');
      return <span className={err ? 'dbc-err' : undefined}>{formatFormulaResult(r)}</span>;
    }
    default: {
      const s = displayValue(row, prop, schema);
      return s ? <span>{s}</span> : null;
    }
  }
}

// ─── interactive cell ────────────────────────────────────────────────────────

export function PropCell({ dbId, row, prop, schema, variant = 'table' }: {
  dbId: string; row: PageDoc; prop: PropertyDef; schema: DbSchema; variant?: 'table' | 'page';
}) {
  switch (prop.type) {
    case 'text': case 'url': case 'email': case 'phone':
      return <TextCell row={row} prop={prop} variant={variant} />;
    case 'number':
      return <NumberCell row={row} prop={prop} variant={variant} />;
    case 'checkbox':
      return <CheckboxCell row={row} prop={prop} />;
    case 'date':
      return <DateCell row={row} prop={prop} variant={variant} />;
    case 'select': case 'status': case 'multiSelect':
      return <SelectCell dbId={dbId} row={row} prop={prop} variant={variant} />;
    case 'relation':
      return <RelationCell row={row} prop={prop} variant={variant} />;
    case 'file':
      return <FileCell row={row} prop={prop} variant={variant} />;
    case 'formula':
      return (
        <div className="cell-btn ro" title={prop.formula}>
          <ValueDisplay row={row} prop={prop} schema={schema} />
        </div>
      );
    case 'rollup':
      return (
        <div className="cell-btn ro" title="Rollup">
          <span>{displayValue(row, prop, schema) || ''}</span>
        </div>
      );
    case 'createdTime':
      return <div className="cell-btn ro">{formatDateTime(row.createdAt)}</div>;
    case 'updatedTime':
      return <div className="cell-btn ro">{formatDateTime(row.updatedAt)}</div>;
    default:
      return <div className="cell-btn ro"><ValueDisplay row={row} prop={prop} schema={schema} /></div>;
  }
}

function EmptyHint({ variant }: { variant: 'table' | 'page' }) {
  return variant === 'page' ? <span className="dbc-empty">Empty</span> : null;
}

// text / url / email / phone ──────────────────────────────────────────────────

function TextCell({ row, prop, variant }: { row: PageDoc; prop: PropertyDef; variant: 'table' | 'page' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const value = String(storedValue(row, prop) ?? '');

  const commit = (v: string) => {
    setEditing(false);
    if (v !== value) setRowProp(row, prop, v.trim() === '' ? undefined : v);
  };

  if (editing) {
    return (
      <input
        className="cell-input"
        value={draft}
        autoFocus
        placeholder={prop.type === 'url' ? 'https://…' : prop.type === 'email' ? 'name@example.com' : ''}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
          else if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); }
        }}
      />
    );
  }

  const action =
    prop.type === 'url' && value ? (
      <a className="cell-action" href={/^https?:/i.test(value) ? value : `https://${value}`} target="_blank" rel="noreferrer"
        onClick={(e) => e.stopPropagation()} title="Open link"><ExternalLink size={13} /></a>
    ) : prop.type === 'email' && value ? (
      <a className="cell-action" href={`mailto:${value}`} onClick={(e) => e.stopPropagation()} title="Send email"><Mail size={13} /></a>
    ) : prop.type === 'phone' && value ? (
      <a className="cell-action" href={`tel:${value}`} onClick={(e) => e.stopPropagation()} title="Call"><PhoneIcon size={13} /></a>
    ) : null;

  return (
    <div className="cell-btn" onClick={() => { setDraft(value); setEditing(true); }}>
      {value
        ? <span className={`cell-text ${prop.type === 'url' ? 'dbc-link' : ''}`}>{value}</span>
        : <EmptyHint variant={variant} />}
      {action}
    </div>
  );
}

// number ──────────────────────────────────────────────────────────────────────

function NumberCell({ row, prop, variant }: { row: PageDoc; prop: PropertyDef; variant: 'table' | 'page' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const value = storedValue(row, prop);

  const commit = (raw: string) => {
    setEditing(false);
    const s = raw.trim();
    if (s === '') { if (value != null && value !== '') setRowProp(row, prop, undefined); return; }
    const n = Number(s.replace(/[$€₹,%\s]/g, ''));
    if (!Number.isNaN(n) && n !== value) setRowProp(row, prop, n);
  };

  if (editing) {
    return (
      <input
        className="cell-input num"
        value={draft}
        autoFocus
        inputMode="decimal"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
          else if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); }
        }}
      />
    );
  }
  return (
    <div className="cell-btn num" onClick={() => { setDraft(value == null ? '' : String(value)); setEditing(true); }}>
      {value == null || value === '' ? <EmptyHint variant={variant} /> : <span>{formatNumber(value, prop.numberFormat)}</span>}
    </div>
  );
}

// checkbox ────────────────────────────────────────────────────────────────────

function CheckboxCell({ row, prop }: { row: PageDoc; prop: PropertyDef }) {
  const v = !!storedValue(row, prop);
  return (
    <div className="cell-btn" onClick={() => setRowProp(row, prop, !v)}>
      <span className={`dbc-check ${v ? 'on' : ''}`}>{v ? <Check size={11} /> : null}</span>
    </div>
  );
}

// date ────────────────────────────────────────────────────────────────────────

function DateCell({ row, prop, variant }: { row: PageDoc; prop: PropertyDef; variant: 'table' | 'page' }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const value = String(storedValue(row, prop) ?? '');

  return (
    <>
      <div ref={ref} className="cell-btn" onClick={() => setAnchor(anchorFromEl(ref.current))}>
        {value ? <span>{formatDate(value)}</span> : <EmptyHint variant={variant} />}
      </div>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={240}>
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="date"
              className="text-input"
              autoFocus
              value={value}
              onChange={(e) => { setRowProp(row, prop, e.target.value || undefined); }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn small" onClick={() => { setRowProp(row, prop, toISODate(Date.now())); setAnchor(null); }}>Today</button>
              {value && (
                <button className="btn small" onClick={() => { setRowProp(row, prop, undefined); setAnchor(null); }}>Clear</button>
              )}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}

// select / status / multiSelect ───────────────────────────────────────────────

function SelectCell({ dbId, row, prop, variant }: {
  dbId: string; row: PageDoc; prop: PropertyDef; variant: 'table' | 'page';
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const multi = prop.type === 'multiSelect';
  const v = storedValue(row, prop);
  const ids: string[] = multi ? (Array.isArray(v) ? v : []) : (typeof v === 'string' && v ? [v] : []);

  return (
    <>
      <div ref={ref} className="cell-btn" onClick={() => setAnchor(anchorFromEl(ref.current))}>
        {ids.length ? (
          <span className="chips">
            {ids.map((id) => {
              const o = optionById(prop, id);
              return o ? <span key={id} className={`chip pill-${o.color}`}>{o.name}</span> : null;
            })}
          </span>
        ) : <EmptyHint variant={variant} />}
      </div>
      {anchor && (
        <SelectOptionsPopover
          anchor={anchor}
          dbId={dbId}
          propId={prop.id}
          selected={ids}
          onClose={() => setAnchor(null)}
          onToggle={(optId) => {
            if (multi) {
              const next = ids.includes(optId) ? ids.filter((x) => x !== optId) : [...ids, optId];
              setRowProp(row, prop, next);
            } else {
              setRowProp(row, prop, ids[0] === optId ? undefined : optId);
              setAnchor(null);
            }
          }}
        />
      )}
    </>
  );
}

/** option list + inline create + per-option edit screen (single popover) */
export function SelectOptionsPopover({ anchor, dbId, propId, selected, onToggle, onClose }: {
  anchor: Anchor;
  dbId: string;
  propId: string;
  selected: string[];
  onToggle: (optionId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  // read live so freshly created/edited options appear immediately
  const liveProp = getPage(dbId)?.dbSchema?.properties.find((p) => p.id === propId);
  if (!liveProp) return null;
  const options = liveProp.options ?? [];
  const filtered = q.trim()
    ? options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()))
    : options;
  const exact = options.some((o) => o.name.toLowerCase() === q.trim().toLowerCase());

  const create = () => {
    const name = q.trim();
    if (!name) return;
    const id = addSelectOption(dbId, propId, name);
    setQ('');
    onToggle(id);
  };

  const editing = editId ? options.find((o) => o.id === editId) : null;

  return (
    <Popover anchor={anchor} onClose={onClose} width={260}>
      {editing ? (
        <OptionEditorBody
          dbId={dbId}
          propId={propId}
          option={editing}
          onBack={() => setEditId(null)}
          onDeleted={() => setEditId(null)}
        />
      ) : (
        <>
          <div style={{ padding: '8px 8px 0' }}>
            <input
              className="text-input"
              placeholder="Search or create…"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (q.trim() && !exact) create();
                  else if (filtered.length === 1) onToggle(filtered[0].id);
                }
              }}
            />
          </div>
          <div className="menu">
            {filtered.map((o) => (
              <div key={o.id} className="menu-item" role="button" onClick={() => onToggle(o.id)}>
                <span className={`chip pill-${o.color}`} style={{ flex: '0 1 auto', minWidth: 0 }}>{o.name}</span>
                <span style={{ flex: 1 }} />
                {selected.includes(o.id) && <Check size={14} style={{ color: 'var(--gold)' }} />}
                <span
                  className="icon-btn small"
                  role="button"
                  title="Edit option"
                  onClick={(e) => { e.stopPropagation(); setEditId(o.id); }}
                >
                  <MoreHorizontal size={13} />
                </span>
              </div>
            ))}
            {q.trim() && !exact && (
              <button className="menu-item" onClick={create}>
                <span className="mi-icon"><Plus size={14} /></span>
                <span className="mi-label">Create</span>
                <span className="chip pill-gray" style={{ flex: '0 1 auto', minWidth: 0 }}>{q.trim()}</span>
              </button>
            )}
            {!filtered.length && !q.trim() && (
              <div style={{ padding: '8px 10px', color: 'var(--text-tertiary)', fontSize: 13 }}>
                Type to create an option
              </div>
            )}
          </div>
        </>
      )}
    </Popover>
  );
}

/** standalone popover wrapper around OptionEditorBody (used by the property options manager) */
export function OptionEditorPopover({ dbId, propId, option, anchor, onClose }: {
  dbId: string; propId: string; option: SelectOption; anchor: Anchor; onClose: () => void;
}) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={240}>
      <OptionEditorBody dbId={dbId} propId={propId} option={option} onDeleted={onClose} />
    </Popover>
  );
}

/** rename / recolor / delete one select option — body only, embed in a popover */
export function OptionEditorBody({ dbId, propId, option, onBack, onDeleted }: {
  dbId: string; propId: string; option: SelectOption; onBack?: () => void; onDeleted: () => void;
}) {
  const [name, setName] = useState(option.name);
  const commit = () => {
    const n = name.trim();
    if (n && n !== option.name) patchSelectOption(dbId, propId, option.id, { name: n });
  };
  return (
    <div style={{ padding: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {onBack && (
          <button className="icon-btn small" onClick={() => { commit(); onBack(); }} title="Back">
            <ArrowLeft size={14} />
          </button>
        )}
        <input
          className="text-input"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { commit(); onBack?.(); } }}
        />
      </div>
      <div className="menu-title" style={{ paddingLeft: 2 }}>Color</div>
      <div className="color-grid">
        {SELECT_COLORS.map((c) => (
          <button
            key={c}
            className={`color-swatch ${option.color === c ? 'on' : ''}`}
            title={c}
            onClick={() => patchSelectOption(dbId, propId, option.id, { color: c })}
          >
            <span className={`dot bgdot-${c}`} />
          </button>
        ))}
      </div>
      <button
        className="menu-item danger"
        style={{ marginTop: 6 }}
        onClick={() => { deleteSelectOption(dbId, propId, option.id); onDeleted(); }}
      >
        <span className="mi-icon"><Trash2 size={14} /></span>
        <span className="mi-label">Delete option</span>
      </button>
    </div>
  );
}

// relation ────────────────────────────────────────────────────────────────────

function RelationCell({ row, prop, variant }: { row: PageDoc; prop: PropertyDef; variant: 'table' | 'page' }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const v = storedValue(row, prop);
  const ids: string[] = Array.isArray(v) ? v : [];
  const target = prop.relationDatabaseId ? getPage(prop.relationDatabaseId) : undefined;

  return (
    <>
      <div ref={ref} className="cell-btn" onClick={() => setAnchor(anchorFromEl(ref.current))}>
        {ids.length ? (
          <span className="chips">
            {ids.map((id) => {
              const p = getPage(id);
              if (!p || p.deletedAt) return null;
              return (
                <span key={id} className="chip rel-chip" title="Open"
                  onClick={(e) => { e.stopPropagation(); openPeek(id); }}>
                  <ArrowUpRight size={11} />
                  {p.icon ? `${p.icon} ` : ''}{p.title || 'Untitled'}
                </span>
              );
            })}
          </span>
        ) : <EmptyHint variant={variant} />}
      </div>
      {anchor && (
        <RelationPopover
          anchor={anchor}
          targetDb={target}
          selected={ids}
          onClose={() => setAnchor(null)}
          onToggle={(id) => {
            const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
            setRowProp(row, prop, next);
          }}
        />
      )}
    </>
  );
}

function RelationPopover({ anchor, targetDb, selected, onToggle, onClose }: {
  anchor: Anchor; targetDb: PageDoc | undefined; selected: string[];
  onToggle: (id: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const rows = targetDb && !targetDb.deletedAt ? getRows(targetDb.id) : [];
  const filtered = q.trim()
    ? rows.filter((r) => (r.title || 'Untitled').toLowerCase().includes(q.trim().toLowerCase()))
    : rows;

  return (
    <Popover anchor={anchor} onClose={onClose} width={280}>
      {!targetDb || targetDb.deletedAt ? (
        <div style={{ padding: 14, fontSize: 13, color: 'var(--text-tertiary)' }}>
          The related database no longer exists.
        </div>
      ) : (
        <>
          <div style={{ padding: '8px 8px 0' }}>
            <input className="text-input" placeholder={`Search ${targetDb.title || 'database'}…`} autoFocus
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="menu" style={{ maxHeight: 260, overflowY: 'auto' }}>
            {filtered.map((r) => (
              <button key={r.id} className="menu-item" onClick={() => onToggle(r.id)}>
                <span className="mi-icon">{r.icon || '📄'}</span>
                <span className="mi-label">{r.title || 'Untitled'}</span>
                {selected.includes(r.id) && <Check size={14} style={{ color: 'var(--gold)' }} />}
              </button>
            ))}
            {!filtered.length && (
              <div style={{ padding: '8px 10px', color: 'var(--text-tertiary)', fontSize: 13 }}>No pages found</div>
            )}
          </div>
        </>
      )}
    </Popover>
  );
}

// file / media ─────────────────────────────────────────────────────────────────

function FileCell({ row, prop, variant }: { row: PageDoc; prop: PropertyDef; variant: 'table' | 'page' }) {
  const ref = useRef<HTMLInputElement>(null);
  const files: Array<{ name: string; url: string }> = Array.isArray(storedValue(row, prop)) ? storedValue(row, prop) : [];

  const add = async (list: FileList) => {
    const next = [...files];
    for (const f of Array.from(list)) {
      try { next.push({ name: f.name, url: await fileToDataURL(f) }); } catch { /* skip unreadable */ }
    }
    setRowProp(row, prop, next);
  };
  const remove = (i: number) => {
    const next = files.filter((_, j) => j !== i);
    setRowProp(row, prop, next.length ? next : undefined);
  };

  return (
    <div className="cell-btn" onClick={() => ref.current?.click()}>
      {files.length ? (
        <span className="chips">
          {files.map((f, i) => (
            <span key={i} className="chip rel-chip" title={f.name}>
              <a href={f.url} download={f.name} onClick={(e) => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }}>{shortFileName(f.name)}</a>
              <span onClick={(e) => { e.stopPropagation(); remove(i); }} style={{ cursor: 'pointer', opacity: 0.55 }}>×</span>
            </span>
          ))}
        </span>
      ) : <EmptyHint variant={variant} />}
      <input ref={ref} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) void add(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

function shortFileName(n: string): string {
  return n.length > 22 ? `${n.slice(0, 12)}…${n.slice(-7)}` : n;
}

// title (used by the table) ───────────────────────────────────────────────────

export function TitleCellInput({ row, autoFocus }: { row: PageDoc; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) { ref.current?.focus(); ref.current?.select(); }
  }, [autoFocus]);
  return (
    <input
      ref={ref}
      className="cell-input title"
      value={row.title}
      placeholder="Untitled"
      onChange={(e) => {
        captureUndo(row.id, 'title');
        updatePage(row.id, { title: e.target.value });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
