import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { slotRecordPath } from "../src/meetings/slot-record.js";
import { PHASE_VENTURES, readVentureRegistry } from "../src/ventures/registry.js";
import { RunnablePhaseSchema, ScheduledPhaseSchema } from "../src/types.js";
import {
  VENTURE_DAYS,
  VENTURE_DAY_PHASES,
  isVentureDayPhase,
  runVentureDay,
  type VentureDayPreStepOutcome,
  type VentureDayPreStepRunner
} from "../src/cycle/venture-day.js";
import { runVentureDayPreStep } from "../src/cycle/pre-steps.js";
import type { CycleOptions, CycleResult } from "../src/cycle/types.js";
import type { VentureRegistry } from "../src/contracts/venture-registry.js";
import type { RunWebDevSignalDailyInput } from "../src/ventures/webdev-signal/run.js";

/**
 * The venture-day runner: the clock consolidates, the rooms do not.
 *
 * Every assertion here is about the driver — that it runs the right rooms in the right order,
 * passes each the day's own clock, and reports honestly what happened. The rooms' own behaviour is
 * proved where it always was, by their own tests, because the day runs them unchanged.
 */

function step(overrides: Partial<CycleResult> = {}): CycleResult {
  return {
    cycleId: "test",
    phase: "cu-edition",
    dry: true,
    status: "dry_complete",
    decision: "NO_ACTION",
    estimatedWorstCaseUsd: 0,
    selectedAgents: [],
    skippedAgents: [],
    artifacts: [],
    ...overrides
  };
}

const options: CycleOptions = {
  phase: "cu-day",
  dry: true,
  explainBudget: false,
  explainRouting: false,
  now: new Date("2026-09-03T06:00:00.000Z")
};

/** A prerequisite that recorded a receipt and touched nothing else: the rooms' tests need no more. */
const recordedPreStep: VentureDayPreStepRunner = async (id) => ({
  id,
  status: "recorded",
  recordRef: `state/ventures/webdev-signal/runs/2026-09-03.json`,
  note: null,
  artifacts: []
});

