"use client";

import type { CSSProperties } from "react";
import type { CalendarStatus } from "@/lib/calendar-feed-model";
import type { OfficeCell, OfficeWeek } from "@/lib/office-walkthrough";
import { WALKTHROUGH_PANEL_ZOOM } from "@/components/office/panel-zoom";
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
    height: "48px",
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
  meetingCount,
  canStepBack,
  canStepForward,
  onStepBack,
  onStepForward,
  onOpen
}: {
  week: OfficeWeek;
  meetingCount: number;
  canStepBack: boolean;
  canStepForward: boolean;
  onStepBack: () => void;
  onStepForward: () => void;
  onOpen: (channel: WorkspaceChannelId, date: string) => void;
}) {
  return (
    <div
      className="w-full max-w-[1080px] rounded-[14px] border border-[#3f3f46] bg-[rgba(11,11,13,.9)] shadow-[0_40px_120px_rgba(0,0,0,.65)] backdrop-blur-[16px]"
      data-cal-panel
      style={WALKTHROUGH_PANEL_ZOOM}
    >
      <div className="flex items-center justify-between gap-6 border-b border-[#26262b] px-[22px] py-3.5">
        <p className="text-[13px] leading-[1.5] text-[#94949c]">
          {meetingCount} meetings a day. Open one that happened and its record starts playing.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#94949c]">
            {week.label}
          </span>
          <button
            aria-label="Previous week"
            className="grid size-[30px] place-items-center rounded-[9px] border border-[#3f3f46] bg-[#101013] font-mono text-[13px] text-[#d4d4d8] transition-colors hover:border-[#a1a1aa] hover:text-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canStepBack}
            onClick={onStepBack}
            type="button"
          >
            ‹
          </button>
          <button
            aria-label="Next week"
            className="grid size-[30px] place-items-center rounded-[9px] border border-[#3f3f46] bg-[#101013] font-mono text-[13px] text-[#d4d4d8] transition-colors hover:border-[#a1a1aa] hover:text-[#f4f4f5] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canStepForward}
            onClick={onStepForward}
            type="button"
          >
            ›
          </button>
        </div>
      </div>

      <div className="overflow-x-auto [overscroll-behavior-x:contain]" data-cal-scroll data-horizontal-scroll>
        <div className="min-w-[680px] lg:min-w-0">
          <div className="flex border-b border-[#26262b] bg-[#101013]">
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
            The row block scrolls inside itself when the viewport cannot hold every slot, rather
            than the panel growing past the section. Twelve rooms at a fixed 48px need 576px, which
            fits a 900px-tall screen and does not fit a 700px one; the inner scroll is what keeps
            the section exactly one viewport tall either way.
          */}
          <div className="max-h-[min(576px,46svh)] overflow-y-auto [overscroll-behavior:contain] lg:max-h-[min(576px,52svh)]">
            {week.rows.map((row) => (
              <div className="flex border-b border-[#1d1d21]" key={row.kind}>
                <div
                  className="flex h-12 w-[148px] shrink-0 items-center gap-2.5 overflow-hidden border-r border-[#26262b] bg-[#0e0e11] px-[18px] py-1.5 md:w-[176px] lg:w-[232px]"
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
                    <span className="line-clamp-2 text-[11px] leading-[1.32]">{cell.text}</span>
                  );
                  return openable ? (
                    <button
                      key={`${row.kind}-${cell.date}`}
                      onClick={() => onOpen(cell.channel!, cell.date)}
                      style={cellStyle(cell)}
                      title={cell.title}
                      type="button"
                    >
                      {content}
                    </button>
                  ) : (
                    <div key={`${row.kind}-${cell.date}`} style={cellStyle(cell)} title={cell.title}>
                      {content}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-[22px] gap-y-2 px-[26px] py-3.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#94949c]">
        <span className="inline-flex items-center gap-[7px]">
          <span className="size-[9px] rounded-sm bg-[rgba(22,101,52,.55)]" />
          Happened
        </span>
        <span className="inline-flex items-center gap-[7px]">
          <span className="size-[9px] rounded-sm border border-[#3f3f46] bg-[#1b1b1f]" />
          Planned
        </span>
        <span className="inline-flex items-center gap-[7px]">
          <span className="size-[9px] rounded-sm bg-[rgba(133,77,14,.5)]" />
          Did not happen
        </span>
        <span className="ml-auto">{week.label}</span>
      </div>
    </div>
  );
}
