import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deployedCronExpressions, readVentureRegistry, resolveScheduledClock } from "../src/ventures/registry.js";
import { CRON_MINUTE } from "../src/ventures/registry.js";
import { resolveBackstopSweep } from "../src/meetings/sweep.js";
import { slotRecordPath } from "../src/meetings/slot-record.js";
import { allOperating } from "./fixtures/all-operating-registry.js";

/** The registry the repository deploys, for what the schedule actually is. */
const liveRegistry = readVentureRegistry();
/** Every room running, for how a sweep behaves whichever ventures the owner runs today. */
const registry = allOperating(liveRegistry);

async function stateRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "backstop-sweep-"));
}

async function record(root: string, phase: Parameters<typeof slotRecordPath>[0], date: string): Promise<void> {
  const target = path.join(root, slotRecordPath(phase, date));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, "{}", "utf8");
}

/**
 * Eighteen GitHub crons duplicated a punctual Vercel path that had already done the work — about
 * 600 billable minutes a month of guard exits. Three sweeps replace them, and a sweep is a rescue,
 * never a second opinion: it opens only a slot that has no record and can still be opened.
 */
describe("the backstop sweep", () => {
  it("deploys three crons on the house minute", () => {
    const deployed = deployedCronExpressions();
    expect(deployed).toHaveLength(3);
    // Two late sweeps (21 and 22 UTC) existed only for the 23:00 Personal Growth desk and left
    // with it when it was paused (operations-2026-09b).
    expect(deployed).not.toContain(`${CRON_MINUTE} 21 * * *`);
    expect(deployed).not.toContain(`${CRON_MINUTE} 22 * * *`);
    for (const expression of deployed) {
      expect(expression).toMatch(new RegExp(`^${CRON_MINUTE} \\d{1,2} \\* \\* \\*$`, "u"));
    }
    // Far fewer than the per-slot expressions the Vercel side still uses.
    expect(deployed.length).toBeLessThanOrEqual(resolveScheduledClock(liveRegistry).length);
  });

  it("has no running slot after 21:00 Prague, which only the removed late sweeps could reach", () => {
    // 19:55 UTC is the last sweep: 21:55 Prague in summer, 20:55 in winter. A venture resumed with
    // a later slot needs 21 and 22 back in BACKSTOP_SWEEP_HOURS and in cycle.yml.
    const late = resolveScheduledClock(liveRegistry).filter((slot) => slot.hour >= 21);
    expect(late.map((slot) => slot.phase), "restore the 21:55 and 22:55 UTC sweeps").toEqual([]);
  });

  it("rescues the oldest slot today that has no record", async () => {
    const root = await stateRoot();
    // 10:00 Prague on 10 August: the 05:00, 06:00, 07:00 and 08:00 slots have all passed and all
    // are still inside the window a firing can name them in. The day's own record is what the
    // sweep reads — DNESKAi's rooms write theirs inside `cu-day`, and the sweep asks about the
    // slot on the clock.
    const now = new Date("2026-08-10T08:00:00.000Z");
    await record(root, "cu-day", "2026-08-10");

    const outcome = await resolveBackstopSweep({ registry, stateRoot: root, now });

    // 05:00 has its record, so the sweep reaches for the next slot that has passed — never a
    // later one first, because a later slot's packet may read an earlier slot's record.
    expect(outcome.phase).toBe("morning");
  });

  it("finds nothing when the day is accounted for", async () => {
    const root = await stateRoot();
    const now = new Date("2026-08-10T18:00:00.000Z");
    for (const slot of resolveScheduledClock(registry)) {
      await record(root, slot.phase, "2026-08-10");
    }

    const outcome = await resolveBackstopSweep({ registry, stateRoot: root, now });

    expect(outcome.phase).toBeNull();
    expect(outcome.reason).toContain("already has a record");
  });

  it("never reaches for a slot whose hour has not come", async () => {
    const root = await stateRoot();
    // 05:55 Prague: the 05:00 DNESKAi day has passed and nothing else has.
    const outcome = await resolveBackstopSweep({
      registry,
      stateRoot: root,
      now: new Date("2026-08-10T03:55:00.000Z")
    });

    expect(outcome.phase).toBe("cu-day");
  });

  it("never opens a room the punctual path would have refused as too late", async () => {
    const root = await stateRoot();
    // 22:00 Prague. The 05:00 slot has no record, but a firing naming it now is far outside the
    // window in which a run can still be recorded against it — the same window a late cron hits.
    const outcome = await resolveBackstopSweep({
      registry,
      stateRoot: root,
      now: new Date("2026-08-10T20:00:00.000Z")
    });

    // The window is CRON_DELIVERY_WINDOW_HOURS minus the lead, so at 22:00 the oldest slot a
    // firing can still name is 17:00 — the morning is long past reach. 17:00 emptied when the
    // product room joined DNESKAi's day, so the oldest reachable slot is now the 18:00 desk.
    expect(outcome.phase).not.toBe("cu-day");
    expect(outcome.phase).toBe("ts-desk");
  });

  it("says so plainly before the day's first slot", async () => {
    const root = await stateRoot();
    const outcome = await resolveBackstopSweep({
      registry,
      stateRoot: root,
      now: new Date("2026-08-10T01:00:00.000Z")
    });

    expect(outcome.phase).toBeNull();
    expect(outcome.reason).toContain("has passed its hour yet");
  });
});
