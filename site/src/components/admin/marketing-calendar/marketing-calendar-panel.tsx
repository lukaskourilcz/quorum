"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import {
  AdminButton,
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminSelect,
  AdminTableRegion
} from "@/components/admin/admin-primitives";
import {
  CALENDAR_PLATFORM_LABELS,
  CALENDAR_PLATFORMS,
  CALENDAR_PRODUCER_LABELS,
  CALENDAR_STATUSES,
  type CalendarDocument,
  type CalendarOwnerStatus,
  type CalendarPlatform
} from "@/lib/marketing-calendar-model";
import {
  calendarAggregates,
  calendarPhase,
  calendarStateFromQuery,
  CALENDAR_FILTER_PARAMS,
  filterCalendarEntries,
  formatDateRange,
  nextUp,
  periodWeeks,
  type CalendarEntryView,
  type CalendarFilters,
  type CalendarView
} from "@/lib/marketing-calendar-view";
import { useAdminHydrated } from "@/components/admin/admin-write-mode";
import { mondayOfCalendarWeek } from "@/lib/calendar-feed-model";
import { cn } from "@/lib/utils";
import { CalendarBrief, CalendarSummary, PrelaunchCallout } from "./calendar-brief";
import { CalendarEntryDetail, type CalendarDetailTarget } from "./calendar-entry-detail";
import { CalendarMonthGrid } from "./calendar-month-grid";
import { CalendarPlanList } from "./calendar-plan-list";
import { CalendarPlanSections } from "./calendar-plan-sections";
import { ProducerMark, StatusPill } from "./calendar-shared";
import { CalendarWeekGrid, rowKeyOf, type CalendarRow } from "./calendar-week-grid";


export interface MarketingCalendarPanelProps {
  venture: { id: string; label: string };
  document: CalendarDocument;
  entries: CalendarEntryView[];
  rotation: Record<string, string> | null;
  queue: { state: "read" | "unavailable"; matched: number; unmatched: number };
  today: string;
  clock: string;
  ownDashboardUrl: string;
  sourcePath: string;
  writesConfigured: boolean;
  accent: string;
  initial: { week: string; view: CalendarView; entry: string | null; filters: CalendarFilters };
}

