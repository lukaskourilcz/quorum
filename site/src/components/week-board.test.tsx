import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WeekBoard } from "./week-board";
import {
  ONGOING_CEILING_MINUTES,
  SLOT_DELIVERY_GRACE_MINUTES,
  buildPublicCalendarFeed,
  pragueSlotInstant
} from "@/lib/calendar-feed-model";

// 11:00 Prague on 4 August, the Titty Tuesdays marketing slot.
const slotAt = pragueSlotInstant("2026-08-04", 11);

function boardHtml(minutesAfterSlot: number): string {
  const feed = buildPublicCalendarFeed({
    weekOf: "2026-08-03",
    now: new Date(slotAt.getTime() + minutesAfterSlot * 60_000),
    standups: [],
    meetings: []
  });
  return renderToStaticMarkup(
    <WeekBoard
      anchorDate="2026-08-04"
      availableWeeks={["2026-08-03"]}
      feed={feed}
      today="2026-08-04"
    />
  );
}

/**
 * The rendered 11:00 cell for 4 August. The board draws five days starting the day before its
 * anchor, so it paints several Titty Tuesdays cells and only this one belongs to the slot under
 * test — matching on the project alone picks up 3 August, which is long past and always missed.
 */
function ttMarketingCell(html: string): string {
  const cells = html.match(/<(?:a|div)[^>]*data-calendar-slot[^>]*>/g) ?? [];
  const cell = cells.find((tag) =>
    tag.includes('data-project="titty-tuesdays"') && tag.includes('aria-label="2026-08-04 '));
  if (!cell) throw new Error("no 4 August Titty Tuesdays cell rendered");
  return cell;
}

describe("the week board shows a run that is happening now", () => {
  it("renders its own state, not the one a missed slot gets", () => {
    // A run in flight used to render identically to one that never started: both were past their
    // hour with no record, so both took the "missed" branch and printed "Did not happen".
    const html = boardHtml(5);
    expect(ttMarketingCell(html)).toContain('data-calendar-state="ongoing"');
    expect(html).toContain("Happening now");
  });

  it("gives the reader the label in text, not colour alone", () => {
    // The only thing separating these cells for a screen reader is the accessible name, so the
    // state has to reach it. Colour and icon are not enough on their own.
    expect(boardHtml(5)).toContain("2026-08-04 Titty Tuesdays marketing meeting, Happening now");
  });

  it("hands off to the late state past the ceiling, and to missed past the window", () => {
    expect(ttMarketingCell(boardHtml(ONGOING_CEILING_MINUTES + 1)))
      .toContain('data-calendar-state="late"');
    expect(ttMarketingCell(boardHtml(SLOT_DELIVERY_GRACE_MINUTES + 1)))
      .toContain('data-calendar-state="missed"');
  });

  it("names every status it can render in the legend", () => {
    // The legend is the only place the colours are explained. A state the board can paint but
    // never names leaves the reader guessing what the new colour means.
    const html = boardHtml(5);
    for (const label of [
      "Happening now",
      "Waiting on the run",
      "Happened",
      "Did not happen",
      "Skipped",
      "Not needed",
      "Planned"
    ]) {
      expect(html).toContain(label);
    }
  });
});
