/**
 * YojanaScan rule engine — type definitions.
 *
 * Matching is fully deterministic. Every scheme in data/schemes.json carries a
 * hand-encoded eligibility rule tree over the fact set below. No LLM is
 * involved in deciding eligibility — the LLM (optionally) narrates results
 * that this engine has already computed.
 */

/** Raw answers from the 10-question intake. */
export interface IntakeAnswers {
  state: "MH" | "OTHER";
  stage: "idea" | "lt1" | "y1to3" | "y3to10" | "gt10";
  entityType:
    | "proprietorship"
    | "partnership"
    | "pvt_ltd"
    | "llp"
    | "shg_coop_trust"
    | "unregistered";
  sector:
    | "manufacturing"
    | "services"
    | "trading"
    | "food_processing"
    | "agri_allied"
    | "artisan";
  udyam: "yes" | "no";
  investment: "lt25l" | "l25to2_5cr" | "cr2_5to25" | "cr25to125" | "gt125cr";
  turnover: "pre" | "lt2cr" | "cr2to10" | "cr10to100" | "cr100to500" | "gt500cr";
  social: "general" | "sc" | "st" | "obc" | "minority";
  profile: Array<"woman" | "youth18to35" | "divyang" | "exserviceman" | "none">;
  needs: Array<"capital" | "subsidy" | "quality" | "market" | "infra" | "export">;
}

/**
 * Facts the engine evaluates conditions against = answers + derived fields.
 * Derived fields are computed in deriveFacts() (lib/engine/evaluate.ts).
 */
export interface FactSet extends Omit<IntakeAnswers, "udyam"> {
  udyam: boolean;
  /** Composite micro/small/medium per revised classification (FY 2025-26). */
  msmeClass: "micro" | "small" | "medium" | "outside";
  /** True only for ventures that have not started operations yet. */
  isNewUnit: boolean;
  /** Owner belongs to SC or ST. */
  scst: boolean;
  /** Any special category: SC/ST/minority/woman/divyang/ex-serviceman. */
  specialCategory: boolean;
  /** Woman-owned. */
  womanOwned: boolean;
}

export type FactKey = keyof FactSet;

export type Op =
  | "eq"
  | "neq"
  | "in"
  | "notIn"
  | "includesAny" // array fact intersects value array
  | "isTrue"
  | "isFalse";

export interface Condition {
  fact: FactKey;
  op: Op;
  value?: unknown;
  /** Human-readable requirement, shown in the eligibility trace. */
  label: string;
}

export type RuleNode =
  | { all: RuleNode[]; label?: string }
  | { any: RuleNode[]; label?: string }
  | { not: RuleNode; label?: string }
  | Condition;

export interface SchemeBenefit {
  /** One-line benefit, e.g. "15–35% margin-money subsidy on project cost". */
  headline: string;
  /** Best-case rupee value used for the teaser aggregate (0 = non-monetary). */
  maxValue: number;
  /** What maxValue assumes, e.g. "35% on a ₹50L rural project". */
  maxValueNote: string;
  details: string[];
}

export interface SchemeSource {
  url: string;
  /** True when the data was verified against an official government page. */
  official: boolean;
}

export interface Scheme {
  id: string;
  shortName: string;
  name: string;
  level: "central" | "state";
  state?: "MH";
  authority: string;
  category:
    | "credit_subsidy"
    | "guarantee"
    | "loan"
    | "grant"
    | "certification"
    | "market_access"
    | "infra"
    | "protection";
  /** Which intake needs this scheme serves — used for relevance scoring. */
  tags: Array<IntakeAnswers["needs"][number]>;
  benefit: SchemeBenefit;
  eligibility: RuleNode;
  /**
   * Requirements the 10-question intake cannot fully verify (age, education,
   * negative lists…). Always shown with the match — honesty over false
   * certainty.
   */
  softChecks: string[];
  documents: string[];
  applyUrl: string;
  applySteps: string[];
  sources: SchemeSource[];
  lastVerified: string; // ISO date
  confidence: "high" | "medium";
  notes?: string;
}

export interface TraceEntry {
  label: string;
  passed: boolean;
}

export interface MatchResult {
  scheme: Scheme;
  status: "eligible" | "ineligible";
  /** Higher = more relevant. Deterministic function of needs + benefit. */
  score: number;
  trace: TraceEntry[];
  /** Labels of hard conditions that failed (empty when eligible). */
  failedConditions: string[];
  /**
   * Ineligible by exactly one condition — surfaced in the paid report as
   * "unlock this by fixing X" (e.g. get Udyam registration).
   */
  nearMiss: boolean;
}

export interface ScanResult {
  facts: FactSet;
  eligible: MatchResult[];
  nearMisses: MatchResult[];
  ineligible: MatchResult[];
  /** Sum of maxValue across eligible schemes (teaser aggregate). */
  totalMaxValue: number;
}
