import { Rocket } from "lucide-react";
import {
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminEntityBadge,
  AdminMetric,
  AdminSectionHeading,
  AdminTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableRegion
} from "@/components/admin/admin-primitives";
import {
  CALENDAR_PLATFORM_LABELS,
  type CalendarDocument,
  type CalendarPlatform
} from "@/lib/marketing-calendar-model";
import {
  formatCalendarDate,
  formatDateRange,
  formatEffort,
  type CalendarAggregates,
  type CalendarEntryView,
  type CalendarPhase
} from "@/lib/marketing-calendar-view";
import { PlatformLabel } from "./calendar-shared";

/** The long form of a date for the launch line: "Thu 5 Nov 2026". */
function launchDate(date: string): string {
  return `${formatCalendarDate(date)} ${date.slice(0, 4)}`;
}

export function phaseLine(phase: CalendarPhase, launch: string): string {
  if (phase.phase === "before") {
    return phase.daysToLaunch === 1 ? `Launch tomorrow — ${formatCalendarDate(launch)}` : `Launch in ${phase.daysToLaunch} days — ${formatCalendarDate(launch)}`;
  }
  if (phase.phase === "running") return `Day ${phase.day} of ${phase.of}`;
  return phase.daysSinceEnd === 0 ? "The plan ended today" : `The plan ended ${phase.daysSinceEnd} ${phase.daysSinceEnd === 1 ? "day" : "days"} ago`;
}

