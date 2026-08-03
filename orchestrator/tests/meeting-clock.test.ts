import { describe, expect, it } from "vitest";
import { resolveCronPhase } from "../src/meetings/clock.js";
import { readVentureRegistry, scheduledCronExpressions } from "../src/ventures/registry.js";
/** The crons that carry a meeting in summer, read from the generator rather than pinned. */
function summerCrons(): string[] {
  return scheduledCronExpressions(readVentureRegistry()).filter((cron) =>
    resolveCronPhase(cron, new Date(Date.UTC(2026, 7, 3, Number(cron.split(" ")[1]), 0))) !== null
  );
}

/** The firings that belong to the winter variant and therefore carry no summer meeting. */
function winterOnlyHours(): number[] {
  return scheduledCronExpressions(readVentureRegistry())
    .map((cron) => Number(cron.split(" ")[1]))
    .filter((hour) => resolveCronPhase(`0 ${hour} * * *`, new Date(Date.UTC(2026, 7, 3, hour, 0))) === null);
}


describe("a queued cron still runs the meeting it was scheduled for", () => {
  // The delays GitHub actually applied to the 2 August crons, in minutes past the hour.
  const LATE_BY = [54, 29, 25, 28, 13, 50, 38, 14, 58, 42, 23, 1, 7, 57, 3];

  it("resolves every meeting from its own cron, however late the run starts", () => {
    // On 2 August seven of fourteen meetings resolved to "skip" because the wall-clock
    // reading allows twenty minutes of grace and GitHub queued the crons up to 54 late.
    for (const cron of summerCrons()) {
      const hour = Number(cron.split(" ")[1]);
      const onTime = resolveCronPhase(cron, new Date(`2026-08-02T${String(hour).padStart(2, "0")}:00:00Z`));
      expect(onTime, `${cron} on time`).not.toBeNull();
      for (const late of LATE_BY) {
        const at = new Date(Date.UTC(2026, 7, 2, hour, late));
        expect(resolveCronPhase(cron, at), `${cron} ${late} minutes late`).toBe(onTime);
      }
    }
  });

  it("never answers a neighbouring meeting when a run is very late", () => {
    // The wall clock read a run that started at 11:58 UTC as the 14:00 Prague company
    // meeting, when the only cron that could have triggered it fired at 11:00 for studio.
    // Running the wrong meeting is worse than running none. Studio sits at 13:00 Prague and
    // the afternoon board at 14:00, an hour apart, and each keeps its own firing however late.
    expect(resolveCronPhase("0 10 * * *", new Date("2026-08-02T10:58:00Z"))).toBe("studio");
    expect(resolveCronPhase("0 11 * * *", new Date("2026-08-02T11:05:00Z"))).toBe("afternoon");
  });

  it("keeps the two daylight-saving variants apart", () => {
    // 03:00 UTC carries the 06:00 Prague morning board in summer and the 05:00 DNESKAi
    // edition in winter — one firing, two meetings, told apart by the date alone.
    expect(resolveCronPhase("0 3 * * *", new Date("2026-08-02T03:00:00Z"))).toBe("morning");
    expect(resolveCronPhase("0 3 * * *", new Date("2026-01-15T03:00:00Z"))).toBe("cu-edition");
    // The inactive variant of a slot has no meeting and must stay skipped.
    for (const hour of winterOnlyHours()) {
      expect(resolveCronPhase(`0 ${hour} * * *`, new Date(Date.UTC(2026, 7, 2, hour, 0))), `0 ${hour} in summer`).toBeNull();
    }
    expect(resolveCronPhase("0 2 * * *", new Date("2026-01-15T02:00:00Z"))).toBeNull();
  });

  it("refuses a cron it cannot read, and a run absurdly far from any firing", () => {
    expect(resolveCronPhase("*/5 * * * *", new Date("2026-08-02T04:00:00Z"))).toBeNull();
    expect(resolveCronPhase("", new Date("2026-08-02T04:00:00Z"))).toBeNull();
    expect(resolveCronPhase("0 3 * * *", new Date("2026-08-02T11:00:00Z"))).toBeNull();
  });
});

describe("the fired cron is the final word", () => {
  it("covers all fifteen Prague slots and only those, from the summer crons", () => {
    const summer = summerCrons()
      .map((cron) => resolveCronPhase(cron, new Date(Date.UTC(2026, 7, 3, Number(cron.split(" ")[1]), 40))));
    expect(summer.filter(Boolean)).toHaveLength(15);
    expect(new Set(summer).size).toBe(15);
  });

  it("answers nothing for a firing that belongs to the other daylight-saving variant", () => {
    // 10:00, 13:00 and 21:00 UTC are winter firings. In summer they must resolve to no
    // meeting — and a caller must not then reach for the wall clock, which at 10:40 UTC is
    // 12:40 in Prague and would hand back the 13:00 studio slot: the neighbouring-meeting
    // failure this whole change exists to remove.
    for (const hour of winterOnlyHours()) {
      expect(resolveCronPhase(`0 ${hour} * * *`, new Date(Date.UTC(2026, 7, 3, hour, 40))), `0 ${hour}`).toBeNull();
    }
  });
});
