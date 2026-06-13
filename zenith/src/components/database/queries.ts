// Pure data helpers for database views: value access, formatting, filtering,
// sorting, grouping, CSV export — plus small schema-mutation helpers.
import { evalFormula } from '../../lib/formula';
import { uid } from '../../lib/id';
import {
  captureUndo, getPage, getRows, updateDbSchema,
} from '../../lib/store';
import type {
  DbSchema, FilterRule, PageDoc, PropertyDef, SelectOption, SortRule, ViewDef, ViewType,
} from '../../lib/types';
import { SELECT_COLORS } from '../../lib/types';

// ─── basic value access ──────────────────────────────────────────────────────

export function findProp(schema: DbSchema, propId: string): PropertyDef | undefined {
  return schema.properties.find((p) => p.id === propId);
}

export function findPropByName(schema: DbSchema, name: string): PropertyDef | undefined {
  const exact = schema.properties.find((p) => p.name === name);
  if (exact) return exact;
  const lower = name.trim().toLowerCase();
  return schema.properties.find((p) => p.name.trim().toLowerCase() === lower);
}

/** stored value of a property on a row (no formatting, no formula eval) */
export function storedValue(row: PageDoc, prop: PropertyDef): any {
  switch (prop.type) {
    case 'title': return row.title;
    case 'createdTime': return row.createdAt;
    case 'updatedTime': return row.updatedAt;
    default: return row.rowProps?.[prop.id];
  }
}

export function optionById(prop: PropertyDef, id: any): SelectOption | undefined {
  if (typeof id !== 'string') return undefined;
  return prop.options?.find((o) => o.id === id);
}

/** value as seen by formulas: option names, relation titles, raw scalars */
export function formulaValue(
  row: PageDoc, prop: PropertyDef, schema: DbSchema, visiting: Set<string>,
): any {
  const v = storedValue(row, prop);
  switch (prop.type) {
    case 'select': case 'status':
      return optionById(prop, v)?.name ?? '';
    case 'multiSelect':
      return Array.isArray(v) ? v.map((id) => optionById(prop, id)?.name ?? '').filter(Boolean) : [];
    case 'relation':
      return Array.isArray(v) ? v.map((id) => getPage(id)?.title || 'Untitled') : [];
    case 'number':
      return typeof v === 'number' ? v : v == null || v === '' ? null : Number(v);
    case 'checkbox':
      return !!v;
    case 'formula':
      return computeFormula(row, prop, schema, visiting);
    case 'rollup': {
      const r = computeRollup(row, prop, schema);
      return r.value ?? r.display;
    }
    default:
      return v ?? (prop.type === 'createdTime' || prop.type === 'updatedTime' ? 0 : '');
  }
}

/** evaluate a formula property for a row (cycle-safe) */
export function computeFormula(
  row: PageDoc, prop: PropertyDef, schema: DbSchema, visiting: Set<string> = new Set(),
): any {
  if (visiting.has(prop.id)) return '⚠ circular reference';
  visiting.add(prop.id);
  const out = evalFormula(prop.formula ?? '', {
    prop: (name: string) => {
      const target = findPropByName(schema, name);
      if (!target) throw new Error(`unknown property "${name}"`);
      return formulaValue(row, target, schema, visiting);
    },
  });
  visiting.delete(prop.id);
  return out;
}

// ─── aggregation (column calculations + rollups) ─────────────────────────────

import type { Aggregation } from '../../lib/types';

export interface AggResult { value: number | string | null; display: string }

export const CALC_OPTIONS: Array<{ id: Aggregation; label: string }> = [
  { id: 'count', label: 'Count all' },
  { id: 'countValues', label: 'Count values' },
  { id: 'countUnique', label: 'Count unique' },
  { id: 'countEmpty', label: 'Count empty' },
  { id: 'countNotEmpty', label: 'Count not empty' },
  { id: 'percentEmpty', label: 'Percent empty' },
  { id: 'percentNotEmpty', label: 'Percent not empty' },
  { id: 'sum', label: 'Sum' },
  { id: 'average', label: 'Average' },
  { id: 'median', label: 'Median' },
  { id: 'min', label: 'Min' },
  { id: 'max', label: 'Max' },
  { id: 'range', label: 'Range' },
  { id: 'earliest', label: 'Earliest date' },
  { id: 'latest', label: 'Latest date' },
  { id: 'checked', label: 'Checked' },
  { id: 'unchecked', label: 'Unchecked' },
  { id: 'percentChecked', label: 'Percent checked' },
];

