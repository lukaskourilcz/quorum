import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import { runTehdejsiSvetCycle } from "../src/ventures/tehdejsi-svet/run.js";

const temporaryRoots: string[] = [];

async function temporaryState(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-svet-cycle-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  delete process.env.MEETING_TRIGGER;
  delete process.env.PORTFOLIO_LIVE_ENABLED;
});

describe("Tehdejsi svet desk", () => {
  it("keeps a scheduled live phase paused behind the pending founding decision at $0", async () => {
    const root = await temporaryState();
    process.env.MEETING_TRIGGER = "schedule";

    const result = await runTehdejsiSvetCycle({
      executionCycleId: "20260812160000-ts-desk",
      dry: false,
      now: new Date("2026-08-12T16:00:00.000Z"),
      root
    });

    expect(result).toMatchObject({ status: "paused", decision: "PAUSED", estimatedWorstCaseUsd: 0 });
    expect(result.selectedAgents).toEqual([]);
    const record = JSON.parse(await readFile(path.join(root, "meetings", "2026-08-12-ts-desk.json"), "utf8"));
    expect(MeetingRecordSchema.safeParse(record).success).toBe(true);
    expect(record.ledger).toMatchObject({ estimatedCycleUsd: 0, actualCycleUsd: 0 });
    // The room says what has not been built rather than reporting a meeting that never happened.
    expect(record.participantReasons.every((entry: { participated: boolean }) => !entry.participated)).toBe(true);
    expect(record.decision.evidenceRefs).toContain("decisions/2026-08-12-tehdejsi-svet-founding.md");
  });

  it("writes nothing when a closed live room is invoked by hand", async () => {
    const root = await temporaryState();

    const result = await runTehdejsiSvetCycle({
      executionCycleId: "20260812170000-ts-desk",
      dry: false,
      now: new Date("2026-08-12T17:00:00.000Z"),
      root
    });

    expect(result).toMatchObject({ status: "paused", decision: "PAUSED", artifacts: [] });
    await expect(readFile(path.join(root, "meetings", "2026-08-12-ts-desk.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("treats a second firing for a recorded date as a no-op", async () => {
    const root = await temporaryState();
    process.env.MEETING_TRIGGER = "schedule";
    const now = new Date("2026-08-12T16:00:00.000Z");
    await runTehdejsiSvetCycle({ executionCycleId: "20260812160000-ts-desk", dry: false, now, root });
    const first = await readFile(path.join(root, "meetings", "2026-08-12-ts-desk.json"), "utf8");

    const duplicate = await runTehdejsiSvetCycle({
      executionCycleId: "20260812161500-ts-desk",
      dry: false,
      now: new Date("2026-08-12T16:15:00.000Z"),
      root
    });

    expect(duplicate).toMatchObject({ status: "already_recorded", decision: "NO_ACTION", artifacts: [] });
    expect(await readFile(path.join(root, "meetings", "2026-08-12-ts-desk.json"), "utf8")).toBe(first);
  });
});
