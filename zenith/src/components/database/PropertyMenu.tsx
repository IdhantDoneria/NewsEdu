// Property editing popovers: rename / change type / configure (options, formula,
// relation target, number format) / sort / hide / insert / duplicate / delete.
// Used by table column headers, the Properties panel and the row-page section.
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronRight, Copy,
  EyeOff, MoreHorizontal, Plus, Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { evalFormula } from '../../lib/formula';
import { uid } from '../../lib/id';
import { getPage, getRows, useStore } from '../../lib/store';
import type { DbSchema, PropertyDef, PropertyType, ViewDef } from '../../lib/types';
import { type Anchor, Popover } from '../ui/Popover';
import { toast } from '../ui/Toast';
import { OptionEditorPopover } from './cells';
import {
  addProperty, addSelectOption, computeFormula, defaultStatusOptions, deleteProperty,
  duplicateProperty, findProp, findPropByName, formatFormulaResult, patchProperty,
  patchView, ROLLUP_AGGS,
} from './queries';
import { PROP_TYPES, PropIcon, propTypeMeta } from './propertyMeta';

const NUMBER_FORMATS: { id: NonNullable<PropertyDef['numberFormat']>; label: string }[] = [
  { id: 'plain', label: 'Plain number' },
  { id: 'commas', label: 'With commas' },
  { id: 'percent', label: 'Percent' },
  { id: 'usd', label: 'US Dollar' },
  { id: 'eur', label: 'Euro' },
  { id: 'inr', label: 'Indian Rupee' },
];

type Screen = 'main' | 'type' | 'format' | 'options' | 'formula' | 'relation' | 'rollup';

