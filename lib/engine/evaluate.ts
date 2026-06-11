/**
 * YojanaScan rule engine — deterministic evaluation.
 *
 * evaluate(scheme, facts) walks the scheme's hand-encoded rule tree and
 * returns a verdict with a full condition-by-condition trace. There is no
 * model call anywhere in this module; identical inputs always produce
 * identical verdicts.
 */

import type {
  Condition,
  FactSet,
  IntakeAnswers,
  MatchResult,
  RuleNode,
  ScanResult,
  Scheme,
  TraceEntry,
} from "./types";

/* ------------------------------------------------------------------ */
/* Fact derivation                                                     */
/* ------------------------------------------------------------------ */

const INVESTMENT_CLASS: Record<IntakeAnswers["investment"], number> = {
  lt25l: 0, // within micro band
  l25to2_5cr: 0,
  cr2_5to25: 1, // small band
  cr25to125: 2, // medium band
  gt125cr: 3, // outside MSME
};

const TURNOVER_CLASS: Record<IntakeAnswers["turnover"], number> = {
  pre: 0,
  lt2cr: 0,
  cr2to10: 0, // micro: turnover ≤ ₹10 crore (revised classification, FY 2025-26)
  cr10to100: 1, // small: ≤ ₹100 crore
  cr100to500: 2, // medium: ≤ ₹500 crore
  gt500cr: 3,
};

const CLASS_NAMES = ["micro", "small", "medium", "outside"] as const;

/**
 * Composite criterion (Udyam): an enterprise is placed in the higher of the
 * two classes implied by investment and turnover. Bands reflect the revised
 * limits effective 1 April 2025 (micro ₹2.5cr/₹10cr, small ₹25cr/₹100cr,
 * medium ₹125cr/₹500cr).
 */
export function deriveFacts(answers: IntakeAnswers): FactSet {
  const cls =
    CLASS_NAMES[
      Math.max(INVESTMENT_CLASS[answers.investment], TURNOVER_CLASS[answers.turnover])
    ];
  const profile = answers.profile.filter((p) => p !== "none");
  const scst = answers.social === "sc" || answers.social === "st";
  const womanOwned = profile.includes("woman");
  return {
    ...answers,
    profile,
    udyam: answers.udyam === "yes",
    msmeClass: cls,
    isNewUnit: answers.stage === "idea",
    scst,
    womanOwned,
    specialCategory:
      scst || answers.social === "minority" || womanOwned ||
      profile.includes("divyang") || profile.includes("exserviceman"),
  };
}

/* ------------------------------------------------------------------ */
/* Rule evaluation                                                     */
/* ------------------------------------------------------------------ */

function isCondition(node: RuleNode): node is Condition {
  return (node as Condition).fact !== undefined;
}

function testCondition(cond: Condition, facts: FactSet): boolean {
  const actual = facts[cond.fact];
  switch (cond.op) {
    case "eq":
      return actual === cond.value;
    case "neq":
      return actual !== cond.value;
    case "in":
      return Array.isArray(cond.value) && cond.value.includes(actual);
    case "notIn":
      return Array.isArray(cond.value) && !cond.value.includes(actual);
    case "includesAny":
      return (
        Array.isArray(actual) &&
        Array.isArray(cond.value) &&
        cond.value.some((v) => (actual as unknown[]).includes(v))
      );
    case "isTrue":
      return actual === true;
    case "isFalse":
      return actual === false;
    default:
      return false;
  }
}

interface NodeResult {
  passed: boolean;
  trace: TraceEntry[];
  /** Leaf conditions that caused failure along the failing path. */
  failures: string[];
}

function evaluateNode(node: RuleNode, facts: FactSet): NodeResult {
  if (isCondition(node)) {
    const passed = testCondition(node, facts);
    return {
      passed,
      trace: [{ label: node.label, passed }],
      failures: passed ? [] : [node.label],
    };
  }

  if ("all" in node) {
    const results = node.all.map((child) => evaluateNode(child, facts));
    return {
      passed: results.every((r) => r.passed),
      trace: results.flatMap((r) => r.trace),
      failures: results.flatMap((r) => r.failures),
    };
  }

  if ("any" in node) {
    const results = node.any.map((child) => evaluateNode(child, facts));
    const passed = results.some((r) => r.passed);
    if (passed) {
      // Show the first satisfied branch in the trace.
      const winner = results.find((r) => r.passed)!;
      return { passed: true, trace: winner.trace, failures: [] };
    }
    return {
      passed: false,
      trace: results.flatMap((r) => r.trace),
      // An "any" group failing is one logical failure; use the group label
      // when present so near-miss counting stays meaningful.
      failures: [node.label ?? results.flatMap((r) => r.failures).join(" OR ")],
    };
  }

  // "not"
  const inner = evaluateNode(node.not, facts);
  const passed = !inner.passed;
  const label = node.label ?? `NOT(${inner.trace.map((t) => t.label).join(", ")})`;
  return {
    passed,
    trace: [{ label, passed }],
    failures: passed ? [] : [label],
  };
}

/* ------------------------------------------------------------------ */
/* Scoring & scan                                                      */
/* ------------------------------------------------------------------ */

/** Deterministic relevance: need overlap dominates, benefit size breaks ties. */
function scoreScheme(scheme: Scheme, facts: FactSet): number {
  const needOverlap = scheme.tags.filter((t) => facts.needs.includes(t)).length;
  const benefitWeight = Math.min(scheme.benefit.maxValue / 1_000_000, 20); // cap at ₹2cr
  return needOverlap * 100 + benefitWeight;
}

export function evaluateScheme(scheme: Scheme, facts: FactSet): MatchResult {
  const result = evaluateNode(scheme.eligibility, facts);
  return {
    scheme,
    status: result.passed ? "eligible" : "ineligible",
    score: scoreScheme(scheme, facts),
    trace: result.trace,
    failedConditions: result.failures,
    nearMiss: !result.passed && result.failures.length === 1,
  };
}

export function runScan(schemes: Scheme[], answers: IntakeAnswers): ScanResult {
  const facts = deriveFacts(answers);
  const results = schemes.map((s) => evaluateScheme(s, facts));
  const byScore = (a: MatchResult, b: MatchResult) =>
    b.score - a.score || a.scheme.shortName.localeCompare(b.scheme.shortName);

  const eligible = results.filter((r) => r.status === "eligible").sort(byScore);
  const nearMisses = results.filter((r) => r.nearMiss).sort(byScore);
  const ineligible = results
    .filter((r) => r.status === "ineligible" && !r.nearMiss)
    .sort(byScore);

  return {
    facts,
    eligible,
    nearMisses,
    ineligible,
    totalMaxValue: eligible.reduce((sum, r) => sum + r.scheme.benefit.maxValue, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Formatting helpers (shared by UI and report)                        */
/* ------------------------------------------------------------------ */

/** ₹12,50,000 → "₹12.5 lakh"; crores above 1e7. */
export function formatINR(value: number): string {
  if (value <= 0) return "—";
  if (value >= 1_00_00_000) {
    const cr = value / 1_00_00_000;
    return `₹${trimZero(cr)} crore`;
  }
  if (value >= 1_00_000) {
    const l = value / 1_00_000;
    return `₹${trimZero(l)} lakh`;
  }
  return `₹${value.toLocaleString("en-IN")}`;
}

function trimZero(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}
