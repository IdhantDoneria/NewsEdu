// Shared metadata for property types, view types and filter operators.
import {
  AlignLeft, ArrowUpRight, Calendar, CalendarClock, CalendarDays, CalendarRange,
  CheckSquare, ChevronDownCircle, CircleDot, Combine, GanttChart, Hash, History, Kanban,
  Lightbulb, Link, List, LayoutGrid, Mail, Paperclip, Phone, Sigma, Table, Tags, Type,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { FilterRule, PropertyDef, PropertyType, ViewType } from '../../lib/types';

void Lightbulb;

type IconCmp = ComponentType<{ size?: number | string; className?: string }>;

// ─── property types ──────────────────────────────────────────────────────────

export interface PropTypeMeta {
  type: PropertyType;
  label: string;
  icon: IconCmp;
  /** appears in the "new property" picker */
  creatable: boolean;
}

export const PROP_TYPES: PropTypeMeta[] = [
  { type: 'text', label: 'Text', icon: AlignLeft, creatable: true },
  { type: 'number', label: 'Number', icon: Hash, creatable: true },
  { type: 'select', label: 'Select', icon: ChevronDownCircle, creatable: true },
  { type: 'multiSelect', label: 'Multi-select', icon: Tags, creatable: true },
  { type: 'status', label: 'Status', icon: CircleDot, creatable: true },
  { type: 'date', label: 'Date', icon: Calendar, creatable: true },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare, creatable: true },
  { type: 'url', label: 'URL', icon: Link, creatable: true },
  { type: 'email', label: 'Email', icon: Mail, creatable: true },
  { type: 'phone', label: 'Phone', icon: Phone, creatable: true },
  { type: 'formula', label: 'Formula', icon: Sigma, creatable: true },
  { type: 'relation', label: 'Relation', icon: ArrowUpRight, creatable: true },
  { type: 'rollup', label: 'Rollup', icon: Combine, creatable: true },
  { type: 'file', label: 'Files & media', icon: Paperclip, creatable: true },
  { type: 'createdTime', label: 'Created time', icon: CalendarClock, creatable: true },
  { type: 'updatedTime', label: 'Last edited', icon: History, creatable: true },
  { type: 'title', label: 'Title', icon: Type, creatable: false },
];

export function propTypeMeta(type: PropertyType): PropTypeMeta {
  return PROP_TYPES.find((m) => m.type === type) ?? PROP_TYPES[0];
}

export function PropIcon({ type, size = 14 }: { type: PropertyType; size?: number }) {
  const I = propTypeMeta(type).icon;
  return <I size={size} />;
}

// ─── view types ──────────────────────────────────────────────────────────────

export interface ViewTypeMeta { type: ViewType; label: string; icon: IconCmp; desc: string }

export const VIEW_TYPES: ViewTypeMeta[] = [
  { type: 'table', label: 'Table', icon: Table, desc: 'Spreadsheet-style grid' },
  { type: 'board', label: 'Board', icon: Kanban, desc: 'Kanban grouped by select' },
  { type: 'gallery', label: 'Gallery', icon: LayoutGrid, desc: 'Grid of cards' },
  { type: 'list', label: 'List', icon: List, desc: 'Minimal rows' },
  { type: 'calendar', label: 'Calendar', icon: CalendarDays, desc: 'Month grid by date' },
  { type: 'timeline', label: 'Timeline', icon: GanttChart, desc: 'Bars across time' },
];

export function viewTypeMeta(type: ViewType): ViewTypeMeta {
  return VIEW_TYPES.find((m) => m.type === type) ?? VIEW_TYPES[0];
}

void CalendarRange;

// ─── filter operators ────────────────────────────────────────────────────────

export type FilterOp = FilterRule['op'];

export const OP_LABELS: Record<FilterOp, string> = {
  contains: 'contains',
  notContains: "doesn't contain",
  is: 'is',
  isNot: 'is not',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  before: 'is before',
  after: 'is after',
  checked: 'is checked',
  unchecked: 'is unchecked',
};

export function opsForType(type: PropertyType): FilterOp[] {
  switch (type) {
    case 'number':
      return ['is', 'isNot', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'];
    case 'select':
    case 'status':
      return ['is', 'isNot', 'isEmpty', 'isNotEmpty'];
    case 'multiSelect':
      return ['contains', 'notContains', 'isEmpty', 'isNotEmpty'];
    case 'date':
    case 'createdTime':
    case 'updatedTime':
      return ['is', 'before', 'after', 'isEmpty', 'isNotEmpty'];
    case 'checkbox':
      return ['checked', 'unchecked'];
    case 'file':
      return ['isEmpty', 'isNotEmpty'];
    case 'relation':
      return ['contains', 'notContains', 'isEmpty', 'isNotEmpty'];
    case 'formula':
    case 'rollup':
      return ['contains', 'notContains', 'is', 'isNot', 'gt', 'lt', 'isEmpty', 'isNotEmpty'];
    default: // title, text, url, email, phone
      return ['contains', 'notContains', 'is', 'isNot', 'isEmpty', 'isNotEmpty'];
  }
}

/** does this operator take a value input? */
export function opNeedsValue(op: FilterOp): boolean {
  return !['isEmpty', 'isNotEmpty', 'checked', 'unchecked'].includes(op);
}

// ─── misc defaults ───────────────────────────────────────────────────────────

export const DEFAULT_COL_WIDTH: Record<PropertyType, number> = {
  title: 260, text: 190, number: 120, select: 140, multiSelect: 180, status: 140,
  date: 130, checkbox: 90, url: 170, email: 170, phone: 140, formula: 160,
  relation: 180, rollup: 160, file: 170, createdTime: 165, updatedTime: 165,
};

export function colWidth(prop: PropertyDef, widths?: Record<string, number>): number {
  const w = widths?.[prop.id];
  return Math.max(80, w ?? DEFAULT_COL_WIDTH[prop.type] ?? 160);
}
