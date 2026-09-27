"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Megaphone } from "lucide-react";
import { AdminTooltip } from "@/components/admin/admin-overlays";
import {
  CALENDAR_KIND_LABELS,
  CALENDAR_PLATFORM_LABELS,
  CALENDAR_STATUS_LABELS,
  type CalendarAd
} from "@/lib/marketing-calendar-model";
import {
  formatCalendarDate,
  formatDateRange,
  formatEffort,
  type CalendarEntryView,
  type CalendarWeek
} from "@/lib/marketing-calendar-view";
import { cn } from "@/lib/utils";
import { KIND_ICONS, PLATFORM_ICONS, ProducerMark, STATUS_ICONS, STATUS_INK, STATUS_SURFACES } from "./calendar-shared";
import { useAdminSurfaceTheme } from "./use-admin-surface-theme";

export type CalendarRow =
  | { key: string; kind: "platform"; platform: CalendarEntryView["platform"]; label: string; handle: string | null }
  | { key: "ads"; kind: "ads"; label: string }
  | { key: "work"; kind: "work"; label: string };

/** Which row an entry sits in: ads and work have their own rows whatever platform they name. */
export function rowKeyOf(entry: Pick<CalendarEntryView, "kind" | "platform">): string {
  if (entry.kind === "ad") return "ads";
  if (entry.kind === "task" || entry.kind === "review") return "work";
  return entry.platform;
}

interface NavItem { id: string; row: number; col: number; idx: number }

function entryLabel(entry: CalendarEntryView, date: string, rowLabel: string): string {
  const reason = entry.effectiveStatus === "blocked" ? `, blocked by ${entry.blockedBy ?? entry.note ?? "an unnamed reason"}` : "";
  return `${formatCalendarDate(date)} ${entry.time}, ${rowLabel}, ${CALENDAR_KIND_LABELS[entry.kind]}, ${CALENDAR_STATUS_LABELS[entry.effectiveStatus]}${reason}: ${entry.title}`;
}

function EntryChip({ entry, label, tabIndex, onOpen, onFocus }: {
  entry: CalendarEntryView;
  label: string;
  tabIndex: number;
  onOpen: (id: string) => void;
  onFocus: (id: string) => void;
}) {
  const KindIcon = KIND_ICONS[entry.kind];
  const StatusIcon = STATUS_ICONS[entry.effectiveStatus];
  return (
    <button
      aria-label={label}
      className={cn(
        "admin-focus-ring group flex w-full min-w-0 flex-col gap-1 rounded-[var(--admin-radius-sm)] border border-l-[3px] px-2 py-1.5 text-left transition-colors duration-[var(--admin-motion-fast)] hover:brightness-[0.97] motion-reduce:transition-none",
        STATUS_SURFACES[entry.effectiveStatus],
        entry.synthetic ? "border-dashed" : null
      )}
      data-calendar-entry={entry.id}
      data-calendar-state={entry.effectiveStatus}
      data-platform={entry.platform}
      onClick={() => onOpen(entry.id)}
      onFocus={() => onFocus(entry.id)}
      // Inline so no status border utility can repaint the identity stripe.
      style={{ borderLeftColor: "var(--admin-section-accent)" }}
      tabIndex={tabIndex}
      type="button"
    >
      <span className="flex w-full min-w-0 items-center gap-1 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">
        <span className="admin-tabular font-semibold text-[var(--admin-foreground)]">{entry.time}</span>
        <KindIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <ProducerMark producer={entry.producer} />
          <StatusIcon aria-hidden className={cn("size-3.5", STATUS_INK[entry.effectiveStatus])} strokeWidth={2.25} />
        </span>
      </span>
      <span className={cn("line-clamp-3 text-[length:var(--admin-type-control)] font-medium leading-4 [overflow-wrap:anywhere]", entry.effectiveStatus === "skipped" ? "line-through decoration-[var(--admin-foreground-subtle)]" : null)}>
        {entry.title}
      </span>
    </button>
  );
}

