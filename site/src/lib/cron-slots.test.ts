import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cronUtcHours,
  expectedCronEntries,
  parseScheduledPhase,
  pragueHour,
  pragueUtcOffsetHours,
  resolveCronSlots,
  SCHEDULED_PHASES
} from "@/lib/cron-slots";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

async function registry(): Promise<unknown> {
  return JSON.parse(await readFile(path.join(repoRoot, "config", "ventures.json"), "utf8"));
}

describe("the slot table the cron route dispatches from", () => {
  it("reads every scheduled slot out of the venture registry", async () => {
    const slots = await resolveCronSlots(await registry());
    expect(slots.map((slot) => `${slot.hour}:${slot.phase}`)).toEqual([
      "5:cu-edition",
      "6:morning",
      "7:ms-daily",
      "8:mma-intake",
      "9:mag-editorial",
      "10:article-am",
      "11:tt-marketing",
      "12:bh-desk",
      "13:gv-brief",
      "14:afternoon",
      "17:cu-product",
      "18:ts-desk",
      "19:mma-analysis",
      "20:mag-desk",
      "22:night"
    ]);
  });

  it("refuses a registry it cannot read rather than dropping a slot", async () => {
    expect(() => resolveCronSlots({})).toThrow(/Invalid venture registry/u);
    expect(() =>
      resolveCronSlots({
        schemaVersion: "venture-registry/1",
        ventures: [{ meetings: [{ kind: "not-a-phase", cadence: "daily@09:00" }] }]
      })
    ).toThrow(/Unsupported venture meeting kind/u);
    expect(() =>
      resolveCronSlots({
        schemaVersion: "venture-registry/1",
        ventures: [{ meetings: [{ kind: "mag-desk", cadence: "hourly" }] }]
      })
    ).toThrow(/Unsupported venture cadence/u);
  });

  it("refuses two meetings in one Prague hour, which would make both DST variants look live", () => {
    expect(() =>
      resolveCronSlots({
        schemaVersion: "venture-registry/1",
        ventures: [
          { meetings: [{ kind: "mag-desk", cadence: "daily@13:00" }] },
          { meetings: [{ kind: "tt-marketing", cadence: "daily@13:00" }] }
        ]
      })
    ).toThrow(/share one Prague hour/u);
  });

  it("names only phases the route will accept", async () => {
    for (const slot of await resolveCronSlots(await registry())) {
      expect(parseScheduledPhase(slot.phase)).toBe(slot.phase);
    }
    expect(parseScheduledPhase("founding")).toBeNull();
    expect(parseScheduledPhase("../admin")).toBeNull();
    expect(parseScheduledPhase("")).toBeNull();
  });
});

describe("the Prague clock the route decides the live DST variant with", () => {
  it("reads the offset that is actually in force", () => {
    // 4 August is CEST, 4 January is CET.
    expect(pragueUtcOffsetHours(new Date("2026-08-04T08:00:00.000Z"))).toBe(2);
    expect(pragueUtcOffsetHours(new Date("2026-01-04T08:00:00.000Z"))).toBe(1);
    expect(pragueHour(new Date("2026-08-04T08:00:00.000Z"))).toBe(10);
    expect(pragueHour(new Date("2026-01-04T08:00:00.000Z"))).toBe(9);
  });

  it("wraps across midnight rather than going negative", () => {
    // 23:30 UTC under CEST is 01:30 the next Prague day.
    expect(pragueHour(new Date("2026-08-04T23:30:00.000Z"))).toBe(1);
  });

  /**
   * The two changeover days are where a schedule written in UTC either works or silently moves
   * every meeting by an hour. Both entries fire on both days; exactly one of them must land in
   * the slot's Prague hour, and it has to be the other one after the changeover than before.
   */
  it.each([
    // Europe/Prague turns the clocks forward at 01:00 UTC on 29 March 2026.
    ["the morning before spring forward", "2026-03-29T04:00:00.000Z", 6, true],
    ["the winter entry after spring forward", "2026-03-29T05:00:00.000Z", 6, false],
    // ...and back at 01:00 UTC on 25 October 2026.
    ["the summer entry after fall back", "2026-10-25T04:00:00.000Z", 6, false],
    ["the morning after fall back", "2026-10-25T05:00:00.000Z", 6, true]
  ])("resolves %s", (_name, instant, slotHour, isLive) => {
    expect(pragueHour(new Date(instant)) === slotHour).toBe(isLive);
  });

  it("gives every slot exactly one live entry on any given day", async () => {
    const slots = await resolveCronSlots(await registry());
    for (const day of ["2026-08-04", "2026-01-04", "2026-03-29", "2026-10-25"]) {
      for (const slot of slots) {
        const live = cronUtcHours(slot.hour).filter((utcHour) => {
          const at = new Date(`${day}T${String(utcHour).padStart(2, "0")}:00:00.000Z`);
          return pragueHour(at) === slot.hour;
        });
        expect(live, `${slot.phase} on ${day}`).toHaveLength(1);
      }
    }
  });
});

/**
 * `vercel.json` is what Vercel actually schedules, and nothing at runtime reads it back. A drift
 * between it and the registry would take a slot off the punctual path without any other symptom.
 * `orchestrator/tests/vercel-cron.test.ts` pins the same file to the orchestrator's own clock, so
 * the two derivations and the deployed file are held together from both sides.
 */
describe("the deployed vercel.json", () => {
  it("holds exactly the entries this module derives from the registry", async () => {
    const deployed = JSON.parse(
      await readFile(path.join(repoRoot, "site", "vercel.json"), "utf8")
    ) as { crons: Array<{ path: string; schedule: string }> };
    const key = (entry: { path: string; schedule: string }) => `${entry.path} ${entry.schedule}`;
    expect(deployed.crons.map(key).sort()).toEqual(expectedCronEntries(await registry()).map(key).sort());
    // One entry per daylight-saving variant for every scheduled phase, plus the two the edition
    // slot's same-day retry adds. The retry is a second dispatch of cu-edition, not a phase.
    expect(deployed.crons).toHaveLength((SCHEDULED_PHASES.length + 1) * 2);
  });
});
