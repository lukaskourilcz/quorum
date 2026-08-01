import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseVentureRegistry } from "../src/ventures/registry.js";
import {
  budgetDecisionStatus,
  resolveEffectivePortfolioSchedule
} from "../src/portfolio/schedule.js";
import { repoRoot } from "../src/paths.js";
import { resolveTittyTuesdaysSlot } from "../src/titty-tuesdays/schedule.js";
import {
  composeMeetingRouteDefinition,
  cronPayloads,
  loadVentureRegistry,
  resolveMeetingClock
} from "../src/ventures/registry.js";

const shapeA = `Status: countersigned
Selection: [x] Shape A  [ ] Shape B
Signature / explicit approval reference: owner-approval-2026-08-01`;

const shapeB = `Status: countersigned
Selection: [ ] Shape A  [x] Shape B
Signature / explicit approval reference: owner-approval-2026-08-01`;

describe("portfolio schedule and budget gate", () => {
  it("adds FightAIQ at collision-free 08 and 19 Prague slots", async () => {
    const registry = await loadVentureRegistry();
    expect(resolveMeetingClock(registry).map((slot) => slot.hour)).toEqual([5, 6, 7, 8, 11, 14, 17, 19, 21, 22]);
    const colliding = structuredClone(registry);
    colliding.ventures.find((venture) => venture.id === "titty-tuesdays")!.meetings[0]!.cadence = "daily@07:00";
    expect(() => parseVentureRegistry(colliding)).toThrow(/60 minutes apart/);
  });

  it("uses fallback shape B until an exact owner countersignature selects A", async () => {
    const [registry, pending] = await Promise.all([
      loadVentureRegistry(),
      readFile(path.join(repoRoot, "state", "decisions", "2026-08-01-budget-raise.md"), "utf8")
    ]);
    const fallback = resolveEffectivePortfolioSchedule({ registry, budgetDecisionRaw: pending, monthlyApiHeadroomUsd: 15 });
    expect(fallback).toMatchObject({
      shape: "B",
      decisionStatus: "pending",
      monthlyBudgetUsd: 15,
      dailyBudgetUsd: 0.7,
      envelopeByPhase: { "tt-marketing": 0.06 }
    });
    expect(fallback.activePhases).not.toContain("incubator-synthesis");

    const approved = resolveEffectivePortfolioSchedule({ registry, budgetDecisionRaw: shapeA, monthlyApiHeadroomUsd: 18 });
    expect(approved).toMatchObject({ shape: "A", monthlyBudgetUsd: 18, dailyBudgetUsd: 1 });
    expect(approved.activePhases).toContain("incubator-synthesis");
    expect(approved.envelopeByPhase["tt-marketing"]).toBe(0.08);
    expect(budgetDecisionStatus(shapeB)).toBe("countersigned-shape-b");
  });

  it("extends the monthly-headroom degradation ladder without displacing Caught Up", async () => {
    const registry = await loadVentureRegistry();
    const low = resolveEffectivePortfolioSchedule({ registry, budgetDecisionRaw: shapeA, monthlyApiHeadroomUsd: 1 });
    expect(low.activePhases).not.toContain("incubator-scan");
    expect(low.ttTranscriptMode).toBe("minimal");
    expect(low.activePhases).toContain("cu-edition");
    const critical = resolveEffectivePortfolioSchedule({ registry, budgetDecisionRaw: shapeA, monthlyApiHeadroomUsd: 0.4 });
    expect(critical.activePhases).not.toContain("tt-marketing");
    expect(critical.activePhases).toContain("cu-edition");
  });

  it("emits correct summer/winter cron pairs for all three new wall-clock slots", async () => {
    const payloads = cronPayloads(await loadVentureRegistry());
    expect(payloads).toHaveLength(20);
    expect(payloads.filter((item) => item.phase === "incubator-scan").map((item) => item.cron)).toEqual(["0 5 * * *", "0 6 * * *"]);
    expect(payloads.filter((item) => item.phase === "tt-marketing").map((item) => item.cron)).toEqual(["0 9 * * *", "0 10 * * *"]);
    expect(payloads.filter((item) => item.phase === "incubator-synthesis").map((item) => item.cron)).toEqual(["0 19 * * *", "0 20 * * *"]);
    expect(payloads.filter((item) => item.phase === "mma-intake").map((item) => item.cron)).toEqual(["0 6 * * *", "0 7 * * *"]);
    expect(payloads.filter((item) => item.phase === "mma-analysis").map((item) => item.cron)).toEqual(["0 17 * * *", "0 18 * * *"]);
  });

  it("runs PALATE only as a pre-step on each taste venture's first meeting", async () => {
    const registry = await loadVentureRegistry();
    expect(composeMeetingRouteDefinition(registry, "tt-marketing", "live").preSteps).toEqual(["palate"]);
    expect(composeMeetingRouteDefinition(registry, "incubator-scan", "live").preSteps).toEqual(["palate"]);
    expect(composeMeetingRouteDefinition(registry, "incubator-synthesis", "live").preSteps).toEqual([]);
    expect(composeMeetingRouteDefinition(registry, "cu-edition", "live").preSteps).toEqual([]);
  });
});

describe("Titty Tuesdays cadence wheel", () => {
  const cases = [
    ["2026-08-03", ["FUNNEL", "SPARK"]],
    ["2026-08-04", ["INSTAGRAM", "THREADS", "QUILL"]],
    ["2026-08-05", ["STUNT"]],
    ["2026-08-06", ["COHORT", "FUNNEL"]],
    ["2026-08-07", ["SCENE", "PALATE"]],
    ["2026-08-08", ["FRAME", "LENS"]],
    ["2026-08-09", ["SCRIBE", "FUNNEL"]]
  ] as const;

  it.each(cases)("seats only the %s weekday guests", (date, guests) => {
    const slot = resolveTittyTuesdaysSlot({ date });
    expect(slot.kind).toBe("tt-marketing");
    expect(slot.cast.slice(0, 3)).toEqual(["PULSE", "ANGLE", "AUDIT"]);
    expect(slot.cast.slice(3)).toEqual(guests);
  });

  it("adds QUILL to Saturday only when captions are needed", () => {
    expect(resolveTittyTuesdaysSlot({ date: "2026-08-08" }).cast).not.toContain("QUILL");
    expect(resolveTittyTuesdaysSlot({ date: "2026-08-08", captionsNeeded: true }).cast).toContain("QUILL");
  });

  it("replaces exactly the 91-day boundary slot with turnover", () => {
    expect(resolveTittyTuesdaysSlot({ date: "2026-10-31" })).toEqual({
      kind: "season-turnover",
      cast: ["PULSE", "ANGLE", "FUNNEL", "SCENE", "STUNT", "AUDIT"],
      palatePreStep: true
    });
    expect(resolveTittyTuesdaysSlot({ date: "2026-10-30" }).kind).toBe("tt-marketing");
  });
});
