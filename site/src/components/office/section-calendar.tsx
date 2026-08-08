"use client";

import type { CSSProperties } from "react";
import type { CalendarStatus } from "@/lib/calendar-feed-model";
import type { OfficeCell, OfficeWeek } from "@/lib/office-walkthrough";
import type { WorkspaceChannelId } from "@/lib/meeting-feed";

/**
 * The five surfaces a slot can wear.
 *
 * `late` gets the planned surface rather than the amber one on purpose: the slot's hour has
 * passed and its run has not landed yet, which is a wait and not a failure. The board elsewhere
 * makes the same distinction, and painting it amber would tell a visitor something went wrong on
 * a morning when GitHub was simply slow to deliver a cron.
 */
const CELL_SURFACE: Record<CalendarStatus, { background: string; color: string }> = {
  held: { background: "rgba(22,101,52,.26)", color: "#e4f3e8" },
  /*
   * Ember at 24% over the row's `#0e0e11`, composited here rather than left as an alpha layer.
   *
   * The pixel is identical either way. What changes is that the colour can be measured: the
   * contrast gate reads a 24%-alpha layer as if it were opaque `rgb(255,90,0)` and reported this
   * cell at 2.61:1, when the text really sits on near-black at about 11.8:1. It only ever fired
   * in the quarter of an hour a slot reads "in progress", which is how it went unseen — the same
   * reason the wallboard's controls and the venture tints are already blended rather than layered.
   */
  ongoing: { background: "#48200d", color: "#ffe6d6" },
  missed: { background: "rgba(133,77,14,.24)", color: "#f4e3c4" },
  skipped: { background: "rgba(133,77,14,.24)", color: "#f4e3c4" },
  "not-needed": { background: "#101013", color: "#5b5b63" },
  late: { background: "#16161a", color: "#a1a1aa" },
  scheduled: { background: "#16161a", color: "#94949c" }
};

function cellStyle(cell: OfficeCell): CSSProperties {
  const surface = CELL_SURFACE[cell.state];
  const openable = cell.channel !== null;
  return {
    display: "flex",
    flex: "1 1 0",
    minWidth: 0,
    alignItems: "center",
    textAlign: "left",
    // Every slot is exactly the same size in every state, so the grid never shifts. Anything that
    // does not fit is truncated and the full sentence lives in `title`.
    height: "100%",
    overflow: "hidden",
    border: 0,
    borderRight: "1px solid #1d1d21",
    padding: "6px 10px",
    background: surface.background,
    color: surface.color,
    cursor: openable ? "pointer" : "default",
    fontFamily: cell.state === "scheduled" ? "var(--font-ibm-plex-mono), monospace" : "inherit",
    letterSpacing: cell.state === "scheduled" ? ".06em" : "normal"
  };
}