export const ROLLUP_AGGS: Array<{ id: Aggregation; label: string }> = [
  { id: 'show', label: 'Show original' },
  ...CALC_OPTIONS,
];

function aggNumbers(rows: PageDoc[], prop: PropertyDef, schema: DbSchema): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const n = comparableNumber(r, prop, schema);
    if (n !== null) out.push(n);
  }
  return out;
}

/** reduce a set of rows by one of their property's values */
export function computeAggregation(rows: PageDoc[], prop: PropertyDef, schema: DbSchema, agg: Aggregation): AggResult {
  const total = rows.length;
  const empties = rows.filter((r) => isValueEmpty(r, prop, schema)).length;
  const notEmpty = total - empties;
  const pct = (n: number) => (total === 0 ? '0%' : `${Math.round((n / total) * 100)}%`);
  const num = () => aggNumbers(rows, prop, schema);
  const dates = () => rows.map((r) => parseDateValue(storedValue(r, prop))).filter((d): d is number => d !== null);
  const numFmt = (n: number) => formatNumber(n, prop.numberFormat);

  const mk = (value: number | string | null, display?: string): AggResult => ({ value, display: display ?? (value === null ? '' : String(value)) });

  switch (agg) {
    case 'show':
      return mk(null, rows.map((r) => displayValue(r, prop, schema)).filter(Boolean).join(', '));
    case 'count': return mk(total, String(total));
    case 'countValues': return mk(notEmpty, String(notEmpty));
    case 'countUnique': {
      const set = new Set(rows.map((r) => displayValue(r, prop, schema)).filter(Boolean));
      return mk(set.size, String(set.size));
    }
    case 'countEmpty': return mk(empties, String(empties));
    case 'countNotEmpty': return mk(notEmpty, String(notEmpty));
    case 'percentEmpty': return mk(total ? empties / total : 0, pct(empties));
    case 'percentNotEmpty': return mk(total ? notEmpty / total : 0, pct(notEmpty));
    case 'sum': { const n = num(); const s = n.reduce((a, b) => a + b, 0); return mk(s, numFmt(s)); }
    case 'average': { const n = num(); if (!n.length) return mk(null, '—'); const a = n.reduce((x, y) => x + y, 0) / n.length; return mk(a, numFmt(a)); }
    case 'median': {
      const n = num().sort((a, b) => a - b);
      if (!n.length) return mk(null, '—');
      const mid = Math.floor(n.length / 2);
      const m = n.length % 2 ? n[mid] : (n[mid - 1] + n[mid]) / 2;
      return mk(m, numFmt(m));
    }
    case 'min': { const n = num(); if (!n.length) return mk(null, '—'); const m = Math.min(...n); return mk(m, numFmt(m)); }
    case 'max': { const n = num(); if (!n.length) return mk(null, '—'); const m = Math.max(...n); return mk(m, numFmt(m)); }
    case 'range': { const n = num(); if (!n.length) return mk(null, '—'); const r = Math.max(...n) - Math.min(...n); return mk(r, numFmt(r)); }
    case 'earliest': { const d = dates(); if (!d.length) return mk(null, '—'); const e = Math.min(...d); return mk(e, formatDate(e)); }
    case 'latest': { const d = dates(); if (!d.length) return mk(null, '—'); const e = Math.max(...d); return mk(e, formatDate(e)); }
    case 'checked': { const c = rows.filter((r) => storedValue(r, prop) === true).length; return mk(c, String(c)); }
    case 'unchecked': { const c = rows.filter((r) => storedValue(r, prop) !== true).length; return mk(c, String(c)); }
    case 'percentChecked': { const c = rows.filter((r) => storedValue(r, prop) === true).length; return mk(total ? c / total : 0, pct(c)); }
    default: return mk(null, '');
  }
}

