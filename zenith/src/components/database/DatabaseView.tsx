// Full database experience: view tabs + toolbar (filter / sort / properties /
// search / export) + the six view renderers, plus the row-page property panel.
import {
  ArrowDownUp, ChevronLeft, ChevronRight, Download, Filter, MoreHorizontal,
  Plus, Settings2, SlidersHorizontal, Trash2, X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { downloadFile, safeFileName } from '../../lib/export';
import { uid } from '../../lib/id';
import {
  captureUndo, createPage, deletePage, duplicatePage, getPage, getRows,
  moveRow, openPeek, updateDbSchema, updatePage, useStore,
} from '../../lib/store';
import type {
  Aggregation, DbSchema, FilterRule, PageDoc, PropertyDef, SortRule, ViewDef, ViewType,
} from '../../lib/types';
import { type Anchor, anchorFromEl, Popover } from '../ui/Popover';
import { toast } from '../ui/Toast';
import { PropCell, TitleCellInput, ValueDisplay } from './cells';
import { NewPropertyPopover, PropertyMenuPopover } from './PropertyMenu';
import { OP_LABELS, opNeedsValue, opsForType, PropIcon, VIEW_TYPES, viewTypeMeta, colWidth } from './propertyMeta';
import {
  addView, applyView, buildCSV, CALC_OPTIONS, computeAggregation, deleteView, duplicateView,
  findProp, groupableProps, groupForBoard, groupRowsByProp, optionById, parseDateValue, patchView,
  patchViewLayout, sameDay, storedValue, toISODate, visibleProps,
} from './queries';
import './database.css';

// ─────────────────────────────────────────────────────────────────────────────

export function DatabaseFullPage({ page }: { page: PageDoc }) {
  useStore((s) => s.pageTick[page.id]);
  useStore((s) => s.navTick);
  const schema = page.dbSchema;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [quick, setQuick] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  if (!schema) return <div className="db-empty">This database has no schema.</div>;
  const view = schema.views.find((v) => v.id === activeId) ?? schema.views[0];
  if (!view) return <div className="db-empty">No views — add one to begin.</div>;

  const rows = useMemo(
    () => applyView(getRows(page.id), schema, view, quick),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page.id, schema, view, quick, useStore.getState().navTick],
  );

  const addRow = (rowProps: Record<string, any> = {}): string => {
    captureUndo(page.id, 'new row', false);
    return createPage({ parentId: page.id, databaseId: page.id, empty: true, rowProps });
  };

  return (
    <div className="db">
      <ViewTabs db={page} schema={schema} activeId={view.id} onPick={setActiveId} />
      <Toolbar
        db={page} schema={schema} view={view}
        quick={quick} setQuick={setQuick}
        showSearch={showSearch} setShowSearch={setShowSearch}
        onNew={() => openPeek(addRow())}
      />
      <ViewBody db={page} schema={schema} view={view} rows={rows} addRow={addRow} />
    </div>
  );
}

// ─── view tabs ───────────────────────────────────────────────────────────────

