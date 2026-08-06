import { composePortfolioContext } from "../src/portfolio/run.js";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseVentureRegistry,
  CRON_HOUR_CARRY,
  CRON_LEAD_HOURS,
  CRON_MINUTE,
  cronSlotHour,
  resolveScheduledClock
} from "../src/ventures/registry.js";
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
    // The decision on disk is countersigned now, so reading it and asserting "pending" would
    // test the state of the repository rather than the rule. This strips the signature back out
    // and keeps the rule under test; the live file's own answer is asserted below.
    const unsigned = pending
      .replace(/^Status:\s*countersigned\s*$/mi, "Status: pending owner countersignature")
      .replace(/^Selection:.*$/mi, "Selection: [ ] Shape A  [ ] Shape B")
      .replace(/^Signature \/ explicit approval reference:.*$/mi, "Signature / explicit approval reference: ____________________");
    const fallback = resolveEffectivePortfolioSchedule({ registry, budgetDecisionRaw: unsigned, monthlyApiHeadroomUsd: 15 });
    expect(fallback).toMatchObject({
      shape: "B",
      decisionStatus: "pending",
      monthlyBudgetUsd: 15,
      dailyBudgetUsd: 0.7,
      envelopeByPhase: { "tt-marketing": 0.06 }
    });
    expect(fallback.activePhases).not.toContain("incubator-synthesis");

    // And what the committed decision actually says today, so the countersignature cannot be
    // reverted or corrupted without a test noticing.
    const live = resolveEffectivePortfolioSchedule({ registry, budgetDecisionRaw: pending, monthlyApiHeadroomUsd: 15 });
    expect(live.shape).toBe("A");
    expect(live.activePhases).toContain("incubator-synthesis");

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
    expect(full.activePhases).toEqual(expect.arrayContaining(["mma-intake", "mma-analysis", "mag-editorial", "article-am", "mag-desk"]));
    // One article a day: the evening slot is off the clock entirely, not merely disabled.
    expect(full.activePhases).not.toContain("article-pm");
  });

  it("emits correct summer/winter cron pairs for meetings and article slots", async () => {
    const registry = await loadVentureRegistry();
    const payloads = cronPayloads(registry);
    expect(payloads).toHaveLength(resolveScheduledClock(registry).length * 2);
    // Assert the rule rather than a snapshot of it: every slot gets exactly two firings, the
    // summer one CRON_LEAD_HOURS + 2 hours before its Prague hour and the winter one
    // CRON_LEAD_HOURS + 1 before, so changing the lead cannot leave this test agreeing with
    // a schedule that no longer exists. CRON_HOUR_CARRY comes off both because the crons fire at
    // CRON_MINUTE of the hour before the one they serve.
    for (const slot of resolveScheduledClock(registry)) {
      const hours = payloads.filter((item) => item.phase === slot.phase).map((item) => Number(item.cron.split(" ")[1]));
      expect(hours, `${slot.phase} at ${slot.hour}:00 Prague`).toEqual([
        (slot.hour - 2 - CRON_LEAD_HOURS - CRON_HOUR_CARRY + 48) % 24,
        (slot.hour - 1 - CRON_LEAD_HOURS - CRON_HOUR_CARRY + 48) % 24
      ]);
      // And the carry survives the round trip: each firing names back the hour it was written
      // from. Without this the pair above is satisfied by any consistent off-by-one.
      for (const hour of hours) {
        expect(cronSlotHour(hour, CRON_MINUTE), `${slot.phase} firing at ${hour}:${CRON_MINUTE}`).toBe(
          (hour + CRON_HOUR_CARRY) % 24
        );
      }
    }
    // One entry per UTC hour, never a multi-hour expression: GitHub reports the whole cron
    // back as github.event.schedule, so "0 11,12" could not say which hour had fired, and
    // 12:00 UTC is both studio's winter slot and the afternoon meeting's summer one.
    const expressions = scheduledCronExpressions(await loadVentureRegistry());
    expect(expressions).toHaveLength(18);
    // Every firing sits on CRON_MINUTE, off the start-of-hour queue GitHub warns about, and the
    // generator emits the same strings the workflow deploys — otherwise the resolver is only
    // ever exercised on expressions github.event.schedule will never send it.
    expect(
      expressions.every((expression) =>
        new RegExp(`^${CRON_MINUTE} \\d{1,2} \\* \\* \\*$`, "u").test(expression)
      )
    ).toBe(true);
    // The two hours studio's variants belong to, written as the firings that serve them.
    expect(expressions).toContain(`${CRON_MINUTE} ${11 - CRON_HOUR_CARRY} * * *`);
    expect(expressions).toContain(`${CRON_MINUTE} ${12 - CRON_HOUR_CARRY} * * *`);
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

describe("the studio room reads the links it is given", () => {
  it("refuses a board or a bare homepage the way the admin store does", async () => {
    // The room filter checked only the https prefix, so a link the admin store would refuse
    // could still reach the room if it arrived any other way.
    const root = await mkdtemp(path.join(os.tmpdir(), "studio-links-"));
    await mkdir(path.join(root, "ventures", "carousel-studio", "inspiration"), { recursive: true });
    await writeFile(
      path.join(root, "ventures", "carousel-studio", "inspiration", "owner-links.json"),
      JSON.stringify({ links: [
        { url: "https://www.pinterest.com/someone/a-board/" },
        { url: "https://godly.website/" },
        { url: "http://example.com/an-article" }
      ] })
    );
    const context = await composePortfolioContext("studio", root, "2026-08-04", await loadVentureRegistry(), new Date("2026-08-04T11:00:00.000Z"));
    expect(context.evidenceRefs).toEqual([]);
    expect(context.text).toContain("Record no observations");
  });
});
