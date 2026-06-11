import { describe, expect, it } from "vitest";
import { deriveFacts, evaluateScheme, formatINR, runScan } from "../lib/engine/evaluate";
import type { IntakeAnswers, Scheme } from "../lib/engine/types";
import schemesJson from "../data/schemes.json";

const SCHEMES = schemesJson as unknown as Scheme[];

const baseAnswers: IntakeAnswers = {
  state: "MH",
  stage: "y1to3",
  entityType: "proprietorship",
  sector: "manufacturing",
  udyam: "yes",
  investment: "lt25l",
  turnover: "lt2cr",
  social: "general",
  profile: ["none"],
  needs: ["capital", "subsidy"],
};

describe("deriveFacts", () => {
  it("classifies a small workshop as micro under revised FY26 limits", () => {
    const f = deriveFacts(baseAnswers);
    expect(f.msmeClass).toBe("micro");
    expect(f.udyam).toBe(true);
    expect(f.isNewUnit).toBe(false);
    expect(f.specialCategory).toBe(false);
  });

  it("uses the composite criterion — higher of investment/turnover class wins", () => {
    const f = deriveFacts({ ...baseAnswers, investment: "lt25l", turnover: "cr10to100" });
    expect(f.msmeClass).toBe("small");
    const f2 = deriveFacts({ ...baseAnswers, investment: "cr25to125", turnover: "lt2cr" });
    expect(f2.msmeClass).toBe("medium");
    const f3 = deriveFacts({ ...baseAnswers, investment: "gt125cr", turnover: "lt2cr" });
    expect(f3.msmeClass).toBe("outside");
  });

  it("derives special category from social and profile answers", () => {
    expect(deriveFacts({ ...baseAnswers, social: "sc" }).scst).toBe(true);
    expect(deriveFacts({ ...baseAnswers, social: "sc" }).specialCategory).toBe(true);
    expect(deriveFacts({ ...baseAnswers, profile: ["woman"] }).womanOwned).toBe(true);
    expect(deriveFacts({ ...baseAnswers, profile: ["woman"] }).specialCategory).toBe(true);
    expect(deriveFacts({ ...baseAnswers, profile: ["none"] }).profile).toEqual([]);
  });

  it("treats only not-yet-started ventures as new units", () => {
    expect(deriveFacts({ ...baseAnswers, stage: "idea" }).isNewUnit).toBe(true);
    expect(deriveFacts({ ...baseAnswers, stage: "lt1" }).isNewUnit).toBe(false);
  });
});

describe("evaluateScheme — PMEGP encoding", () => {
  const pmegp = SCHEMES.find((s) => s.id === "pmegp")!;

  it("matches a fresh individual manufacturing founder", () => {
    const facts = deriveFacts({
      ...baseAnswers,
      stage: "idea",
      entityType: "unregistered",
      udyam: "no",
    });
    const r = evaluateScheme(pmegp, facts);
    expect(r.status).toBe("eligible");
    expect(r.failedConditions).toHaveLength(0);
  });

  it("rejects an existing business (not a new unit)", () => {
    const r = evaluateScheme(pmegp, deriveFacts(baseAnswers));
    expect(r.status).toBe("ineligible");
    expect(r.failedConditions.some((f) => f.includes("new"))).toBe(true);
  });

  it("rejects a private limited company even for a new project", () => {
    const facts = deriveFacts({ ...baseAnswers, stage: "idea", entityType: "pvt_ltd" });
    expect(evaluateScheme(pmegp, facts).status).toBe("ineligible");
  });

  it("rejects pure trading", () => {
    const facts = deriveFacts({
      ...baseAnswers,
      stage: "idea",
      entityType: "unregistered",
      sector: "trading",
    });
    expect(evaluateScheme(pmegp, facts).status).toBe("ineligible");
  });
});

