import { describe, expect, it } from "vitest";
import { buildPublicCalendarFeed, calendarStaticWeeks, pragueSlotInstant } from "./calendar-feed-model";

describe("public CalendarFeed build model", () => {
  it("generates ten Prague slots for every day", () => {
    const feed = buildPublicCalendarFeed({
      weekOf: "2026-07-31",
      now: new Date("2026-07-31T10:00:00Z"),
      standups: [],
      meetings: []
    });
    expect(feed.weekOf).toBe("2026-07-27");
    expect(feed.slots).toHaveLength(70);
    expect(feed.slots.slice(0, 10).map((slot) => slot.kind)).toEqual([
      "cu-edition",
      "venture-morning",
      "incubator-scan",
      "mma-intake",
      "tt-marketing",
      "venture-afternoon",
      "cu-product",
      "mma-analysis",
      "incubator-synthesis",
      "venture-night"
    ]);
  });

  it("keeps Prague wall times stable across seasonal offsets", () => {
    expect(pragueSlotInstant("2026-07-31", 5).toISOString()).toBe("2026-07-31T03:00:00.000Z");
    expect(pragueSlotInstant("2026-12-31", 5).toISOString()).toBe("2026-12-31T04:00:00.000Z");
  });

  it("exposes bounded static weeks including the coming week", () => {
    const weeks = calendarStaticWeeks(new Date("2026-07-31T10:00:00Z"), 2);
    expect(weeks).toEqual(["2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03"]);
  });
});
