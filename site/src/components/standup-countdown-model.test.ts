import { describe, expect, it } from "vitest";
import {
  formatStandupOccurrence,
  getNextStandup,
  getStandupCountdown
} from "./standup-countdown-model";

describe("Standup countdown schedule", () => {
  it("selects the morning Prague council before 07:30", () => {
    expect(getNextStandup(new Date("2026-07-30T05:00:00.000Z"))).toEqual({
      iso: "2026-07-30T05:30:00.000Z",
      label: "AM council",
      phase: "am"
    });
  });

  it("selects the evening Prague council after the morning slot", () => {
    expect(getNextStandup(new Date("2026-07-30T12:00:00.000Z"))).toEqual({
      iso: "2026-07-30T17:30:00.000Z",
      label: "PM council",
      phase: "pm"
    });
  });

  it("moves to tomorrow morning after the evening slot", () => {
    expect(getNextStandup(new Date("2026-07-30T18:00:00.000Z"))).toEqual({
      iso: "2026-07-31T05:30:00.000Z",
      label: "AM council",
      phase: "am"
    });
  });

  it("uses the winter Prague offset", () => {
    expect(getNextStandup(new Date("2026-12-15T18:31:00.000Z"))).toEqual({
      iso: "2026-12-16T06:30:00.000Z",
      label: "AM council",
      phase: "am"
    });
  });

  it.each([
    ["spring", "2026-03-29T05:00:00.000Z", "2026-03-29T05:30:00.000Z"],
    ["autumn", "2026-10-25T05:00:00.000Z", "2026-10-25T06:30:00.000Z"]
  ])(
    "keeps the morning slot at 07:30 through the %s clock change",
    (_, now, expected) => {
      expect(getNextStandup(new Date(now))).toEqual({
        iso: expected,
        label: "AM council",
        phase: "am"
      });
    }
  );

  it("keeps the current occurrence at its exact start time", () => {
    expect(getNextStandup(new Date("2026-07-30T17:30:00.000Z"))).toEqual({
      iso: "2026-07-30T17:30:00.000Z",
      label: "PM council",
      phase: "pm"
    });
  });

  it("splits the remaining time into stable counter units", () => {
    const occurrence = {
      iso: "2026-08-01T10:03:04.000Z",
      label: "AM council",
      phase: "am"
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
        iso: "2026-07-30T17:30:00.000Z",
        label: "PM council",
        phase: "pm"
      })
    ).toBe("Jul 30, 2026 · 19:30 · Prague");
  });
});
