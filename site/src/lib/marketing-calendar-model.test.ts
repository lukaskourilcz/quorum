import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMarketingCalendar, pillarName, repoIssueHref, type CalendarDocument } from "./marketing-calendar-model";
import {
  bodyBeats,
  calendarAggregates,
  calendarPhase,
  defaultCalendarWeek,
  EMPTY_CALENDAR_FILTERS,
  filterCalendarEntries,
  filterCounts,
  formatDateRange,
  formatEffort,
  nextUp,
  periodDays,
  periodWeeks,
  type CalendarEntryView
} from "./marketing-calendar-view";

const repo = path.resolve(process.cwd(), "..");
const read = (relative: string): unknown => JSON.parse(readFileSync(path.join(repo, relative), "utf8"));

function document(relative: string): CalendarDocument {
  const result = parseMarketingCalendar(read(relative));
  if (!result.ok) throw new Error(result.reason);
  return result.document;
}

function views(doc: CalendarDocument): CalendarEntryView[] {
  return doc.entries.map((entry) => ({ ...entry, effectiveStatus: entry.status, statusSource: "owner", queue: null, packageExists: null, synthetic: false }));
}

describe("the committed seed plans", () => {
  it.each(["state/marketing-calendar/marketingshark.json", "state/marketing-calendar/caught-up.json"])("%s parses with nothing dropped and covers every day", (relative) => {
    const doc = document(relative);
    expect(doc.dropped).toEqual([]);
    expect(doc.entries.length).toBeGreaterThan(100);
    const aggregates = calendarAggregates(doc, views(doc));
    expect(aggregates.periodDays).toBe(30);
    expect(aggregates.daysWithoutEntry).toEqual([]);
    expect(doc.entries.every((entry) => entry.date >= doc.period.start && entry.date <= doc.period.end)).toBe(true);
  });

  it("reads the November addendum: launch, period, pre-launch and producer", () => {
    const doc = document("state/marketing-calendar/marketingshark.json");
    expect(doc.launch).toBe(doc.period.start);
    expect(doc.periodDerived).toBe(false);
    expect(doc.prelaunch.length).toBeGreaterThan(0);
    expect(new Set(doc.entries.map((entry) => entry.producer))).toEqual(new Set(["owner", "marketingShark"]));
  });

  it("derives what an October document leaves out", () => {
    const raw = read("state/marketing-calendar/caught-up.json") as Record<string, unknown>;
    const october = Object.fromEntries(Object.entries(raw).filter(([key]) => !["launch", "period", "prelaunch"].includes(key)));
    const result = parseMarketingCalendar(october);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.periodDerived).toBe(true);
    expect(result.document.launch).toBe(result.document.entries[0]!.date);
    expect(result.document.period.end).toBe(result.document.entries.at(-1)!.date);
    expect(result.document.prelaunch).toEqual([]);
  });

  it("maps the October `work` field onto the venture's producer", () => {
    const parsed = parseMarketingCalendar({
      name: "DNESKAi", project: "dneskai",
      entries: [
        { id: "dn-001", date: "2026-10-01", time: "09:30", platform: "threads", kind: "thread", title: "Edice", work: "auto-draft" },
        { id: "dn-002", date: "2026-10-01", time: "20:30", platform: "threads", kind: "thread", title: "Otázka", work: "owner" }
      ]
    });
    expect(parsed.ok && parsed.document.entries.map((entry) => entry.producer)).toEqual(["dneskai-pack", "owner"]);
  });
});

describe("parse-or-drop", () => {
  const fixture = () => structuredClone(read("contracts/fixtures/marketing-calendar.valid.json")) as { entries: Record<string, unknown>[]; ads: Record<string, unknown>[] };

  it("reports every malformed entry with its reason and keeps the rest", () => {
    const raw = fixture();
    raw.entries.push(
      { ...raw.entries[0], id: "ds-003", time: "9:00" },
      { ...raw.entries[0], id: "ds-004", platform: "tiktok" },
      { ...raw.entries[0], id: "ds-005", title: "x".repeat(61) },
      { ...raw.entries[0] },
      { ...raw.entries[0], id: "ds-006", status: "sent" }
    );
    const result = parseMarketingCalendar(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.entries.map((entry) => entry.id)).toEqual(["ds-001", "ds-002"]);
    expect(result.document.dropped.map(({ id, reason }) => [id, reason])).toEqual([
      ["ds-003", "time is not HH:mm"],
      ["ds-004", "unknown platform \"tiktok\""],
      ["ds-005", "title is longer than 60 characters"],
      ["ds-001", "duplicate id"],
      ["ds-006", "unknown status \"sent\""]
    ]);
  });

  it("refuses a document with no name, a foreign schema or no readable entry", () => {
    expect(parseMarketingCalendar(null).ok).toBe(false);
    expect(parseMarketingCalendar({ ...fixture(), name: "" }).ok).toBe(false);
    expect(parseMarketingCalendar({ ...fixture(), schemaVersion: "marketing-calendar/2" }).ok).toBe(false);
    expect(parseMarketingCalendar({ ...fixture(), entries: [{ id: "x" }] }).ok).toBe(false);
  });

  it("prices an ad over its inclusive date range and links the boosted entry", () => {
    const result = parseMarketingCalendar(fixture());
    expect(result.ok && result.document.ads[0]).toMatchObject({ days: 2, totalEur: 10, creativeEntryId: "ds-002" });
  });

  it("links dependencies and names the setup pillar", () => {
    expect(repoIssueHref("aifirst", null)).toBe("https://github.com/lukaskourilcz/aifirst");
    expect(repoIssueHref("lukaskourilcz/react-express-app", "#239")).toBe("https://github.com/lukaskourilcz/react-express-app/issues/239");
    expect(pillarName({ pillars: [] }, "p0")).toBe("Setup & operations");
    expect(pillarName({ pillars: [] }, null)).toBe("No pillar");
  });
});

