// Fractional indexing (Figma-style): generates a string strictly between two
// keys so reordering never rewrites siblings. Keys never end in DIGITS[0].
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function midpoint(a: string, b: string): string {
  const zero = DIGITS[0];
  if (b !== '' && a >= b) {
    // defensive: callers should keep a < b; fall back to appending
    return a + DIGITS[32];
  }
  if (b !== '') {
    // shared prefix
    let n = 0;
    while (n < b.length && (a[n] ?? zero) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a !== '' ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== '' ? DIGITS.indexOf(b[0]) : DIGITS.length;
  if (digitB - digitA > 1) {
    return DIGITS[Math.floor((digitA + digitB) / 2)];
  }
  // consecutive first digits
  if (b.length > 1) return b[0];
  return DIGITS[digitA] + midpoint(a.slice(1), '');
}

/** Key strictly between a and b (either side may be null = open end). */
export function orderBetween(a: string | null | undefined, b: string | null | undefined): string {
  const lo = a ?? '';
  const hi = b ?? '';
  if (lo === '' && hi === '') return DIGITS[32]; // 'W'-ish middle
  return midpoint(lo, hi);
}

/** n keys evenly between a and b */
export function ordersBetween(a: string | null, b: string | null, n: number): string[] {
  const out: string[] = [];
  let lo = a;
  for (let i = 0; i < n; i++) {
    const k = orderBetween(lo, b);
    out.push(k);
    lo = k;
  }
  return out;
}

export function compareOrder(a: { order: string }, b: { order: string }): number {
  return a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
}
