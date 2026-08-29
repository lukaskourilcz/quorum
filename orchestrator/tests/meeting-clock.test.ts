import { describe, expect, it } from "vitest";
import { MEETING_CLOCK, resolveCronPhase } from "../src/meetings/clock.js";
import {
  CRON_HOUR_CARRY,
  CRON_MINUTE,
  readVentureRegistry,
  scheduledCronExpressions
} from "../src/ventures/registry.js";

/**
 * The instant a cron fires, plus however many minutes GitHub delivered it late.
 *
 * Built from the expression's own minute rather than from the top of the hour. The crons fire at
 * CRON_MINUTE of the hour before the one they serve, so an instant pinned to :00 is not late at
 * all — it is most of an hour EARLY, and the resolver would rightly refuse it. Every delivery
 * instant in this file goes through here so that cannot be got wrong one assertion at a time.
 */
function delivered(cron: string, [year, month, day]: [number, number, number], lateMinutes = 0): Date {
  const [minute, hour] = cron.split(" ").map(Number);
  return new Date(Date.UTC(year, month, day, hour!, minute! + lateMinutes));
}

/** The crons that carry a meeting in summer, read from the generator rather than pinned. */
function summerCrons(): string[] {
  return scheduledCronExpressions(readVentureRegistry()).filter(
    (cron) => resolveCronPhase(cron, delivered(cron, [2026, 7, 3])) !== null
  );
}

/** The firings that belong to the winter variant and therefore carry no summer meeting. */
function winterOnlyCrons(): string[] {
  return scheduledCronExpressions(readVentureRegistry()).filter(
    (cron) => resolveCronPhase(cron, delivered(cron, [2026, 7, 3])) === null
  );
}


describe("a queued cron still runs the meeting it was scheduled for", () => {
  // The delays GitHub actually applied to the 2 August crons, in minutes past the hour.
  const LATE_BY = [54, 29, 25, 28, 13, 50, 38, 14, 58, 42, 23, 1, 7, 57, 3];

  it("resolves every meeting from its own cron, however late the run starts", () => {
    // On 2 August seven of fourteen meetings resolved to "skip" because the wall-clock
    // reading allows twenty minutes of grace and GitHub queued the crons up to 54 late.
    for (const cron of summerCrons()) {
      const onTime = resolveCronPhase(cron, delivered(cron, [2026, 7, 2]));
      expect(onTime, `${cron} on time`).not.toBeNull();
      for (const late of LATE_BY) {
        expect(
          resolveCronPhase(cron, delivered(cron, [2026, 7, 2], late)),
          `${cron} ${late} minutes late`
        ).toBe(onTime);
      }
    }
  });

  it("names the hour a cron belongs to, not the hour it fires in", () => {
    // Every cron fires at CRON_MINUTE of the hour BEFORE the one it serves, so the hour field is
    // one behind the meeting. Reading that field literally hands every firing the previous slot,
    // and would do it without a single red test: cronPayloads writes the cron from the same
    // registry this resolver reads back, so a missing carry moves both sides together and every
    // round-trip assertion still agrees with itself. Only an independent answer catches it, so
    // this pins that the literal hour resolves to something ELSE and that the resolver does not
    // return that something.
    expect(CRON_HOUR_CARRY, "the crons no longer fire in the hour they serve").toBe(1);
    for (const cron of summerCrons()) {
      const fireHour = Number(cron.split(" ")[1]);
      const literal = resolveCronPhase(`0 ${fireHour} * * *`, new Date(Date.UTC(2026, 7, 3, fireHour)));
      const actual = resolveCronPhase(cron, delivered(cron, [2026, 7, 3]));
      expect(actual, `${cron} names a meeting`).not.toBeNull();
      expect(actual, `${cron} answered the hour it fires in`).not.toBe(literal);
    }
  });

  it("never answers a neighbouring meeting when a run is very late", () => {
    // The wall clock read a run that started at 11:58 UTC as the 14:00 Prague company
    // meeting, when the only cron that could have triggered it fired an hour earlier for a
    // different one. Running the wrong meeting is worse than running none. The MMA Files day sits
    // at 08:00 Prague and the Design Lab studio at 11:00, and each keeps its own firing however
    // late it is delivered.
    expect(resolveCronPhase("55 4 * * *", delivered("55 4 * * *", [2026, 7, 2], 118))).toBe("mma-day");
    expect(resolveCronPhase("55 7 * * *", delivered("55 7 * * *", [2026, 7, 2], 65))).toBe("tt-marketing");
  });

  it("keeps the two daylight-saving variants apart", () => {
    // The 03:00 UTC hour carries the 06:00 Prague morning board in summer and the 05:00 Caught Up
    // edition in winter — one firing, two meetings, told apart by the date alone.
    //
    // Both forms of that firing are asserted. The minute-0 pair is what actually fired on these
    // dates, before the schedule moved; it also exercises the branch where a cron fires inside the
    // hour it serves, which nothing this repository deploys does any more. The CRON_MINUTE pair is
    // the same firing as the schedule writes it today: one hour earlier in the expression, at :55,
    // carried back onto the same 03:00 hour. Same answer from both is the point.
    expect(resolveCronPhase("0 3 * * *", new Date("2026-08-02T03:00:00Z"))).toBe("morning");
    expect(resolveCronPhase("0 3 * * *", new Date("2026-01-15T03:00:00Z"))).toBe("cu-day");
    const asDeployed = `${CRON_MINUTE} ${3 - CRON_HOUR_CARRY} * * *`;
    expect(resolveCronPhase(asDeployed, delivered(asDeployed, [2026, 7, 2]))).toBe("morning");
    expect(resolveCronPhase(asDeployed, delivered(asDeployed, [2026, 0, 15]))).toBe("cu-day");
    // The inactive variant of a slot has no meeting and must stay skipped.
    for (const cron of winterOnlyCrons()) {
      expect(
        resolveCronPhase(cron, delivered(cron, [2026, 7, 2])),
        `${cron} in summer`
      ).toBeNull();
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
  it("covers every Prague slot and only those, from the summer crons", () => {
    const summer = summerCrons().map((cron) => resolveCronPhase(cron, delivered(cron, [2026, 7, 3], 40)));
    expect(summer.filter(Boolean)).toHaveLength(MEETING_CLOCK.length);
    expect(new Set(summer).size).toBe(MEETING_CLOCK.length);
  });

  it("answers nothing for a firing that belongs to the other daylight-saving variant", () => {
    // Three of the eighteen firings serve winter only. In summer they must resolve to no meeting
    // — and a caller must not then reach for the wall clock, which would hand back a neighbouring
    // slot: the failure this whole change exists to remove.
    for (const cron of winterOnlyCrons()) {
      expect(resolveCronPhase(cron, delivered(cron, [2026, 7, 3], 40)), cron).toBeNull();
    }
  });
});