export function PropertyMenuPopover({ dbId, propId, anchor, onClose, view, allowInsert = false }: {
  dbId: string;
  propId: string;
  anchor: Anchor;
  onClose: () => void;
  /** when given, sort / hide actions are offered and persisted on this view */
  view?: ViewDef;
  /** show "insert left / right" (table headers) */
  allowInsert?: boolean;
}) {
  useStore((s) => s.pageTick[dbId]);
  const schema = getPage(dbId)?.dbSchema;
  const prop = schema ? findProp(schema, propId) : undefined;
  const [screen, setScreen] = useState<Screen>('main');
  const [name, setName] = useState(prop?.name ?? '');
  if (!schema || !prop) return null;
  const isTitle = prop.type === 'title';
  const index = schema.properties.findIndex((p) => p.id === prop.id);

  const commitName = () => {
    const n = name.trim();
    if (n && n !== prop.name) patchProperty(dbId, prop.id, { name: n });
  };
  const close = () => { commitName(); onClose(); };

  const setSort = (dir: 'asc' | 'desc') => {
    if (!view) return;
    patchView(dbId, view.id, { sorts: [{ id: uid(), propId: prop.id, dir }] }, 'sort');
    close();
  };

  const changeType = (type: PropertyType) => {
    if (type === prop.type) { setScreen('main'); return; }
    const patch: Partial<PropertyDef> = { type };
    if ((type === 'select' || type === 'multiSelect') && !prop.options) patch.options = [];
    if (type === 'status' && !prop.options?.length) patch.options = defaultStatusOptions();
    if (type === 'formula' && prop.formula === undefined) patch.formula = '';
    if (type === 'rollup' && !prop.rollup) {
      patch.rollup = { relationPropId: schema.properties.find((p) => p.type === 'relation')?.id ?? '', targetPropId: '', agg: 'count' };
    }
    patchProperty(dbId, prop.id, patch);
    setScreen(type === 'relation' && !prop.relationDatabaseId ? 'relation' : type === 'rollup' ? 'rollup' : 'main');
  };

  const insert = (side: -1 | 1) => {
    addProperty(dbId, { type: 'text' }, index + (side === 1 ? 1 : 0));
    close();
  };

  return (
    <Popover anchor={anchor} onClose={close} width={250}>
      {screen === 'main' && (
        <>
          <div style={{ padding: '8px 8px 2px' }}>
            <input
              className="text-input"
              value={name}
              autoFocus
              disabled={false}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') close(); }}
            />
          </div>
          <div className="menu">
            {!isTitle && (
              <button className="menu-item" onClick={() => setScreen('type')}>
                <span className="mi-icon"><PropIcon type={prop.type} /></span>
                <span className="mi-label">Type</span>
                <span className="mi-hint">{propTypeMeta(prop.type).label}</span>
                <ChevronRight size={13} style={{ color: 'var(--text-tertiary)' }} />
              </button>
            )}
            {prop.type === 'number' && (
              <button className="menu-item" onClick={() => setScreen('format')}>
                <span className="mi-icon">#</span>
                <span className="mi-label">Number format</span>
                <span className="mi-hint">{NUMBER_FORMATS.find((f) => f.id === (prop.numberFormat ?? 'plain'))?.label}</span>
              </button>
            )}
            {(prop.type === 'select' || prop.type === 'multiSelect' || prop.type === 'status') && (
              <button className="menu-item" onClick={() => setScreen('options')}>
                <span className="mi-icon"><MoreHorizontal size={14} /></span>
                <span className="mi-label">Edit options</span>
                <span className="mi-hint">{prop.options?.length ?? 0}</span>
              </button>
            )}
            {prop.type === 'formula' && (
              <button className="menu-item" onClick={() => setScreen('formula')}>
                <span className="mi-icon">ƒ</span>
                <span className="mi-label">Edit formula</span>
              </button>
            )}
            {prop.type === 'relation' && (
              <button className="menu-item" onClick={() => setScreen('relation')}>
                <span className="mi-icon">↗</span>
                <span className="mi-label">Related to</span>
                <span className="mi-hint">
                  {prop.relationDatabaseId ? (getPage(prop.relationDatabaseId)?.title || 'Untitled') : 'Choose…'}
                </span>
              </button>
            )}
            {prop.type === 'rollup' && (
              <button className="menu-item" onClick={() => setScreen('rollup')}>
                <span className="mi-icon">∑</span>
                <span className="mi-label">Configure rollup</span>
              </button>
            )}
            {(view || allowInsert || !isTitle) && <div className="menu-sep" />}
            {view && (
              <>
                <button className="menu-item" onClick={() => setSort('asc')}>
                  <span className="mi-icon"><ArrowUp size={14} /></span>
                  <span className="mi-label">Sort ascending</span>
                </button>
                <button className="menu-item" onClick={() => setSort('desc')}>
                  <span className="mi-icon"><ArrowDown size={14} /></span>
                  <span className="mi-label">Sort descending</span>
                </button>
              </>
            )}
            {view && !isTitle && (
              <button
                className="menu-item"
                onClick={() => {
                  patchView(dbId, view.id, { hiddenProps: [...(view.hiddenProps ?? []), prop.id] }, 'hide property');
                  close();
                }}
              >
                <span className="mi-icon"><EyeOff size={14} /></span>
                <span className="mi-label">Hide in view</span>
              </button>
            )}
            {allowInsert && (
              <>
                <button className="menu-item" onClick={() => insert(-1)}>
                  <span className="mi-icon"><ArrowLeft size={14} /></span>
                  <span className="mi-label">Insert left</span>
                </button>
                <button className="menu-item" onClick={() => insert(1)}>
                  <span className="mi-icon"><ArrowRight size={14} /></span>
                  <span className="mi-label">Insert right</span>
                </button>
              </>
            )}
            {!isTitle && (
              <>
                <button className="menu-item" onClick={() => { duplicateProperty(dbId, prop.id); close(); }}>
                  <span className="mi-icon"><Copy size={14} /></span>
                  <span className="mi-label">Duplicate property</span>
                </button>
                <button
                  className="menu-item danger"
                  onClick={() => { deleteProperty(dbId, prop.id); toast(`Deleted “${prop.name}”`); onClose(); }}
                >
                  <span className="mi-icon"><Trash2 size={14} /></span>
                  <span className="mi-label">Delete property</span>
                </button>
              </>
            )}
          </div>
        </>
      )}

      {screen === 'type' && (
        <div className="menu">
          <div className="menu-title">Change type</div>
          {PROP_TYPES.filter((m) => m.creatable).map((m) => (
            <button key={m.type} className="menu-item" onClick={() => changeType(m.type)}>
              <span className="mi-icon"><m.icon size={14} /></span>
              <span className="mi-label">{m.label}</span>
              {prop.type === m.type && <Check size={14} style={{ color: 'var(--gold)' }} />}
            </button>
          ))}
        </div>
      )}

      {screen === 'format' && (
        <div className="menu">
          <div className="menu-title">Number format</div>
          {NUMBER_FORMATS.map((f) => (
            <button
              key={f.id}
              className="menu-item"
              onClick={() => { patchProperty(dbId, prop.id, { numberFormat: f.id }); setScreen('main'); }}
            >
              <span className="mi-label">{f.label}</span>
              {(prop.numberFormat ?? 'plain') === f.id && <Check size={14} style={{ color: 'var(--gold)' }} />}
            </button>
          ))}
        </div>
      )}

      {screen === 'options' && <OptionsManager dbId={dbId} prop={prop} />}

      {screen === 'formula' && (
        <FormulaEditor
          schema={schema}
          dbId={dbId}
          initial={prop.formula ?? ''}
          onSave={(expr) => { patchProperty(dbId, prop.id, { formula: expr }); setScreen('main'); }}
        />
      )}

      {screen === 'relation' && (
        <DatabasePicker
          current={prop.relationDatabaseId}
          onPick={(id) => { patchProperty(dbId, prop.id, { relationDatabaseId: id }); setScreen('main'); }}
        />
      )}

      {screen === 'rollup' && (
        <RollupEditor dbId={dbId} propId={prop.id} onDone={() => setScreen('main')} />
      )}
    </Popover>
  );
}