/** evaluate a rollup property for one row */
export function computeRollup(row: PageDoc, prop: PropertyDef, schema: DbSchema): AggResult {
  const cfg = prop.rollup;
  if (!cfg) return { value: null, display: '' };
  const relProp = findProp(schema, cfg.relationPropId);
  if (!relProp || relProp.type !== 'relation') return { value: null, display: '⚠ pick a relation' };
  const ids = storedValue(row, relProp);
  const relatedRows = (Array.isArray(ids) ? ids : []).map((id) => getPage(id)).filter((p): p is PageDoc => !!p && !p.deletedAt);
  const targetDb = relProp.relationDatabaseId ? getPage(relProp.relationDatabaseId) : undefined;
  const targetSchema = targetDb?.dbSchema;
  if (!targetSchema) return { value: null, display: '' };
  const targetProp = findProp(targetSchema, cfg.targetPropId);
  if (!targetProp) return { value: null, display: '⚠ pick a property' };
  return computeAggregation(relatedRows, targetProp, targetSchema, cfg.agg);
}

// ─── formatting ──────────────────────────────────────────────────────────────

const NUM_FMT: Record<string, Intl.NumberFormat> = {
  commas: new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }),
  usd: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
  eur: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }),
  inr: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }),
};

export function formatNumber(v: any, format?: PropertyDef['numberFormat']): string {
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  switch (format) {
    case 'commas': return NUM_FMT.commas.format(n);
    case 'percent': return `${Math.round(n * 1e6) / 1e6}%`;
    case 'usd': return NUM_FMT.usd.format(n);
    case 'eur': return NUM_FMT.eur.format(n);
    case 'inr': return NUM_FMT.inr.format(n);
    default: return String(Math.round(n * 1e10) / 1e10);
  }
}

/** parse 'YYYY-MM-DD' (local), ms numbers, or anything Date.parse takes → ms | null */
export function parseDateValue(v: any): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