export function CalendarWeekGrid({
  week,
  rows,
  entries,
  ads,
  today,
  period,
  rotation,
  onOpen,
  onOpenAd
}: {
  week: CalendarWeek;
  rows: readonly CalendarRow[];
  entries: readonly CalendarEntryView[];
  ads: readonly CalendarAd[];
  today: string;
  period: { start: string; end: string };
  rotation: Record<string, string> | null;
  onOpen: (id: string) => void;
  onOpenAd: (id: string) => void;
}) {
  const theme = useAdminSurfaceTheme();
  const grid = useRef<HTMLDivElement | null>(null);
  const weekEntries = useMemo(() => entries.filter((entry) => week.days.includes(entry.date)), [entries, week.days]);
  const weekAds = useMemo(() => ads.filter((ad) => ad.start <= week.days[6]! && ad.end >= week.days[0]!), [ads, week.days]);

  /** cells[row][col] = entry ids, the geometry arrow keys move through. */
  const cells = useMemo(() => rows.map((row) => week.days.map((day) => {
    const ids = weekEntries.filter((entry) => entry.date === day && rowKeyOf(entry) === row.key).map((entry) => entry.id);
    if (row.kind === "ads") {
      weekAds.forEach((ad) => {
        if ((ad.start < week.days[0]! ? week.days[0] : ad.start) === day) ids.unshift(`ad:${ad.id}`);
      });
    }
    return ids;
  })), [rows, week.days, weekEntries, weekAds]);

  const firstFocusable = useMemo(() => {
    const todayCol = week.days.indexOf(today);
    for (const col of todayCol >= 0 ? [todayCol, 0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6]) {
      for (const row of cells) if (row[col]?.length) return row[col]![0]!;
    }
    return null;
  }, [cells, today, week.days]);
  const [focused, setFocused] = useState<string | null>(null);
  const active = focused && cells.some((row) => row.some((ids) => ids.includes(focused))) ? focused : firstFocusable;

  function locate(id: string): NavItem | null {
    for (let row = 0; row < cells.length; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        const idx = cells[row]![col]!.indexOf(id);
        if (idx >= 0) return { id, row, col, idx };
      }
    }
    return null;
  }

  function move(from: NavItem, key: string): string | null {
    const cell = (row: number, col: number) => cells[row]?.[col] ?? [];
    if (key === "ArrowDown") {
      if (from.idx + 1 < cell(from.row, from.col).length) return cell(from.row, from.col)[from.idx + 1]!;
      for (let row = from.row + 1; row < cells.length; row += 1) if (cell(row, from.col).length) return cell(row, from.col)[0]!;
    }
    if (key === "ArrowUp") {
      if (from.idx > 0) return cell(from.row, from.col)[from.idx - 1]!;
      for (let row = from.row - 1; row >= 0; row -= 1) if (cell(row, from.col).length) return cell(row, from.col).at(-1)!;
    }
    if (key === "ArrowRight" || key === "ArrowLeft") {
      const step = key === "ArrowRight" ? 1 : -1;
      for (let col = from.col + step; col >= 0 && col < 7; col += step) {
        const ids = cell(from.row, col);
        if (ids.length) return ids[Math.min(from.idx, ids.length - 1)]!;
      }
    }
    if (key === "Home" || key === "End") {
      const cols = key === "Home" ? [0, 1, 2, 3, 4, 5, 6] : [6, 5, 4, 3, 2, 1, 0];
      for (const col of cols) if (cell(from.row, col).length) return cell(from.row, col)[0]!;
    }
    return null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const current = (event.target as HTMLElement).closest<HTMLElement>("[data-calendar-nav]")?.dataset.calendarNav;
    const from = current ? locate(current) : null;
    if (!from) return;
    const next = move(from, event.key);
    event.preventDefault();
    if (!next) return;
    setFocused(next);
    grid.current?.querySelector<HTMLElement>(`[data-calendar-nav="${CSS.escape(next)}"] button, button[data-calendar-nav="${CSS.escape(next)}"]`)?.focus();
  }

  // On a narrow screen the region scrolls; open it on today, or on the plan's first day, rather
  // than on days before the launch that hold nothing.
  useEffect(() => {
    const region = grid.current?.closest<HTMLElement>("[data-horizontal-scroll]");
    if (!region || region.scrollWidth <= region.clientWidth) return;
    const target = week.days.includes(today) ? today : week.days.find((day) => day >= period.start && day <= period.end);
    const header = target ? grid.current?.querySelector<HTMLElement>(`[data-calendar-day="${target}"]`) : null;
    const label = grid.current?.querySelector<HTMLElement>('[role="columnheader"]');
    if (!header || !label) return;
    region.scrollLeft = Math.max(0, region.scrollLeft + header.getBoundingClientRect().left - region.getBoundingClientRect().left - label.offsetWidth);
  }, [week.monday, week.days, today, period.start, period.end]);

  const weekday = (day: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)).toLowerCase();
  const effortByDay = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const entry of weekEntries) if (entry.effortMin !== null) totals[entry.date] = (totals[entry.date] ?? 0) + entry.effortMin;
    return totals;
  }, [weekEntries]);

  return (
    <div
      aria-colcount={8}
      aria-label={`Week of ${formatDateRange(week.days[0]!, week.days[6]!)}`}
      aria-rowcount={rows.length + 1}
      className="grid min-w-[60rem] grid-cols-[5.5rem_repeat(7,minmax(7.75rem,1fr))] sm:min-w-[62rem] sm:grid-cols-[7.5rem_repeat(7,minmax(7.75rem,1fr))] bg-[var(--admin-surface)]"
      data-calendar-week={week.monday}
      onKeyDown={onKeyDown}
      ref={grid}
      role="grid"
    >
      <div className="contents" role="row">
        <div className="sticky left-0 z-10 border-b border-r border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] px-3 py-2 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[0.06em] text-[var(--admin-foreground-muted)]" role="columnheader">
          Channel
        </div>
        {week.days.map((day) => {
          const inPeriod = day >= period.start && day <= period.end;
          const isToday = day === today;
          const rotationKind = rotation && inPeriod ? rotation[weekday(day)] : null;
          return (
            <div
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "grid gap-0.5 border-b border-r border-[var(--admin-border)] px-2.5 py-2 last:border-r-0",
                isToday ? "bg-[var(--admin-surface-selected)] shadow-[inset_0_2px_0_var(--admin-brand)]" : "bg-[var(--admin-surface-secondary)]"
              )}
              data-calendar-day={day}
              key={day}
              role="columnheader"
            >
              <span className="flex items-center gap-1.5">
                <span className={cn("text-[length:var(--admin-type-control)] font-semibold", inPeriod ? "text-[var(--admin-foreground)]" : "text-[var(--admin-foreground-subtle)]")}>{formatCalendarDate(day)}</span>
                {isToday ? <span className="rounded-full bg-[var(--admin-primary)] px-1.5 text-[length:var(--admin-type-micro)] font-semibold uppercase text-[var(--admin-primary-foreground)]">Today</span> : null}
              </span>
              <span className="text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">
                {!inPeriod
                  ? day < period.start ? "Before launch" : "After the plan"
                  : formatEffort(effortByDay[day] ?? null) ?? "No effort stated"}
              </span>
              {rotationKind ? <span className="truncate text-[length:var(--admin-type-micro)] uppercase tracking-[0.05em] text-[var(--admin-foreground-subtle)]" title="marketingShark's weekday rotation">mS · {rotationKind.replaceAll("-", " ")}</span> : null}
            </div>
          );
        })}
      </div>
      {rows.map((row, rowIndex) => {
        const RowIcon = row.kind === "platform" ? PLATFORM_ICONS[row.platform] : row.kind === "ads" ? Megaphone : KIND_ICONS.task;
        return (
          <div className="contents" data-calendar-row={row.key} key={row.key} role="row">
            <div className="sticky left-0 z-10 flex min-w-0 flex-col justify-start gap-0.5 border-b border-r border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-2.5 sm:px-3" role="rowheader">
              <span className="flex items-center gap-1.5 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground)]">
                <RowIcon aria-hidden className="size-3.5 shrink-0 text-[var(--admin-foreground-muted)]" />
                <span className="truncate">{row.label}</span>
              </span>
              {row.kind === "platform" && row.handle ? <span className="truncate text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{row.handle}</span> : null}
            </div>
            {row.kind === "ads" ? (
              <div aria-colspan={7} className="col-span-7 grid min-h-14 grid-cols-7 content-start gap-1 border-b border-[var(--admin-border)] p-1.5" role="gridcell">
                {weekAds.length === 0 && cells[rowIndex]!.every((ids) => ids.length === 0) ? (
                  <span className="col-span-7 self-center px-1 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-subtle)]">No paid test this week</span>
                ) : null}
                {weekAds.map((ad) => {
                  const from = Math.max(0, week.days.indexOf(ad.start < week.days[0]! ? week.days[0]! : ad.start));
                  const to = ad.end > week.days[6]! ? 6 : week.days.indexOf(ad.end);
                  const id = `ad:${ad.id}`;
                  return (
                    <button
                      aria-label={`Ad ${ad.id}, ${CALENDAR_PLATFORM_LABELS[ad.platform]}, ${formatDateRange(ad.start, ad.end)}, €${ad.dailyBudgetEur} a day, ${CALENDAR_STATUS_LABELS[ad.status]}: ${ad.objective}`}
                      className={cn(
                        "admin-focus-ring flex min-w-0 items-center gap-1.5 rounded-[var(--admin-radius-sm)] border border-l-[3px] px-2 py-1.5 text-left text-[length:var(--admin-type-label)]",
                        STATUS_SURFACES[ad.status]
                      )}
                      data-calendar-ad={ad.id}
                      data-calendar-nav={id}
                      data-calendar-state={ad.status}
                      data-platform={ad.platform}
                      key={ad.id}
                      onClick={() => onOpenAd(ad.id)}
                      onFocus={() => setFocused(id)}
                      style={{ gridColumn: `${from + 1} / ${to + 2}`, borderLeftColor: "var(--admin-section-accent)" }}
                      tabIndex={active === id ? 0 : -1}
                      type="button"
                    >
                      <Megaphone aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate font-semibold">{`€${ad.dailyBudgetEur}/day · ${ad.objective}`}</span>
                      <span className="ml-auto hidden shrink-0 text-[var(--admin-foreground-muted)] sm:inline">{formatDateRange(ad.start, ad.end)}</span>
                    </button>
                  );
                })}
                {week.days.map((day, col) => weekEntries.filter((entry) => entry.date === day && rowKeyOf(entry) === "ads").map((entry) => (
                  <div data-calendar-nav={entry.id} key={entry.id} style={{ gridColumn: `${col + 1} / ${col + 2}` }}>
                    <EntryChip entry={entry} label={entryLabel(entry, day, row.label)} onFocus={setFocused} onOpen={onOpen} tabIndex={active === entry.id ? 0 : -1} />
                  </div>
                )))}
              </div>
            ) : (
              week.days.map((day, col) => {
                const inPeriod = day >= period.start && day <= period.end;
                const ids = cells[rowIndex]![col]!;
                return (
                  <div
                    className={cn(
                      "flex min-h-16 min-w-0 flex-col gap-1 border-b border-r border-[var(--admin-border)] p-1.5 last:border-r-0",
                      day === today ? "bg-[var(--admin-surface-selected)]" : inPeriod ? null : "bg-[var(--admin-surface-secondary)]"
                    )}
                    data-calendar-slot={`${day}:${row.key}`}
                    data-calendar-state={ids.length ? undefined : "empty"}
                    data-platform={row.kind === "platform" ? row.platform : undefined}
                    key={day}
                    role="gridcell"
                  >
                    {ids.map((id) => {
                      const entry = weekEntries.find((candidate) => candidate.id === id)!;
                      const chip = <EntryChip entry={entry} label={entryLabel(entry, day, row.label)} onFocus={setFocused} onOpen={onOpen} tabIndex={active === id ? 0 : -1} />;
                      return (
                        <div className="min-w-0" data-calendar-nav={id} key={id}>
                          {entry.effectiveStatus === "blocked" ? (
                            <AdminTooltip className="flex w-full" content={entry.blockedBy ?? entry.note ?? "No reason recorded."} label="Blocked" theme={theme}>
                              {chip}
                            </AdminTooltip>
                          ) : chip}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
