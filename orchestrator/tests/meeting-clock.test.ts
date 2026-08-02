import { describe, expect, it } from "vitest";
import { resolveCronPhase } from "../src/meetings/clock.js";

describe("a queued cron still runs the meeting it was scheduled for", () => {
  // The delays GitHub actually applied to the 2 August crons, in minutes past the hour.
  const LATE_BY = [54, 29, 25, 28, 13, 50, 38, 14, 58, 42, 23, 1, 7, 57, 3];

  it("resolves every meeting from its own cron, however late the run starts", () => {
    // On 2 August seven of fourteen meetings resolved to "skip" because the wall-clock
    // reading allows twenty minutes of grace and GitHub queued the crons up to 54 late.
    for (const hour of [3, 4, 5, 6, 7, 8, 9, 11, 12, 15, 16, 17, 18, 19, 20]) {
      const cron = `0 ${hour} * * *`;
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
    // Running the wrong meeting is worse than running none.
    expect(resolveCronPhase("0 11 * * *", new Date("2026-08-02T11:58:00Z"))).toBe("studio");
    expect(resolveCronPhase("0 12 * * *", new Date("2026-08-02T12:05:00Z"))).toBe("afternoon");
  });

  it("keeps the two daylight-saving variants apart", () => {
    // 04:00 UTC is the morning meeting in summer and the Caught Up edition in winter.
    expect(resolveCronPhase("0 4 * * *", new Date("2026-08-02T04:00:00Z"))).toBe("morning");
    expect(resolveCronPhase("0 4 * * *", new Date("2026-01-15T04:00:00Z"))).toBe("cu-edition");
    // The inactive variant of a slot has no meeting and must stay skipped.
    expect(resolveCronPhase("0 10 * * *", new Date("2026-08-02T10:00:00Z"))).toBeNull();
    expect(resolveCronPhase("0 3 * * *", new Date("2026-01-15T03:00:00Z"))).toBeNull();
  });

  it("refuses a cron it cannot read, and a run absurdly far from any firing", () => {
    expect(resolveCronPhase("*/5 * * * *", new Date("2026-08-02T04:00:00Z"))).toBeNull();
    expect(resolveCronPhase("", new Date("2026-08-02T04:00:00Z"))).toBeNull();
    expect(resolveCronPhase("0 4 * * *", new Date("2026-08-02T11:00:00Z"))).toBeNull();
  });
});
