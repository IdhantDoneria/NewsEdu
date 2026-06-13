// ─── Zenith formula engine ───────────────────────────────────────────────────
// Small, safe recursive-descent parser + evaluator. No eval / no Function.
// Grammar (lowest → highest precedence):
//   ternary  :=  or ('?' ternary ':' ternary)?
//   or       :=  and (('or'|'||') and)*
//   and      :=  not (('and'|'&&') not)*
//   not      :=  ('not'|'!') not | cmp
//   cmp      :=  add (('=='|'='|'!='|'>='|'<='|'>'|'<') add)?
//   add      :=  mul (('+'|'-') mul)*
//   mul      :=  unary (('*'|'/'|'%') unary)*
//   unary    :=  '-' unary | primary
//   primary  :=  number | string | true | false | null | fn '(' args ')' | '(' ternary ')'
// Errors never throw out of evalFormula — they come back as "⚠ message".

export interface FormulaCtx {
  prop: (name: string) => any;
}

class FormulaError extends Error {}

// ─── coercion ────────────────────────────────────────────────────────────────

function toNum(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new FormulaError('not a finite number');
    return v;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v)) return toNum(v[0]);
  const s = String(v).trim();
  if (s === '') return 0;
  // date strings become timestamps so date math works
  const dm = parseDateLike(s);
  if (dm !== null && /^\d{4}-\d{2}-\d{2}/.test(s)) return dm;
  const n = Number(s.replace(/[$€₹,%\s]/g, ''));
  if (Number.isNaN(n)) throw new FormulaError(`can't convert "${truncate(s)}" to a number`);
  return n;
}

function toStr(v: any): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(toStr).join(', ');
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return formatNum(v);
  return String(v);
}

function truthy(v: any): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v !== '' && v !== 'false';
  return !!v;
}

function isEmptyVal(v: any): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  // avoid float dust like 0.30000000000000004
  const r = Math.round(n * 1e10) / 1e10;
  return String(r);
}

function truncate(s: string): string {
  return s.length > 24 ? s.slice(0, 24) + '…' : s;
}

/** parse a date-ish value (ms number or string) → ms, or null */
function parseDateLike(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime(); // local midnight
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function toDateMs(v: any): number {
  const t = parseDateLike(v);
  if (t === null) throw new FormulaError(`"${truncate(toStr(v))}" is not a date`);
  return t;
}

function looseEq(a: any, b: any): boolean {
  if (a == null && b == null) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b);
  if (typeof a === 'number' || typeof b === 'number') {
    try { return toNum(a) === toNum(b); } catch { return false; }
  }
  return toStr(a) === toStr(b);
}

function compare(a: any, b: any): number {
  try {
    return toNum(a) - toNum(b);
  } catch {
    return toStr(a) < toStr(b) ? -1 : toStr(a) > toStr(b) ? 1 : 0;
  }
}

// ─── lexer ───────────────────────────────────────────────────────────────────

type TokType = 'num' | 'str' | 'id' | 'op' | 'eof';
interface Tok { t: TokType; v: string; n?: number }

const OPS2 = ['==', '!=', '>=', '<=', '&&', '||'];
const OPS1 = '+-*/%><()=,!?:';

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  if (src.length > 4000) throw new FormulaError('formula too long');
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      const raw = src.slice(i, j).replace(/_/g, '');
      const n = Number(raw);
      if (Number.isNaN(n)) throw new FormulaError(`bad number "${raw}"`);
      toks.push({ t: 'num', v: raw, n });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let out = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const e = src[j + 1];
          out += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          j += 2;
        } else {
          out += src[j];
          j++;
        }
      }
      if (j >= src.length) throw new FormulaError('unterminated string');
      toks.push({ t: 'str', v: out });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      toks.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if (OPS1.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new FormulaError(`unexpected character "${c}"`);
  }
  toks.push({ t: 'eof', v: '' });
  return toks;
}

// ─── parser (compiles straight to closures; if() stays lazy) ────────────────

type Thunk = () => any;

class Parser {
  private pos = 0;
  private depth = 0;
  constructor(private toks: Tok[], private ctx: FormulaCtx) {}

