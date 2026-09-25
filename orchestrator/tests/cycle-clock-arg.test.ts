import { describe, expect, it } from "vitest";
import { dryRunClock } from "../src/cycle/clock-arg.js";

// quorum#576 (B9): a dry run can rehearse any morning, and a live cycle can never be told the date.

describe("--now for dry runs", () => {
  it("reads an ISO instant for a dry run and nothing when the flag is absent", () => {
    expect(dryRunClock(["--phase", "ms-daily", "--dry", "--now", "2026-09-29T05:00:00Z"])?.toISOString()).toBe("2026-09-29T05:00:00.000Z");
    expect(dryRunClock(["--phase", "ms-daily", "--dry", "--now", "2026-09-29T07:00:00+02:00"])?.toISOString()).toBe("2026-09-29T05:00:00.000Z");
    expect(dryRunClock(["--phase", "ms-daily", "--dry"])).toBeUndefined();
  });

  it("refuses it on a live cycle, and refuses anything but a zoned instant", () => {
    expect(() => dryRunClock(["--phase", "ms-daily", "--now", "2026-09-29T05:00:00Z"])).toThrow(/dry runs only/u);
    for (const value of ["2026-09-29", "2026-09-29T05:00:00", "tomorrow", ""]) {
      expect(() => dryRunClock(["--dry", "--now", value]), value).toThrow(/ISO instant/u);
    }
    expect(() => dryRunClock(["--dry", "--now"])).toThrow(/ISO instant/u);
  });
});
