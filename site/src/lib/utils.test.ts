import { describe, expect, it } from "vitest";
import { formatClock, formatDate, formatDateTime } from "./utils";

describe("shared display dates", () => {
  it("uses one readable date format for date-only values", () => {
    expect(formatDate("2026-08-01")).toBe("Aug 01, 2026");
  });

  it("shows timestamps in Prague time with a clear label", () => {
    expect(formatDateTime("2026-08-01T16:42:24.374Z")).toBe(
      "Aug 01, 2026 · 18:42 Prague time"
    );
    expect(formatClock("2026-08-01T16:42:24.374Z", true)).toBe("18:42:24");
  });

  it("returns human-readable fallbacks for invalid values", () => {
    expect(formatDate("not-a-date")).toBe("Date unavailable");
    expect(formatDateTime("not-a-date")).toBe("Date and time unavailable");
  });
});
