import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deployedCronExpressions, readVentureRegistry, resolveScheduledClock } from "../src/ventures/registry.js";
import { CRON_MINUTE } from "../src/ventures/registry.js";
import { resolveBackstopSweep } from "../src/meetings/sweep.js";
import { slotRecordPath } from "../src/meetings/slot-record.js";

const registry = readVentureRegistry();

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
  it("deploys five crons on the house minute, and two of them after the last desk", () => {
    const deployed = deployedCronExpressions();
    expect(deployed).toHaveLength(5);
    // 21:55 UTC is 23:55 Prague in summer and 22:55 UTC is 23:55 Prague in winter. Without the
    // pair the 23:00 Personal Growth desk was the one slot no sweep could reach: its Vercel
    // dispatch is the only path to it, and the desk ran once in August and then left sixteen
    // skip records in a row.
    expect(deployed).toContain(`${CRON_MINUTE} 21 * * *`);
    expect(deployed).toContain(`${CRON_MINUTE} 22 * * *`);
    for (const expression of deployed) {
      expect(expression).toMatch(new RegExp(`^${CRON_MINUTE} \\d{1,2} \\* \\* \\*$`, "u"));
    }
    // Far fewer than the per-slot expressions the Vercel side still uses.
    expect(deployed.length).toBeLessThan(resolveScheduledClock(registry).length);
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

describe("the evening sweeps", () => {
  it("reach the 23:00 desk in summer from the 21:55 UTC sweep", async () => {
    const root = await stateRoot();
    // 23:55 Prague on 15 September (CEST): every slot of the day has passed. Everything but the
    // 23:00 desk has a record, so the desk is what the sweep opens.
    const now = new Date("2026-09-15T21:55:00.000Z");
    for (const slot of resolveScheduledClock(registry)) {
      if (slot.phase !== "pg-desk") await record(root, slot.phase, "2026-09-15");
    }
    expect((await resolveBackstopSweep({ registry, stateRoot: root, now })).phase).toBe("pg-desk");
  });

  it("reach the 23:00 desk in winter from the 22:55 UTC sweep, and never yesterday's", async () => {
    const root = await stateRoot();
    // 23:55 Prague on 15 December (CET) from the later sweep of the pair.
    const winter = new Date("2026-12-15T22:55:00.000Z");
    for (const slot of resolveScheduledClock(registry)) {
      if (slot.phase !== "pg-desk") await record(root, slot.phase, "2026-12-15");
    }
    expect((await resolveBackstopSweep({ registry, stateRoot: root, now: winter })).phase).toBe("pg-desk");
    // The same 22:55 UTC sweep in summer is 00:55 Prague on the 16th: nothing of that day has
    // passed, and the 15th's desk is not reopened across midnight.
    const summerAfterMidnight = new Date("2026-09-15T22:55:00.000Z");
    expect((await resolveBackstopSweep({ registry, stateRoot: root, now: summerAfterMidnight })).phase).toBeNull();
  });
});