function ViewTabs({ db, schema, activeId, onPick }: {
  db: PageDoc; schema: DbSchema; activeId: string; onPick: (id: string) => void;
}) {
  const [addAnchor, setAddAnchor] = useState<Anchor | null>(null);
  const [menu, setMenu] = useState<{ view: ViewDef; anchor: Anchor } | null>(null);

  return (
    <div className="db-tabs">
      {schema.views.map((v) => {
        const Icon = viewTypeMeta(v.type).icon;
        return (
          <button
            key={v.id}
            className={`db-tab ${v.id === activeId ? 'on' : ''}`}
            onClick={() => onPick(v.id)}
            onDoubleClick={(e) => setMenu({ view: v, anchor: anchorFromEl(e.currentTarget) })}
          >
            <Icon size={14} />
            {v.name}
            {v.id === activeId && (
              <span
                className="db-tab-x"
                onClick={(e) => { e.stopPropagation(); setMenu({ view: v, anchor: anchorFromEl(e.currentTarget as HTMLElement) }); }}
              >
                <MoreHorizontal size={13} />
              </span>
            )}
          </button>
        );
      })}
      <button className="db-tab" title="Add a view" onClick={(e) => setAddAnchor(anchorFromEl(e.currentTarget))}>
        <Plus size={14} />
      </button>

      {addAnchor && (
        <Popover anchor={addAnchor} onClose={() => setAddAnchor(null)} width={230}>
          <div className="menu">
            <div className="menu-title">Add a view</div>
            {VIEW_TYPES.map((m) => (
              <button key={m.type} className="menu-item" onClick={() => {
                const id = addView(db.id, m.type);
                setAddAnchor(null);
                if (id) onPick(id);
              }}>
                <span className="mi-icon"><m.icon size={15} /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="mi-label" style={{ display: 'block' }}>{m.label}</span>
                  <span className="mi-desc">{m.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </Popover>
      )}
      {menu && (
        <ViewSettingsMenu
          db={db} schema={schema} view={menu.view} anchor={menu.anchor}
          onClose={() => setMenu(null)} onPick={onPick}
        />
      )}
    </div>
  );
}

function ViewSettingsMenu({ db, schema, view, anchor, onClose, onPick }: {
  db: PageDoc; schema: DbSchema; view: ViewDef; anchor: Anchor; onClose: () => void; onPick: (id: string) => void;
}) {
  const [name, setName] = useState(view.name);
  const commit = () => { if (name.trim() && name.trim() !== view.name) patchView(db.id, view.id, { name: name.trim() }, 'rename view'); };
  return (
    <Popover anchor={anchor} onClose={() => { commit(); onClose(); }} width={230}>
      <div style={{ padding: '8px 8px 2px' }}>
        <input className="text-input" value={name} autoFocus onChange={(e) => setName(e.target.value)}
          onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { commit(); onClose(); } }} />
      </div>
      <div className="menu">
        <div className="menu-title">Layout</div>
        {VIEW_TYPES.map((m) => (
          <button key={m.type} className="menu-item" onClick={() => { patchView(db.id, view.id, { type: m.type }, 'change layout'); onClose(); }}>
            <span className="mi-icon"><m.icon size={14} /></span>
            <span className="mi-label">{m.label}</span>
            {view.type === m.type && <span className="mi-hint">✓</span>}
          </button>
        ))}
        <div className="menu-sep" />
        <button className="menu-item" onClick={() => { const id = duplicateView(db.id, view.id); onClose(); if (id) onPick(id); }}>
          <span className="mi-icon"><Plus size={14} /></span><span className="mi-label">Duplicate view</span>
        </button>
        <button className="menu-item danger" onClick={() => {
          if (schema.views.length <= 1) { toast('A database needs at least one view'); return; }
          deleteView(db.id, view.id); onClose(); onPick(schema.views[0].id);
        }}>
          <span className="mi-icon"><Trash2 size={14} /></span><span className="mi-label">Delete view</span>
        </button>
      </div>
    </Popover>
  );
}

// ─── toolbar ─────────────────────────────────────────────────────────────────

function Toolbar({ db, schema, view, quick, setQuick, showSearch, setShowSearch, onNew }: {
  db: PageDoc; schema: DbSchema; view: ViewDef; quick: string; setQuick: (s: string) => void;
  showSearch: boolean; setShowSearch: (b: boolean) => void; onNew: () => void;
}) {
  const [pop, setPop] = useState<null | { kind: 'filter' | 'sort' | 'props' | 'more'; anchor: Anchor }>(null);
  const nFilters = (view.filters ?? []).length;
  const nSorts = (view.sorts ?? []).length;
  const nHidden = (view.hiddenProps ?? []).length;

  return (
    <div className="db-toolbar">
      {(view.type === 'board' || view.type === 'table') && <GroupChooser db={db} schema={schema} view={view} allowNone={view.type === 'table'} />}
      {(view.type === 'calendar' || view.type === 'timeline') && <DatePropChooser db={db} schema={schema} view={view} />}
      <span className="spacer" />
      {showSearch ? (
        <input
          className="text-input db-search-input" placeholder="Search rows…" autoFocus value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onBlur={() => { if (!quick) setShowSearch(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setQuick(''); setShowSearch(false); } }}
        />
      ) : (
        <button className="db-tool" title="Search" onClick={() => setShowSearch(true)}><SlidersHorizontal size={14} style={{ display: 'none' }} />🔍</button>
      )}
      <button className={`db-tool ${nFilters ? 'active' : ''}`} onClick={(e) => setPop({ kind: 'filter', anchor: anchorFromEl(e.currentTarget) })}>
        <Filter size={14} /> Filter {nFilters > 0 && <span className="badge">{nFilters}</span>}
      </button>
      <button className={`db-tool ${nSorts ? 'active' : ''}`} onClick={(e) => setPop({ kind: 'sort', anchor: anchorFromEl(e.currentTarget) })}>
        <ArrowDownUp size={14} /> Sort {nSorts > 0 && <span className="badge">{nSorts}</span>}
      </button>
      <button className={`db-tool ${nHidden ? 'active' : ''}`} onClick={(e) => setPop({ kind: 'props', anchor: anchorFromEl(e.currentTarget) })}>
        <Settings2 size={14} /> Properties
      </button>
      <button className="db-tool" onClick={(e) => setPop({ kind: 'more', anchor: anchorFromEl(e.currentTarget) })}>
        <MoreHorizontal size={16} />
      </button>
      <button className="btn gold small" onClick={onNew}><Plus size={14} /> New</button>

      {pop?.kind === 'filter' && <FilterPopover db={db} schema={schema} view={view} anchor={pop.anchor} onClose={() => setPop(null)} />}
      {pop?.kind === 'sort' && <SortPopover db={db} schema={schema} view={view} anchor={pop.anchor} onClose={() => setPop(null)} />}
      {pop?.kind === 'props' && <PropertiesPopover db={db} schema={schema} view={view} anchor={pop.anchor} onClose={() => setPop(null)} />}
      {pop?.kind === 'more' && (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={210}>
          <div className="menu">
            {view.type === 'table' && (
              <button className="menu-item" onClick={() => { patchViewLayout(db.id, view.id, { wrap: !view.layout?.wrap }); setPop(null); }}>
                <span className="mi-icon">↩</span>
                <span className="mi-label">{view.layout?.wrap ? 'Unwrap cells' : 'Wrap cells'}</span>
              </button>
            )}
            <button className="menu-item" onClick={() => { downloadFile(`${safeFileName(db.title)}.csv`, buildCSV(db, view), 'text/csv'); setPop(null); }}>
              <span className="mi-icon"><Download size={14} /></span><span className="mi-label">Export view to CSV</span>
            </button>
          </div>
        </Popover>
      )}
    </div>
  );
}

function GroupChooser({ db, schema, view, allowNone = false }: { db: PageDoc; schema: DbSchema; view: ViewDef; allowNone?: boolean }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const groupable = groupableProps(schema);
  const current = view.groupByPropId ? findProp(schema, view.groupByPropId) : undefined;
  return (
    <>
      <button className={`db-tool ${current ? 'active' : ''}`} onClick={(e) => setAnchor(anchorFromEl(e.currentTarget))}>
        Group: <b style={{ marginLeft: 3 }}>{current?.name ?? 'None'}</b>
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={200}>
          <div className="menu">
            <div className="menu-title">Group by</div>
            {allowNone && (
              <button className="menu-item" onClick={() => { patchView(db.id, view.id, { groupByPropId: undefined }, 'group'); setAnchor(null); }}>
                <span className="mi-label">None</span>
                {!view.groupByPropId && <span className="mi-hint">✓</span>}
              </button>
            )}
            {groupable.map((p) => (
              <button key={p.id} className="menu-item" onClick={() => { patchView(db.id, view.id, { groupByPropId: p.id }, 'group'); setAnchor(null); }}>
                <span className="mi-icon"><PropIcon type={p.type} /></span>
                <span className="mi-label">{p.name}</span>
                {view.groupByPropId === p.id && <span className="mi-hint">✓</span>}
              </button>
            ))}
            {!groupable.length && <div style={{ padding: 10, fontSize: 13, color: 'var(--text-tertiary)' }}>Add a Select, Status or Checkbox property to group.</div>}
          </div>
        </Popover>
      )}
    </>
  );
}