describe("evaluateScheme — CGTMSE encoding", () => {
  const cgtmse = SCHEMES.find((s) => s.id === "cgtmse")!;

  it("covers a Udyam-registered micro unit", () => {
    expect(evaluateScheme(cgtmse, deriveFacts(baseAnswers)).status).toBe("eligible");
  });

  it("is a near-miss (not a flat reject) when only Udyam is missing", () => {
    const r = evaluateScheme(cgtmse, deriveFacts({ ...baseAnswers, udyam: "no" }));
    expect(r.status).toBe("ineligible");
    expect(r.nearMiss).toBe(true);
    expect(r.failedConditions).toHaveLength(1);
    expect(r.failedConditions[0]).toContain("Udyam");
  });

  it("excludes medium enterprises", () => {
    const r = evaluateScheme(
      cgtmse,
      deriveFacts({ ...baseAnswers, investment: "cr25to125", turnover: "cr100to500" })
    );
    expect(r.status).toBe("ineligible");
  });
});

describe("runScan", () => {
  it("is deterministic — identical answers produce identical results", () => {
    const a = runScan(SCHEMES, baseAnswers);
    const b = runScan(SCHEMES, baseAnswers);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("partitions schemes into eligible / near-miss / ineligible without overlap", () => {
    const r = runScan(SCHEMES, { ...baseAnswers, udyam: "no", stage: "idea" });
    const ids = [
      ...r.eligible.map((m) => m.scheme.id),
      ...r.nearMisses.map((m) => m.scheme.id),
      ...r.ineligible.map((m) => m.scheme.id),
    ];
    expect(new Set(ids).size).toBe(SCHEMES.length);
  });

  it("sums the teaser ceiling over eligible schemes only", () => {
    const r = runScan(SCHEMES, baseAnswers);
    const expected = r.eligible.reduce((s, m) => s + m.scheme.benefit.maxValue, 0);
    expect(r.totalMaxValue).toBe(expected);
  });

  it("ranks schemes serving the asked-for needs above others", () => {
    const r = runScan(SCHEMES, { ...baseAnswers, needs: ["quality"] });
    if (r.eligible.length > 1) {
      const first = r.eligible[0];
      expect(first.scheme.tags).toContain("quality");
    }
  });
});

describe("schemes.json integrity", () => {
  it("every scheme has the required publishable fields", () => {
    for (const s of SCHEMES) {
      expect(s.id, s.id).toBeTruthy();
      expect(s.benefit.headline, s.id).toBeTruthy();
      expect(s.documents.length, s.id).toBeGreaterThan(0);
      expect(s.applySteps.length, s.id).toBeGreaterThan(0);
      expect(s.applyUrl, s.id).toMatch(/^https:\/\//);
      expect(s.sources.length, s.id).toBeGreaterThan(0);
      expect(s.lastVerified, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.sources.some((src) => src.official), s.id).toBe(true);
    }
  });

  it("scheme ids are unique", () => {
    const ids = SCHEMES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every scheme is reachable — at least one profile matches it", () => {
    // A scheme nobody can ever match is dead data; catch it in CI.
    const profiles: IntakeAnswers[] = [];
    const stages: IntakeAnswers["stage"][] = ["idea", "y1to3"];
    const entities: IntakeAnswers["entityType"][] = [
      "unregistered",
      "proprietorship",
      "pvt_ltd",
      "shg_coop_trust",
    ];
    const sectors: IntakeAnswers["sector"][] = [
      "manufacturing",
      "services",
      "trading",
      "food_processing",
      "artisan",
      "agri_allied",
    ];
    for (const stage of stages)
      for (const entityType of entities)
        for (const sector of sectors)
          for (const social of ["general", "sc"] as const)
            for (const profile of [["none"], ["woman", "youth18to35"]] as const)
              profiles.push({
                ...baseAnswers,
                stage,
                entityType,
                sector,
                social,
                profile: [...profile],
                state: "MH",
                udyam: "yes",
                needs: ["capital", "subsidy", "quality", "market", "infra", "export"],
              });

    const everMatched = new Set<string>();
    for (const p of profiles) {
      for (const m of runScan(SCHEMES, p).eligible) everMatched.add(m.scheme.id);
    }
    for (const s of SCHEMES) {
      expect(everMatched.has(s.id), `scheme ${s.id} is unmatchable by any tested profile`).toBe(true);
    }
  });
});

describe("formatINR", () => {
  it("formats lakhs and crores in Indian conventions", () => {
    expect(formatINR(1750000)).toBe("₹17.5 lakh");
    expect(formatINR(100000000)).toBe("₹10 crore");
    expect(formatINR(50000)).toBe("₹50,000");
    expect(formatINR(0)).toBe("—");
  });
});
