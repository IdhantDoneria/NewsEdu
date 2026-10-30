/**
 * Small, dependency-free metric helpers for the evaluation harness.
 * All functions are pure and tolerate empty input (they return 0 / null, never NaN).
 */

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export const round = (x, d = 3) => (num(x) === null ? null : Math.round(x * 10 ** d) / 10 ** d);

export function mean(xs) {
  const v = xs.filter((x) => num(x) !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

/** Population standard deviation (the vitals describe the pool itself, not a sample of it). */
export function sd(xs) {
  const v = xs.filter((x) => num(x) !== null);
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
}

/** Linear-interpolated quantile, q in [0,1]. */
export function quantile(xs, q) {
  const v = xs.filter((x) => num(x) !== null).sort((a, b) => a - b);
  if (!v.length) return 0;
  const pos = Math.min(1, Math.max(0, q)) * (v.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

export const median = (xs) => quantile(xs, 0.5);

export function share(xs, pred) {
  return xs.length ? xs.filter(pred).length / xs.length : 0;
}

export function distinctCount(xs, digits = 6) {
  return new Set(xs.map((x) => (typeof x === 'number' ? x.toFixed(digits) : String(x)))).size;
}

/** Number of items whose value equals at least one other item's value. */
export function tiedItems(xs, digits = 6) {
  const counts = new Map();
  for (const x of xs) {
    const k = typeof x === 'number' ? x.toFixed(digits) : String(x);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let tied = 0;
  for (const c of counts.values()) if (c > 1) tied += c;
  return tied;
}

/** Counts of each distinct value, sorted high to low. */
export function tally(xs) {
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Precision / recall / F1 from confusion counts. Undefined ratios are 0. */
export function prf(tp, fp, fn) {
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, precision, recall, f1 };
}

/** Confusion counts from parallel arrays of booleans (truth, prediction). */
export function confusion(truth, pred) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (let i = 0; i < truth.length; i++) {
    if (truth[i] && pred[i]) tp++;
    else if (!truth[i] && pred[i]) fp++;
    else if (truth[i] && !pred[i]) fn++;
    else tn++;
  }
  return { tp, fp, fn, tn };
}

export function prfFromLabels(truth, pred) {
  const { tp, fp, fn, tn } = confusion(truth, pred);
  return { ...prf(tp, fp, fn), tn };
}

/** Precision@k: relevant items in the first k (k clipped to the list length). `rels` are 0/1 (or graded >0). */
export function precisionAtK(rels, k) {
  const top = rels.slice(0, k);
  return top.length ? top.filter((r) => r > 0).length / top.length : 0;
}

export function dcg(rels, k = rels.length, { exponential = false } = {}) {
  let s = 0;
  for (let i = 0; i < Math.min(k, rels.length); i++) {
    const r = rels[i] || 0;
    s += (exponential ? 2 ** r - 1 : r) / Math.log2(i + 2);
  }
  return s;
}

/**
 * NDCG@k. `rels` are the graded relevances in ranked order. `pool` (optional) is the full set of
 * relevances available (used for the ideal ordering) - pass it when the ranked list is only a
 * subset of everything that was relevant, otherwise the ideal is the sorted `rels` themselves.
 */
export function ndcg(rels, k = rels.length, { pool = rels, exponential = false } = {}) {
  const ideal = [...pool].sort((a, b) => b - a);
  const idcg = dcg(ideal, k, { exponential });
  return idcg > 0 ? dcg(rels, k, { exponential }) / idcg : 0;
}

/** Area under the ROC curve: P(random positive scores higher than random negative); ties count half. */
export function auc(positives, negatives) {
  if (!positives.length || !negatives.length) return null;
  let wins = 0;
  for (const p of positives) {
    for (const n of negatives) wins += p > n ? 1 : p === n ? 0.5 : 0;
  }
  return wins / (positives.length * negatives.length);
}

/**
 * Best F1 over every possible threshold for "score >= t means positive" (or "<=" when
 * `lowIsPositive`). Scale-free separability of a score against binary truth.
 */
export function bestF1(scores, truth, { lowIsPositive = false } = {}) {
  const idx = scores.map((s, i) => [s, !!truth[i]]);
  const cand = [...new Set(scores)].sort((a, b) => a - b);
  let best = { f1: 0, precision: 0, recall: 0, threshold: null };
  for (const t of cand) {
    const pred = idx.map(([s]) => (lowIsPositive ? s <= t : s >= t));
    const r = prfFromLabels(
      idx.map(([, y]) => y),
      pred
    );
    if (r.f1 > best.f1) best = { f1: r.f1, precision: r.precision, recall: r.recall, threshold: t };
  }
  return best;
}

/** Jaccard similarity of two iterables. */
export function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Flatten nested numeric leaves into { 'a.b.c': number } for diffing two eval runs. */
export function flattenNumbers(obj, prefix = '', out = {}) {
  if (num(obj) !== null) {
    out[prefix] = obj;
  } else if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) flattenNumbers(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}
