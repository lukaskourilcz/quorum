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
  resolveMeetingClock,
  scheduledCronExpressions
} from "../src/ventures/registry.js";

const shapeA = `Status: countersigned
Selection: [x] Shape A  [ ] Shape B
Signature / explicit approval reference: owner-approval-2026-08-01`;

const shapeB = `Status: countersigned
Selection: [ ] Shape A  [x] Shape B
Signature / explicit approval reference: owner-approval-2026-08-01`;

const signedDecision = `Status: countersigned
Signature / explicit approval reference: owner-approval-2026-08-04`;

describe("portfolio schedule and budget gate", () => {
  it("keeps all venture meetings at collision-free Prague slots", async () => {
    const registry = await loadVentureRegistry();
    expect(resolveMeetingClock(registry).map((slot) => slot.hour)).toEqual([5, 6, 7, 8, 9, 11, 13, 14, 17, 19, 20, 21, 22]);
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

  it("keeps the magazine dry until 08d is signed, then enables both rooms and article slots", async () => {
    const registry = await loadVentureRegistry();
    const pending = resolveEffectivePortfolioSchedule({ registry, budgetDecisionRaw: shapeA, monthlyApiHeadroomUsd: 18 });
    expect(pending.activePhases).not.toContain("mag-editorial");
    expect(pending.activePhases).not.toContain("article-am");
    const full = resolveEffectivePortfolioSchedule({
      registry,
      budgetDecisionRaw: shapeA,
      budgetFiftyRaw: signedDecision,
      fightAiQFoundingRaw: signedDecision,
      monthlyApiHeadroomUsd: 25
    });
    // budget-2026-08d unlocks the full clock; budget-2026-08e supersedes it on amounts,
    // lowering the all-in limit to $30, the model share to $25 and the daily pace to $1.00.
    expect(full).toMatchObject({ fiftyDecisionStatus: "countersigned", monthlyBudgetUsd: 25, dailyBudgetUsd: 1, monthlyOperatingUsd: 30 });
    expect(full.activePhases).toEqual(expect.arrayContaining(["mma-intake", "mma-analysis", "mag-editorial", "article-am", "article-pm", "mag-desk"]));
  });

  it("emits correct summer/winter cron pairs for meetings and article slots", async () => {
    const payloads = cronPayloads(await loadVentureRegistry());
    expect(payloads).toHaveLength(30);
    expect(payloads.filter((item) => item.phase === "incubator-scan").map((item) => item.cron)).toEqual(["0 5 * * *", "0 6 * * *"]);
    expect(payloads.filter((item) => item.phase === "tt-marketing").map((item) => item.cron)).toEqual(["0 9 * * *", "0 10 * * *"]);
    expect(payloads.filter((item) => item.phase === "incubator-synthesis").map((item) => item.cron)).toEqual(["0 19 * * *", "0 20 * * *"]);
    expect(payloads.filter((item) => item.phase === "mma-intake").map((item) => item.cron)).toEqual(["0 6 * * *", "0 7 * * *"]);
    expect(payloads.filter((item) => item.phase === "mma-analysis").map((item) => item.cron)).toEqual(["0 17 * * *", "0 18 * * *"]);
    expect(payloads.filter((item) => item.phase === "mag-editorial").map((item) => item.cron)).toEqual(["0 7 * * *", "0 8 * * *"]);
    expect(payloads.filter((item) => item.phase === "article-am").map((item) => item.cron)).toEqual(["0 8 * * *", "0 9 * * *"]);
    expect(payloads.filter((item) => item.phase === "article-pm").map((item) => item.cron)).toEqual(["0 16 * * *", "0 17 * * *"]);
    expect(payloads.filter((item) => item.phase === "mag-desk").map((item) => item.cron)).toEqual(["0 18 * * *", "0 19 * * *"]);
    expect(payloads.filter((item) => item.phase === "studio").map((item) => item.cron)).toEqual(["0 11 * * *", "0 12 * * *"]);
    // One entry per UTC hour, never a multi-hour expression: GitHub reports the whole cron
    // back as github.event.schedule, so "0 11,12" could not say which hour had fired, and
    // 12:00 UTC is both studio's winter slot and the afternoon meeting's summer one.
    const expressions = scheduledCronExpressions(await loadVentureRegistry());
    expect(expressions).toHaveLength(18);
    expect(expressions.every((expression) => /^0 \d{1,2} \* \* \*$/u.test(expression))).toBe(true);
    expect(expressions).toContain("0 11 * * *");
    expect(expressions).toContain("0 12 * * *");
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
    ["2026-08-03", ["FUNNEL"]],
    ["2026-08-04", ["STUNT"]],
    ["2026-08-05", ["COHORT"]],
    ["2026-08-06", ["SCENE"]],
    ["2026-08-07", ["PALATE"]],
    ["2026-08-08", ["SPARK"]],
    ["2026-08-09", ["VAULT"]]
  ] as const;

  it.each(cases)("seats only the %s weekday guests", (date, guests) => {
    const slot = resolveTittyTuesdaysSlot({ date });
    expect(slot.kind).toBe("tt-marketing");
    expect(slot.cast.slice(0, 3)).toEqual(["PULSE", "ANGLE", "AUDIT"]);
    expect(slot.cast.slice(3)).toEqual(guests);
  });

  it("adds QUILL only when a separate caption brief is explicitly needed", () => {
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