function DatePropChooser({ db, schema, view }: { db: PageDoc; schema: DbSchema; view: ViewDef }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const dates = schema.properties.filter((p) => p.type === 'date' || p.type === 'createdTime' || p.type === 'updatedTime');
  const current = view.layout?.dateProp ? findProp(schema, view.layout.dateProp) : undefined;
  return (
    <>
      <button className="db-tool" onClick={(e) => setAnchor(anchorFromEl(e.currentTarget))}>
        Date: <b style={{ marginLeft: 3 }}>{current?.name ?? 'None'}</b>
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={200}>
          <div className="menu">
            <div className="menu-title">{view.type === 'timeline' ? 'Start date' : 'Date property'}</div>
            {dates.map((p) => (
              <button key={p.id} className="menu-item" onClick={() => { patchViewLayout(db.id, view.id, { dateProp: p.id }); setAnchor(null); }}>
                <span className="mi-icon"><PropIcon type={p.type} /></span>
                <span className="mi-label">{p.name}</span>
                {view.layout?.dateProp === p.id && <span className="mi-hint">✓</span>}
              </button>
            ))}
            {view.type === 'timeline' && (
              <>
                <div className="menu-title">End date (optional)</div>
                {dates.map((p) => (
                  <button key={p.id} className="menu-item" onClick={() => { patchViewLayout(db.id, view.id, { endDateProp: p.id }); setAnchor(null); }}>
                    <span className="mi-icon"><PropIcon type={p.type} /></span>
                    <span className="mi-label">{p.name}</span>
                    {view.layout?.endDateProp === p.id && <span className="mi-hint">✓</span>}
                  </button>
                ))}
              </>
            )}
            {!dates.length && <div style={{ padding: 10, fontSize: 13, color: 'var(--text-tertiary)' }}>Add a Date property first.</div>}
          </div>
        </Popover>
      )}
    </>
  );
}

// ─── filter / sort / properties popovers ─────────────────────────────────────

