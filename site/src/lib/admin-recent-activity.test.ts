import { describe, expect, it } from "vitest";
import { buildAdminRecentActivity } from "./admin-recent-activity";

describe("admin recent venture activity", () => {
  it("counts recorded events from yesterday's Prague day and rejects future or invalid dates", () => {
    const [row] = buildAdminRecentActivity([{
      ventureId: "door-money",
      ventureName: "Door Money",
      href: "/admin?venture=door-money",
      events: [
        { at: "2026-08-12T00:05:00+02:00", singular: "recommendation update", plural: "recommendation updates" },
        { at: "2026-08-13T09:00:00+02:00", singular: "recommendation update", plural: "recommendation updates" },
        { at: "2026-08-13T10:00:00+02:00", singular: "owner result", plural: "owner results" },
        { at: "2026-08-11T23:59:00+02:00", singular: "old record", plural: "old records" },
        { at: "2026-08-14T10:00:00+02:00", singular: "future record", plural: "future records" },
        { at: "not-a-date", singular: "broken record", plural: "broken records" }
      ]
    }], new Date("2026-08-13T10:00:00.000Z"));

    expect(row).toMatchObject({
      count: 3,
      summary: "2 recommendation updates and 1 owner result since yesterday.",
      latestAt: "2026-08-13T10:00:00+02:00",
      latestLabel: "owner result"
    });
  });

  it("keeps an honest empty answer and still reports the latest older record", () => {
    const [row] = buildAdminRecentActivity([{
      ventureId: "kvorum",
      ventureName: "Kvórum",
      href: "/admin?venture=kvorum",
      events: [{ at: "2026-08-10T20:00:00.000Z", singular: "desk record", plural: "desk records" }]
    }], new Date("2026-08-13T10:00:00.000Z"));

    expect(row).toMatchObject({
      count: 0,
      summary: "No recorded activity since yesterday.",
      latestAt: "2026-08-10T20:00:00.000Z",
      latestLabel: "desk record"
    });
  });

  it("uses calendar-day arithmetic across Prague's daylight-saving boundary", () => {
    const [row] = buildAdminRecentActivity([{
      ventureId: "booksofhistory",
      ventureName: "BOOKSOFHISTORY",
      href: "/admin?venture=booksofhistory",
      events: [{ at: "2026-03-29T00:10:00+01:00", singular: "feature", plural: "features" }]
    }], new Date("2026-03-30T00:30:00.000Z"));

    expect(row?.count).toBe(1);
  });
});