export function MarketingCalendarPanel(props: MarketingCalendarPanelProps) {
  const { document: initialDocument, venture, today, clock, rotation, queue, ownDashboardUrl, writesConfigured, accent } = props;
  const hydrated = useAdminHydrated();
  const [entries, setEntries] = useState(props.entries);
  const [document, setDocument] = useState(initialDocument);
  const weeks = useMemo(() => periodWeeks(document.period), [document.period]);
  const clampWeek = useCallback((monday: string) => {
    if (weeks.some((week) => week.monday === monday)) return monday;
    return monday < weeks[0]!.monday ? weeks[0]!.monday : weeks.at(-1)!.monday;
  }, [weeks]);
  const initialWeek = props.initial.week;
  const [weekMonday, setWeekMonday] = useState(() => clampWeek(initialWeek));
  const [view, setView] = useState<CalendarView>(props.initial.view);
  const [filters, setFilters] = useState<CalendarFilters>(props.initial.filters);
  const [detail, setDetail] = useState<{ type: "entry" | "ad"; id: string } | null>(
    props.initial.entry ? { type: props.initial.entry.includes("-ad-") ? "ad" : "entry", id: props.initial.entry } : null
  );

  // One URL for every state the owner might want to send himself back to. Week and entry changes
  // are history steps, so Back closes a dialog or returns to the previous week; filters replace.
  const writeUrl = useCallback((next: { week: string; view: CalendarView; entry: string | null; filters: CalendarFilters }, mode: "push" | "replace") => {
    const url = new URL(window.location.href);
    const set = (key: string, value: string | null) => (value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
    set("week", next.week);
    set("view", next.view === "month" ? "month" : null);
    set("entry", next.entry);
    for (const key of CALENDAR_FILTER_PARAMS) set(key, next.filters[key]);
    set("q", next.filters.query.trim() || null);
    set("upcoming", next.filters.upcomingOnly ? "1" : null);
    if (url.toString() === window.location.href) return;
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const query = new URLSearchParams(window.location.search);
      const state = calendarStateFromQuery(query, document.pillars.map((pillar) => pillar.id));
      const week = query.get("week");
      // No week in the address is the week the page first opened on.
      setWeekMonday(clampWeek(week && /^\d{4}-\d{2}-\d{2}$/u.test(week) ? mondayOfCalendarWeek(week) : initialWeek));
      setView(state.view);
      setFilters(state.filters);
      setDetail(state.entry ? { type: state.entry.includes("-ad-") ? "ad" : "entry", id: state.entry } : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [clampWeek, document.pillars, initialWeek]);

  const snapshot = { week: weekMonday, view, entry: detail?.id ?? null, filters };
  const go = (patch: Partial<typeof snapshot>, mode: "push" | "replace" = "push") => {
    const next = { ...snapshot, ...patch };
    if (patch.week !== undefined) setWeekMonday(next.week);
    if (patch.view !== undefined) setView(next.view);
    if (patch.filters !== undefined) setFilters(next.filters);
    if (patch.entry !== undefined) setDetail(next.entry ? { type: next.entry.includes("-ad-") ? "ad" : "entry", id: next.entry } : null);
    writeUrl(next, mode);
  };

  const visible = useMemo(() => filterCalendarEntries(entries, filters, today), [entries, filters, today]);
  const aggregates = useMemo(() => calendarAggregates(document, entries), [document, entries]);
  const phase = calendarPhase(today, document);
  const next = useMemo(() => nextUp(entries, today, clock), [entries, today, clock]);
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const platforms = useMemo(() => {
    const order = [...document.channels.map((channel) => channel.platform), ...CALENDAR_PLATFORMS]
      .filter((platform): platform is CalendarPlatform => platform !== "x");
    return [...new Set(order)].filter((platform) => entries.some((entry) => entry.platform === platform));
  }, [document.channels, entries]);
  const rows = useMemo<CalendarRow[]>(() => [
    ...platforms
      .filter((platform) => entries.some((entry) => rowKeyOf(entry) === platform))
      .map((platform) => ({
        key: platform,
        kind: "platform" as const,
        platform,
        label: CALENDAR_PLATFORM_LABELS[platform],
        handle: document.channels.find((channel) => channel.platform === platform)?.handle ?? null
      })),
    { key: "ads", kind: "ads", label: "Ads" },
    { key: "work", kind: "work", label: "Tasks & reviews" }
  ], [platforms, entries, document.channels]);
  const week = weeks.find((candidate) => candidate.monday === weekMonday) ?? weeks[0]!;
  const weekIndex = weeks.indexOf(week);
  const theme = week.planWeek ? document.weeks.find((candidate) => candidate.week === week.planWeek) : undefined;
  const todayWeek = weeks.find((candidate) => candidate.days.includes(today));
  const ads = filters.platform ? document.ads.filter((ad) => ad.platform === filters.platform) : document.ads;

  const target: CalendarDetailTarget | null = detail?.type === "ad"
    ? (() => { const ad = document.ads.find((candidate) => candidate.id === detail.id); return ad ? { type: "ad" as const, ad } : null; })()
    : detail ? (() => { const entry = entryById.get(detail.id); return entry ? { type: "entry" as const, entry } : null; })() : null;
  const order = visible.some((entry) => entry.id === detail?.id) ? visible : entries;
  const position = target?.type === "entry" ? { index: order.findIndex((entry) => entry.id === target.entry.id), total: order.length } : null;

  const open = (id: string) => {
    const entry = entryById.get(id);
    go({ entry: id, ...(entry && view === "week" ? { week: clampWeek(weeks.find((candidate) => candidate.days.includes(entry.date))?.monday ?? weekMonday) } : {}) });
  };
  const onSaved = (id: string, status: CalendarOwnerStatus, note: string | null) => {
    setEntries((current) => current.map((entry) => entry.id !== id ? entry : {
      ...entry,
      status,
      note,
      ...(entry.statusSource === "owner" ? { effectiveStatus: status } : {})
    }));
  };
  const onPrelaunch = (id: string, done: boolean) => {
    setDocument((current) => ({ ...current, prelaunch: current.prelaunch.map((item) => item.id === id ? { ...item, status: done ? "done" : "planned" } : item) }));
  };

  return (
    <div className="grid min-w-0 gap-5 print-binder" data-marketing-calendar={venture.id} style={{ "--admin-section-accent": accent } as CSSProperties}>
      {document.dropped.length ? (
        <AdminCallout data-calendar-dropped={document.dropped.length} tone="warning">
          <p className="m-0 font-semibold">{document.dropped.length} {document.dropped.length === 1 ? "record was" : "records were"} dropped from {props.sourcePath}</p>
          <ul className="m-0 mt-1 list-disc pl-5 text-[length:var(--admin-type-control)]">
            {document.dropped.map((drop) => <li key={`${drop.section}-${drop.index}`}>{drop.section}[{drop.index}]{drop.id ? ` ${drop.id}` : ""}: {drop.reason}</li>)}
          </ul>
        </AdminCallout>
      ) : null}
      <CalendarBrief document={document} phase={phase} />
      <PrelaunchCallout document={document} phase={phase} />
      <CalendarSummary aggregates={aggregates} next={next} onOpen={open} platformOrder={platforms} />

      <AdminCard data-calendar-board>
        <AdminCardHeader className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div aria-label="Calendar view" className="inline-flex rounded-[var(--admin-radius)] border border-[var(--admin-border-strong)] bg-[var(--admin-surface-secondary)] p-0.5 print:hidden" role="tablist">
              {([["week", "Week", CalendarDays], ["month", "Month", LayoutGrid]] as const).map(([value, label, Icon]) => (
                <button
                  aria-controls="calendar-view-panel"
                  aria-selected={view === value}
                  className={cn(
                    "admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] items-center gap-1.5 rounded-[var(--admin-radius-sm)] px-3 text-[length:var(--admin-type-control)] font-semibold md:min-h-[calc(var(--admin-control-height)-4px)]",
                    view === value ? "bg-[var(--admin-surface)] text-[var(--admin-foreground)] shadow-[var(--admin-shadow-card)]" : "text-[var(--admin-foreground-muted)] hover:text-[var(--admin-foreground)]"
                  )}
                  data-calendar-view-tab={value}
                  id={`calendar-tab-${value}`}
                  key={value}
                  onClick={() => go({ view: value })}
                  role="tab"
                  type="button"
                >
                  <Icon aria-hidden className="size-3.5" />{label}
                </button>
              ))}
            </div>
            {view === "week" ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2 print:hidden" data-calendar-week-nav>
                <AdminButton aria-label="Previous week" disabled={weekIndex <= 0} onClick={() => go({ week: weeks[weekIndex - 1]!.monday })} variant="secondary"><ChevronLeft aria-hidden className="size-4" /></AdminButton>
                <AdminButton disabled={todayWeek ? todayWeek.monday === week.monday : weeks[0]!.monday === week.monday} onClick={() => go({ week: todayWeek?.monday ?? weeks[0]!.monday })}>
                  {todayWeek ? "Today" : "Launch week"}
                </AdminButton>
                <AdminButton aria-label="Next week" disabled={weekIndex >= weeks.length - 1} onClick={() => go({ week: weeks[weekIndex + 1]!.monday })} variant="secondary"><ChevronRight aria-hidden className="size-4" /></AdminButton>
                <label className="sr-only" htmlFor="calendar-week-picker">Week</label>
                <AdminSelect className="w-full min-w-0 sm:w-auto sm:max-w-[24rem]" data-calendar-week-picker id="calendar-week-picker" onChange={(event) => go({ week: event.target.value })} value={week.monday}>
                  {weeks.map((candidate) => {
                    const named = document.weeks.find((item) => item.week === candidate.planWeek);
                    return <option key={candidate.monday} value={candidate.monday}>{`Week ${candidate.planWeek} · ${formatDateRange(candidate.days[0]!, candidate.days[6]!)}${named ? ` — ${named.theme}` : ""}`}</option>;
                  })}
                </AdminSelect>
              </div>
            ) : null}
          </div>
          {view === "week" ? (
            <div className="grid gap-0.5 border-l-[3px] border-[var(--admin-section-accent)] pl-3">
              <p className="m-0 text-[length:var(--admin-type-section)] font-semibold text-[var(--admin-foreground)] [overflow-wrap:anywhere]">
                Week {week.planWeek} · {formatDateRange(week.days[0]!, week.days[6]!)}{theme ? ` — ${theme.theme}` : ""}
              </p>
              {theme?.focus ? <p className="m-0 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)] [overflow-wrap:anywhere]">{theme.focus}</p> : null}
            </div>
          ) : null}
        </AdminCardHeader>
        <AdminCardContent aria-labelledby={`calendar-tab-${view}`} className="grid gap-3" id="calendar-view-panel" role="tabpanel">
          {view === "week" ? (
            <>
              <AdminTableRegion label={`Week ${week.planWeek} calendar`}>
                <CalendarWeekGrid
                  ads={ads}
                  entries={visible}
                  onOpen={open}
                  onOpenAd={(id) => go({ entry: id })}
                  period={document.period}
                  rotation={rotation}
                  rows={rows}
                  today={today}
                  week={week}
                />
              </AdminTableRegion>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]" data-calendar-legend>
                {CALENDAR_STATUSES.map((status) => <StatusPill key={status} status={status} />)}
                <span className="inline-flex items-center gap-3">
                  {(["owner", "marketingShark"] as const).map((producer) => <ProducerMark key={producer} producer={venture.id === "caught-up" && producer === "marketingShark" ? "dneskai-pack" : producer} showLabel />)}
                </span>
                <span>Arrow keys move between entries; Enter opens one.</span>
              </div>
            </>
          ) : (
            <AdminTableRegion className="border-0" label="Month overview">
              <CalendarMonthGrid ads={ads} document={document} entries={visible} onOpenWeek={(monday) => go({ view: "week", week: monday })} platforms={platforms} today={today} />
            </AdminTableRegion>
          )}
          {queue.state === "unavailable" ? (
            <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-warning)]">The Queue could not be read, so every status here is the one the plan file holds.</p>
          ) : queue.unmatched ? (
            <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{queue.unmatched} Queue {queue.unmatched === 1 ? "post has" : "posts have"} no matching entry in this plan.</p>
          ) : null}
        </AdminCardContent>
      </AdminCard>

      <CalendarPlanList
        document={document}
        entries={entries}
        filters={filters}
        onFilters={(nextFilters) => go({ filters: nextFilters }, "replace")}
        onOpen={open}
        platforms={platforms}
        today={today}
        visible={visible}
        weeks={weeks}
      />
      <CalendarPlanSections
        aggregates={aggregates}
        document={document}
        entries={entries}
        onOpen={open}
        onOpenAd={(id) => go({ entry: id })}
        onPrelaunch={onPrelaunch}
        ownDashboardUrl={ownDashboardUrl}
        today={today}
        venture={venture.id}
        writesConfigured={writesConfigured}
      />
      <p className="m-0 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">
        Source: <span className="font-mono">{props.sourcePath}</span>. The calendar publishes nothing and books nothing; {CALENDAR_PRODUCER_LABELS.owner.toLowerCase()} statuses are written back to that file, queued and published come from the Queue.
      </p>

      <CalendarEntryDetail
        accent={accent}
        document={document}
        entryById={entryById}
        onClose={() => go({ entry: null })}
        onOpen={(id) => go({ entry: id })}
        onSaved={onSaved}
        onStep={(direction) => {
          if (!position) return;
          const nextEntry = order[position.index + direction];
          if (nextEntry) go({ entry: nextEntry.id }, "replace");
        }}
        ownDashboardUrl={ownDashboardUrl}
        position={position && position.index >= 0 ? position : null}
        // The dialog portals into the body, so a deep-linked entry opens once the page has hydrated.
        target={hydrated ? target : null}
        venture={venture.id}
        writesConfigured={writesConfigured}
      />
    </div>
  );
}

