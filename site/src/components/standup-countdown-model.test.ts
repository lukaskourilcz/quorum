import { describe, expect, it } from "vitest";
import {
  formatPhaseLabel,
  formatStandupOccurrence,
  getNextStandup,
  getStandupCountdown
} from "./standup-countdown-model";

describe("Standup countdown schedule", () => {
  it("selects the DNESKAi day before 05:00 Prague time", () => {
    expect(getNextStandup(new Date("2026-07-30T02:59:59.000Z"))).toEqual({
      hours: "05:00 · daily",
      iso: "2026-07-30T03:00:00.000Z",
      label: "DNESKAi daily desk",
      phase: "cu-day"
    });
  });

  it("selects the morning company meeting before 06:00 Prague time", () => {
    expect(getNextStandup(new Date("2026-07-30T03:59:59.000Z"))).toEqual({
      hours: "06:00 · daily",
      iso: "2026-07-30T04:00:00.000Z",
      label: "Morning company meeting",
      phase: "morning"
    });
  });

  it("keeps the morning occurrence at its exact start time", () => {
    expect(getNextStandup(new Date("2026-07-30T04:00:00.000Z"))).toEqual({
      hours: "06:00 · daily",
      iso: "2026-07-30T04:00:00.000Z",
      label: "Morning company meeting",
      phase: "morning"
    });
  });

  /*
   * The afternoon, product and night slots used to sit between these two, and this is where their
   * absence is proved rather than assumed. After the morning meeting the next thing on the clock
   * is tomorrow's DNESKAi day: the company meets once, and the edition and product rooms sit
   * inside that day rather than on hours of their own.
   */
  it("rolls to tomorrow's DNESKAi day once the morning meeting has started", () => {
    expect(getNextStandup(new Date("2026-07-30T04:00:01.000Z"))).toEqual({
      hours: "05:00 · daily",
      iso: "2026-07-31T03:00:00.000Z",
      label: "DNESKAi daily desk",
      phase: "cu-day"
    });
  });

  it("uses the winter Prague offset", () => {
    expect(getNextStandup(new Date("2026-12-15T21:00:01.000Z"))).toEqual({
      hours: "05:00 · daily",
      iso: "2026-12-16T04:00:00.000Z",
      label: "DNESKAi daily desk",
      phase: "cu-day"
    });
  });

  it.each([
    ["spring", "2026-03-29T03:59:59.000Z", "2026-03-29T04:00:00.000Z"],
    ["autumn", "2026-10-25T04:59:59.000Z", "2026-10-25T05:00:00.000Z"]
  ])(
    "keeps the morning slot at 06:00 through the %s clock change",
    (_, now, expected) => {
      expect(getNextStandup(new Date(now))).toEqual({
        hours: "06:00 · daily",
        iso: expected,
        label: "Morning company meeting",
        phase: "morning"
      });
    }
  );

  it("splits the remaining time into stable counter units", () => {
    const occurrence = {
      hours: "06:00 · daily",
      iso: "2026-08-01T10:03:04.000Z",
      label: "Morning company meeting",
      phase: "morning"
    } as const;

    expect(
      getStandupCountdown(
        occurrence,
        new Date("2026-07-31T08:00:00.000Z")
      )
    ).toEqual({
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4,
      totalMilliseconds: 93_784_000
    });
  });

  it("formats the target in the public Prague schedule", () => {
    expect(
      formatStandupOccurrence({
        hours: "05:00 · daily",
        iso: "2026-07-30T03:00:00.000Z",
        label: "DNESKAi daily desk",
        phase: "cu-day"
      })
    ).toBe("Jul 30, 2026 · 05:00 · Prague");
  });

  it("labels the days, the shifts that were retired and the historical AM/PM records", () => {
    expect(formatPhaseLabel("cu-day")).toBe("DNESKAi daily desk");
    expect(formatPhaseLabel("mma-day")).toBe("MMA Files daily desk");
    expect(formatPhaseLabel("dm-day")).toBe("Door Money daily desk");
    expect(formatPhaseLabel("morning")).toBe("Morning company meeting");
    // Retired, and still named: their records are on file and a reader still opens them.
    expect(formatPhaseLabel("afternoon")).toBe("Afternoon company meeting");
    expect(formatPhaseLabel("night")).toBe("Night company meeting");
    expect(formatPhaseLabel("cu-edition")).toBe("DNESKAi edition production");
    expect(formatPhaseLabel("cu-product")).toBe("DNESKAi product meeting");
    expect(formatPhaseLabel("founding")).toBe("Founding");
    expect(formatPhaseLabel("am")).toBe("Morning meeting · old label");
    expect(formatPhaseLabel("pm")).toBe("Afternoon meeting · old label");
  });
});