  private peek(): Tok { return this.toks[this.pos]; }
  private next(): Tok { return this.toks[this.pos++]; }
  private isOp(...vals: string[]): boolean {
    const t = this.peek();
    return t.t === 'op' && vals.includes(t.v);
  }
  private isKw(...vals: string[]): boolean {
    const t = this.peek();
    return t.t === 'id' && vals.includes(t.v.toLowerCase());
  }
  private expectOp(v: string): void {
    if (!this.isOp(v)) throw new FormulaError(`expected "${v}"`);
    this.next();
  }
  private guard<T>(f: () => T): T {
    if (++this.depth > 64) throw new FormulaError('formula too deeply nested');
    const r = f();
    this.depth--;
    return r;
  }

  parse(): Thunk {
    const fn = this.expr();
    if (this.peek().t !== 'eof') throw new FormulaError(`unexpected "${this.peek().v}"`);
    return fn;
  }

  private expr(): Thunk {
    return this.guard(() => {
      const cond = this.or();
      if (this.isOp('?')) {
        this.next();
        const a = this.expr();
        this.expectOp(':');
        const b = this.expr();
        return () => (truthy(cond()) ? a() : b());
      }
      return cond;
    });
  }

  private or(): Thunk {
    let l = this.and();
    while (this.isOp('||') || this.isKw('or')) {
      this.next();
      const a = l, b = this.and();
      l = () => truthy(a()) || truthy(b());
    }
    return l;
  }

  private and(): Thunk {
    let l = this.not();
    while (this.isOp('&&') || this.isKw('and')) {
      this.next();
      const a = l, b = this.not();
      l = () => truthy(a()) && truthy(b());
    }
    return l;
  }

  private not(): Thunk {
    if (this.isOp('!') || this.isKw('not')) {
      this.next();
      const f = this.not();
      return () => !truthy(f());
    }
    return this.cmp();
  }

  private cmp(): Thunk {
    const l = this.add();
    if (this.isOp('==', '=', '!=', '>', '<', '>=', '<=')) {
      const op = this.next().v;
      const r = this.add();
      switch (op) {
        case '==': case '=': return () => looseEq(l(), r());
        case '!=': return () => !looseEq(l(), r());
        case '>': return () => compare(l(), r()) > 0;
        case '<': return () => compare(l(), r()) < 0;
        case '>=': return () => compare(l(), r()) >= 0;
        case '<=': return () => compare(l(), r()) <= 0;
      }
    }
    return l;
  }

  private add(): Thunk {
    let l = this.mul();
    while (this.isOp('+', '-')) {
      const op = this.next().v;
      const a = l, b = this.mul();
      l = op === '+'
        ? () => {
            const x = a(), y = b();
            if (typeof x === 'string' || typeof y === 'string') return toStr(x) + toStr(y);
            return toNum(x) + toNum(y);
          }
        : () => toNum(a()) - toNum(b());
    }
    return l;
  }

  private mul(): Thunk {
    let l = this.unary();
    while (this.isOp('*', '/', '%')) {
      const op = this.next().v;
      const a = l, b = this.unary();
      if (op === '*') l = () => toNum(a()) * toNum(b());
      else if (op === '/') l = () => {
        const d = toNum(b());
        if (d === 0) throw new FormulaError('division by zero');
        return toNum(a()) / d;
      };
      else l = () => {
        const d = toNum(b());
        if (d === 0) throw new FormulaError('division by zero');
        return toNum(a()) % d;
      };
    }
    return l;
  }

  private unary(): Thunk {
    if (this.isOp('-')) {
      this.next();
      const f = this.unary();
      return () => -toNum(f());
    }
    if (this.isOp('+')) { this.next(); return this.unary(); }
    return this.primary();
  }

  private primary(): Thunk {
    const t = this.peek();
    if (t.t === 'num') { this.next(); const n = t.n!; return () => n; }
    if (t.t === 'str') { this.next(); const s = t.v; return () => s; }
    if (this.isOp('(')) {
      this.next();
      const f = this.expr();
      this.expectOp(')');
      return f;
    }
    if (t.t === 'id') {
      const name = t.v;
      const lower = name.toLowerCase();
      this.next();
      if (lower === 'true') return () => true;
      if (lower === 'false') return () => false;
      if (lower === 'null') return () => null;
      if (this.isOp('(')) {
        this.next();
        const args: Thunk[] = [];
        if (!this.isOp(')')) {
          args.push(this.expr());
          while (this.isOp(',')) { this.next(); args.push(this.expr()); }
        }
        this.expectOp(')');
        return this.callable(lower, name, args);
      }
      throw new FormulaError(`unknown name "${name}" — reference properties with prop("${name}")`);
    }
    throw new FormulaError(t.t === 'eof' ? 'unexpected end of formula' : `unexpected "${t.v}"`);
  }

