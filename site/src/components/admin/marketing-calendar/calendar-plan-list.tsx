"use client";

import { Printer, Search, X } from "lucide-react";
import { AdminButton, AdminEmptyState, AdminInput, AdminLabel, AdminSelect } from "@/components/admin/admin-primitives";
import {
  CALENDAR_KIND_LABELS,
  CALENDAR_KINDS,
  CALENDAR_PLATFORM_LABELS,
  CALENDAR_PRODUCER_LABELS,
  CALENDAR_PRODUCERS,
  CALENDAR_STATUS_LABELS,
  CALENDAR_STATUSES,
  pillarName,
  type CalendarDocument,
  type CalendarPlatform
} from "@/lib/marketing-calendar-model";
import {
  filterCounts,
  formatCalendarDate,
  formatDateRange,
  formatEffort,
  type CalendarEntryView,
  type CalendarFilters,
  type CalendarWeek
} from "@/lib/marketing-calendar-view";
import { cn } from "@/lib/utils";
import { KIND_ICONS, PlatformLabel, ProducerMark, StatusPill } from "./calendar-shared";

type SelectKey = "platform" | "kind" | "status" | "pillar" | "producer";

function FilterSelect({ id, label, value, options, counts, onChange }: {
  id: string;
  label: string;
  value: string | null;
  options: readonly { value: string; label: string }[];
  counts: Record<string, number>;
  onChange: (value: string | null) => void;
}) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return (
    <div className="min-w-0">
      <AdminLabel htmlFor={id}>{label}</AdminLabel>
      <AdminSelect data-calendar-filter={id.replace("calendar-filter-", "")} id={id} onChange={(event) => onChange(event.target.value || null)} value={value ?? ""}>
        <option value="">All ({total})</option>
        {options.map((option) => (
          <option disabled={!counts[option.value] && option.value !== value} key={option.value} value={option.value}>
            {option.label} ({counts[option.value] ?? 0})
          </option>
        ))}
      </AdminSelect>
    </div>
  );
}

function EntryRow({ entry, document, firstOfDay, onOpen }: { entry: CalendarEntryView; document: CalendarDocument; firstOfDay: boolean; onOpen: (id: string) => void }) {
  const KindIcon = KIND_ICONS[entry.kind];
  return (
    <li className={cn("border-[var(--admin-border)]", firstOfDay ? "border-t first:border-t-0" : "border-t border-dashed")} data-calendar-list-entry={entry.id} data-calendar-state={entry.effectiveStatus} data-platform={entry.platform}>
      <button
        className="admin-focus-ring grid w-full min-w-0 gap-x-4 gap-y-1.5 px-3 py-2.5 text-left hover:bg-[var(--admin-surface-hover)] md:grid-cols-[6.5rem_7.5rem_minmax(0,1fr)_5.5rem_6.5rem] md:items-start lg:grid-cols-[6.5rem_7.5rem_minmax(0,1fr)_minmax(0,11rem)_5.5rem_6.5rem] print:grid-cols-[6.5rem_7.5rem_minmax(0,1fr)_minmax(0,11rem)_5.5rem_6.5rem]"
        onClick={() => onOpen(entry.id)}
        type="button"
      >
        <span className="flex items-baseline gap-2 md:grid md:gap-0">
          {/* The date prints once per day; later rows keep it for screen readers only. */}
          <span className={cn("text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground)]", firstOfDay ? null : "sr-only")}>{formatCalendarDate(entry.date)}</span>
          <span className="admin-tabular text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{entry.time}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[length:var(--admin-type-control)] text-[var(--admin-foreground)] md:grid md:gap-0.5">
          <PlatformLabel label={CALENDAR_PLATFORM_LABELS[entry.platform]} platform={entry.platform} />
          <span className="inline-flex items-center gap-1.5 text-[var(--admin-foreground-muted)]"><KindIcon aria-hidden className="size-3.5" />{CALENDAR_KIND_LABELS[entry.kind]}</span>
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className={cn("text-[length:var(--admin-type-body)] font-semibold text-[var(--admin-foreground)] [overflow-wrap:anywhere]", entry.effectiveStatus === "skipped" ? "line-through" : null)}>{entry.title}</span>
          {entry.hook ? <span className="line-clamp-2 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)] [overflow-wrap:anywhere]">“{entry.hook}”</span> : null}
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">
            <span>{pillarName(document, entry.pillar)}</span>
            <ProducerMark producer={entry.producer} showLabel />
            {entry.note ? <span className="italic">Note: {entry.note}</span> : null}
          </span>
        </span>
        <span className="hidden text-[length:var(--admin-type-label)] leading-4 text-[var(--admin-foreground-muted)] lg:line-clamp-3 print:block [overflow-wrap:anywhere]">{entry.measure ?? "—"}</span>
        <span className="flex items-center gap-3 md:contents">
          <span className="admin-tabular text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{formatEffort(entry.effortMin) ?? "—"}</span>
          <span><StatusPill status={entry.effectiveStatus} /></span>
        </span>
      </button>
    </li>
  );
}