// ─── rollup config ───────────────────────────────────────────────────────────

export function RollupEditor({ dbId, propId, onDone }: { dbId: string; propId: string; onDone: () => void }) {
  useStore((s) => s.pageTick[dbId]);
  const schema = getPage(dbId)?.dbSchema;
  const prop = schema ? findProp(schema, propId) : undefined;
  if (!schema || !prop) return null;
  const cfg = prop.rollup ?? { relationPropId: '', targetPropId: '', agg: 'count' as const };
  const relProps = schema.properties.filter((p) => p.type === 'relation' && p.relationDatabaseId);
  const relProp = relProps.find((p) => p.id === cfg.relationPropId);
  const targetDb = relProp?.relationDatabaseId ? getPage(relProp.relationDatabaseId) : undefined;
  const targetProps = targetDb?.dbSchema?.properties ?? [];
  const set = (patch: Partial<typeof cfg>) => patchProperty(dbId, propId, { rollup: { ...cfg, ...patch } });

  if (!relProps.length) {
    return <div style={{ padding: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>Add a <b>Relation</b> property first, then a rollup can summarize the related rows.</div>;
  }
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <div className="menu-title" style={{ paddingLeft: 2 }}>Relation</div>
        <select className="text-input" value={cfg.relationPropId} onChange={(e) => set({ relationPropId: e.target.value, targetPropId: '' })}>
          <option value="">Choose…</option>
          {relProps.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <div className="menu-title" style={{ paddingLeft: 2 }}>Property</div>
        <select className="text-input" value={cfg.targetPropId} disabled={!targetProps.length} onChange={(e) => set({ targetPropId: e.target.value })}>
          <option value="">Choose…</option>
          {targetProps.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <div className="menu-title" style={{ paddingLeft: 2 }}>Calculate</div>
        <select className="text-input" value={cfg.agg} onChange={(e) => set({ agg: e.target.value as typeof cfg.agg })}>
          {ROLLUP_AGGS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>
      <button className="btn small primary" style={{ alignSelf: 'flex-end' }} onClick={onDone}>Done</button>
    </div>
  );
}

// ─── select options manager ──────────────────────────────────────────────────

function OptionsManager({ dbId, prop }: { dbId: string; prop: PropertyDef }) {
  const [draft, setDraft] = useState('');
  const [edit, setEdit] = useState<{ id: string; anchor: Anchor } | null>(null);
  const options = prop.options ?? [];
  const add = () => {
    const n = draft.trim();
    if (!n) return;
    if (options.some((o) => o.name.toLowerCase() === n.toLowerCase())) { setDraft(''); return; }
    addSelectOption(dbId, prop.id, n);
    setDraft('');
  };
  return (
    <div style={{ padding: '8px 0 4px' }}>
      <div style={{ padding: '0 8px', display: 'flex', gap: 6 }}>
        <input
          className="text-input"
          placeholder="New option…"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <button className="icon-btn" onClick={add} title="Add option"><Plus size={15} /></button>
      </div>
      <div className="menu">
        {options.map((o) => (
          <button
            key={o.id}
            className="menu-item"
            onClick={(e) => setEdit({ id: o.id, anchor: { x: e.clientX, y: e.clientY + 6 } })}
          >
            <span className={`chip pill-${o.color}`} style={{ flex: '0 1 auto', minWidth: 0 }}>{o.name}</span>
            <span style={{ flex: 1 }} />
            <MoreHorizontal size={13} style={{ color: 'var(--text-tertiary)' }} />
          </button>
        ))}
        {!options.length && (
          <div style={{ padding: '6px 10px', color: 'var(--text-tertiary)', fontSize: 13 }}>No options yet</div>
        )}
      </div>
      {edit && (() => {
        const o = options.find((x) => x.id === edit.id);
        return o ? (
          <OptionEditorPopover dbId={dbId} propId={prop.id} option={o} anchor={edit.anchor} onClose={() => setEdit(null)} />
        ) : null;
      })()}
    </div>
  );
}

// ─── formula editor with live preview ────────────────────────────────────────

export function FormulaEditor({ dbId, schema, initial, onSave }: {
  dbId: string; schema: DbSchema; initial: string; onSave: (expr: string) => void;
}) {
  const [expr, setExpr] = useState(initial);
  const preview = useMemo(() => {
    if (!expr.trim()) return null;
    const row = getRows(dbId)[0];
    if (row) {
      return computeFormula(row, { id: '__preview', name: '', type: 'formula', formula: expr }, schema);
    }
    return evalFormula(expr, {
      prop: (n: string) => {
        if (!findPropByName(schema, n)) throw new Error(`unknown property "${n}"`);
        return null;
      },
    });
  }, [expr, dbId, schema]);
  const isErr = typeof preview === 'string' && preview.startsWith('⚠');

  return (
    <div style={{ padding: 10 }}>
      <textarea
        className="text-input"
        style={{ minHeight: 74, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
        placeholder={'if(prop("Done"), "✓", concat(prop("Name"), "!"))'}
        autoFocus
        value={expr}
        onChange={(e) => setExpr(e.target.value)}
      />
      <div className={`formula-preview ${isErr ? 'err' : ''}`}>
        {expr.trim() === '' ? 'Reference properties with prop("Name")'
          : isErr ? String(preview)
          : <>= {formatFormulaResult(preview) || '(empty)'}</>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
        <button className="btn small primary" disabled={isErr} onClick={() => onSave(expr)}>Save</button>
      </div>
    </div>
  );
}

// ─── database picker (relation target) ───────────────────────────────────────

export function DatabasePicker({ current, onPick }: { current?: string; onPick: (id: string) => void }) {
  const pages = useStore((s) => s.pages);
  const dbs = Object.values(pages)
    .filter((p) => p.type === 'database' && !p.deletedAt)
    .sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'));
  return (
    <div className="menu">
      <div className="menu-title">Related database</div>
      {dbs.map((d) => (
        <button key={d.id} className="menu-item" onClick={() => onPick(d.id)}>
          <span className="mi-icon">{d.icon || '🗂'}</span>
          <span className="mi-label">{d.title || 'Untitled'}</span>
          {current === d.id && <Check size={14} style={{ color: 'var(--gold)' }} />}
        </button>
      ))}
      {!dbs.length && (
        <div style={{ padding: '6px 10px', color: 'var(--text-tertiary)', fontSize: 13 }}>No databases yet</div>
      )}
    </div>
  );
}

// ─── new property flow ───────────────────────────────────────────────────────

export function NewPropertyPopover({ dbId, anchor, onClose, atIndex }: {
  dbId: string; anchor: Anchor; onClose: () => void; atIndex?: number;
}) {
  useStore((s) => s.pageTick[dbId]);
  const schema = getPage(dbId)?.dbSchema;
  const [name, setName] = useState('');
  const [type, setType] = useState<PropertyType | null>(null);
  const [relTarget, setRelTarget] = useState<string | undefined>(undefined);
  if (!schema) return null;

  const create = (formula?: string) => {
    if (!type) return;
    addProperty(dbId, {
      type,
      name: name.trim() || undefined as any,
      relationDatabaseId: type === 'relation' ? relTarget : undefined,
      formula: type === 'formula' ? (formula ?? '') : undefined,
    }, atIndex);
    onClose();
  };

  return (
    <Popover anchor={anchor} onClose={onClose} width={260}>
      <div style={{ padding: '8px 8px 0' }}>
        <input
          className="text-input"
          placeholder="Property name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {type === null && (
        <div className="menu">
          <div className="menu-title">Type</div>
          {PROP_TYPES.filter((m) => m.creatable).map((m) => (
            <button
              key={m.type}
              className="menu-item"
              onClick={() => {
                if (m.type === 'relation' || m.type === 'formula') setType(m.type);
                else {
                  addProperty(dbId, { type: m.type, name: name.trim() || undefined as any }, atIndex);
                  onClose();
                }
              }}
            >
              <span className="mi-icon"><m.icon size={14} /></span>
              <span className="mi-label">{m.label}</span>
              {(m.type === 'relation' || m.type === 'formula') && (
                <ChevronRight size={13} style={{ color: 'var(--text-tertiary)' }} />
              )}
            </button>
          ))}
        </div>
      )}
      {type === 'relation' && (
        <>
          <DatabasePicker current={relTarget} onPick={(id) => setRelTarget(id)} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 10px 10px' }}>
            <button className="btn small primary" disabled={!relTarget} onClick={() => create()}>
              Create relation
            </button>
          </div>
        </>
      )}
      {type === 'formula' && (
        <FormulaEditor dbId={dbId} schema={schema} initial="" onSave={(expr) => create(expr)} />
      )}
    </Popover>
  );
}