export function toISODate(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function formatDate(v: any): string {
  const ms = parseDateValue(v);
  if (ms === null) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(v: any): string {
  const ms = parseDateValue(v);
  if (ms === null) return '';
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatFormulaResult(v: any): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'number') return String(Math.round(v * 1e10) / 1e10);
  return String(v);
}

/** plain-text rendering of any property (CSV, list rows, quick search) */
export function displayValue(row: PageDoc, prop: PropertyDef, schema: DbSchema): string {
  const v = storedValue(row, prop);
  switch (prop.type) {
    case 'title': return row.title || '';
    case 'number': return formatNumber(v, prop.numberFormat);
    case 'select': case 'status': return optionById(prop, v)?.name ?? '';
    case 'multiSelect':
      return Array.isArray(v) ? v.map((id) => optionById(prop, id)?.name ?? '').filter(Boolean).join(', ') : '';
    case 'date': return formatDate(v);
    case 'checkbox': return v ? '✓' : '';
    case 'formula': return formatFormulaResult(computeFormula(row, prop, schema));
    case 'relation':
      return Array.isArray(v) ? v.map((id) => getPage(id)?.title || 'Untitled').join(', ') : '';
    case 'file':
      return Array.isArray(v) ? v.map((f: any) => f?.name ?? '').filter(Boolean).join(', ') : '';
    case 'rollup': return computeRollup(row, prop, schema).display;
    case 'createdTime': return formatDateTime(row.createdAt);
    case 'updatedTime': return formatDateTime(row.updatedAt);
    default: return v == null ? '' : String(v);
  }
}

export function isValueEmpty(row: PageDoc, prop: PropertyDef, schema: DbSchema): boolean {
  const v = prop.type === 'formula' ? computeFormula(row, prop, schema)
    : prop.type === 'rollup' ? computeRollup(row, prop, schema).value
    : storedValue(row, prop);
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// ─── filtering ───────────────────────────────────────────────────────────────

function comparableNumber(row: PageDoc, prop: PropertyDef, schema: DbSchema): number | null {
  switch (prop.type) {
    case 'number': {
      const v = storedValue(row, prop);
      const n = typeof v === 'number' ? v : Number(v);
      return v == null || v === '' || Number.isNaN(n) ? null : n;
    }
    case 'date': case 'createdTime': case 'updatedTime':
      return parseDateValue(storedValue(row, prop));
    case 'formula': {
      const v = computeFormula(row, prop, schema);
      if (typeof v === 'number') return v;
      const n = Number(v);
      return v != null && v !== '' && !Number.isNaN(n) ? n : null;
    }
    case 'rollup': {
      const v = computeRollup(row, prop, schema).value;
      return typeof v === 'number' ? v : null;
    }
    default: return null;
  }
}

export function matchRule(row: PageDoc, rule: FilterRule, schema: DbSchema): boolean {
  const prop = findProp(schema, rule.propId);
  if (!prop) return true; // dangling rule: ignore
  const stored = storedValue(row, prop);
  const text = displayValue(row, prop, schema).toLowerCase();
  const needle = String(rule.value ?? '').toLowerCase();

  switch (rule.op) {
    case 'isEmpty': return isValueEmpty(row, prop, schema);
    case 'isNotEmpty': return !isValueEmpty(row, prop, schema);
    case 'checked': return stored === true;
    case 'unchecked': return !stored;
    case 'contains':
    case 'notContains': {
      let hit: boolean;
      if (prop.type === 'multiSelect') {
        hit = Array.isArray(stored) && stored.includes(rule.value);
      } else {
        hit = needle !== '' && text.includes(needle);
      }
      return rule.op === 'contains' ? hit : !hit;
    }
    case 'is':
    case 'isNot': {
      let hit: boolean;
      if (prop.type === 'select' || prop.type === 'status') {
        hit = stored === rule.value;
      } else if (prop.type === 'date' || prop.type === 'createdTime' || prop.type === 'updatedTime') {
        const a = parseDateValue(stored);
        const b = parseDateValue(rule.value);
        hit = a !== null && b !== null && sameDay(a, b);
      } else if (prop.type === 'number' || prop.type === 'formula') {
        const n = comparableNumber(row, prop, schema);
        const target = Number(rule.value);
        hit = !Number.isNaN(target) && n !== null
          ? n === target
          : text === needle;
      } else {
        hit = text === needle;
      }
      return rule.op === 'is' ? hit : !hit;
    }
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const n = comparableNumber(row, prop, schema);
      const t = Number(rule.value);
      if (n === null || Number.isNaN(t)) return false;
      return rule.op === 'gt' ? n > t : rule.op === 'gte' ? n >= t : rule.op === 'lt' ? n < t : n <= t;
    }
    case 'before': case 'after': {
      const a = parseDateValue(stored);
      const b = parseDateValue(rule.value);
      if (a === null || b === null) return false;
      return rule.op === 'before' ? a < b : a > dayEnd(b);
    }
    default: return true;
  }
}

export function sameDay(a: number, b: number): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function dayEnd(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
}

// ─── sorting ─────────────────────────────────────────────────────────────────

function sortKey(row: PageDoc, prop: PropertyDef, schema: DbSchema): number | string | null {
  const v = storedValue(row, prop);
  switch (prop.type) {
    case 'number': {
      const n = typeof v === 'number' ? v : Number(v);
      return v == null || v === '' || Number.isNaN(n) ? null : n;
    }
    case 'checkbox': return v ? 1 : 0;
    case 'date': case 'createdTime': case 'updatedTime': return parseDateValue(v);
    case 'select': case 'status': {
      const i = prop.options?.findIndex((o) => o.id === v) ?? -1;
      return i < 0 ? null : i;
    }
    case 'formula': {
      const r = computeFormula(row, prop, schema);
      if (r == null || r === '') return null;
      if (typeof r === 'number') return r;
      if (typeof r === 'boolean') return r ? 1 : 0;
      return String(r).toLowerCase();
    }
    case 'rollup': {
      const r = computeRollup(row, prop, schema).value;
      if (r == null || r === '') return null;
      return typeof r === 'number' ? r : String(r).toLowerCase();
    }
    default: {
      const s = displayValue(row, prop, schema).toLowerCase();
      return s === '' ? null : s;
    }
  }
}

export function sortRows(rows: PageDoc[], sorts: SortRule[], schema: DbSchema): PageDoc[] {
  if (!sorts.length) return rows;
  const active = sorts
    .map((s) => ({ rule: s, prop: findProp(schema, s.propId) }))
    .filter((x): x is { rule: SortRule; prop: PropertyDef } => !!x.prop);
  if (!active.length) return rows;
  return [...rows].sort((a, b) => {
    for (const { rule, prop } of active) {
      const ka = sortKey(a, prop, schema);
      const kb = sortKey(b, prop, schema);
      if (ka === kb) continue;
      // empties always sink to the bottom
      if (ka === null) return 1;
      if (kb === null) return -1;
      let c: number;
      if (typeof ka === 'number' && typeof kb === 'number') c = ka - kb;
      else c = String(ka) < String(kb) ? -1 : 1;
      if (c !== 0) return rule.dir === 'asc' ? c : -c;
    }
    return 0;
  });
}

// ─── the one pipeline ────────────────────────────────────────────────────────

/** filters + quick-search + sorts, in one pure pass */
export function applyView(
  rows: PageDoc[], schema: DbSchema, view: ViewDef, quickSearch?: string,
): PageDoc[] {
  let out = rows;
  const rules = (view.filters ?? []).filter((r) => findProp(schema, r.propId));
  if (rules.length) {
    out = out.filter((row) => (
      view.filterMode === 'or'
        ? rules.some((r) => matchRule(row, r, schema))
        : rules.every((r) => matchRule(row, r, schema))
    ));
  }
  const q = quickSearch?.trim().toLowerCase();
  if (q) {
    out = out.filter((row) =>
      schema.properties.some((p) => displayValue(row, p, schema).toLowerCase().includes(q)));
  }
  return sortRows(out, view.sorts ?? [], schema);
}

export interface BoardGroup {
  /** null = "no value" column */
  option: SelectOption | null;
  rows: PageDoc[];
}

export function groupForBoard(rows: PageDoc[], prop: PropertyDef): BoardGroup[] {
  const groups: BoardGroup[] = (prop.options ?? []).map((o) => ({ option: o, rows: [] }));
  const none: BoardGroup = { option: null, rows: [] };
  for (const row of rows) {
    const v = row.rowProps?.[prop.id];
    const g = groups.find((x) => x.option!.id === v);
    if (g) g.rows.push(row);
    else none.rows.push(row);
  }
  return [none, ...groups];
}

export interface RowGroup { key: string; label: string; color?: string; preset: Record<string, any>; rows: PageDoc[] }

/** general row grouping for the table view (select / status / checkbox) */
export function groupRowsByProp(rows: PageDoc[], prop: PropertyDef): RowGroup[] {
  if (prop.type === 'checkbox') {
    const yes: RowGroup = { key: 'y', label: `${prop.name}`, color: 'green', preset: { [prop.id]: true }, rows: [] };
    const no: RowGroup = { key: 'n', label: `Not ${prop.name}`, color: 'gray', preset: { [prop.id]: false }, rows: [] };
    for (const r of rows) (r.rowProps?.[prop.id] ? yes : no).rows.push(r);
    return [yes, no];
  }
  const groups: RowGroup[] = (prop.options ?? []).map((o) => ({ key: o.id, label: o.name, color: o.color, preset: { [prop.id]: o.id }, rows: [] }));
  const none: RowGroup = { key: '__none', label: `No ${prop.name}`, preset: {}, rows: [] };
  for (const r of rows) {
    const v = r.rowProps?.[prop.id];
    const g = groups.find((x) => x.key === v);
    (g ?? none).rows.push(r);
  }
  return [...groups, none].filter((g) => g.rows.length > 0 || g.key !== '__none');
}

/** properties a view can be grouped by */
export function groupableProps(schema: DbSchema): PropertyDef[] {
  return schema.properties.filter((p) => p.type === 'select' || p.type === 'status' || p.type === 'checkbox');
}

/** props shown on cards / list rows / table (schema order minus hidden minus title) */
export function visibleProps(schema: DbSchema, view: ViewDef, includeTitle = false): PropertyDef[] {
  return schema.properties.filter((p) =>
    (includeTitle || p.type !== 'title') && !(view.hiddenProps ?? []).includes(p.id));
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

export function buildCSV(db: PageDoc, view: ViewDef): string {
  const schema = db.dbSchema!;
  const rows = applyView(getRows(db.id), schema, view);
  const esc = (s: string) => (/[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  const props = schema.properties;
  const lines = [props.map((p) => esc(p.name)).join(',')];
  for (const r of rows) {
    lines.push(props.map((p) => {
      if (p.type === 'checkbox') return storedValue(r, p) ? 'true' : 'false';
      return esc(displayValue(r, p, schema));
    }).join(','));
  }
  return lines.join('\r\n');
}

// ─── schema mutations (always whole-schema replace via updateDbSchema) ──────

function withUndo(dbId: string, label: string, mutate: (schema: DbSchema) => DbSchema): void {
  const db = getPage(dbId);
  if (!db?.dbSchema) return;
  captureUndo(dbId, label, false);
  updateDbSchema(dbId, mutate(structuredClone(db.dbSchema)));
}

export function patchView(dbId: string, viewId: string, patch: Partial<ViewDef>, label = 'view settings'): void {
  withUndo(dbId, label, (s) => ({
    ...s,
    views: s.views.map((v) => (v.id === viewId ? { ...v, ...patch } : v)),
  }));
}

export function patchViewLayout(dbId: string, viewId: string, layoutPatch: Record<string, any>): void {
  const db = getPage(dbId);
  const view = db?.dbSchema?.views.find((v) => v.id === viewId);
  if (!view) return;
  patchView(dbId, viewId, { layout: { ...view.layout, ...layoutPatch } }, 'view layout');
}

export function addView(dbId: string, type: ViewType): string | null {
  const db = getPage(dbId);
  const schema = db?.dbSchema;
  if (!schema) return null;
  const id = uid();
  const firstSelect = schema.properties.find((p) => p.type === 'select' || p.type === 'status');
  const firstDate = schema.properties.find((p) => p.type === 'date');
  const base = VIEW_NAMES[type];
  const taken = schema.views.map((v) => v.name);
  let name = base;
  for (let i = 2; taken.includes(name); i++) name = `${base} ${i}`;
  const view: ViewDef = {
    id, name, type,
    filters: [], filterMode: 'and', sorts: [],
    groupByPropId: type === 'board' ? firstSelect?.id : undefined,
    hiddenProps: [],
    layout: (type === 'calendar' || type === 'timeline') && firstDate ? { dateProp: firstDate.id } : {},
  };
  withUndo(dbId, 'add view', (s) => ({ ...s, views: [...s.views, view] }));
  return id;
}

const VIEW_NAMES: Record<ViewType, string> = {
  table: 'Table', board: 'Board', gallery: 'Gallery', list: 'List', calendar: 'Calendar', timeline: 'Timeline',
};

export function duplicateView(dbId: string, viewId: string): string | null {
  const db = getPage(dbId);
  const src = db?.dbSchema?.views.find((v) => v.id === viewId);
  if (!src) return null;
  const id = uid();
  const copy: ViewDef = { ...structuredClone(src), id, name: src.name + ' copy' };
  withUndo(dbId, 'duplicate view', (s) => {
    const i = s.views.findIndex((v) => v.id === viewId);
    const views = [...s.views];
    views.splice(i + 1, 0, copy);
    return { ...s, views };
  });
  return id;
}

export function deleteView(dbId: string, viewId: string): void {
  withUndo(dbId, 'delete view', (s) => ({
    ...s,
    views: s.views.length > 1 ? s.views.filter((v) => v.id !== viewId) : s.views,
  }));
}

export function addProperty(dbId: string, def: Partial<PropertyDef> & { type: PropertyDef['type'] }, index?: number): string {
  const id = def.id ?? uid();
  withUndo(dbId, 'add property', (s) => {
    const name = def.name || uniquePropName(s, propDefaultName(def.type));
    const prop: PropertyDef = {
      id, name, type: def.type,
      options: def.options ?? (def.type === 'select' || def.type === 'multiSelect' ? [] : def.type === 'status' ? defaultStatusOptions() : undefined),
      formula: def.formula,
      numberFormat: def.numberFormat,
      relationDatabaseId: def.relationDatabaseId,
      rollup: def.rollup ?? (def.type === 'rollup'
        ? { relationPropId: s.properties.find((p) => p.type === 'relation')?.id ?? '', targetPropId: '', agg: 'count' as const }
        : undefined),
    };
    const properties = [...s.properties];
    properties.splice(index === undefined ? properties.length : index, 0, prop);
    return { ...s, properties };
  });
  return id;
}

function propDefaultName(type: PropertyDef['type']): string {
  const meta: Partial<Record<PropertyDef['type'], string>> = {
    text: 'Text', number: 'Number', select: 'Select', multiSelect: 'Tags', status: 'Status',
    date: 'Date', checkbox: 'Checkbox', url: 'URL', email: 'Email', phone: 'Phone',
    formula: 'Formula', relation: 'Relation', createdTime: 'Created', updatedTime: 'Updated',
  };
  return meta[type] ?? 'Property';
}

function uniquePropName(schema: DbSchema, base: string): string {
  const taken = new Set(schema.properties.map((p) => p.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

export function defaultStatusOptions(): SelectOption[] {
  return [
    { id: uid(), name: 'Not started', color: 'gray' },
    { id: uid(), name: 'In progress', color: 'blue' },
    { id: uid(), name: 'Done', color: 'green' },
  ];
}

export function patchProperty(dbId: string, propId: string, patch: Partial<PropertyDef>): void {
  withUndo(dbId, 'edit property', (s) => ({
    ...s,
    properties: s.properties.map((p) => (p.id === propId ? { ...p, ...patch } : p)),
  }));
}

export function duplicateProperty(dbId: string, propId: string): void {
  withUndo(dbId, 'duplicate property', (s) => {
    const i = s.properties.findIndex((p) => p.id === propId);
    if (i < 0) return s;
    const src = s.properties[i];
    if (src.type === 'title') return s;
    const copy: PropertyDef = { ...structuredClone(src), id: uid(), name: uniquePropName(s, src.name) };
    const properties = [...s.properties];
    properties.splice(i + 1, 0, copy);
    return { ...s, properties };
  });
}

export function deleteProperty(dbId: string, propId: string): void {
  withUndo(dbId, 'delete property', (s) => {
    if (findProp(s, propId)?.type === 'title') return s;
    return {
      ...s,
      properties: s.properties.filter((p) => p.id !== propId),
      views: s.views.map((v) => ({
        ...v,
        hiddenProps: (v.hiddenProps ?? []).filter((id) => id !== propId),
        sorts: (v.sorts ?? []).filter((r) => r.propId !== propId),
        filters: (v.filters ?? []).filter((r) => r.propId !== propId),
        groupByPropId: v.groupByPropId === propId ? undefined : v.groupByPropId,
      })),
    };
  });
}

/** move a property to a new index in schema order */
export function moveProperty(dbId: string, propId: string, toIndex: number): void {
  withUndo(dbId, 'move property', (s) => {
    const from = s.properties.findIndex((p) => p.id === propId);
    if (from < 0) return s;
    const properties = [...s.properties];
    const [moved] = properties.splice(from, 1);
    properties.splice(Math.max(0, Math.min(toIndex, properties.length)), 0, moved);
    return { ...s, properties };
  });
}

// select option helpers ────────────────────────────────────────────────────────

export function addSelectOption(dbId: string, propId: string, name: string): string {
  const id = uid();
  withUndo(dbId, 'add option', (s) => ({
    ...s,
    properties: s.properties.map((p) => {
      if (p.id !== propId) return p;
      const color = SELECT_COLORS[(p.options?.length ?? 0) % SELECT_COLORS.length];
      return { ...p, options: [...(p.options ?? []), { id, name: name.trim(), color }] };
    }),
  }));
  return id;
}

export function patchSelectOption(dbId: string, propId: string, optionId: string, patch: Partial<SelectOption>): void {
  withUndo(dbId, 'edit option', (s) => ({
    ...s,
    properties: s.properties.map((p) => (
      p.id === propId
        ? { ...p, options: (p.options ?? []).map((o) => (o.id === optionId ? { ...o, ...patch } : o)) }
        : p
    )),
  }));
}

export function deleteSelectOption(dbId: string, propId: string, optionId: string): void {
  withUndo(dbId, 'delete option', (s) => ({
    ...s,
    properties: s.properties.map((p) => (
      p.id === propId ? { ...p, options: (p.options ?? []).filter((o) => o.id !== optionId) } : p
    )),
  }));
}