export function CalendarPlanList({
  document,
  entries,
  visible,
  filters,
  today,
  weeks,
  platforms,
  onFilters,
  onOpen
}: {
  document: CalendarDocument;
  /** Every entry, for the per-option counts. */
  entries: readonly CalendarEntryView[];
  /** The entries the filters leave. */
  visible: readonly CalendarEntryView[];
  filters: CalendarFilters;
  today: string;
  weeks: readonly CalendarWeek[];
  platforms: readonly CalendarPlatform[];
  onFilters: (next: CalendarFilters) => void;
  onOpen: (id: string) => void;
}) {
  const counts = (key: SelectKey) => filterCounts(entries, filters, today, key);
  const set = (key: SelectKey, value: string | null) => onFilters({ ...filters, [key]: value });
  const active = Boolean(filters.platform || filters.kind || filters.status || filters.pillar || filters.producer || filters.query || filters.upcomingOnly);
  const pillarOptions = [
    ...(entries.some((entry) => entry.pillar === "p0") ? [{ value: "p0", label: pillarName(document, "p0") }] : []),
    ...document.pillars.map((pillar) => ({ value: pillar.id, label: pillar.name })),
    ...(entries.some((entry) => entry.pillar === null) ? [{ value: "none", label: "No pillar" }] : [])
  ];
  const groups = weeks.map((week) => {
    const theme = week.planWeek ? document.weeks.find((candidate) => candidate.week === week.planWeek) : undefined;
    const items = visible.filter((entry) => week.days.includes(entry.date));
    return { week, theme, items, effort: items.reduce((sum, entry) => sum + (entry.effortMin ?? 0), 0) };
  });

  return (
    <section aria-labelledby="calendar-plan-heading" className="grid min-w-0 gap-4" data-calendar-plan id="calendar-plan">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[length:var(--admin-type-section)] font-semibold text-[var(--admin-foreground)]" id="calendar-plan-heading">The complete plan</h2>
          <p className="m-0 mt-0.5 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]" data-calendar-plan-count={visible.length}>
            {active ? `Showing ${visible.length} of ${entries.length} entries` : `All ${entries.length} posts, ads and tasks, week by week`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {active ? <AdminButton onClick={() => onFilters({ platform: null, kind: null, status: null, pillar: null, producer: null, query: "", upcomingOnly: false })} variant="ghost"><X aria-hidden className="size-3.5" />Clear filters</AdminButton> : null}
          <AdminButton onClick={() => window.print()}><Printer aria-hidden className="size-3.5" />Print</AdminButton>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-surface)] grid-cols-2 p-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))] print:hidden" data-calendar-filters>
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <AdminLabel htmlFor="calendar-filter-query">Search</AdminLabel>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--admin-foreground-subtle)]" />
            <AdminInput className="pl-8" id="calendar-filter-query" onChange={(event) => onFilters({ ...filters, query: event.target.value })} placeholder="Title, hook, body…" type="search" value={filters.query} />
          </div>
        </div>
        <FilterSelect counts={counts("platform")} id="calendar-filter-platform" label="Platform" onChange={(value) => set("platform", value)} options={platforms.map((platform) => ({ value: platform, label: CALENDAR_PLATFORM_LABELS[platform] }))} value={filters.platform} />
        <FilterSelect counts={counts("kind")} id="calendar-filter-kind" label="Kind" onChange={(value) => set("kind", value)} options={CALENDAR_KINDS.map((kind) => ({ value: kind, label: CALENDAR_KIND_LABELS[kind] }))} value={filters.kind} />
        <FilterSelect counts={counts("status")} id="calendar-filter-status" label="Status" onChange={(value) => set("status", value)} options={CALENDAR_STATUSES.map((status) => ({ value: status, label: CALENDAR_STATUS_LABELS[status] }))} value={filters.status} />
        <FilterSelect counts={counts("pillar")} id="calendar-filter-pillar" label="Pillar" onChange={(value) => set("pillar", value)} options={pillarOptions} value={filters.pillar} />
        <FilterSelect counts={counts("producer")} id="calendar-filter-producer" label="Made by" onChange={(value) => set("producer", value)} options={CALENDAR_PRODUCERS.map((producer) => ({ value: producer, label: CALENDAR_PRODUCER_LABELS[producer] }))} value={filters.producer} />
        <label className="flex min-h-[var(--admin-touch-target)] cursor-pointer items-center gap-2 text-[length:var(--admin-type-control)] font-medium text-[var(--admin-foreground)] col-span-2 lg:col-span-6 md:min-h-0">
          <input checked={filters.upcomingOnly} className="admin-focus-ring size-4 accent-[var(--admin-primary)]" data-calendar-filter="upcoming" onChange={(event) => onFilters({ ...filters, upcomingOnly: event.target.checked })} type="checkbox" />
          Only upcoming (from {formatCalendarDate(today)})
        </label>
      </div>

      {visible.length === 0 ? (
        <AdminEmptyState description="No entry matches every filter. Clear one to see more." title="No matches" />
      ) : (
        <div className="grid min-w-0 gap-4">
          {groups.filter((group) => group.items.length).map((group) => (
            <section aria-label={`Week ${group.week.planWeek ?? ""}`} className="min-w-0 overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-surface)] print:break-inside-avoid-page" data-calendar-list-week={group.week.monday} key={group.week.monday}>
              <header className="grid gap-1 border-b border-[var(--admin-border)] border-l-[3px] border-l-[var(--admin-section-accent)] bg-[var(--admin-surface-secondary)] px-3 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="m-0 text-[length:var(--admin-type-section)] font-semibold text-[var(--admin-foreground)] [overflow-wrap:anywhere]">
                    Week {group.week.planWeek} · {formatDateRange(group.week.days[0]!, group.week.days[6]!)}{group.theme ? ` — ${group.theme.theme}` : ""}
                  </h3>
                  <span className="admin-tabular text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">
                    {group.items.length} {group.items.length === 1 ? "entry" : "entries"} · {formatEffort(group.effort) ?? "0 min"}
                  </span>
                </div>
                {group.theme?.focus ? <p className="m-0 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)] [overflow-wrap:anywhere]">{group.theme.focus}</p> : null}
              </header>
              <div className="hidden gap-x-4 border-b border-[var(--admin-border)] px-3 py-1.5 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[0.06em] text-[var(--admin-foreground-muted)] md:grid md:grid-cols-[6.5rem_7.5rem_minmax(0,1fr)_5.5rem_6.5rem] lg:grid-cols-[6.5rem_7.5rem_minmax(0,1fr)_minmax(0,11rem)_5.5rem_6.5rem]" aria-hidden>
                <span>When</span><span>Channel</span><span>Entry</span><span className="hidden lg:block">Measure</span><span>Effort</span><span>Status</span>
              </div>
              <ol className="m-0 list-none p-0">
                {group.items.map((entry, index) => <EntryRow document={document} entry={entry} firstOfDay={index === 0 || group.items[index - 1]!.date !== entry.date} key={entry.id} onOpen={onOpen} />)}
              </ol>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
