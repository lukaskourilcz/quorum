import { describe, expect, it } from "vitest";
import {
  formatPhaseLabel,
  formatStandupOccurrence,
  getNextStandup,
  getStandupCountdown
} from "./standup-countdown-model";

describe("Standup countdown schedule", () => {
  it("selects the edition room before 05:00 Prague time", () => {
    expect(getNextStandup(new Date("2026-07-30T02:59:59.000Z"))).toEqual({
      hours: "05:00 · daily",
      iso: "2026-07-30T03:00:00.000Z",
      label: "DNESKAi edition meeting",
      phase: "cu-edition"
    });
  });

  it("selects the morning shift before 06:00 Prague time", () => {
    expect(getNextStandup(new Date("2026-07-30T03:59:59.000Z"))).toEqual({
      hours: "06:00–14:00",
      iso: "2026-07-30T04:00:00.000Z",
      label: "Morning company meeting",
      phase: "morning"
    });
  });

  it("keeps the morning occurrence at its exact start time", () => {
    expect(getNextStandup(new Date("2026-07-30T04:00:00.000Z"))).toEqual({
      hours: "06:00–14:00",
      iso: "2026-07-30T04:00:00.000Z",
      label: "Morning company meeting",
      phase: "morning"
    });
  });

  it("selects the afternoon shift after the morning slot", () => {
    expect(getNextStandup(new Date("2026-07-30T04:00:01.000Z"))).toEqual({
      hours: "14:00–22:00",
      iso: "2026-07-30T12:00:00.000Z",
      label: "Afternoon company meeting",
      phase: "afternoon"
    });
  });

  it("selects the product room after the afternoon slot", () => {
    expect(getNextStandup(new Date("2026-07-30T12:00:01.000Z"))).toEqual({
      hours: "17:00 · daily",
      iso: "2026-07-30T15:00:00.000Z",
      label: "DNESKAi product meeting",
      phase: "cu-product"
    });
  });

  it("selects the night shift after the product room", () => {
    expect(getNextStandup(new Date("2026-07-30T15:00:01.000Z"))).toEqual({
      hours: "22:00–06:00",
      iso: "2026-07-30T20:00:00.000Z",
      label: "Night company meeting",
      phase: "night"
    });
  });

  it("moves to tomorrow's edition room after the night shift starts", () => {
    expect(getNextStandup(new Date("2026-07-30T20:00:01.000Z"))).toEqual({
      hours: "05:00 · daily",
      iso: "2026-07-31T03:00:00.000Z",
      label: "DNESKAi edition meeting",
      phase: "cu-edition"
    });
  });

  it("uses the winter Prague offset", () => {
    expect(getNextStandup(new Date("2026-12-15T21:00:01.000Z"))).toEqual({
      hours: "05:00 · daily",
      iso: "2026-12-16T04:00:00.000Z",
      label: "DNESKAi edition meeting",
      phase: "cu-edition"
    });
  });

  it.each([
    ["spring", "2026-03-29T03:59:59.000Z", "2026-03-29T04:00:00.000Z"],
    ["autumn", "2026-10-25T04:59:59.000Z", "2026-10-25T05:00:00.000Z"]
  ])(
    "keeps the morning slot at 06:00 through the %s clock change",
    (_, now, expected) => {
      expect(getNextStandup(new Date(now))).toEqual({
        hours: "06:00–14:00",
        iso: expected,
        label: "Morning company meeting",
        phase: "morning"
      });
    }
  );

  it("keeps the night occurrence at its exact start time", () => {
    expect(getNextStandup(new Date("2026-07-30T20:00:00.000Z"))).toEqual({
      hours: "22:00–06:00",
      iso: "2026-07-30T20:00:00.000Z",
      label: "Night company meeting",
      phase: "night"
    });
  });

  it("splits the remaining time into stable counter units", () => {
    const occurrence = {
      hours: "06:00–14:00",
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
        hours: "14:00–22:00",
        iso: "2026-07-30T12:00:00.000Z",
        label: "Afternoon company meeting",
        phase: "afternoon"
      })
    ).toBe("Jul 30, 2026 · 14:00 · Prague");
  });

  it("labels current shifts and makes historical AM/PM records explicit", () => {
    expect(formatPhaseLabel("morning")).toBe("Morning company meeting");
    expect(formatPhaseLabel("afternoon")).toBe("Afternoon company meeting");
    expect(formatPhaseLabel("night")).toBe("Night company meeting");
    expect(formatPhaseLabel("cu-edition")).toBe("DNESKAi edition production");
    expect(formatPhaseLabel("cu-product")).toBe("DNESKAi product meeting");
    expect(formatPhaseLabel("founding")).toBe("Founding");
    expect(formatPhaseLabel("am")).toBe("Morning meeting · old label");
    expect(formatPhaseLabel("pm")).toBe("Afternoon meeting · old label");
  });
});