describe("a venture's day", () => {
  it("names only registered ventures and only runnable rooms", () => {
    const registry = readVentureRegistry();
    const ids = new Set(registry.ventures.map((venture) => venture.id));
    for (const [phase, day] of Object.entries(VENTURE_DAYS)) {
      expect(RunnablePhaseSchema.options, phase).toContain(phase);
      expect(ScheduledPhaseSchema.options, phase).toContain(phase);
      expect(ids.has(day.venture), `${phase} -> ${day.venture}`).toBe(true);
      expect(day.steps.length, phase).toBeGreaterThan(0);
      for (const inner of day.steps) expect(RunnablePhaseSchema.options, inner).toContain(inner);
      // A day may not run a room its venture does not schedule. `article-pm` is the standing
      // example: the registry has promised one article a day since the evening slot was killed.
      expect(day.steps, phase).not.toContain("article-pm");
    }
    expect(isVentureDayPhase("mma-day")).toBe(true);
    expect(isVentureDayPhase("bh-desk")).toBe(false);
  });

  it("pauses with its venture, and gives the MMA day the magazine's switch", () => {
    for (const phase of VENTURE_DAY_PHASES) {
      expect(PHASE_VENTURES[phase], phase).toBe(VENTURE_DAYS[phase].venture);
    }
    // FightAIQ's checks are steps of the MMA Files day, so the magazine's switch stands them down
    // with it. FightAIQ still has no switch of its own — the deliberate exception, written down.
    expect(VENTURE_DAYS["mma-day"].steps).toContain("mma-intake");
    expect(PHASE_VENTURES["mma-day"]).toBe("mma-files");
    expect(Object.values(PHASE_VENTURES)).not.toContain("fightaiq");
  });

  it("runs its rooms in order, each on the day's own clock", async () => {
    const seen: Array<{ phase: string; now: string }> = [];
    const result = await runVentureDay("mma-day", options, async (input) => {
      seen.push({ phase: input.phase, now: input.now!.toISOString() });
      return step({ phase: input.phase });
    }, recordedPreStep);
    expect(seen.map(({ phase }) => phase)).toEqual([...VENTURE_DAYS["mma-day"].steps]);
    // One clock for the whole day: it is what carries the retry hour into the edition room and
    // what keeps a Thursday a Thursday for the growth room.
    expect(new Set(seen.map(({ now }) => now)).size).toBe(1);
    expect(result.phase).toBe("mma-day");
    expect(result.steps?.map((entry) => entry.phase)).toEqual([...VENTURE_DAYS["mma-day"].steps]);
  });

  it("adds up what the day cost and who sat, without double-counting a seat", async () => {
    const results = [
      step({ estimatedWorstCaseUsd: 0.08, selectedAgents: ["CANVAS", "AUDIT"], artifacts: ["a"] }),
      step({ estimatedWorstCaseUsd: 0.12, selectedAgents: ["AUDIT"], skippedAgents: ["CHUM"], artifacts: ["b"] })
    ];
    let index = 0;
    const result = await runVentureDay("cu-day", options, async () => results[index++]!, recordedPreStep);
    expect(result.estimatedWorstCaseUsd).toBeCloseTo(0.2, 10);
    expect(result.selectedAgents).toEqual(["CANVAS", "AUDIT"]);
    expect(result.artifacts).toEqual(["a", "b"]);
    // AUDIT sat in one room; it did not skip the day because another room stood it down.
    expect(result.skippedAgents).toEqual(["CHUM"]);
  });

  it("is only already-recorded when every room was, so a half day resumes", async () => {
    const whole = await runVentureDay("cu-day", options, async () =>
      step({ status: "already_recorded", alreadyRecordedAt: "meetings/x.json" }), recordedPreStep);
    expect(whole.status).toBe("already_recorded");

    // The shape a retry takes: the finished room is skipped, the unfinished one runs, and the day
    // reports that it did work rather than claiming the whole day was already done.
    const outcomes = [
      step({ status: "already_recorded", alreadyRecordedAt: "meetings/2026-09-03-cu-edition.json" }),
      step({ status: "live_complete", decision: "PLAN", dry: false })
    ];
    let index = 0;
    const resumed = await runVentureDay("cu-day", { ...options, dry: false }, async () => outcomes[index++]!, recordedPreStep);
    expect(resumed.status).toBe("live_complete");
    expect(resumed.decision).toBe("PLAN");
    expect(resumed.steps?.[0]?.note).toBe("meetings/2026-09-03-cu-edition.json");
  });

  it("reports a day every room refused as paused, at nothing", async () => {
    const result = await runVentureDay("dm-day", { ...options, dry: false }, async () =>
      step({ status: "paused", decision: "PAUSED", dry: false }), recordedPreStep);
    expect(result).toMatchObject({ status: "paused", decision: "PAUSED", estimatedWorstCaseUsd: 0 });
  });

  it("carries on past a room that threw, and never reports the day clean", async () => {
    // A room's failure costs that room. The rooms behind it already tolerate an upstream that
    // never ran — being six separate dispatches has always required that of them.
    const result = await runVentureDay("cu-day", options, async (input) => {
      if (input.phase === "cu-edition") throw new Error("the edition room fell over");
      return step({ phase: input.phase, decision: "PLAN" });
    }, recordedPreStep);
    expect(result.steps?.[0]).toMatchObject({ phase: "cu-edition", status: "failed" });
    expect(result.steps?.[0]?.note).toContain("fell over");
    expect(result.steps?.[1]).toMatchObject({ phase: "cu-product", status: "dry_complete" });
    // The failure is on the record the caller reads; nothing here reports a day that went well.
    expect(result.steps?.some((entry) => entry.status === "failed")).toBe(true);
  });

  it("runs the WebDev Signal scan before the first Caught Up room, on the day's clock", async () => {
    // `config/webdev-signal.json` places the scan `before-anchor` on `cu-day`; the registration
    // test proves that shape, this proves the driver honours it. Only Caught Up's day carries it.
    expect(VENTURE_DAYS["cu-day"].preSteps).toEqual(["webdev-signal-daily"]);
    for (const phase of VENTURE_DAY_PHASES.filter((candidate) => candidate !== "cu-day")) {
      expect((VENTURE_DAYS[phase] as { preSteps?: readonly string[] }).preSteps ?? [], phase).toEqual([]);
    }
    const order: string[] = [];
    const clocks = new Set<string>();
    const result = await runVentureDay("cu-day", options, async (input) => {
      order.push(input.phase);
      clocks.add(input.now!.toISOString());
      return step({ phase: input.phase });
    }, async (id, input) => {
      order.push(id);
      clocks.add(input.now!.toISOString());
      return { id, status: "recorded", recordRef: "state/ventures/webdev-signal/runs/2026-09-03.json", note: "NO_EDITION", artifacts: ["state/ventures/webdev-signal/runs/2026-09-03.json"] };
    });
    expect(order).toEqual(["webdev-signal-daily", "cu-edition", "cu-product"]);
    expect(clocks.size).toBe(1);
    expect(result.preSteps).toEqual([expect.objectContaining({ id: "webdev-signal-daily", status: "recorded" })]);
    expect(result.artifacts).toContain("state/ventures/webdev-signal/runs/2026-09-03.json");
    // The scan is not a room: it is absent from the rooms' record and cannot be the headline.
    expect(result.steps?.map((entry) => entry.phase)).toEqual(["cu-edition", "cu-product"]);
    expect(result.decision).toBe("NO_ACTION");
  });

  it("carries on into the Caught Up rooms when the scan throws, and says it did", async () => {
    const rooms: string[] = [];
    const result = await runVentureDay("cu-day", options, async (input) => {
      rooms.push(input.phase);
      return step({ phase: input.phase, decision: "PLAN" });
    }, async () => {
      throw new Error("a feed fell over inside the scan");
    });
    expect(rooms).toEqual(["cu-edition", "cu-product"]);
    expect(result.preSteps?.[0]).toMatchObject({ id: "webdev-signal-daily", status: "failed" });
    expect(result.preSteps?.[0]?.note).toContain("fell over");
    // The scan's failure never decides the day: the rooms ran, and the day reports what they did.
    expect(result.status).toBe("dry_complete");
    expect(result.decision).toBe("PLAN");
    expect(result.steps?.every((entry) => entry.status === "dry_complete")).toBe(true);
  });

  it("does not count the scan when deciding whether every room was already recorded", async () => {
    const result = await runVentureDay("cu-day", options, async () =>
      step({ status: "already_recorded", alreadyRecordedAt: "meetings/x.json" }), async (id) => ({
      id, status: "recorded", recordRef: null, note: null, artifacts: []
    }));
    expect(result.status).toBe("already_recorded");
  });

  it("gives a day no record of its own, so a second firing can resume it", () => {
    // The rooms' records are what a re-fire reads. A day-level record would stop the second
    // firing before any room could be reconsidered, turning a resumable day into a lost one.
    for (const phase of VENTURE_DAY_PHASES) {
      expect(slotRecordPath(phase, "2026-09-03")).toBe(`meetings/2026-09-03-${phase}.json`);
    }
  });
});

