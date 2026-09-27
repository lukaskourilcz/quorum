"use client";

import { useState } from "react";
import { ArrowUpRight, Lightbulb } from "lucide-react";
import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminEntityBadge,
  AdminSectionHeading,
  AdminTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableRegion
} from "@/components/admin/admin-primitives";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import { CALENDAR_PLATFORM_LABELS, repoIssueHref, type CalendarDocument, type CalendarPrelaunchItem } from "@/lib/marketing-calendar-model";
import { formatCalendarDate, formatDateRange, type CalendarAggregates, type CalendarEntryView } from "@/lib/marketing-calendar-view";
import { cn } from "@/lib/utils";
import { StatusPill } from "./calendar-shared";

const link = "admin-focus-ring rounded-[var(--admin-radius-sm)] text-[var(--admin-link)] underline-offset-2 hover:underline";

function Section({ id, title, description, children, className }: { id: string; title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <AdminCard className={cn("scroll-mt-4 print:break-inside-avoid-page", className)} data-calendar-section={id} id={`calendar-${id}`}>
      <AdminCardHeader><AdminSectionHeading description={description} title={title} /></AdminCardHeader>
      {children}
    </AdminCard>
  );
}

function PrelaunchRow({ item, venture, writesConfigured, today, onToggled }: {
  item: CalendarPrelaunchItem;
  venture: string;
  writesConfigured: boolean;
  today: string;
  onToggled: (id: string, done: boolean) => void;
}) {
  const writable = useAdminWritesEnabled();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = item.status === "done";
  const overdue = !done && item.due < today;
  const href = repoIssueHref(item.repo, item.issue);

  async function toggle(next: boolean) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/admin/api/marketing-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venture, action: "prelaunch", id: item.id, done: next })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Not saved (${response.status}).`);
        return;
      }
      onToggled(item.id, next);
    } catch {
      setError("The admin could not be reached. Nothing was saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="grid gap-1 border-b border-[var(--admin-border)] px-[var(--admin-card-padding)] py-3 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:gap-3" data-calendar-prelaunch={item.id} data-calendar-state={item.status}>
      <input
        aria-describedby={`prelaunch-${item.id}-detail`}
        aria-label={`${item.title} done`}
        checked={done}
        className="admin-focus-ring mt-0.5 size-4 accent-[var(--admin-primary)] disabled:cursor-not-allowed"
        disabled={!writable || pending}
        onChange={(event) => toggle(event.target.checked)}
        title={writesConfigured ? undefined : "GitHub writing is not configured for this admin, so the checklist is read-only here."}
        type="checkbox"
      />
      <div className="min-w-0">
        <p className={cn("m-0 font-semibold text-[var(--admin-foreground)] [overflow-wrap:anywhere]", done ? "text-[var(--admin-foreground-muted)] line-through" : null)}>{item.title}</p>
        <p className="m-0 mt-0.5 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)] [overflow-wrap:anywhere]" id={`prelaunch-${item.id}-detail`}>{item.detail}</p>
        {error ? <p className="m-0 mt-1 text-[length:var(--admin-type-control)] text-[var(--admin-destructive)]" role="alert">{error}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className={cn("admin-tabular text-[length:var(--admin-type-control)]", overdue ? "font-semibold text-[var(--admin-warning)]" : "text-[var(--admin-foreground-muted)]")}>
          {overdue ? "Overdue · " : "Due "}{formatCalendarDate(item.due)}
        </span>
        <AdminEntityBadge>{item.owner === "agent" ? "Agent" : "Owner"}</AdminEntityBadge>
        {href ? <a className={cn(link, "inline-flex items-center gap-0.5 text-[length:var(--admin-type-control)]")} href={href} rel="noreferrer" target="_blank">{item.repo?.split("/")[1]}{item.issue ?? ""}<ArrowUpRight aria-hidden className="size-3" /></a> : null}
      </div>
    </li>
  );
}

export function CalendarPlanSections({
  document,
  entries,
  aggregates,
  today,
  venture,
  writesConfigured,
  ownDashboardUrl,
  onOpen,
  onOpenAd,
  onPrelaunch
}: {
  document: CalendarDocument;
  entries: readonly CalendarEntryView[];
  aggregates: CalendarAggregates;
  today: string;
  venture: string;
  writesConfigured: boolean;
  ownDashboardUrl: string;
  onOpen: (id: string) => void;
  onOpenAd: (id: string) => void;
  onPrelaunch: (id: string, done: boolean) => void;
}) {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const done = document.prelaunch.filter((item) => item.status === "done").length;
  return (
    <div className="grid min-w-0 gap-4" data-calendar-sections>
      <Section description="Owner-paid and outside the $50 cap. The calendar shows each test; it never books one." id="ads" title={`Ads · €${aggregates.ads.totalEur.toLocaleString("en-GB")} in all`}>
        {document.ads.length ? (
          <AdminTableRegion className="rounded-none border-0" label="Ad tests">
            <AdminTable className="min-w-[56rem]">
              <thead>
                <tr>
                  <AdminTableHead scope="col">Dates</AdminTableHead>
                  <AdminTableHead scope="col">Budget</AdminTableHead>
                  <AdminTableHead scope="col">Objective and audience</AdminTableHead>
                  <AdminTableHead scope="col">Creative</AdminTableHead>
                  <AdminTableHead scope="col">Stop rule</AdminTableHead>
                  <AdminTableHead scope="col">Policy</AdminTableHead>
                </tr>
              </thead>
              <tbody>
                {document.ads.map((ad) => {
                  const boosted = ad.creativeEntryId ? entryById.get(ad.creativeEntryId) : undefined;
                  return (
                    <tr className="align-top" data-calendar-ad-row={ad.id} key={ad.id}>
                      <AdminTableCell className="py-2.5">
                        <button className={cn(link, "font-semibold")} onClick={() => onOpenAd(ad.id)} type="button">{formatDateRange(ad.start, ad.end)}</button>
                        <p className="m-0 mt-1 text-[var(--admin-foreground-muted)]">{CALENDAR_PLATFORM_LABELS[ad.platform]} · {ad.days} days</p>
                        <StatusPill className="mt-1" status={ad.status} />
                      </AdminTableCell>
                      <AdminTableCell className="admin-tabular py-2.5 whitespace-nowrap">€{ad.dailyBudgetEur}/day<p className="m-0 mt-1 font-semibold">€{ad.totalEur}</p></AdminTableCell>
                      <AdminTableCell className="py-2.5"><p className="m-0 font-semibold">{ad.objective}</p><p className="m-0 mt-1 text-[var(--admin-foreground-muted)]">{ad.audience}</p></AdminTableCell>
                      <AdminTableCell className="py-2.5">
                        {boosted ? <button className={cn(link, "text-left font-semibold")} onClick={() => onOpen(boosted.id)} type="button">{boosted.title}</button> : null}
                        <p className="m-0 mt-1 text-[var(--admin-foreground-muted)]">{ad.creative}</p>
                      </AdminTableCell>
                      <AdminTableCell className="py-2.5">{ad.successRule}</AdminTableCell>
                      <AdminTableCell className="py-2.5 text-[var(--admin-foreground-muted)]">{ad.policyNotes}</AdminTableCell>
                    </tr>
                  );
                })}
              </tbody>
            </AdminTable>
          </AdminTableRegion>
        ) : <AdminCardContent className="text-[var(--admin-foreground-muted)]">No paid test is planned.</AdminCardContent>}
      </Section>

      {document.prelaunch.length ? (
        <Section description={`${done} of ${document.prelaunch.length} done. Product work links the issue that delivers it.`} id="prelaunch" title="Pre-launch checklist">
          <ol className="m-0 list-none p-0">
            {document.prelaunch.map((item) => <PrelaunchRow item={item} key={item.id} onToggled={onPrelaunch} today={today} venture={venture} writesConfigured={writesConfigured} />)}
          </ol>
        </Section>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Section description="Every Sunday, and the rule each one decides by." id="reviews" title="Reviews">
          <ol className="m-0 list-none p-0">
            {document.reviews.map((review) => {
              const entry = entries.find((candidate) => candidate.date === review.date && candidate.kind === "review");
              return (
                <li className="grid gap-1 border-b border-[var(--admin-border)] px-[var(--admin-card-padding)] py-3 last:border-b-0" key={review.date}>
                  {entry ? <button className={cn(link, "w-fit font-semibold")} onClick={() => onOpen(entry.id)} type="button">{formatCalendarDate(review.date)}</button> : <span className="font-semibold">{formatCalendarDate(review.date)}</span>}
                  <p className="m-0 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground)] [overflow-wrap:anywhere]">{review.what}</p>
                </li>
              );
            })}
          </ol>
        </Section>

        <Section description="Planned share against the entries the plan actually gives each pillar." id="pillars" title="Pillars">
          <ul className="m-0 list-none p-0">
            {document.pillars.map((pillar) => {
              const count = aggregates.byPillar[pillar.id] ?? 0;
              const actual = aggregates.total ? Math.round((count / aggregates.total) * 100) : null;
              return (
                <li className="grid gap-1.5 border-b border-[var(--admin-border)] px-[var(--admin-card-padding)] py-3 last:border-b-0" data-calendar-pillar={pillar.id} key={pillar.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-[var(--admin-foreground)]">{pillar.name}</span>
                    <span className="admin-tabular text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">planned {pillar.share || "—"} · {count} entries{actual === null ? "" : ` (${actual}%)`}</span>
                  </div>
                  <div aria-hidden className="relative h-1.5 overflow-hidden rounded-full bg-[var(--admin-surface-muted)]">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--admin-section-accent)] opacity-40" style={{ width: `${Math.min(100, pillar.shareValue ?? 0)}%` }} />
                    <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--admin-section-accent)]" style={{ width: `${Math.min(100, actual ?? 0)}%` }} />
                  </div>
                  <p className="m-0 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)] [overflow-wrap:anywhere]">{pillar.description}</p>
                  {pillar.tipRefs.length ? (
                    <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
                      {pillar.tipRefs.map((tip) => (
                        <li className="min-w-0" key={tip}>
                          <a className={cn(link, "inline-flex items-start gap-1 text-[length:var(--admin-type-label)]")} href={`${ownDashboardUrl}/ig-tips?q=${encodeURIComponent(tip)}`} rel="noreferrer" target="_blank"><Lightbulb aria-hidden className="mt-px size-3 shrink-0" />{tip}</a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        {document.profileSetup.length ? (
          <Section description="One-off work on the profiles before the first post." id="profile-setup" title="Profile setup">
            <ul className="m-0 grid list-disc gap-1.5 py-3 pl-8 pr-[var(--admin-card-padding)] text-[length:var(--admin-type-control)] leading-5 [overflow-wrap:anywhere]">
              {document.profileSetup.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </Section>
        ) : null}
        <Section id="risks" title="Risks">
          <ul className="m-0 grid list-disc gap-1.5 py-3 pl-8 pr-[var(--admin-card-padding)] text-[length:var(--admin-type-control)] leading-5 [overflow-wrap:anywhere]">
            {document.risks.map((risk) => <li key={risk}>{risk}</li>)}
          </ul>
        </Section>
      </div>

      <Section description="Product changes the plan leans on, with the issue that delivers each." id="dependencies" title="Product dependencies">
        <ul className="m-0 list-none p-0">
          {document.productDependencies.map((dependency) => (
            <li className="grid gap-1 border-b border-[var(--admin-border)] px-[var(--admin-card-padding)] py-3 last:border-b-0" key={`${dependency.repo}-${dependency.what}`}>
              <div className="flex flex-wrap items-center gap-2">
                {dependency.href ? <a className={cn(link, "inline-flex items-center gap-0.5 font-semibold")} href={dependency.href} rel="noreferrer" target="_blank">{dependency.repo}{dependency.issue ?? ""}<ArrowUpRight aria-hidden className="size-3" /></a> : <span className="font-semibold">{dependency.repo}</span>}
              </div>
              <p className="m-0 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground)] [overflow-wrap:anywhere]">{dependency.what}</p>
              {dependency.why ? <p className="m-0 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)] [overflow-wrap:anywhere]">Why: {dependency.why}</p> : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section description="What the plan rests on; each note says whether it was verified or is a claim." id="sources" title={`Sources · ${document.sources.length}`}>
        <ol className="m-0 grid list-none p-0 md:grid-cols-2">
          {document.sources.map((source) => (
            <li className="grid gap-0.5 border-b border-[var(--admin-border)] px-[var(--admin-card-padding)] py-2.5 md:odd:border-r" key={`${source.title}-${source.url ?? ""}`}>
              {source.url ? <a className={cn(link, "font-semibold [overflow-wrap:anywhere]")} href={source.url} rel="noreferrer" target="_blank">{source.title}</a> : <span className="font-semibold">{source.title}</span>}
              <p className="m-0 text-[length:var(--admin-type-label)] leading-4 text-[var(--admin-foreground-muted)] [overflow-wrap:anywhere]">{source.checked ? `Checked ${source.checked}. ` : ""}{source.note}</p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
