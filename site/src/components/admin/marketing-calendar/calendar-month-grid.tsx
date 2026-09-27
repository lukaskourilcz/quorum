"use client";

import { ClipboardCheck, Megaphone } from "lucide-react";
import { CALENDAR_PLATFORM_LABELS, type CalendarAd, type CalendarDocument, type CalendarPlatform } from "@/lib/marketing-calendar-model";
import {
  formatCalendarDate,
  formatDateRange,
  formatEffort,
  periodWeeks,
  type CalendarEntryView
} from "@/lib/marketing-calendar-view";
import { cn } from "@/lib/utils";
import { PLATFORM_ICONS } from "./calendar-shared";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The whole period at once: one row per week, a count per platform in each day, the ad and the
 * review days marked. A day opens its week in the week view; a week label does the same.
 */
export function CalendarMonthGrid({
  document,
  entries,
  ads,
  today,
  platforms,
  onOpenWeek
}: {
  document: CalendarDocument;
  entries: readonly CalendarEntryView[];
  ads: readonly CalendarAd[];
  today: string;
  platforms: readonly CalendarPlatform[];
  onOpenWeek: (monday: string, day?: string) => void;
}) {
  const weeks = periodWeeks(document.period);
  const reviewDays = new Set(document.reviews.map((review) => review.date));
  return (
    <div className="grid min-w-0 gap-3" data-calendar-month>
      <ul aria-label="Legend" className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">
        {platforms.map((platform) => {
          const Icon = PLATFORM_ICONS[platform];
          return <li className="inline-flex items-center gap-1" key={platform}><Icon aria-hidden className="size-3.5" />{CALENDAR_PLATFORM_LABELS[platform]}</li>;
        })}
        <li className="inline-flex items-center gap-1"><Megaphone aria-hidden className="size-3.5" />Ad running</li>
        <li className="inline-flex items-center gap-1"><ClipboardCheck aria-hidden className="size-3.5" />Review day</li>
      </ul>
      <div className="grid min-w-[44rem] grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-border)] [gap:1px]" role="table" aria-label={`${document.name}, ${formatDateRange(document.period.start, document.period.end)}`}>
        <div className="contents" role="row">
          <div className="bg-[var(--admin-surface-secondary)] px-2 py-1.5 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[0.06em] text-[var(--admin-foreground-muted)]" role="columnheader">Week</div>
          {WEEKDAYS.map((day) => (
            <div className="bg-[var(--admin-surface-secondary)] px-2 py-1.5 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[0.06em] text-[var(--admin-foreground-muted)]" key={day} role="columnheader">{day}</div>
          ))}
        </div>
        {weeks.map((week) => (
          <div className="contents" key={week.monday} role="row">
            <div className="bg-[var(--admin-surface)] p-1" role="rowheader">
              <button
                className="admin-focus-ring flex h-full w-full flex-col items-start justify-start gap-0.5 rounded-[var(--admin-radius-sm)] px-1.5 py-1 text-left hover:bg-[var(--admin-surface-hover)]"
                onClick={() => onOpenWeek(week.monday)}
                type="button"
              >
                <span className="text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground)]">Week {week.planWeek}</span>
                <span className="text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{formatDateRange(week.days[0]!, week.days[6]!)}</span>
              </button>
            </div>
            {week.days.map((day) => {
              const inPeriod = day >= document.period.start && day <= document.period.end;
              const dayEntries = entries.filter((entry) => entry.date === day);
              const effort = dayEntries.reduce((sum, entry) => sum + (entry.effortMin ?? 0), 0);
              const adRunning = ads.some((ad) => ad.start <= day && ad.end >= day);
              const counts = platforms.map((platform) => [platform, dayEntries.filter((entry) => entry.platform === platform).length] as const).filter(([, count]) => count > 0);
              const label = `${formatCalendarDate(day)}: ${dayEntries.length} ${dayEntries.length === 1 ? "entry" : "entries"}${counts.length ? ` (${counts.map(([platform, count]) => `${CALENDAR_PLATFORM_LABELS[platform]} ${count}`).join(", ")})` : ""}${adRunning ? ", ad running" : ""}${reviewDays.has(day) ? ", review day" : ""}`;
              return (
                <div className={cn("min-h-24 p-1", inPeriod ? "bg-[var(--admin-surface)]" : "bg-[var(--admin-surface-secondary)]")} data-calendar-month-day={day} key={day} role="cell">
                  {inPeriod ? (
                    <button
                      aria-current={day === today ? "date" : undefined}
                      aria-label={label}
                      className={cn(
                        "admin-focus-ring flex h-full w-full flex-col gap-1.5 rounded-[var(--admin-radius-sm)] px-1.5 py-1 text-left hover:bg-[var(--admin-surface-hover)]",
                        day === today ? "bg-[var(--admin-surface-selected)] ring-1 ring-[var(--admin-brand)]" : null
                      )}
                      onClick={() => onOpenWeek(week.monday, day)}
                      type="button"
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span className={cn("admin-tabular text-[length:var(--admin-type-control)] font-semibold", day === today ? "text-[var(--admin-foreground)]" : "text-[var(--admin-foreground)]")}>{Number(day.slice(8))}{day.slice(8) === "01" || day === document.period.start ? ` ${formatCalendarDate(day).split(" ")[2]}` : ""}</span>
                        <span className="flex items-center gap-0.5 text-[var(--admin-foreground-muted)]">
                          {adRunning ? <Megaphone aria-hidden className="size-3" /> : null}
                          {reviewDays.has(day) ? <ClipboardCheck aria-hidden className="size-3" /> : null}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {counts.map(([platform, count]) => {
                          const Icon = PLATFORM_ICONS[platform];
                          return (
                            <span className="admin-tabular inline-flex items-center gap-0.5 text-[length:var(--admin-type-label)] text-[var(--admin-foreground)]" key={platform}>
                              <Icon aria-hidden className="size-3 text-[var(--admin-foreground-muted)]" />
                              {count}
                            </span>
                          );
                        })}
                      </span>
                      {effort ? <span className="mt-auto text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-muted)]">{formatEffort(effort)}</span> : null}
                    </button>
                  ) : (
                    <span className="block px-1.5 py-1 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-subtle)]">{Number(day.slice(8))}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {document.weeks.length ? (
        <ol className="m-0 grid list-none gap-2 p-0 md:grid-cols-2 xl:grid-cols-3" aria-label="Week themes">
          {document.weeks.map((week) => {
            const target = weeks[week.week - 1];
            return (
              <li className="min-w-0 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3" key={week.week}>
                <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Week {week.week} · {week.dates}</p>
                {target ? (
                  <button className="admin-focus-ring mt-1 rounded-[var(--admin-radius-sm)] text-left text-[length:var(--admin-type-body)] font-semibold text-[var(--admin-link)] underline-offset-2 hover:underline [overflow-wrap:anywhere]" onClick={() => onOpenWeek(target.monday)} type="button">{week.theme}</button>
                ) : <p className="m-0 mt-1 font-semibold">{week.theme}</p>}
                <p className="m-0 mt-1 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)] [overflow-wrap:anywhere]">{week.focus}</p>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