describe("the production prerequisite runner", () => {
  const registryWith = (status: "operating" | "paused"): (() => Promise<VentureRegistry>) => async () =>
    ({ ventures: [{ id: "webdev-signal", status }] } as unknown as VentureRegistry);

  it("ends before the runner when the owner paused the venture, and records why", async () => {
    let called = 0;
    const outcome = await runVentureDayPreStep("webdev-signal-daily", { ...options, dry: false }, {
      loadRegistry: registryWith("paused"),
      runDaily: async () => {
        called += 1;
        throw new Error("must not run");
      }
    });
    expect(called).toBe(0);
    expect(outcome).toMatchObject({ status: "paused", recordRef: null });
    expect(outcome.note).toContain("paused");
  });

  it("reports a firing the registration does not anchor to as skipped, not paused", async () => {
    const outcome = await runVentureDayPreStep("webdev-signal-daily", options, {
      loadRegistry: registryWith("operating"),
      runDaily: async () => ({ status: "not-anchored", pragueDate: "2026-09-03", run: null, runRef: null, artifacts: [] })
    });
    expect(outcome).toMatchObject({ status: "skipped", recordRef: null, artifacts: [] });
    expect(outcome.note).toContain("not the phase");
  });

  it("hands a dry firing to the runner as a fixture day with no lock and no fetch", async () => {
    const seen: RunWebDevSignalDailyInput[] = [];
    const outcome = await runVentureDayPreStep("webdev-signal-daily", options, {
      loadRegistry: registryWith("operating"),
      runDaily: async (input) => {
        seen.push(input);
        return { status: "already_recorded", pragueDate: "2026-09-03", run: {} as never, runRef: "state/ventures/webdev-signal/runs/2026-09-03.json", artifacts: [] };
      }
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ dry: true, dispatcherPhase: "cu-day" });
    expect(seen[0]?.fetchImpl).toBeUndefined();
    expect(outcome).toMatchObject({ status: "already_recorded", recordRef: "state/ventures/webdev-signal/runs/2026-09-03.json" });
  });

  it("takes the state lock for a live firing and hands the runner the platform fetch", async () => {
    const lockRoot = await mkdtemp(path.join(os.tmpdir(), "webdev-prestep-lock-"));
    let lockedDuringRun = false;
    let fetchSeen: unknown;
    const outcome = await runVentureDayPreStep("webdev-signal-daily", { ...options, dry: false }, {
      loadRegistry: registryWith("operating"),
      lockRoot,
      runDaily: async (input) => {
        fetchSeen = input.fetchImpl;
        lockedDuringRun = await stat(path.join(lockRoot, ".lock")).then(() => true, () => false);
        return {
          status: "recorded",
          pragueDate: "2026-09-03",
          run: { selectionOutcome: "NO_EDITION", nextSafeAction: "Nothing to post." } as never,
          runRef: "state/ventures/webdev-signal/runs/2026-09-03.json",
          artifacts: ["state/ventures/webdev-signal/runs/2026-09-03.json"]
        };
      }
    });
    expect(lockedDuringRun).toBe(true);
    expect(fetchSeen).toBe(fetch);
    expect(outcome).toMatchObject({ status: "recorded", note: "NO_EDITION: Nothing to post." });
    // Released afterwards, exactly as a room releases it.
    await expect(stat(path.join(lockRoot, ".lock"))).rejects.toThrow();
    await rm(lockRoot, { recursive: true, force: true });
  });
});

