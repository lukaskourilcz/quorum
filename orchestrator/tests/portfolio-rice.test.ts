import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PortfolioRiceInputSchema, type PortfolioRiceInput } from "../src/contracts/portfolio-rice.js";
import { repoRoot } from "../src/paths.js";
import {
  buildQuarterlyRiceRanking,
  confidenceFromKpis,
  declaredVentureOrder,
  effortUsdPerMonth,
  resolveRiceEnforcement,
  riceRankingPath,
  roomRunsPerMonth,
  scorePortfolio,
  writeQuarterlyRiceRanking,
  type KpiStatusRow
} from "../src/portfolio/rice.js";
import { ROOM_DEGRADATION_ORDER } from "../src/portfolio/schedule.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";

const registry = await loadVentureRegistry();
const now = new Date("2026-09-16T12:00:00.000Z");

const signedDecision = `Status: countersigned
Signature / explicit approval reference: owner-approval-2026-09-16`;

function config(overrides: Partial<PortfolioRiceInput> = {}): PortfolioRiceInput {
  return PortfolioRiceInputSchema.parse({
    schemaVersion: "portfolio-rice/1",
    updatedAt: "2026-09-16",
    posture: "information-only",
    rankingEnforced: false,
    decisionRef: "state/decisions/2026-09-16-portfolio-rice.md",
    subjects: [
      {
        id: "caught-up",
        kind: "venture",
        label: "Caught Up",
        reach: null,
        impact: null,
        source: "test fixture"
      }
    ],
    ...overrides
  });
}

describe("RICE effort comes from the declared room envelopes", () => {
  it("bills DNESKAi's two daily rooms and nothing else", () => {
    const effort = effortUsdPerMonth(registry, "caught-up");
    expect(effort.basis.map((item) => item.phase)).toEqual(["cu-edition", "cu-product"]);
    expect(effort.usdPerMonth).toBeCloseTo(0.08 * 30 * 2, 8);
  });

  it("bills a Monday-only room weekly rather than daily", () => {
    expect(roomRunsPerMonth("gv-brief")).toBeCloseTo(30 / 7, 8);
    expect(roomRunsPerMonth("cu-edition")).toBe(30);
    expect(effortUsdPerMonth(registry, "goviral").usdPerMonth).toBeCloseTo(0.06 * (30 / 7), 8);
  });

  it("bills Door Money's daily desk fully and its Thursday growth room weekly", () => {
    expect(effortUsdPerMonth(registry, "door-money").usdPerMonth)
      .toBeCloseTo((0.08 * 30) + (0.06 * (30 / 7)), 8);
  });

  it("adds a production job to the rooms it runs beside", () => {
    const effort = effortUsdPerMonth(registry, "mma-files");
    expect(effort.basis.map((item) => item.phase)).toContain("article-production");
    expect(effort.usdPerMonth).toBeCloseTo((0.05 * 30 * 2) + (0.16 * 30), 8);
  });

  it("reports zero for a venture that declares no room at all", () => {
    expect(effortUsdPerMonth(registry, "carousel-studio").usdPerMonth).toBe(0);
    expect(effortUsdPerMonth(registry, "not-a-venture").usdPerMonth).toBe(0);
  });
});

describe("RICE confidence is the measured share of a venture's KPIs", () => {
  const statuses: KpiStatusRow[] = [
    { venture: "caught-up", status: "on-track" },
    { venture: "caught-up", status: "off-track" },
    { venture: "caught-up", status: "unavailable" },
    { venture: "caught-up", status: "at-risk" }
  ];

  it("counts everything that is not unavailable as measured", () => {
    expect(confidenceFromKpis(statuses, "caught-up"))
      .toEqual({ confidence: 0.75, measuredKpis: 3, totalKpis: 4 });
  });

  it("returns null rather than zero when the venture has no KPI rows", () => {
    expect(confidenceFromKpis(statuses, "webdev-signal"))
      .toEqual({ confidence: null, measuredKpis: 0, totalKpis: 0 });
  });

  it("keeps a measured zero separate from an absence", () => {
    const nothingMeasured: KpiStatusRow[] = [
      { venture: "marketingshark", status: "unavailable" },
      { venture: "marketingshark", status: "unavailable" }
    ];
    expect(confidenceFromKpis(nothingMeasured, "marketingshark"))
      .toEqual({ confidence: 0, measuredKpis: 0, totalKpis: 2 });
    const ranking = scorePortfolio({
      registry,
      config: config({
        subjects: [{
          id: "marketingshark",
          kind: "venture",
          label: "marketingShark",
          reach: 500,
          impact: 2,
          source: "test fixture"
        }]
      }),
      kpiStatuses: nothingMeasured,
      decisionRaw: "",
      quarterId: "2026-Q1",
      now
    });
    // Zero confidence is a reading of real rows, so the venture scores last rather than dropping
    // out of the ranking the way a venture with no rows at all does.
    expect(ranking.rows[0]).toMatchObject({ status: "scored", score: 0 });
    expect(ranking.rows[0]!.confidenceBasis).toEqual({ measuredKpis: 0, totalKpis: 2 });
  });
});