export function SectionCalendar({
  week,
  canStepBack,
  canStepForward,
  onStepBack,
  onStepForward,
  onOpen
}: {
  week: OfficeWeek;
  canStepBack: boolean;
  canStepForward: boolean;
  onStepBack: () => void;
  onStepForward: () => void;
  onOpen: (channel: WorkspaceChannelId, date: string) => void;
}) {
  return (
    <div
      className="w-full rounded-[14px] border border-[#3f3f46] bg-[rgba(11,11,13,.9)] shadow-[0_40px_120px_rgba(0,0,0,.65)] backdrop-blur-[16px] max-lg:max-w-[1080px] lg:h-[max(65vh,680px)] lg:w-[65vw]"
      data-cal-panel
      /*
       * 65% of the viewport, but never shorter than the week itself.
       *
       * Thirteen rooms plus the day header and the week control need about 680px. On a
       * large monitor 65vh clears that comfortably and the panel scales with the screen, which is
       * the point; on a 13-inch laptop 65vh is 497px and the week would stop at the early
       * afternoon again. `maxHeight` keeps the floor from ever pushing the panel past its section.
       */
      style={{ display: "flex", flexDirection: "column", maxHeight: "100%" }}
    >
      <div className="flex min-h-0 flex-1 overflow-x-auto [overscroll-behavior-x:contain]" data-cal-scroll data-horizontal-scroll>
        <div className="flex min-h-0 w-full min-w-[680px] flex-col lg:min-w-0">
          <div className="flex shrink-0 border-b border-[#26262b] bg-[#101013]">
            <div
              className="w-[148px] shrink-0 border-r border-[#26262b] px-[18px] py-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#94949c] md:w-[176px] lg:w-[232px]"
              data-cal-label
            >
              Time / room
            </div>
            {week.days.map((day) => (
              <div className="min-w-0 flex-1 border-r border-[#26262b] px-3 py-2.5" key={day.date}>
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94949c]">
                    {day.short}
                  </span>
                  {day.isToday ? (
                    <span className="rounded-full bg-[var(--bai-accent)] px-[7px] py-px font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#09090b]">
                      Today
                    </span>
                  ) : null}
                </div>
                <div className="mt-[3px] text-[13px] font-semibold tabular-nums text-[#f4f4f5]">
                  {day.dayMonth}
                </div>
              </div>
            ))}
          </div>

          {/*
            The row block takes whatever height the panel has left rather than a fixed cap.
            The cap was a guess at the viewport — and once the panel gained its zoom the guess was
            wrong by that factor too, which is why the week stopped at the early afternoon. Every
            room is on screen when there is room for it, and only then does the block scroll.
          */}
          <div
            className="flex flex-1 flex-col overflow-y-auto [overscroll-behavior:contain]"
            data-cal-rows
          >
            {week.rows.map((row) => (
              <div
                className="flex border-b border-[#1d1d21]"
                key={row.kind}
                style={{ flex: "1 0 40px", minHeight: "40px" }}
              >
                <div
                  className="flex w-[148px] shrink-0 items-center gap-2.5 overflow-hidden border-r border-[#26262b] bg-[#0e0e11] px-[18px] py-1.5 md:w-[176px] lg:w-[232px]"
                  data-cal-label
                >
                  <span className="self-stretch rounded-sm" style={{ width: "3px", background: row.color }} />
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] font-semibold tracking-[0.06em] text-[#f4f4f5]">
                      {row.time}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] leading-[1.3] text-[#94949c]">{row.label}</p>
                  </div>
                </div>
                {row.cells.map((cell) => {
                  const openable = cell.channel !== null;
                  const content = (
                    <span className="truncate text-[11px] leading-[1.32]">{cell.text}</span>
                  );
                  return openable ? (
                    <button
                      key={`${row.kind}-${cell.date}`}
                      onClick={() => onOpen(cell.channel!, cell.date)}
                      style={cellStyle(cell)}
                      title={cell.title || undefined}
                      type="button"
                    >
                      {content}
                    </button>
                  ) : (
                    <div key={`${row.kind}-${cell.date}`} style={cellStyle(cell)} title={cell.title || undefined}>
                      {content}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/*
        The week control, and nothing else. The legend went with the cells' prose: each cell now
        prints its own outcome in words, so a key mapping three colours to three words was naming
        what the cell already said.
      */}
      <div className="flex shrink-0 items-center gap-2 border-t border-[#26262b] px-[22px] py-2.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#94949c]">
          {week.label}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <button
            aria-label="Previous week"
            className="grid size-[26px] place-items-center rounded-lg border border-[#3f3f46] bg-[#101013] font-mono text-[12px] text-[#d4d4d8] transition-colors hover:border-[#a1a1aa] hover:text-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canStepBack}
            onClick={onStepBack}
            type="button"
          >
            ‹
          </button>
          <button
            aria-label="Next week"
            className="grid size-[26px] place-items-center rounded-lg border border-[#3f3f46] bg-[#101013] font-mono text-[12px] text-[#d4d4d8] transition-colors hover:border-[#a1a1aa] hover:text-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canStepForward}
            onClick={onStepForward}
            type="button"
          >
            ›
          </button>
        </span>
      </div>
    </div>
  );
}
