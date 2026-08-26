import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PersonalGrowthHistoryEventSchema,
  PersonalGrowthPlannerConfigSchema
} from "../src/contracts/personal-growth.js";
import {
  buildPersonalGrowthDailyBrief,
  buildPersonalGrowthRollingPlan,
  loadPersonalGrowthPlannerConfig,
  nextPragueCalendarDate,
  personalGrowthHash
} from "../src/ventures/personal-growth/planner.js";
import { runPersonalGrowthDesk } from "../src/ventures/personal-growth/room.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";
import { buildCalendarFeed } from "../src/meetings/calendar.js";

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function event(input: {
  lane: "okraj" | "bbarak";
  date: string;
  action: "completed" | "skipped" | "rescheduled";
  at?: string;
  to?: string | null;
}) {
  return PersonalGrowthHistoryEventSchema.parse({
    schemaVersion: "personal-growth-history-event/1",
    eventId: `pg-event-${personalGrowthHash(input).slice(-16)}`,
    lane: input.lane,
    occurrenceDate: input.date,
    action: input.action,
    recordedAt: input.at ?? `${input.date}T20:00:00.000Z`,
    rescheduledTo: input.to ?? null,
    finalUrl: null,
    articleUrl: null,
    collaborationUrl: null
  });
}

describe("Personal Growth planner and pg-desk", () => {
  it("registers the exact owner-only 23:00 Prague room outside the public portfolio", async () => {
    const registry = await loadVentureRegistry();
    const venture = registry.ventures.find(({ id }) => id === "personal-growth");
    expect(venture).toMatchObject({ visibility: "owner-only", ledgerNamespace: "personal-growth" });
    expect(venture?.meetings).toEqual([expect.objectContaining({
      kind: "pg-desk",
      label: "Lukáš personal growth desk",
      cadence: "daily@23:00",
      envelopeUsd: 0.15
    })]);
    const publicCalendar = buildCalendarFeed({
      weekOf: "2026-08-24",
      records: [],
      now: new Date("2026-08-24T00:00:00.000Z")
    });
    expect(publicCalendar.slots.map(({ kind }) => String(kind))).not.toContain("pg-desk");
  });

  it("keeps the authorized OKRAJ and BBARAK recurrence anchors typed and rejects an unset anchor", async () => {
    const config = await loadPersonalGrowthPlannerConfig();
    expect(config.lanes).toEqual([
      expect.objectContaining({ lane: "okraj", intervalDays: 10, initialSubjectId: "sandra", targetSlides: 10, ownerAuthorshipRequired: true }),
      expect.objectContaining({ lane: "bbarak", intervalDays: 3, publicationId: "bbarak", ownerAuthorshipRequired: true })
    ]);
    expect(PersonalGrowthPlannerConfigSchema.safeParse({
      ...config,
      lanes: config.lanes.map((lane) => lane.lane === "okraj" ? { ...lane, anchorIds: [] } : lane)
    }).success).toBe(false);
    expect(JSON.stringify(config)).not.toMatch(/\bprose\b/iu);
  });

  it("targets the next Prague calendar date across both DST transitions", () => {
    expect(nextPragueCalendarDate(new Date("2026-03-28T22:30:00.000Z"))).toBe("2026-03-29");
    expect(nextPragueCalendarDate(new Date("2026-03-29T22:30:00.000Z"))).toBe("2026-03-31");
    expect(nextPragueCalendarDate(new Date("2026-10-24T22:30:00.000Z"))).toBe("2026-10-26");
    expect(nextPragueCalendarDate(new Date("2026-10-25T22:30:00.000Z"))).toBe("2026-10-26");
  });

  it("builds a deterministic 30-day plan with collisions, overdue work and preserved reschedules", async () => {
    const config = await loadPersonalGrowthPlannerConfig();
    const history = [event({ lane: "okraj", date: "2026-08-27", action: "rescheduled", to: "2026-09-08" })];
    const first = buildPersonalGrowthRollingPlan({ config, targetPragueDate: "2026-09-07", history });
    const replay = buildPersonalGrowthRollingPlan({ config, targetPragueDate: "2026-09-07", history });
    expect(replay).toEqual(first);
    expect(first.rangeEnd).toBe("2026-10-06");
    expect(first.history).toEqual(history);
    expect(first.occurrences).toContainEqual(expect.objectContaining({
      lane: "okraj",
      originalDate: "2026-08-27",
      scheduledDate: "2026-09-08",
      status: "rescheduled",
      source: "reschedule"
    }));
    expect(first.warnings).toContain("overdue");

    const collisionConfig = PersonalGrowthPlannerConfigSchema.parse({
      ...config,
      lanes: config.lanes.map((lane) => ({ ...lane, recurrenceAnchorDate: "2026-08-27" }))
    });
    expect(buildPersonalGrowthRollingPlan({ config: collisionConfig, targetPragueDate: "2026-08-27" }).warnings).toContain("collision");
  });

  it("records truthful NO_ACTION and NO_POST placeholders at zero dry-run cost", async () => {
    const config = await loadPersonalGrowthPlannerConfig();
    const plan = buildPersonalGrowthRollingPlan({
      config,
      targetPragueDate: "2026-08-28",
      history: [
        event({ lane: "okraj", date: "2026-08-27", action: "completed" }),
        event({ lane: "bbarak", date: "2026-08-27", action: "completed" })
      ]
    });
    const brief = buildPersonalGrowthDailyBrief({ plan, generatedAt: new Date("2026-08-27T21:00:00.000Z"), dry: true });
    expect(brief.room.result).toBe("not-needed");
    expect(brief.primaryAction).toEqual({ occurrenceId: null, decision: "NO_ACTION", noActionReason: "none-due" });
    expect(brief.platformPlaceholders).toMatchObject({ threads: "NO_POST", instagram: "NO_POST", reel: "NO_POST" });
    expect(brief.budget).toMatchObject({ dry: true, mainSyntheses: 0, deterministicValidations: 1, repairs: 0, estimatedUsd: 0, hardMaximumUsd: 0.15 });
  });

  it("replays the same target and input without overwriting an owner correction", async () => {
    const config = await loadPersonalGrowthPlannerConfig();
    const plan = buildPersonalGrowthRollingPlan({ config, targetPragueDate: "2026-08-27" });
    const initial = buildPersonalGrowthDailyBrief({ plan, generatedAt: new Date("2026-08-26T21:00:00.000Z"), dry: false });
    const corrected = { ...initial, correction: { revision: 2, correctedAt: "2026-08-26T21:30:00.000Z" } };
    const replay = buildPersonalGrowthDailyBrief({
      plan,
      generatedAt: new Date("2026-08-26T22:00:00.000Z"),
      dry: false,
      existing: corrected
    });
    expect(replay).toEqual(corrected);
  });

  it("never exposes an actionable item when the private room is held or unavailable", async () => {
    const config = await loadPersonalGrowthPlannerConfig();
    const plan = buildPersonalGrowthRollingPlan({ config, targetPragueDate: "2026-08-27" });
    for (const runResult of ["held", "failed", "unavailable"] as const) {
      const brief = buildPersonalGrowthDailyBrief({
        plan,
        generatedAt: new Date("2026-08-26T21:00:00.000Z"),
        dry: true,
        runResult
      });
      expect(brief.primaryAction).toMatchObject({ occurrenceId: null, decision: "NO_ACTION" });
      expect(brief.platformPlaceholders).toMatchObject({
        threads: "NO_POST",
        instagram: "NO_POST",
        reel: "NO_POST",
        noPostReason: "publishing-not-authorized"
      });
    }
  });

  it("writes only bounded records and keeps every optional source independently unavailable", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pg-desk-"));
    temporary.push(root);
    const result = await runPersonalGrowthDesk({
      now: new Date("2026-08-26T21:00:00.000Z"),
      dry: true,
      root
    });
    expect(result.status).toBe("planned");
    expect(result.spendUsd).toBe(0);
    expect(result.artifacts).toEqual([
      "ventures/personal-growth/briefs/2026-08-27.json",
      "meetings/2026-08-26-pg-desk.json",
      "ventures/personal-growth/recommendations/threads/2026-08-27.json",
      "ventures/personal-growth/recommendations/instagram/2026-08-27.json",
      "ventures/personal-growth/analysis/baseline.json"
    ]);
    expect(result.brief?.optionalInputs).toEqual({ goviral: "unavailable", ownerManualReference: "not-needed" });
    const committed = await readFile(path.join(root, "ventures/personal-growth/briefs/2026-08-27.json"), "utf8");
    expect(committed).not.toMatch(/kvorum|portfolio|social-distribution|credential|manuscript/iu);
    const threads = JSON.parse(await readFile(path.join(root, "ventures/personal-growth/recommendations/threads/2026-08-27.json"), "utf8"));
    expect(threads).toMatchObject({ decision: "NO_POST", publishingAuthorized: false, repliesAuthorized: false });
    const instagram = JSON.parse(await readFile(path.join(root, "ventures/personal-growth/recommendations/instagram/2026-08-27.json"), "utf8"));
    expect(instagram).toMatchObject({ actionType: "bbarak-distribution", ownerWritesArtifact: true, publishingAuthorized: false });
    const baseline = JSON.parse(await readFile(path.join(root, "ventures/personal-growth/analysis/baseline.json"), "utf8"));
    expect(baseline).toMatchObject({ status: "collecting", acceptedResultCount: 0, targetProposal: { activatedTargets: 0 } });
  });

  it("rejects malformed history and per-run authority above the hard maximum", async () => {
    const config = await loadPersonalGrowthPlannerConfig();
    expect(() => buildPersonalGrowthRollingPlan({
      config,
      targetPragueDate: "2026-08-27",
      history: [{ action: "rescheduled" } as never]
    })).toThrow();
    const plan = buildPersonalGrowthRollingPlan({ config, targetPragueDate: "2026-08-27" });
    expect(() => buildPersonalGrowthDailyBrief({
      plan,
      generatedAt: new Date("2026-08-26T21:00:00.000Z"),
      dry: false,
      estimatedUsd: 0.150001
    })).toThrow("exceeds its per-run authority");
  });
});
