import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCycle } from "../src/cycle.js";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import { repoRoot } from "../src/paths.js";
import {
  PhaseSchema,
  RunnablePhaseSchema,
  type ShiftPhase
} from "../src/types.js";

const shifts: Array<{
  phase: ShiftPhase;
  now: Date;
}> = [
  { phase: "morning", now: new Date("2026-07-23T04:00:00.000Z") },
  { phase: "afternoon", now: new Date("2026-07-23T12:00:00.000Z") },
  { phase: "night", now: new Date("2026-07-23T20:00:00.000Z") }
];

describe("cycle preflight", () => {
  it("runs three full-council shifts inside the daily budget", async () => {
    const results = await Promise.all(
      shifts.map(({ phase, now }) =>
        runCycle({
          phase,
          dry: true,
          explainBudget: false,
          explainRouting: false,
          now
        })
      )
    );

    for (const [index, result] of results.entries()) {
      const shift = shifts[index]!;
      expect(result.status).toBe("dry_complete");
      expect(result.estimatedWorstCaseUsd).toBeLessThanOrEqual(0.12);
      expect(result.selectedAgents).toEqual(
        expect.arrayContaining(["VIZE", "FORGE", "PULSE", "AUDIT", "LEDGER"])
      );
      if (shift.phase === "morning") expect(result.selectedAgents).toContain("SPARK");
      else expect(result.selectedAgents).not.toContain("SPARK");
      expect(result.skippedAgents).toContain("PEOPLE");
      expect(result.artifacts).toContain(
        `tmp/dry-run/state/standups/2026-07-23-${shift.phase}.json`
      );
    }

    expect(
      results.reduce(
        (total, result) => total + result.estimatedWorstCaseUsd,
        0
      )
    ).toBeLessThanOrEqual(0.4);
  });

  it("refuses to found a venture from fixture evidence", async () => {
    const result = await runCycle({
      phase: "founding",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now: new Date("2026-07-23T05:30:00.000Z")
    });
    expect(result.decision).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.status).toBe("dry_complete");
  });

  it("is deterministic for the same cycle identity", async () => {
    const now = new Date("2026-07-23T20:00:00.000Z");
    const first = await runCycle({
      phase: "night",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now
    });
    const second = await runCycle({
      phase: "night",
      dry: true,
      explainBudget: false,
      explainRouting: false,
      now
    });
    expect(second).toEqual(first);
  });

  it("reads legacy records but refuses to schedule legacy phases", () => {
    expect(PhaseSchema.parse("am")).toBe("am");
    expect(PhaseSchema.parse("pm")).toBe("pm");
    expect(() => RunnablePhaseSchema.parse("am")).toThrow();
    expect(() => RunnablePhaseSchema.parse("pm")).toThrow();
  });

  it("runs both Caught Up phases through fixture-only meeting, calendar and email steps", async () => {
    const phases = [
      { phase: "cu-edition" as const, now: new Date("2026-08-04T03:00:00.000Z") },
      { phase: "cu-product" as const, now: new Date("2026-08-04T15:00:00.000Z") }
    ];
    for (const fixture of phases) {
      const result = await runCycle({
        ...fixture,
        dry: true,
        explainBudget: false,
        explainRouting: false
      });
      expect(result.status).toBe("dry_complete");
      expect(result.estimatedWorstCaseUsd).toBe(0.08);
      expect(result.artifacts).toEqual(expect.arrayContaining([
        `tmp/dry-run/state/meetings/2026-08-04-${fixture.phase}.json`,
        `tmp/dry-run/state/notify/email/meetings-2026-08-04-${fixture.phase}.json`,
        "tmp/dry-run/state/calendar/2026-08-03.json"
      ]));
      const meetingFile = path.join(
        repoRoot,
        `tmp/dry-run/state/meetings/2026-08-04-${fixture.phase}.json`
      );
      expect(MeetingRecordSchema.parse(JSON.parse(await readFile(meetingFile, "utf8"))).kind)
        .toBe(fixture.phase);
    }
  });

  it("keeps Caught Up live execution disabled before cutover", async () => {
    await expect(runCycle({
      phase: "cu-edition",
      dry: false,
      explainBudget: false,
      explainRouting: false,
      now: new Date("2026-08-04T03:00:00.000Z")
    })).rejects.toThrow(/remain dry until the Phase 9 cutover/);
  });
});