describe("the company's one meeting a day", () => {
  it("gives the surviving meeting the checkpoint the night used to run", async () => {
    const source = await readFile(new URL("../src/cycle.ts", import.meta.url), "utf8");
    // The audit behind `operations-2026-08c`: the afternoon had no duty of its own, the morning is
    // the live council and the night was the checkpoint. Every block that read the night now reads
    // this flag, so the morning does them and a dispatched night still does exactly what it did.
    expect(source).toContain('const dayCheckpoint = venturePhase === "morning" || venturePhase === "night"');
    for (const duty of [
      "refreshEcosystemOperatingTruth",
      "runContentGate",
      "materializeOperationsState",
      "synchronizeImplementationPrograms",
      "writeWeeklyReportIfDue"
    ]) {
      expect(source, duty).toContain(duty);
    }
    // Nothing may still be gated on the night alone: that is what would strand a duty when the
    // night stops being scheduled.
    // Past the flag's own definition, which necessarily names the night.
    const definition = 'const dayCheckpoint = venturePhase === "morning" || venturePhase === "night";';
    const guarded = source.slice(source.indexOf(definition) + definition.length);
    expect(guarded).not.toContain('venturePhase === "night"');
  });

  it("keeps the decision that retired the two shifts on file with its audit", async () => {
    const decision = await readFile(
      new URL("../../state/decisions/2026-08-29-one-meeting-per-day.md", import.meta.url),
      "utf8"
    );
    expect(decision).toContain("operations-2026-08c");
    // The owner asked what the retired shifts owned; a decision that does not answer that is not
    // the record this change needs.
    for (const shift of ["Morning", "Afternoon", "Night"]) expect(decision).toContain(shift);
    expect(decision).toContain("stays individually runnable");
  });
});
