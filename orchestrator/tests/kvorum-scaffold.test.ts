import { access, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MeetingRecordSchema } from "../src/contracts/meeting-record.js";
import { runKvorumScaffoldDryCycle } from "../src/ventures/kvorum/scaffold.js";

describe("Kvórum Phase A scaffold", () => {
  it("records an honest zero-dollar quiet day without a monitor, provider or budget write", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-kvorum-scaffold-"));
    const result = await runKvorumScaffoldDryCycle({
      cycleId: "20260812-kv-desk",
      now: new Date("2026-08-12T19:00:00.000Z"),
      root
    });
    const record = MeetingRecordSchema.parse(JSON.parse(
      await readFile(path.join(root, "meetings/2026-08-12-kv-desk.json"), "utf8")
    ) as unknown);

    expect(result).toMatchObject({ decision: "NO_ACTION", estimatedWorstCaseUsd: 0, selectedAgents: [] });
    expect(record).toMatchObject({
      fixture: true,
      status: "NO_ACTION",
      ledger: { estimatedCycleUsd: 0, actualCycleUsd: 0 },
      decision: { outcome: "NO_ACTION", summary: expect.stringMatching(/No monitor data/iu) }
    });
    expect(record.participantReasons.every((participant) => !participant.participated)).toBe(true);
    await expect(access(path.join(root, "budget/ledger.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(path.join(root, "ventures/kvorum/recommendations"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
