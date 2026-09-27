import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminWriteProvider } from "@/components/admin/admin-write-mode";
import { parseMarketingCalendar, type CalendarDocument } from "@/lib/marketing-calendar-model";
import { EMPTY_CALENDAR_FILTERS, type CalendarEntryView } from "@/lib/marketing-calendar-view";
import { MarketingCalendarPanel, type MarketingCalendarPanelProps } from "./marketing-calendar-panel";

function plan(relative: string): CalendarDocument {
  const result = parseMarketingCalendar(JSON.parse(readFileSync(path.resolve(process.cwd(), "..", relative), "utf8")));
  if (!result.ok) throw new Error(result.reason);
  return result.document;
}

function props(document: CalendarDocument, over: Partial<MarketingCalendarPanelProps> = {}): MarketingCalendarPanelProps {
  const entries: CalendarEntryView[] = document.entries.map((entry) => ({ ...entry, effectiveStatus: entry.status, statusSource: "owner", queue: null, packageExists: null, synthetic: false }));
  return {
    venture: { id: "marketingshark", label: "devShark" },
    document: { ...document, entries: [] },
    entries,
    rotation: { thursday: "quiz" },
    queue: { state: "read", matched: 0, unmatched: 0 },
    today: "2026-11-05",
    clock: "08:00",
    ownDashboardUrl: "https://dash.example",
    sourcePath: "state/marketing-calendar/marketingshark.json",
    writesConfigured: true,
    accent: "var(--admin-brand)",
    initial: { week: "2026-11-02", view: "week", entry: null, filters: EMPTY_CALENDAR_FILTERS },
    ...over
  };
}

function render(value: MarketingCalendarPanelProps): string {
  return renderToStaticMarkup(<AdminWriteProvider enabled><MarketingCalendarPanel {...value} /></AdminWriteProvider>);
}

describe("MarketingCalendarPanel", () => {
  const fixture = plan("contracts/fixtures/marketing-calendar.valid.json");

  it("renders the week grid with slot, state and platform attributes and a labelled cell per entry", () => {
    const html = render(props(fixture));
    expect(html).toContain('data-calendar-week="2026-11-02"');
    expect(html).toContain('role="grid"');
    expect(html).toContain('data-calendar-slot="2026-11-05:threads"');
    expect(html).toMatch(/data-calendar-entry="ds-001" data-calendar-state="planned" data-platform="threads"/u);
    expect(html).toContain('aria-label="Thu 5 Nov 09:00, Threads, Thread, Planned: QOTD: what does a commit represent?"');
    expect(html).toContain("blocked by Waiting for the new racer build");
    expect(html).toContain('data-calendar-ad="ds-ad-1"');
    expect(html).toContain('aria-current="date"');
    expect(html).toContain("mS · quiz");
  });

  it("lists every entry below the calendar, grouped by week with its theme", () => {
    const html = render(props(fixture));
    expect(html).toContain('data-calendar-list-entry="ds-001"');
    expect(html).toContain('data-calendar-list-entry="ds-002"');
    expect(html).toContain("Week 1 · 2–8 Nov — Launch");
    expect(html).toContain("All 2 posts, ads and tasks, week by week");
  });

  it("shows the brief, KPIs, channels, ads, reviews, pillars, risks, dependencies and sources", () => {
    const html = render(props(fixture));
    for (const section of ["ads", "prelaunch", "reviews", "pillars", "risks", "dependencies", "sources"]) {
      expect(html).toContain(`data-calendar-section="${section}"`);
    }
    expect(html).toContain("Threads followers");
    expect(html).toContain("https://github.com/lukaskourilcz/react-express-app/issues/239");
    expect(html).toContain("https://dash.example/ig-tips?q=Tip%20one");
    expect(html).toContain("Day 1 of 2");
  });

  it("counts down and opens the checklist before launch", () => {
    const html = render(props(fixture, { today: "2026-10-01" }));
    expect(html).toContain('data-calendar-countdown="35"');
    expect(html).toContain("Launch in 35 days — Thu 5 Nov");
    expect(html).toContain("1 of 2 pre-launch tasks done.");
  });

  it("applies filters from the query to the grid and the list", () => {
    const html = render(props(fixture, { initial: { week: "2026-11-02", view: "week", entry: null, filters: { ...EMPTY_CALENDAR_FILTERS, platform: "instagram" } } }));
    expect(html).not.toContain('data-calendar-list-entry="ds-001"');
    expect(html).toContain('data-calendar-list-entry="ds-002"');
    expect(html).toContain("Showing 1 of 2 entries");
  });

  it("renders the month overview on request", () => {
    const html = render(props(fixture, { initial: { week: "2026-11-02", view: "month", entry: null, filters: EMPTY_CALENDAR_FILTERS } }));
    expect(html).toContain("data-calendar-month");
    expect(html).toContain('data-calendar-month-day="2026-11-05"');
  });

  it("names dropped records instead of hiding them", () => {
    const html = render(props({ ...fixture, dropped: [{ section: "entries", index: 4, id: "ds-009", reason: "time is not HH:mm" }] }));
    expect(html).toContain('data-calendar-dropped="1"');
    expect(html).toContain("entries[4] ds-009: time is not HH:mm");
  });

  it("renders both committed plans, Czech copy included", () => {
    for (const [relative, venture] of [["state/marketing-calendar/marketingshark.json", "marketingshark"], ["state/marketing-calendar/caught-up.json", "caught-up"]] as const) {
      const document = plan(relative);
      const html = render(props(document, { venture: { id: venture, label: venture }, today: document.period.start, initial: { week: document.period.start, view: "week", entry: null, filters: EMPTY_CALENDAR_FILTERS } }));
      expect(html.match(/data-calendar-list-entry=/gu)?.length).toBe(document.entries.length);
    }
  });
});