  private callable(lower: string, name: string, args: Thunk[]): Thunk {
    const ctx = this.ctx;
    const need = (n: number) => {
      if (args.length < n) throw new FormulaError(`${name}() needs at least ${n} argument${n > 1 ? 's' : ''}`);
    };
    switch (lower) {
      case 'prop': {
        need(1);
        return () => {
          const v = ctx.prop(toStr(args[0]()));
          return v === undefined ? null : v;
        };
      }
      case 'if': {
        need(2);
        return () => (truthy(args[0]()) ? args[1]() : args.length > 2 ? args[2]() : null);
      }
      case 'concat': return () => args.map((a) => toStr(a())).join('');
      case 'length': { need(1); return () => toStr(args[0]()).length; }
      case 'round': {
        need(1);
        return () => {
          const m = Math.pow(10, args.length > 1 ? Math.trunc(toNum(args[1]())) : 0);
          return Math.round(toNum(args[0]()) * m) / m;
        };
      }
      case 'abs': { need(1); return () => Math.abs(toNum(args[0]())); }
      case 'floor': { need(1); return () => Math.floor(toNum(args[0]())); }
      case 'ceil': { need(1); return () => Math.ceil(toNum(args[0]())); }
      case 'sqrt': { need(1); return () => Math.sqrt(toNum(args[0]())); }
      case 'min': { need(1); return () => Math.min(...args.map((a) => toNum(a()))); }
      case 'max': { need(1); return () => Math.max(...args.map((a) => toNum(a()))); }
      case 'format': { need(1); return () => toStr(args[0]()); }
      case 'empty': { need(1); return () => isEmptyVal(args[0]()); }
      case 'now': return () => Date.now();
      case 'today': return () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
      case 'year': { need(1); return () => new Date(toDateMs(args[0]())).getFullYear(); }
      case 'month': { need(1); return () => new Date(toDateMs(args[0]())).getMonth() + 1; }
      case 'day': { need(1); return () => new Date(toDateMs(args[0]())).getDate(); }
      case 'slice': {
        need(2);
        return () => {
          const s = toStr(args[0]());
          const a = Math.trunc(toNum(args[1]()));
          return args.length > 2 ? s.slice(a, Math.trunc(toNum(args[2]()))) : s.slice(a);
        };
      }
      case 'lower': { need(1); return () => toStr(args[0]()).toLowerCase(); }
      case 'upper': { need(1); return () => toStr(args[0]()).toUpperCase(); }
      case 'trim': { need(1); return () => toStr(args[0]()).trim(); }
      case 'contains': { need(2); return () => toStr(args[0]()).toLowerCase().includes(toStr(args[1]()).toLowerCase()); }
      case 'replace': { need(3); return () => toStr(args[0]()).split(toStr(args[1]())).join(toStr(args[2]())); }
      default:
        throw new FormulaError(`unknown function ${name}()`);
    }
  }
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate a formula expression. Never throws: returns "⚠ message" on error.
 * Result is number | string | boolean | null.
 */
export function evalFormula(expr: string, ctx: FormulaCtx): any {
  try {
    if (!expr || !expr.trim()) return null;
    const fn = new Parser(lex(expr), ctx).parse();
    const v = fn();
    if (typeof v === 'number' && !Number.isFinite(v)) return '⚠ not a finite number';
    return v === undefined ? null : v;
  } catch (e: any) {
    const msg = e instanceof FormulaError ? e.message : (e?.message ?? 'formula error');
    return '⚠ ' + msg;
  }
}

/** Quick syntax check (used for live preview in the property editor). */
export function formulaError(expr: string): string | null {
  try {
    if (!expr || !expr.trim()) return null;
    new Parser(lex(expr), { prop: () => null }).parse();
    return null;
  } catch (e: any) {
    return e?.message ?? 'formula error';
  }
}
