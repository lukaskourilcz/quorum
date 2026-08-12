import { describe, expect, it } from "vitest";
import {
  LATE_SLOT_REASON,
  MISSED_SLOT_REASON,
  ONGOING_CEILING_MINUTES,
  SLOT_DELIVERY_GRACE_MINUTES,
  buildPublicCalendarFeed,
  calendarStaticWeeks,
  pragueSlotInstant
} from "./calendar-feed-model";
import { meetingFixtures } from "../data/meeting-fixtures";
import { parsePublicMeetingRecord } from "./meeting-record-model";

describe("public CalendarFeed build model", () => {
  it("generates fourteen Prague rooms and article slots for every day", () => {
    const feed = buildPublicCalendarFeed({
      weekOf: "2026-07-31",
      now: new Date("2026-07-31T10:00:00Z"),
      standups: [],
      meetings: []
    });
    expect(feed.weekOf).toBe("2026-07-27");
    expect(feed.slots).toHaveLength(98);
    // The default definitions mirror the live clock. The incubator, the studio room and the
    // evening article slot left it; `CalendarKind` still carries their kinds, because the
    // committed records those rooms wrote still have to render.
    expect(feed.slots.slice(0, 14).map((slot) => slot.kind)).toEqual([
      "cu-edition",
      "venture-morning",
      "ms-daily",
      "mma-intake",
      "mag-editorial",
      "article-am",
      "tt-marketing",
      "gv-brief",
      "venture-afternoon",
      "cu-product",
      "mma-analysis",
      "mag-desk",
      "kv-desk",
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

  it("shows a paused agenda window as not needed, with its reason and no page to open", () => {
    const parsed = parsePublicMeetingRecord(meetingFixtures[1]);
    expect(parsed).not.toBeNull();
    const meeting = {
      ...parsed!,
      status: "PAUSED" as const,
      decision: { ...parsed!.decision, summary: "No agenda was due for this room today." }
    };
    const feed = buildPublicCalendarFeed({
      weekOf: meeting.date,
      now: new Date(`${meeting.date}T20:00:00Z`),
      standups: [],
      meetings: [meeting]
    });
    const slot = feed.slots.find(
      (entry) => entry.kind === meeting.kind && entry.at.startsWith(meeting.date)
    );
    expect(slot?.status).toBe("not-needed");
    // The room never convened, so there is nothing to open: the cell is the whole answer.
    expect(slot?.meetingHref).toBeUndefined();
    expect(slot?.decisionOneLiner).toBe("No agenda was due for this room today.");
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

  it("says the run never arrived for a slot nobody skipped", () => {
    const feed = buildPublicCalendarFeed({ ...base, skips: [] });
    const slot = feed.slots.find((entry) => entry.at.startsWith("2026-08-04") && entry.kind === "tt-marketing");
    expect(slot?.status).toBe("missed");
    // "Did not happen" on its own reads as a decision. Nobody decided this; nothing arrived.
    expect(slot?.decisionOneLiner).toBe(MISSED_SLOT_REASON);
    expect(slot?.meetingHref).toBeUndefined();
  });
});

describe("a slot whose run is still going says so", () => {
  // 11:00 Prague on 4 August is 09:00Z. Every `now` below is an offset from that instant.
  const slotAt = pragueSlotInstant("2026-08-04", 11);
  const minutesAfterSlot = (minutes: number) => new Date(slotAt.getTime() + minutes * 60_000);
  const base = { weekOf: "2026-08-03", standups: [], meetings: [] };
  const ttSlot = (feed: ReturnType<typeof buildPublicCalendarFeed>) =>
    feed.slots.find((entry) => entry.at === slotAt.toISOString() && entry.kind === "tt-marketing");

  it("reads ongoing rather than missed once its hour has passed", () => {
    // Before this, a run in flight was indistinguishable from one that never started: both were
    // simply past their start time with no record, so both printed "Did not happen".
    expect(ttSlot(buildPublicCalendarFeed({ ...base, now: minutesAfterSlot(5) }))?.status)
      .toBe("ongoing");
  });

  it("still reads scheduled before its hour arrives", () => {
    expect(ttSlot(buildPublicCalendarFeed({ ...base, now: minutesAfterSlot(-1) }))?.status)
      .toBe("scheduled");
  });

  it("walks scheduled, ongoing, late, missed and never skips a rung", () => {
    // The ceiling ends "ongoing", not the slot's life: a run can still be delivered and still
    // name the slot for SLOT_DELIVERY_GRACE_MINUTES, so only past that is anything lost.
    const statusAt = (minutes: number) =>
      ttSlot(buildPublicCalendarFeed({ ...base, now: minutesAfterSlot(minutes) }))?.status;
    expect(statusAt(-1)).toBe("scheduled");
    expect(statusAt(ONGOING_CEILING_MINUTES)).toBe("ongoing");
    expect(statusAt(ONGOING_CEILING_MINUTES + 1)).toBe("late");
    expect(statusAt(SLOT_DELIVERY_GRACE_MINUTES)).toBe("late");
    expect(statusAt(SLOT_DELIVERY_GRACE_MINUTES + 1)).toBe("missed");
  });

  it("tells the reader a late slot is waiting rather than leaving the cell blank", () => {
    // A missed cell says nothing on purpose — nobody knows why. A late one does know: the run has
    // not arrived. Without the sentence the cell reads as an unexplained gap, which is the state
    // every other recorder in this chain exists to remove.
    const slot = ttSlot(buildPublicCalendarFeed({ ...base, now: minutesAfterSlot(90) }));
    expect(slot?.status).toBe("late");
    expect(slot?.decisionOneLiner).toBe(LATE_SLOT_REASON);
    // The one word the cell must never carry while a run can still land.
    expect(ttSlot(buildPublicCalendarFeed({ ...base, now: minutesAfterSlot(90) }))?.status).not.toBe("missed");
  });

  it("lets the ceiling be widened without moving the rung below it", () => {
    const wide = { ...base, now: minutesAfterSlot(30), ongoingCeilingMinutes: 45 };
    expect(ttSlot(buildPublicCalendarFeed(wide))?.status).toBe("ongoing");
    expect(ttSlot(buildPublicCalendarFeed({ ...wide, now: minutesAfterSlot(46) }))?.status).toBe("late");
    expect(ttSlot(buildPublicCalendarFeed({ ...wide, now: minutesAfterSlot(SLOT_DELIVERY_GRACE_MINUTES + 1) }))?.status)
      .toBe("missed");
  });
});

describe("the record, not the clock, ends the ongoing state", () => {
  // The run commits its own record and that push redeploys the site, so the arrival of a record is
  // the finish signal. These two assert the ordering that makes it one: a slot only three minutes
  // into a fifteen-minute ceiling must still abandon "ongoing" the moment something is on file.
  const slotAt = pragueSlotInstant("2026-08-04", 11);
  const threeMinutesIn = new Date(slotAt.getTime() + 3 * 60_000);
  const base = { weekOf: "2026-08-03", now: threeMinutesIn, standups: [], meetings: [] };
  const ttSlot = (feed: ReturnType<typeof buildPublicCalendarFeed>) =>
    feed.slots.find((entry) => entry.at === slotAt.toISOString() && entry.kind === "tt-marketing");

  it("a committed record wins over the unspent ceiling", () => {
    const parsed = parsePublicMeetingRecord(meetingFixtures[1]);
    expect(parsed).not.toBeNull();
    const meeting = { ...parsed!, date: "2026-08-04", kind: "tt-marketing" as const };
    expect(ttSlot(buildPublicCalendarFeed({ ...base, meetings: [meeting] }))?.status).toBe("held");
  });

  it("a committed skip wins over the unspent ceiling", () => {
    const feed = buildPublicCalendarFeed({
      ...base,
      skips: [{ date: "2026-08-04", phase: "tt-marketing", reason: "The gate turned this slot off." }]
    });
    expect(ttSlot(feed)?.status).toBe("skipped");
    // The cell, its tooltip and its accessible name all read this string, and it used to be the
    // one public rendering of a summary that never met the plain-language pass: "gate" is now
    // "check", the same word every other surface uses.
    expect(ttSlot(feed)?.decisionOneLiner).toBe("The check turned this slot off.");
  });
});

describe("the site calendar reports the article slots", () => {
  const base = { weekOf: "2026-08-03", now: new Date("2026-08-04T23:00:00Z"), standups: [], meetings: [] };
  const slotOn = (feed: ReturnType<typeof buildPublicCalendarFeed>, kind: string) =>
    feed.slots.find((entry) => entry.at.startsWith("2026-08-04") && entry.kind === kind);

  it("marks a published slot held rather than missed", () => {
    // The orchestrator learned this first, but the site builds its own feed and never got it,
    // so both slots read "Did not happen" on the day one of them published.
    const feed = buildPublicCalendarFeed({ ...base, articleSlots: [{ date: "2026-08-04", slot: "am", status: "published" }] });
    expect(slotOn(feed, "article-am")?.status).toBe("held");
  });

  it("marks a killed slot skipped and carries its reason", () => {
    const feed = buildPublicCalendarFeed({
      ...base,
      articleSlots: [{ date: "2026-08-04", slot: "am", status: "killed", reason: "Missing fresh, source-backed subject." }]
    });
    expect(slotOn(feed, "article-am")?.status).toBe("skipped");
    expect(slotOn(feed, "article-am")?.decisionOneLiner).toBe("Missing fresh, source-backed subject.");
  });

  it("leaves a slot with no run exactly as it was", () => {
    expect(slotOn(buildPublicCalendarFeed({ ...base, articleSlots: [] }), "article-am")?.status).toBe("missed");
  });
});