describe("the portfolio ranking names what it is missing", () => {
  it("leaves a subject unavailable rather than scoring an absent Reach as zero", () => {
    const ranking = scorePortfolio({
      registry,
      config: config(),
      kpiStatuses: [{ venture: "caught-up", status: "on-track" }],
      decisionRaw: "",
      quarterId: "2026-Q1",
      now
    });
    expect(ranking.rows).toHaveLength(1);
    expect(ranking.rows[0]).toMatchObject({ status: "unavailable", score: null });
    expect(ranking.rows[0]!.missingInputs).toEqual(["reach", "impact"]);
  });

  it("names effort as missing when a venture declares no room envelope", () => {
    const ranking = scorePortfolio({
      registry,
      config: config({
        subjects: [{
          id: "carousel-studio",
          kind: "venture",
          label: "Design Lab",
          reach: 100,
          impact: 2,
          source: "test fixture"
        }]
      }),
      kpiStatuses: [{ venture: "carousel-studio", status: "on-track" }],
      decisionRaw: "",
      quarterId: "2026-Q1",
      now
    });
    expect(ranking.rows[0]!.missingInputs).toEqual(["effort"]);
  });

  it("scores a complete row and keeps the order stable when the input file is reordered", () => {
    const subjects = [
      { id: "caught-up", kind: "venture" as const, label: "Caught Up", reach: 400, impact: 2 as const, source: "test fixture" },
      { id: "kvorum", kind: "venture" as const, label: "Kvórum", reach: 100, impact: 1 as const, source: "test fixture" }
    ];
    const kpiStatuses: KpiStatusRow[] = [
      { venture: "caught-up", status: "on-track" },
      { venture: "kvorum", status: "on-track" },
      { venture: "kvorum", status: "unavailable" }
    ];
    const forward = scorePortfolio({ registry, config: config({ subjects }), kpiStatuses, decisionRaw: "", quarterId: "2026-Q1", now });
    const reversed = scorePortfolio({ registry, config: config({ subjects: [...subjects].reverse() }), kpiStatuses, decisionRaw: "", quarterId: "2026-Q1", now });
    expect(forward.rows.map((row) => row.id)).toEqual(reversed.rows.map((row) => row.id));
    expect(forward.rows.every((row) => row.status === "scored")).toBe(true);
    // 400 x 2 x 1 / 4.80 beats 100 x 1 x 0.5 / 3.00, so DNESKAi leads.
    expect(forward.rows[0]!.id).toBe("caught-up");
    expect(forward.rows[0]!.score).toBeCloseTo((400 * 2 * 1) / 4.8, 6);
    expect(forward.rows[1]!.score).toBeCloseTo((100 * 1 * 0.5) / 3, 6);
  });
});

describe("the ranking is compared against the enforced degradation order, never substituted for it", () => {
  it("records the declared order exactly as the schedule enforces it", () => {
    const ranking = scorePortfolio({
      registry,
      config: config(),
      kpiStatuses: [],
      decisionRaw: "",
      quarterId: "2026-Q1",
      now
    });
    expect(ranking.declaredDegradationOrder).toEqual([...ROOM_DEGRADATION_ORDER]);
    expect(ranking.declaredVentureOrder).toEqual(declaredVentureOrder(registry));
    expect(ranking.declaredVentureOrder).toEqual([
      "door-money",
      "kvorum",
      "tehdejsi-svet",
      "booksofhistory",
      "goviral",
      "titty-tuesdays"
    ]);
  });

  it("refuses a verdict while any of those ventures is unscored", () => {
    const ranking = scorePortfolio({
      registry,
      config: config(),
      kpiStatuses: [],
      decisionRaw: "",
      quarterId: "2026-Q1",
      now
    });
    expect(ranking.agreesWithDeclaredOrder).toBeNull();
    expect(ranking.comparison.unavailableVentures).toEqual(ranking.declaredVentureOrder);
  });

  it("agrees when the scores put the ventures in the order the schedule drops them", () => {
    // Ascending score has to match the declared lowest-priority-first order, so Reach rises with
    // each venture in that list and every other factor is held equal.
    const order = declaredVentureOrder(registry);
    const subjects = order.map((id, index) => ({
      id,
      kind: "venture" as const,
      label: id,
      reach: (index + 1) * 1000 * Math.round(effortUsdPerMonth(registry, id).usdPerMonth * 100),
      impact: 1 as const,
      source: "test fixture"
    }));
    const kpiStatuses: KpiStatusRow[] = order.map((id) => ({ venture: id, status: "on-track" }));
    const ranking = scorePortfolio({ registry, config: config({ subjects }), kpiStatuses, decisionRaw: "", quarterId: "2026-Q1", now });
    expect(ranking.rows.every((row) => row.status === "scored")).toBe(true);
    expect(ranking.agreesWithDeclaredOrder).toBe(true);
    expect(ranking.comparison.scoredAscending).toEqual(order);
  });

  it("records a disagreement instead of reordering anything", () => {
    const order = declaredVentureOrder(registry);
    const subjects = order.map((id, index) => ({
      id,
      kind: "venture" as const,
      // Reach falls as the declared order rises, which is the inverted case.
      reach: (order.length - index) * 1000 * Math.round(effortUsdPerMonth(registry, id).usdPerMonth * 100),
      impact: 1 as const,
      label: id,
      source: "test fixture"
    }));
    const kpiStatuses: KpiStatusRow[] = order.map((id) => ({ venture: id, status: "on-track" }));
    const ranking = scorePortfolio({ registry, config: config({ subjects }), kpiStatuses, decisionRaw: "", quarterId: "2026-Q1", now });
    expect(ranking.agreesWithDeclaredOrder).toBe(false);
    expect(ranking.comparison.scoredAscending).toEqual([...order].reverse());
    // The enforced order is untouched by a disagreement.
    expect(ranking.declaredDegradationOrder).toEqual([...ROOM_DEGRADATION_ORDER]);
  });
});