describe("derived views", () => {
  const doc = document("state/marketing-calendar/marketingshark.json");
  const entries = views(doc);

  it("lays the period out in Monday weeks numbered like the plan", () => {
    const weeks = periodWeeks(doc.period);
    expect(weeks[0]!.days).toContain(doc.period.start);
    expect(weeks.at(-1)!.days).toContain(doc.period.end);
    expect(weeks.map((week) => week.planWeek)).toEqual(weeks.map((_, index) => index + 1));
    expect(weeks.length).toBe(doc.weeks.length);
    expect(periodDays(doc.period)).toHaveLength(30);
  });

  it("opens on this week while the plan runs and on the launch week otherwise", () => {
    // The plan runs Sun 4 Oct – Mon 2 Nov 2026, so the launch week is the week of Mon 28 Sep.
    expect(defaultCalendarWeek("2026-09-20", doc)).toBe("2026-09-28");
    expect(defaultCalendarWeek("2026-10-21", doc)).toBe("2026-10-19");
    expect(defaultCalendarWeek("2027-01-10", doc)).toBe("2026-11-02");
    expect(defaultCalendarWeek("2026-09-20", doc, "2026-10-14")).toBe("2026-10-12");
    expect(defaultCalendarWeek("2026-09-20", doc, "not-a-date")).toBe("2026-09-28");
  });

  it("counts down to launch, then counts days", () => {
    expect(calendarPhase("2026-09-28", doc)).toEqual({ phase: "before", daysToLaunch: 6 });
    expect(calendarPhase("2026-10-04", doc)).toEqual({ phase: "running", day: 1, of: 30 });
    expect(calendarPhase("2026-11-04", doc)).toEqual({ phase: "after", daysSinceEnd: 2 });
  });

  it("sums effort and counts posts, ads and progress", () => {
    const aggregates = calendarAggregates(doc, entries);
    const effort = doc.entries.reduce((sum, entry) => sum + (entry.effortMin ?? 0), 0);
    expect(aggregates.effortTotal).toBe(effort);
    expect(Object.values(aggregates.effortByWeek).reduce((sum, value) => sum + value, 0)).toBe(effort);
    expect(aggregates.posts).toBe(doc.entries.filter((entry) => entry.kind !== "task" && entry.kind !== "review").length);
    expect(aggregates.donePercent).toBe(0);
    expect(aggregates.ads.totalEur).toBe(doc.ads.reduce((sum, ad) => sum + ad.dailyBudgetEur * ad.days, 0));
    const published = entries.map((entry, index) => index < 10 && entry.kind !== "task" && entry.kind !== "review" ? { ...entry, effectiveStatus: "published" as const } : entry);
    expect(calendarAggregates(doc, published).published).toBe(published.filter((entry) => entry.effectiveStatus === "published").length);
  });

  it("keeps null effort out of the sums instead of counting it as zero", () => {
    const withUnknown = entries.map((entry, index) => index === 0 ? { ...entry, effortMin: null } : entry);
    expect(calendarAggregates(doc, withUnknown).effortUnknown).toBe(1);
  });

  it("filters, counts per option and finds the next entry", () => {
    const threads = filterCalendarEntries(entries, { ...EMPTY_CALENDAR_FILTERS, platform: "threads" }, "2026-09-28");
    expect(threads.every((entry) => entry.platform === "threads")).toBe(true);
    const counts = filterCounts(entries, { ...EMPTY_CALENDAR_FILTERS, platform: "threads" }, "2026-09-28", "platform");
    expect(counts.threads).toBe(threads.length);
    expect(Object.values(counts).reduce((sum, value) => sum + value, 0)).toBe(entries.length);
    expect(filterCalendarEntries(entries, { ...EMPTY_CALENDAR_FILTERS, upcomingOnly: true }, "2026-10-20").every((entry) => entry.date >= "2026-10-20")).toBe(true);
    expect(nextUp(entries, "2026-09-28", "10:00")?.id).toBe(entries[0]!.id);
  });

  it("finds Czech text without its diacritics", () => {
    const dn = document("state/marketing-calendar/caught-up.json");
    const hits = filterCalendarEntries(views(dn), { ...EMPTY_CALENDAR_FILTERS, query: "praktick" }, "2026-01-01");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("formats the small things the grid prints", () => {
    expect(formatEffort(null)).toBeNull();
    expect(formatEffort(45)).toBe("45 min");
    expect(formatEffort(88)).toBe("1 h 28 min");
    expect(formatDateRange("2026-11-02", "2026-11-08")).toBe("2–8 Nov");
    expect(formatDateRange("2026-11-30", "2026-12-06")).toBe("30 Nov – 6 Dec");
    expect(bodyBeats("Slide 1: cover; slide 2 = second cover; Slide 3: proof")).toHaveLength(3);
    expect(bodyBeats("One paragraph without slides.")).toEqual(["One paragraph without slides."]);
  });
});
