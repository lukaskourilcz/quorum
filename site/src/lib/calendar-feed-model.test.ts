import { describe, expect, it } from "vitest";
import { buildPublicCalendarFeed, calendarStaticWeeks, pragueSlotInstant } from "./calendar-feed-model";
import { meetingFixtures } from "../data/meeting-fixtures";
import { parsePublicMeetingRecord } from "./meeting-record-model";

describe("public CalendarFeed build model", () => {
  it("generates fifteen Prague rooms and article slots for every day", () => {
    const feed = buildPublicCalendarFeed({
      weekOf: "2026-07-31",
      now: new Date("2026-07-31T10:00:00Z"),
      standups: [],
      meetings: []
    });
    expect(feed.weekOf).toBe("2026-07-27");
    expect(feed.slots).toHaveLength(105);
    expect(feed.slots.slice(0, 15).map((slot) => slot.kind)).toEqual([
      "cu-edition",
      "venture-morning",
      "incubator-scan",
      "mma-intake",
      "mag-editorial",
      "article-am",
      "tt-marketing",
      "studio",
      "venture-afternoon",
      "cu-product",
      "article-pm",
      "mma-analysis",
      "mag-desk",
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

  it("shows a paused agenda window as not needed", () => {
    const parsed = parsePublicMeetingRecord(meetingFixtures[1]);
    expect(parsed).not.toBeNull();
    const meeting = { ...parsed!, status: "PAUSED" as const };
    const feed = buildPublicCalendarFeed({
      weekOf: meeting.date,
      now: new Date(`${meeting.date}T20:00:00Z`),
      standups: [],
      meetings: [meeting]
    });
    expect(feed.slots.find((slot) => slot.kind === meeting.kind && slot.meetingHref)?.status)
      .toBe("not-needed");
  });
});

describe("a skipped slot says why", () => {
  const base = { weekOf: "2026-08-03", now: new Date("2026-08-04T23:00:00Z"), standups: [], meetings: [] };

  it("reads skipped rather than missed, and carries the reason", () => {
    // Eleven slots on 2 August showed as "Did not happen" with the reason living only in a
    // GitHub Actions log that expires.
    const feed = buildPublicCalendarFeed({
      ...base,
      skips: [{ date: "2026-08-04", phase: "tt-marketing", reason: "Portfolio meeting crons await explicit owner approval." }]
    });
    const slot = feed.slots.find((entry) => entry.at.startsWith("2026-08-04") && entry.kind === "tt-marketing");
    expect(slot?.status).toBe("skipped");
    expect(slot?.decisionOneLiner).toBe("Portfolio meeting crons await explicit owner approval.");
  });

  it("maps a company shift onto its calendar kind", () => {
    const feed = buildPublicCalendarFeed({
      ...base,
      skips: [{ date: "2026-08-04", phase: "morning", reason: "The countersign-aware budget shape disabled this phase." }]
    });
    expect(feed.slots.find((entry) => entry.at.startsWith("2026-08-04") && entry.kind === "venture-morning")?.status).toBe("skipped");
  });

  it("leaves a slot nobody skipped exactly as it was", () => {
    const feed = buildPublicCalendarFeed({ ...base, skips: [] });
    const slot = feed.slots.find((entry) => entry.at.startsWith("2026-08-04") && entry.kind === "tt-marketing");
    expect(slot?.status).toBe("missed");
    expect(slot?.decisionOneLiner).toBeUndefined();
  });
});