export function CalendarBrief({ document, phase }: { document: CalendarDocument; phase: CalendarPhase }) {
  return (
    <div className="grid min-w-0 gap-4" data-calendar-brief>
      <AdminCard className="border-l-[3px] border-l-[var(--admin-section-accent)]">
        <AdminCardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0">
            <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">
              Marketing plan · {document.periodDerived ? "period read from the entries" : "30 days"}
            </p>
            <h2 className="m-0 mt-1 text-[length:var(--admin-type-page)] font-semibold tracking-[var(--admin-tracking-tight)] text-[var(--admin-foreground)]">{document.name}</h2>
            {document.tagline ? <p className="m-0 mt-1 text-[length:var(--admin-type-section)] font-medium text-[var(--admin-foreground)] [overflow-wrap:anywhere]">{document.tagline}</p> : null}
            {document.description ? <p className="m-0 mt-2 max-w-3xl text-[length:var(--admin-type-body)] leading-5 text-[var(--admin-foreground-muted)] [overflow-wrap:anywhere]">{document.description}</p> : null}
            <dl className="m-0 mt-4 grid gap-4 md:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Audience</dt>
                <dd className="m-0 mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground)] [overflow-wrap:anywhere]">{document.audience || "Not stated"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Goal</dt>
                <dd className="m-0 mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground)] [overflow-wrap:anywhere]">{document.goal || "Not stated"}</dd>
              </div>
            </dl>
          </div>
          <div className="order-first flex min-w-0 flex-col gap-3 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-4 lg:order-none lg:self-start" data-calendar-launch={document.launch}>
            <div className="flex items-center gap-2 text-[var(--admin-foreground-muted)]">
              <Rocket aria-hidden className="size-4" />
              <span className="text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)]">Launch</span>
            </div>
            <p className="admin-tabular m-0 text-[length:var(--admin-type-dialog)] font-semibold text-[var(--admin-foreground)]">{launchDate(document.launch)}</p>
            <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
              Runs {formatDateRange(document.period.start, document.period.end)} {document.period.end.slice(0, 4)}
            </p>
            <p className="m-0 inline-flex w-fit items-center rounded-full border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-2.5 py-1 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground)]" data-calendar-phase={phase.phase}>
              {phaseLine(phase, document.launch)}
            </p>
          </div>
        </AdminCardContent>
      </AdminCard>

      <div className="grid min-w-0 gap-4">
        <AdminCard>
          <AdminCardHeader>
            <AdminSectionHeading description="What the month is judged on: baseline, target and where the number is read." title="KPIs" />
          </AdminCardHeader>
          {document.kpis.length ? (
            <AdminTableRegion className="rounded-none border-0" label={`${document.name} KPIs`}>
              <AdminTable className="min-w-[44rem] table-fixed">
                <thead>
                  <tr>
                    <AdminTableHead className="w-[20%]" scope="col">Metric</AdminTableHead>
                    <AdminTableHead className="w-[22%]" scope="col">Baseline</AdminTableHead>
                    <AdminTableHead className="w-[25%]" scope="col">Target</AdminTableHead>
                    <AdminTableHead scope="col">Where it is measured</AdminTableHead>
                  </tr>
                </thead>
                <tbody>
                  {document.kpis.map((kpi) => (
                    <tr className="align-top" key={kpi.name}>
                      <AdminTableCell className="py-2.5 font-semibold">{kpi.name}</AdminTableCell>
                      <AdminTableCell className="py-2.5 text-[var(--admin-foreground-muted)]">{kpi.baseline}</AdminTableCell>
                      <AdminTableCell className="py-2.5">{kpi.target}</AdminTableCell>
                      <AdminTableCell className="py-2.5 text-[var(--admin-foreground-muted)]">{kpi.how}</AdminTableCell>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            </AdminTableRegion>
          ) : (
            <AdminCardContent className="text-[var(--admin-foreground-muted)]">The plan names no KPI.</AdminCardContent>
          )}
        </AdminCard>
        <AdminCard>
          <AdminCardHeader>
            <AdminSectionHeading description="In the order the calendar rows use." title="Channels" />
          </AdminCardHeader>
          <ul className="-mb-px -mr-px m-0 flex list-none flex-wrap p-0">
            {document.channels.map((channel) => (
              <li className="grid min-w-0 flex-1 basis-[15rem] content-start gap-1 border-b border-r border-[var(--admin-border)] px-[var(--admin-card-padding)] py-3" key={`${channel.platform}-${channel.handle ?? ""}`}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--admin-foreground)]">
                    <PlatformLabel label={CALENDAR_PLATFORM_LABELS[channel.platform]} platform={channel.platform} />
                  </span>
                  <AdminEntityBadge>{channel.role}</AdminEntityBadge>
                  <span className="min-w-0 truncate text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{channel.handle ?? "handle not created yet"}</span>
                </div>
                <p className="m-0 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground)] [overflow-wrap:anywhere]">{channel.cadence}</p>
              </li>
            ))}
          </ul>
        </AdminCard>
      </div>
    </div>
  );
}

function platformSplit(aggregates: CalendarAggregates, order: readonly CalendarPlatform[]): string {
  return order
    .filter((platform) => aggregates.byPlatform[platform])
    .map((platform) => `${CALENDAR_PLATFORM_LABELS[platform]} ${aggregates.byPlatform[platform]}`)
    .join(" · ");
}

export function CalendarSummary({
  aggregates,
  platformOrder,
  next,
  onOpen
}: {
  aggregates: CalendarAggregates;
  platformOrder: readonly CalendarPlatform[];
  next: CalendarEntryView | null;
  onOpen: (id: string) => void;
}) {
  const automated = (aggregates.byProducer.marketingShark ?? 0) + (aggregates.byProducer["dneskai-pack"] ?? 0);
  return (
    <section aria-label="Plan summary" className="grid min-w-0 grid-cols-2 gap-px overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] bg-[var(--admin-border)] md:grid-cols-3 xl:grid-cols-6" data-calendar-summary>
      <AdminMetric label="Posts" note={platformSplit(aggregates, platformOrder)} value={aggregates.posts} />
      <AdminMetric label="Tasks & reviews" note={`${aggregates.total} entries in all`} value={aggregates.total - aggregates.posts} />
      <AdminMetric
        label="Ads"
        note={aggregates.ads.count ? `${aggregates.ads.count} ${aggregates.ads.count === 1 ? "test" : "tests"} · owner-paid, outside the $50 cap` : "No paid test planned"}
        value={aggregates.ads.count ? `€${aggregates.ads.totalEur.toLocaleString("en-GB")}` : "—"}
      />
      <AdminMetric
        label="Owner time a week"
        note={aggregates.effortPerDay === null ? "No effort stated" : `≈ ${formatEffort(aggregates.effortPerDay)} a day · ${automated} automated drafts`}
        value={formatEffort(aggregates.effortPerWeek) ?? "—"}
      />
      <AdminMetric
        label="Done"
        note={`${aggregates.published} of ${aggregates.posts} posts published`}
        progress={aggregates.donePercent ?? undefined}
        value={aggregates.donePercent === null ? "—" : `${aggregates.donePercent}%`}
      />
      <div className="min-w-0 bg-[var(--admin-surface)] px-4 py-3.5">
        <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Next up</p>
        {next ? (
          <button
            className="admin-focus-ring mt-1.5 grid w-full min-w-0 gap-0.5 rounded-[var(--admin-radius-sm)] text-left"
            data-calendar-next={next.id}
            onClick={() => onOpen(next.id)}
            type="button"
          >
            <span className="admin-tabular text-[length:var(--admin-type-section)] font-semibold text-[var(--admin-foreground)]">{formatCalendarDate(next.date)} · {next.time}</span>
            <span className="line-clamp-2 text-[length:var(--admin-type-label)] text-[var(--admin-link)] underline-offset-2 hover:underline">{next.title}</span>
          </button>
        ) : (
          <p className="m-0 mt-1.5 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">Nothing left to do in this plan.</p>
        )}
      </div>
    </section>
  );
}

export function PrelaunchCallout({ document, phase }: { document: CalendarDocument; phase: CalendarPhase }) {
  if (phase.phase !== "before") return null;
  const done = document.prelaunch.filter((item) => item.status === "done").length;
  const open = document.prelaunch.filter((item) => item.status !== "done");
  return (
    <AdminCallout className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" data-calendar-countdown={phase.daysToLaunch} tone="information">
      <div className="min-w-0">
        <p className="m-0 font-semibold">{phaseLine(phase, document.launch)}</p>
        <p className="m-0 mt-0.5 text-[length:var(--admin-type-control)]">
          {document.prelaunch.length
            ? `${done} of ${document.prelaunch.length} pre-launch tasks done.${open[0] ? ` Next due ${formatCalendarDate(open[0].due)}: ${open[0].title}.` : " Everything before launch is ticked."}`
            : "The plan lists no pre-launch tasks."}
        </p>
      </div>
      {document.prelaunch.length ? (
        <a className="admin-focus-ring rounded-[var(--admin-radius-sm)] text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-link)] underline underline-offset-2" href="#calendar-prelaunch">
          Open the checklist
        </a>
      ) : null}
    </AdminCallout>
  );
}