function FilterPopover({ db, schema, view, anchor, onClose }: {
  db: PageDoc; schema: DbSchema; view: ViewDef; anchor: Anchor; onClose: () => void;
}) {
  const filters = view.filters ?? [];
  const set = (next: FilterRule[]) => patchView(db.id, view.id, { filters: next }, 'filter');
  const candidates = schema.properties;

  return (
    <Popover anchor={anchor} onClose={onClose} width={360}>
      <div style={{ padding: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>Filters</span>
          {filters.length > 1 && (
            <div className="seg" style={{ transform: 'scale(0.9)' }}>
              <button className={view.filterMode !== 'or' ? 'on' : ''} onClick={() => patchView(db.id, view.id, { filterMode: 'and' }, 'filter')}>All</button>
              <button className={view.filterMode === 'or' ? 'on' : ''} onClick={() => patchView(db.id, view.id, { filterMode: 'or' }, 'filter')}>Any</button>
            </div>
          )}
        </div>
        {filters.map((rule) => {
          const prop = findProp(schema, rule.propId);
          const ops = prop ? opsForType(prop.type) : [];
          return (
            <div key={rule.id} style={{ display: 'flex', gap: 5, marginBottom: 6, alignItems: 'center' }}>
              <select className="text-input" style={{ flex: 1 }} value={rule.propId}
                onChange={(e) => set(filters.map((f) => f.id === rule.id ? { ...f, propId: e.target.value, op: opsForType(findProp(schema, e.target.value)!.type)[0], value: undefined } : f))}>
                {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="text-input" style={{ width: 96 }} value={rule.op}
                onChange={(e) => set(filters.map((f) => f.id === rule.id ? { ...f, op: e.target.value as FilterRule['op'] } : f))}>
                {ops.map((op) => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
              </select>
              {opNeedsValue(rule.op) && (
                <FilterValueInput prop={prop} rule={rule} onChange={(v) => set(filters.map((f) => f.id === rule.id ? { ...f, value: v } : f))} />
              )}
              <button className="icon-btn small" onClick={() => set(filters.filter((f) => f.id !== rule.id))}><X size={13} /></button>
            </div>
          );
        })}
        <button className="db-tool" style={{ marginTop: 2 }} onClick={() => {
          const p = candidates[0];
          set([...filters, { id: uid(), propId: p.id, op: opsForType(p.type)[0], value: undefined }]);
        }}>
          <Plus size={14} /> Add filter
        </button>
      </div>
    </Popover>
  );
}

function FilterValueInput({ prop, rule, onChange }: { prop?: PropertyDef; rule: FilterRule; onChange: (v: any) => void }) {
  if (!prop) return null;
  if (prop.type === 'select' || prop.type === 'status') {
    return (
      <select className="text-input" style={{ width: 110 }} value={rule.value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">—</option>
        {(prop.options ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    );
  }
  if (prop.type === 'date') {
    return <input type="date" className="text-input" style={{ width: 130 }} value={rule.value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />;
  }
  return (
    <input className="text-input" style={{ width: 110 }} placeholder="value" value={rule.value ?? ''}
      inputMode={prop.type === 'number' ? 'decimal' : undefined}
      onChange={(e) => onChange(e.target.value)} />
  );
}

function SortPopover({ db, schema, view, anchor, onClose }: {
  db: PageDoc; schema: DbSchema; view: ViewDef; anchor: Anchor; onClose: () => void;
}) {
  const sorts = view.sorts ?? [];
  const set = (next: SortRule[]) => patchView(db.id, view.id, { sorts: next }, 'sort');
  return (
    <Popover anchor={anchor} onClose={onClose} width={320}>
      <div style={{ padding: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Sort</div>
        {sorts.map((rule) => (
          <div key={rule.id} style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
            <select className="text-input" style={{ flex: 1 }} value={rule.propId}
              onChange={(e) => set(sorts.map((s) => s.id === rule.id ? { ...s, propId: e.target.value } : s))}>
              {schema.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="seg">
              <button className={rule.dir === 'asc' ? 'on' : ''} onClick={() => set(sorts.map((s) => s.id === rule.id ? { ...s, dir: 'asc' } : s))}>↑</button>
              <button className={rule.dir === 'desc' ? 'on' : ''} onClick={() => set(sorts.map((s) => s.id === rule.id ? { ...s, dir: 'desc' } : s))}>↓</button>
            </div>
            <button className="icon-btn small" onClick={() => set(sorts.filter((s) => s.id !== rule.id))}><X size={13} /></button>
          </div>
        ))}
        <button className="db-tool" onClick={() => {
          const used = new Set(sorts.map((s) => s.propId));
          const p = schema.properties.find((x) => !used.has(x.id)) ?? schema.properties[0];
          set([...sorts, { id: uid(), propId: p.id, dir: 'asc' }]);
        }}>
          <Plus size={14} /> Add sort
        </button>
      </div>
    </Popover>
  );
}

function PropertiesPopover({ db, schema, view, anchor, onClose }: {
  db: PageDoc; schema: DbSchema; view: ViewDef; anchor: Anchor; onClose: () => void;
}) {
  const [newAnchor, setNewAnchor] = useState<Anchor | null>(null);
  const hidden = new Set(view.hiddenProps ?? []);
  const toggle = (id: string) => {
    const next = hidden.has(id) ? [...hidden].filter((x) => x !== id) : [...hidden, id];
    patchView(db.id, view.id, { hiddenProps: next }, 'properties');
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={250}>
      <div className="menu">
        <div className="menu-title">Properties</div>
        {schema.properties.map((p) => (
          <div key={p.id} className="db-prop-toggle" onClick={() => p.type !== 'title' && toggle(p.id)}>
            <span className="mi-icon"><PropIcon type={p.type} /></span>
            <span className="mi-label" style={{ flex: 1, fontSize: 13.5 }}>{p.name}</span>
            {p.type === 'title'
              ? <span className="mi-hint">Always on</span>
              : <button className={`switch ${!hidden.has(p.id) ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); toggle(p.id); }} />}
          </div>
        ))}
        <div className="menu-sep" />
        <button className="menu-item" onClick={(e) => setNewAnchor(anchorFromEl(e.currentTarget))}>
          <span className="mi-icon"><Plus size={14} /></span><span className="mi-label">New property</span>
        </button>
      </div>
      {newAnchor && <NewPropertyPopover dbId={db.id} anchor={newAnchor} onClose={() => { setNewAnchor(null); onClose(); }} />}
    </Popover>
  );
}

// ─── view body dispatch ──────────────────────────────────────────────────────

interface ViewProps { db: PageDoc; schema: DbSchema; view: ViewDef; rows: PageDoc[]; addRow: (rp?: Record<string, any>) => string }

function ViewBody(props: ViewProps) {
  switch (props.view.type) {
    case 'board': return <BoardView {...props} />;
    case 'gallery': return <GalleryView {...props} />;
    case 'list': return <ListView {...props} />;
    case 'calendar': return <CalendarView {...props} />;
    case 'timeline': return <TimelineView {...props} />;
    default: return <TableView {...props} />;
  }
}

// ─── TABLE ───────────────────────────────────────────────────────────────────

function TableView({ db, schema, view, rows, addRow }: ViewProps) {
  const cols = visibleProps(schema, view);
  const titleProp = schema.properties.find((p) => p.type === 'title')!;
  const allCols = [titleProp, ...cols];
  const [header, setHeader] = useState<{ propId: string; anchor: Anchor } | null>(null);
  const [newProp, setNewProp] = useState<Anchor | null>(null);
  const [focusRow, setFocusRow] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<{ row: PageDoc; anchor: Anchor } | null>(null);
  const [calcMenu, setCalcMenu] = useState<{ propId: string; anchor: Anchor } | null>(null);
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [overRow, setOverRow] = useState<string | null>(null);
  const [resize, setResize] = useState<{ propId: string; w: number } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const calc: Record<string, Aggregation> = view.layout?.calc ?? {};
  const widths: Record<string, number> = view.layout?.colWidths ?? {};
  const sorted = (view.sorts ?? []).length > 0;
  const groupProp = view.groupByPropId ? findProp(schema, view.groupByPropId) : undefined;
  const groups = groupProp ? groupRowsByProp(rows, groupProp) : null;

  const colW = (p: PropertyDef) => (resize?.propId === p.id ? resize.w : colWidth(p, widths));
  const totalW = allCols.reduce((s, p) => s + colW(p), 0) + 44;

  const startResize = (e: React.PointerEvent, p: PropertyDef) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX; const w0 = colW(p);
    const move = (ev: PointerEvent) => setResize({ propId: p.id, w: Math.max(72, w0 + ev.clientX - x0) });
    const up = (ev: PointerEvent) => {
      patchViewLayout(db.id, view.id, { colWidths: { ...widths, [p.id]: Math.max(72, w0 + ev.clientX - x0) } });
      setResize(null);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const toggleGroup = (key: string) => setCollapsed((prev) => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
  });

  const dropOnRow = (targetId: string) => {
    if (dragRow && dragRow !== targetId) { captureUndo(db.id, 'reorder row', false); moveRow(dragRow, targetId); }
    setDragRow(null);
    setOverRow(null);
  };

  const renderRow = (row: PageDoc) => (
    <tr
      key={row.id}
      className={`db-row ${overRow === row.id ? 'row-over' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('zenith/row-move')) { e.preventDefault(); setOverRow(row.id); } }}
      onDrop={() => dropOnRow(row.id)}
    >
      <td>
        <div className="db-cell-title">
          {!sorted && !groupProp && (
            <span
              className="db-row-grip"
              draggable
              title="Drag to reorder"
              onDragStart={(e) => { e.dataTransfer.setData('zenith/row-move', row.id); e.dataTransfer.effectAllowed = 'move'; setDragRow(row.id); }}
              onDragEnd={() => { setDragRow(null); setOverRow(null); }}
            >⋮⋮</span>
          )}
          <span>{row.icon || ''}</span>
          <TitleCellInput row={row} autoFocus={focusRow === row.id} />
          <button className="db-open-btn" onClick={() => openPeek(row.id)}>⤢ Open</button>
          <button className="icon-btn small" onClick={(e) => setRowMenu({ row, anchor: anchorFromEl(e.currentTarget) })}><MoreHorizontal size={13} /></button>
        </div>
      </td>
      {cols.map((p) => (
        <td key={p.id}><PropCell dbId={db.id} row={row} prop={p} schema={schema} /></td>
      ))}
      <td />
    </tr>
  );

  const newRowCell = (preset: Record<string, any>) => (
    <tr>
      <td colSpan={allCols.length + 1} style={{ padding: 0 }}>
        <div className="db-newrow" onClick={() => setFocusRow(addRow(preset))}><Plus size={15} /> New</div>
      </td>
    </tr>
  );

  return (
    <>
      <div className="db-table-wrap">
        <table className={`db-table fixed ${view.layout?.wrap ? 'wrap' : ''}`} style={{ width: '100%', minWidth: totalW }}>
          <colgroup>
            {allCols.map((p) => <col key={p.id} style={{ width: colW(p) }} />)}
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th>
                <div className="db-th"><span className="db-th-icon"><PropIcon type="title" /></span>{titleProp.name}</div>
                <span className="db-th-resize" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => startResize(e, titleProp)} />
              </th>
              {cols.map((p) => (
                <th key={p.id}>
                  <div className="db-th" onClick={(e) => setHeader({ propId: p.id, anchor: anchorFromEl(e.currentTarget) })}>
                    <span className="db-th-icon"><PropIcon type={p.type} /></span>{p.name}
                  </div>
                  <span className="db-th-resize" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => startResize(e, p)} />
                </th>
              ))}
              <th className="db-th-add">
                <div className="db-th" style={{ justifyContent: 'center' }} onClick={(e) => setNewProp(anchorFromEl(e.currentTarget))}>
                  <Plus size={15} />
                </div>
              </th>
            </tr>
          </thead>
          {groups ? (
            groups.map((g) => (
              <tbody key={g.key}>
                <tr className="db-group-row">
                  <td colSpan={allCols.length + 1}>
                    <div className="db-group-head" onClick={() => toggleGroup(g.key)}>
                      <ChevronRight size={14} className="gchev" style={{ transform: collapsed.has(g.key) ? 'none' : 'rotate(90deg)' }} />
                      {g.color ? <span className={`chip pill-${g.color}`}>{g.label}</span> : <span className="chip pill-gray">{g.label}</span>}
                      <span className="count">{g.rows.length}</span>
                    </div>
                  </td>
                </tr>
                {!collapsed.has(g.key) && g.rows.map(renderRow)}
                {!collapsed.has(g.key) && newRowCell(g.preset)}
              </tbody>
            ))
          ) : (
            <tbody>{rows.map(renderRow)}</tbody>
          )}
          <tfoot>
            <tr className="db-calc-row">
              {allCols.map((p) => {
                const agg = calc[p.id];
                const res = agg ? computeAggregation(rows, p, schema, agg) : null;
                const label = agg ? CALC_OPTIONS.find((c) => c.id === agg)?.label : null;
                return (
                  <td key={p.id} className="db-calc-cell" onClick={(e) => setCalcMenu({ propId: p.id, anchor: anchorFromEl(e.currentTarget) })}>
                    {res
                      ? <span className="db-calc-val"><span className="db-calc-label">{label}</span> <b>{res.display || '—'}</b></span>
                      : <span className="db-calc-hint">Calculate</span>}
                  </td>
                );
              })}
              <td />
            </tr>
          </tfoot>
        </table>
        {!groups && (
          <div className="db-newrow" onClick={() => setFocusRow(addRow())}>
            <Plus size={15} /> New row
          </div>
        )}
      </div>
      <div className="db-footcount">{rows.length} {rows.length === 1 ? 'row' : 'rows'}</div>

      {header && <PropertyMenuPopover dbId={db.id} propId={header.propId} view={view} allowInsert anchor={header.anchor} onClose={() => setHeader(null)} />}
      {newProp && <NewPropertyPopover dbId={db.id} anchor={newProp} onClose={() => setNewProp(null)} />}
      {rowMenu && <RowMenu db={db} row={rowMenu.row} anchor={rowMenu.anchor} onClose={() => setRowMenu(null)} />}
      {calcMenu && (
        <CalcMenu
          current={calc[calcMenu.propId]}
          anchor={calcMenu.anchor}
          onPick={(agg) => {
            const next = { ...calc };
            if (agg) next[calcMenu.propId] = agg; else delete next[calcMenu.propId];
            patchViewLayout(db.id, view.id, { calc: next });
            setCalcMenu(null);
          }}
          onClose={() => setCalcMenu(null)}
        />
      )}
    </>
  );
}

function CalcMenu({ current, anchor, onPick, onClose }: {
  current?: Aggregation; anchor: Anchor; onPick: (agg: Aggregation | null) => void; onClose: () => void;
}) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={200}>
      <div className="menu" style={{ maxHeight: 340, overflowY: 'auto' }}>
        <button className="menu-item" onClick={() => onPick(null)}>
          <span className="mi-label">None</span>{!current && <span className="mi-hint">✓</span>}
        </button>
        <div className="menu-sep" />
        {CALC_OPTIONS.map((c) => (
          <button key={c.id} className="menu-item" onClick={() => onPick(c.id)}>
            <span className="mi-label">{c.label}</span>{current === c.id && <span className="mi-hint">✓</span>}
          </button>
        ))}
      </div>
    </Popover>
  );
}

function RowMenu({ db, row, anchor, onClose }: { db: PageDoc; row: PageDoc; anchor: Anchor; onClose: () => void }) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={190}>
      <div className="menu">
        <button className="menu-item" onClick={() => { openPeek(row.id); onClose(); }}>
          <span className="mi-icon">⤢</span><span className="mi-label">Open</span>
        </button>
        <button className="menu-item" onClick={() => { captureUndo(db.id, 'dup row', false); duplicatePage(row.id); onClose(); }}>
          <span className="mi-icon"><Plus size={14} /></span><span className="mi-label">Duplicate</span>
        </button>
        <div className="menu-sep" />
        <button className="menu-item danger" onClick={() => { captureUndo(db.id, 'del row', false); deletePage(row.id); onClose(); }}>
          <span className="mi-icon"><Trash2 size={14} /></span><span className="mi-label">Delete</span>
        </button>
      </div>
    </Popover>
  );
}

// ─── BOARD ───────────────────────────────────────────────────────────────────

function BoardView({ db, schema, view, rows, addRow }: ViewProps) {
  const groupProp = view.groupByPropId ? findProp(schema, view.groupByPropId) : undefined;
  const [dragOver, setDragOver] = useState<string | null>(null);
  if (!groupProp) return <div className="db-empty">Choose a property to group by (Select or Status) from the toolbar.</div>;
  const groups = groupForBoard(rows, groupProp);
  const cardProps = visibleProps(schema, view).filter((p) => p.id !== groupProp.id);

  const drop = (optionId: string | undefined, rowId: string) => {
    captureUndo(db.id, 'move card', false);
    updatePage(rowId, { rowProps: { [groupProp.id]: optionId } });
    setDragOver(null);
  };

  return (
    <div className="db-board">
      {groups.map((g) => {
        const key = g.option?.id ?? '__none';
        return (
          <div
            key={key}
            className={`db-bcol ${dragOver === key ? 'dragover' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
            onDragLeave={() => setDragOver((d) => (d === key ? null : d))}
            onDrop={(e) => drop(g.option?.id, e.dataTransfer.getData('zenith/row'))}
          >
            <div className="db-bcol-head">
              {g.option ? <span className={`chip pill-${g.option.color}`}>{g.option.name}</span> : <span className="chip pill-gray">No {groupProp.name}</span>}
              <span className="count">{g.rows.length}</span>
            </div>
            {g.rows.map((row) => (
              <div
                key={row.id}
                className="db-card"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('zenith/row', row.id)}
                onClick={() => openPeek(row.id)}
              >
                <div className="db-card-title">{row.icon || ''} {row.title || 'Untitled'}</div>
                <div className="db-card-props">
                  {cardProps.map((p) => {
                    const empty = storedValue(row, p) == null || storedValue(row, p) === '';
                    if (empty && p.type !== 'checkbox' && p.type !== 'formula') return null;
                    return (
                      <div key={p.id} className="db-card-prop">
                        <span className="k">{p.name}</span>
                        <ValueDisplay row={row} prop={p} schema={schema} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="db-bcol-add" onClick={() => openPeek(addRow(g.option ? { [groupProp.id]: g.option.id } : {}))}>
              <Plus size={14} /> New
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── GALLERY ─────────────────────────────────────────────────────────────────

function GalleryView({ db, schema, view, rows, addRow }: ViewProps) {
  const size = (view.layout?.cardSize as 's' | 'm' | 'l') ?? 'm';
  const cardProps = visibleProps(schema, view);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div className="seg">
          {(['s', 'm', 'l'] as const).map((s) => (
            <button key={s} className={size === s ? 'on' : ''} onClick={() => patchViewLayout(db.id, view.id, { cardSize: s })}>{s.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <div className={`db-gallery ${size}`}>
        {rows.map((row) => (
          <div key={row.id} className="db-gcard" onClick={() => openPeek(row.id)}>
            <div className="db-gcover" style={row.cover && !row.cover.startsWith('g:') ? { backgroundImage: `url(${row.cover})` } : undefined}>
              {(!row.cover || row.cover.startsWith('g:')) && (row.icon || '📄')}
            </div>
            <div className="db-gbody">
              <div className="db-gtitle">{row.title || 'Untitled'}</div>
              <div className="db-card-props">
                {cardProps.map((p) => {
                  const empty = storedValue(row, p) == null || storedValue(row, p) === '';
                  if (empty && p.type !== 'checkbox' && p.type !== 'formula') return null;
                  return <div key={p.id} className="db-card-prop"><ValueDisplay row={row} prop={p} schema={schema} /></div>;
                })}
              </div>
            </div>
          </div>
        ))}
        <div className="db-gcard" onClick={() => openPeek(addRow())} style={{ display: 'grid', placeItems: 'center', minHeight: 150, color: 'var(--text-tertiary)' }}>
          <span><Plus size={18} /> New</span>
        </div>
      </div>
    </>
  );
}

// ─── LIST ────────────────────────────────────────────────────────────────────

function ListView({ db, schema, view, rows, addRow }: ViewProps) {
  const cardProps = visibleProps(schema, view);
  return (
    <div className="db-list">
      {rows.map((row) => (
        <div key={row.id} className="db-litem" onClick={() => openPeek(row.id)}>
          <span style={{ fontSize: 15 }}>{row.icon || '📄'}</span>
          <span className="db-ltitle">{row.title || 'Untitled'}</span>
          <span className="db-lprops">
            {cardProps.map((p) => {
              const empty = storedValue(row, p) == null || storedValue(row, p) === '';
              if (empty && p.type !== 'checkbox' && p.type !== 'formula') return null;
              return <ValueDisplay key={p.id} row={row} prop={p} schema={schema} />;
            })}
          </span>
        </div>
      ))}
      <div className="db-newrow" onClick={() => openPeek(addRow())}><Plus size={15} /> New row</div>
      {!rows.length && <div className="db-empty">No rows yet.</div>}
    </div>
  );
}

// ─── CALENDAR ────────────────────────────────────────────────────────────────

function CalendarView({ db, schema, view, rows, addRow }: ViewProps) {
  const dateProp = view.layout?.dateProp ? findProp(schema, view.layout.dateProp) : undefined;
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  if (!dateProp) return <div className="db-empty">Pick a date property from the toolbar to populate the calendar.</div>;

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday-first
  const gridStart = new Date(year, month, 1 - startPad);
  const today = new Date();
  const cells = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));

  const eventsOn = (day: Date) => rows.filter((r) => {
    const ms = parseDateValue(storedValue(r, dateProp));
    return ms !== null && sameDay(ms, day.getTime());
  });

  return (
    <div>
      <div className="db-cal-head">
        <button className="icon-btn" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={17} /></button>
        <div className="db-cal-title">{cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
        <button className="icon-btn" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={17} /></button>
        <button className="btn small" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</button>
      </div>
      <div className="db-cal-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="db-cal-dow">{d}</div>)}
        {cells.map((day, i) => {
          const dim = day.getMonth() !== month;
          const isToday = sameDay(day.getTime(), today.getTime());
          return (
            <div key={i} className={`db-cal-cell ${dim ? 'dim' : ''} ${isToday ? 'today' : ''}`}>
              <div className="d">
                {day.getDate()}
                <span className="db-cal-add" onClick={() => openPeek(addRow({ [dateProp.id]: toISODate(day.getTime()) }))}><Plus size={13} /></span>
              </div>
              {eventsOn(day).map((r) => (
                <div key={r.id} className="db-cal-ev" onClick={() => openPeek(r.id)}>{r.icon ? r.icon + ' ' : ''}{r.title || 'Untitled'}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TIMELINE ────────────────────────────────────────────────────────────────

function TimelineView({ schema, view, rows }: ViewProps) {
  const startProp = view.layout?.dateProp ? findProp(schema, view.layout.dateProp) : undefined;
  const endProp = view.layout?.endDateProp ? findProp(schema, view.layout.endDateProp) : undefined;
  if (!startProp) return <div className="db-empty">Pick a start date property from the toolbar to draw the timeline.</div>;

  const dated = rows.map((r) => ({ row: r, start: parseDateValue(storedValue(r, startProp)) }))
    .filter((x): x is { row: PageDoc; start: number } => x.start !== null);
  const undated = rows.filter((r) => parseDateValue(storedValue(r, startProp)) === null);

  const today = new Date();
  let min = dated.length ? Math.min(...dated.map((d) => d.start)) : today.getTime();
  let max = dated.length ? Math.max(...dated.map((d) => d.start)) : today.getTime();
  const winStart = new Date(new Date(min).getFullYear(), new Date(min).getMonth(), 1);
  const endRef = new Date(max);
  const winEnd = new Date(endRef.getFullYear(), endRef.getMonth() + 1, 1);
  const months: Date[] = [];
  for (let d = new Date(winStart); d < winEnd; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(new Date(d));
  if (!months.length) months.push(new Date(winStart));
  const span = Math.max(1, winEnd.getTime() - winStart.getTime());
  const pct = (ms: number) => ((ms - winStart.getTime()) / span) * 100;

  return (
    <div>
      <div className="db-tl">
        <div className="db-tl-head" style={{ minWidth: months.length * 90 }}>
          {months.map((m, i) => <div key={i} className="db-tl-mon">{m.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}</div>)}
        </div>
        {dated.map(({ row, start }) => {
          const end = endProp ? parseDateValue(storedValue(row, endProp)) : null;
          const endMs = end && end > start ? end : start + 2 * 86400000;
          return (
            <div key={row.id} className="db-tl-row" style={{ minWidth: months.length * 90 }}>
              <div className="db-tl-bar" style={{ left: `${pct(start)}%`, width: `${Math.max(6, pct(endMs) - pct(start))}%` }} onClick={() => openPeek(row.id)}>
                {row.icon ? row.icon + ' ' : ''}{row.title || 'Untitled'}
              </div>
            </div>
          );
        })}
        {!dated.length && <div className="db-empty">No rows have a {startProp.name} yet.</div>}
      </div>
      {undated.length > 0 && (
        <div className="db-tl-undated">
          <div className="menu-title" style={{ paddingLeft: 0 }}>Not scheduled</div>
          {undated.map((r) => (
            <div key={r.id} className="db-litem" onClick={() => openPeek(r.id)}>
              <span style={{ fontSize: 15 }}>{r.icon || '📄'}</span>
              <span className="db-ltitle">{r.title || 'Untitled'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── row-page property panel ─────────────────────────────────────────────────

export function RowPropsSection({ page }: { page: PageDoc }) {
  useStore((s) => (page.databaseId ? s.pageTick[page.databaseId] : 0));
  useStore((s) => s.pageTick[page.id]);
  const db = page.databaseId ? getPage(page.databaseId) : undefined;
  const schema = db?.dbSchema;
  const [propMenu, setPropMenu] = useState<{ propId: string; anchor: Anchor } | null>(null);
  const [newProp, setNewProp] = useState<Anchor | null>(null);
  if (!db || !schema) return null;
  const props = schema.properties.filter((p) => p.type !== 'title');

  return (
    <div className="db-rowprops">
      {props.map((p) => (
        <div key={p.id} className="db-rowprop">
          <div className="db-rowprop-label" onClick={(e) => setPropMenu({ propId: p.id, anchor: anchorFromEl(e.currentTarget) })}>
            <PropIcon type={p.type} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
          </div>
          <div className="db-rowprop-val">
            <PropCell dbId={db.id} row={page} prop={p} schema={schema} variant="page" />
          </div>
        </div>
      ))}
      <div className="db-addprop" onClick={(e) => setNewProp(anchorFromEl(e.currentTarget))}>
        <Plus size={14} /> Add a property
      </div>
      {propMenu && <PropertyMenuPopover dbId={db.id} propId={propMenu.propId} anchor={propMenu.anchor} onClose={() => setPropMenu(null)} />}
      {newProp && <NewPropertyPopover dbId={db.id} anchor={newProp} onClose={() => setNewProp(null)} />}
    </div>
  );
}

void optionById; void updateDbSchema; void useRef;