describe("enforcement needs the switch and the signature, and has neither", () => {
  it("holds on the config switch even with a countersigned record", () => {
    expect(resolveRiceEnforcement({ config: config(), decisionRaw: signedDecision }))
      .toMatchObject({ enforcement: "information-only" });
  });

  it("holds on the signature even with the switch on", () => {
    const enabled = config({ posture: "owner-enforced", rankingEnforced: true });
    expect(resolveRiceEnforcement({ config: enabled, decisionRaw: "Status: pending owner countersignature" }))
      .toMatchObject({ enforcement: "information-only" });
    expect(resolveRiceEnforcement({ config: enabled, decisionRaw: signedDecision }))
      .toEqual({ enforcement: "owner-enforced", heldBecause: [] });
  });

  it("refuses an enforced switch that has not also moved the posture", () => {
    expect(PortfolioRiceInputSchema.safeParse({ ...config(), rankingEnforced: true }).success).toBe(false);
  });

  it("always names what holds a ranking that decides nothing", () => {
    const ranking = scorePortfolio({ registry, config: config(), kpiStatuses: [], decisionRaw: "", quarterId: "2026-Q1", now });
    expect(ranking.enforcement).toBe("information-only");
    expect(ranking.enforcementHeldBecause.length).toBeGreaterThan(0);
  });
});

describe("the committed input file", () => {
  it("parses, stays information-only and covers every registered venture", async () => {
    const committed = PortfolioRiceInputSchema.parse(
      JSON.parse(await readFile(path.join(repoRoot, "config/portfolio-rice.json"), "utf8"))
    );
    expect(committed.posture).toBe("information-only");
    expect(committed.rankingEnforced).toBe(false);
    expect(new Set(committed.subjects.map((subject) => subject.id)))
      .toEqual(new Set(registry.ventures.map((venture) => venture.id)));
  });

  it("enters no invented Reach or Impact", async () => {
    const committed = PortfolioRiceInputSchema.parse(
      JSON.parse(await readFile(path.join(repoRoot, "config/portfolio-rice.json"), "utf8"))
    );
    expect(committed.subjects.every((subject) => subject.reach === null && subject.impact === null)).toBe(true);
  });

  it("produces a ranking whose every row is unavailable today", async () => {
    const snapshot = JSON.parse(await readFile(path.join(repoRoot, "state/kpis/latest.json"), "utf8")) as {
      quarterId: string;
      statuses: KpiStatusRow[];
    };
    const built = await buildQuarterlyRiceRanking({
      repoRoot,
      registry,
      kpiStatuses: snapshot.statuses,
      quarterId: snapshot.quarterId,
      now
    });
    expect(built.ranking).not.toBeNull();
    expect(built.ranking!.rows.every((row) => row.status === "unavailable")).toBe(true);
    expect(built.ranking!.agreesWithDeclaredOrder).toBeNull();
    expect(built.ranking!.enforcement).toBe("information-only");
  });
});

describe("the quarter-end write", () => {
  it("writes the ranking inside state/kpis so the cycle can commit it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-rice-"));
    const written = await writeQuarterlyRiceRanking({
      repoRoot,
      stateRoot: root,
      registry,
      kpiStatuses: [{ venture: "caught-up", status: "on-track" }],
      quarterId: "2026-Q1",
      now
    });
    expect(written).toBe(riceRankingPath("2026-Q1"));
    expect(written!.startsWith("kpis/")).toBe(true);
    const stored = JSON.parse(await readFile(path.join(root, written!), "utf8")) as { schemaVersion: string };
    expect(stored.schemaVersion).toBe("portfolio-rice-ranking/1");
  });

  it("costs the ranking and not the run when the input file is missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-rice-missing-"));
    const written = await writeQuarterlyRiceRanking({
      repoRoot: root,
      stateRoot: root,
      registry,
      kpiStatuses: [],
      quarterId: "2026-Q1",
      now
    });
    expect(written).toBeNull();
  });
});
