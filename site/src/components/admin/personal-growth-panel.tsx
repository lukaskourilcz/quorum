import Link from "next/link";
import {
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminEmptyState,
  AdminEntityBadge,
  AdminMetric,
  AdminSectionHeading,
  AdminStateMessage,
  AdminStatusBadge,
  AdminTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableRegion
} from "./admin-primitives";
import {
  PersonalGrowthAnchorForm,
  PersonalGrowthThreadActions,
  PersonalGrowthTimelineAction
} from "./personal-growth-actions";
import {
  PersonalGrowthBudgetModeForm,
  PersonalGrowthDisableCapability,
  PersonalGrowthExperimentActions,
  PersonalGrowthExperimentCreateForm,
  PersonalGrowthPillarForm,
  PersonalGrowthPolicyForm,
  PersonalGrowthResultCorrectionForm,
  PersonalGrowthResultCreateForm,
  PersonalGrowthSettingsForm
} from "./personal-growth-insight-actions";
import type {
  AdminPersonalGrowthSnapshot,
  PersonalGrowthCoreTab,
  PersonalGrowthTimelineStatus
} from "@/lib/admin-personal-growth";

const statusTone: Readonly<Record<PersonalGrowthTimelineStatus, "information" | "success" | "warning" | "risk" | "neutral">> = {
  due: "information",
  upcoming: "neutral",
  overdue: "risk",
  completed: "success",
  skipped: "warning",
  rescheduled: "information"
};

function displayDate(value: string | null): string {
  if (!value) return "Unavailable";
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00.000Z`));
}

function percent(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }).format(value);
}

function usd(value: number | null): string {
  return value === null ? "Unavailable" : `$${value.toFixed(2)}`;
}

function CoreCard({
  title,
  note,
  children
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <AdminCard>
      <AdminCardHeader><AdminSectionHeading actions={note ? <AdminEntityBadge>{note}</AdminEntityBadge> : undefined} title={title} /></AdminCardHeader>
      <AdminCardContent>{children}</AdminCardContent>
    </AdminCard>
  );
}

export function PersonalGrowthOverview({ snapshot }: { snapshot: AdminPersonalGrowthSnapshot }) {
  const trend = snapshot.overview.latestGoViral;
  return (
    <AdminCard className="border-[var(--admin-section-accent)]" data-personal-growth-overview>
      <AdminCardHeader>
        <AdminSectionHeading
          actions={<Link className="admin-focus-ring rounded-[var(--admin-radius)] px-2 py-1 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-information)]" href="/admin?venture=personal-growth&tab=today">Open desk →</Link>}
          description="Owner-only planning. No company-venture scan, publishing or generated OKRAJ/BBARAK prose."
          title="Lukáš Growth Desk"
        />
      </AdminCardHeader>
      <AdminCardContent className="grid min-w-0 gap-4">
        <AdminCallout tone="information">
          <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)]">What should I do next?</p>
          <p className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold">{snapshot.today.nextAction.title}</p>
          <p className="m-0 mt-1 text-[length:var(--admin-type-control)]">{snapshot.today.nextAction.why}</p>
        </AdminCallout>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-border)] md:grid-cols-4">
          <AdminMetric label="Next OKRAJ" note="10-day owner-authored anchor" value={displayDate(snapshot.overview.nextOkrajDeadline)} />
          <AdminMetric label="Next BBARAK" note="3-day owner-authored anchor" value={displayDate(snapshot.overview.nextBbarakDeadline)} />
          <AdminMetric label="Personal mix" note="85% minimum" progress={snapshot.today.personalRatio * 100} value={percent(snapshot.today.personalRatio)} />
          <AdminMetric label="Monthly headroom" note={`of $${snapshot.overview.monthlyCapUsd.toFixed(2)} nested cap`} progress={snapshot.overview.monthlySpendUsd === null ? undefined : (snapshot.overview.monthlySpendUsd / snapshot.overview.monthlyCapUsd) * 100} value={usd(snapshot.overview.monthlyHeadroomUsd)} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-3">
            <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Threads preview</p>
            <p className="m-0 mt-2 line-clamp-3 text-[length:var(--admin-type-body)] text-[var(--admin-foreground)]">{snapshot.threads.primary?.text ?? snapshot.threads.noPostReason ?? "Unavailable"}</p>
          </div>
          <div className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-3">
            <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Latest accepted GoVIRAL intelligence</p>
            <p className="m-0 mt-2 text-[length:var(--admin-type-body)] text-[var(--admin-foreground)]">{trend ? `${trend.disposition.toUpperCase()} · ${trend.pillar} · ${trend.format}` : "No accepted packet is available."}</p>
          </div>
        </div>
        {snapshot.today.overdueCount ? <AdminStateMessage description={`${snapshot.today.overdueCount} owner-authored recurrence ${snapshot.today.overdueCount === 1 ? "is" : "are"} overdue.`} state="held" title="Timeline needs attention" /> : null}
      </AdminCardContent>
    </AdminCard>
  );
}

function Today({ snapshot }: { snapshot: AdminPersonalGrowthSnapshot }) {
  const manual = snapshot.manualReferences[0] ?? null;
  return (
    <div className="grid min-w-0 gap-4" data-personal-growth-tab="today">
      <AdminCallout tone="information">
        <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)]">What should I do next?</p>
        <h2 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold">{snapshot.today.nextAction.title}</h2>
        <p className="m-0 mt-1">{snapshot.today.nextAction.why}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <AdminEntityBadge>{snapshot.today.nextAction.provenance === "goviral" ? "Accepted GoVIRAL intelligence" : "Owner/private input"}</AdminEntityBadge>
          <AdminEntityBadge>{snapshot.today.nextAction.dueWindow ? `Due ${displayDate(snapshot.today.nextAction.dueWindow)}` : "No due date"}</AdminEntityBadge>
        </div>
      </AdminCallout>
      <div className="grid gap-4 lg:grid-cols-2">
        <CoreCard note={snapshot.threads.decision} title="Threads">
          <p className="m-0 text-[length:var(--admin-type-body)] leading-relaxed">{snapshot.threads.primary?.text ?? snapshot.threads.noPostReason ?? "No readable suggestion."}</p>
          {snapshot.threads.primary ? <p className="m-0 mt-2 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{snapshot.threads.primary.selectionReason}</p> : null}
        </CoreCard>
        <CoreCard note={snapshot.instagram.actionType ?? "unavailable"} title="Instagram">
          <p className="m-0 text-[length:var(--admin-type-body)] leading-relaxed">{snapshot.instagram.reason ?? "No owner-grounded recommendation is recorded."}</p>
          {snapshot.instagram.dueWindow ? <p className="m-0 mt-2 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">Due {displayDate(snapshot.instagram.dueWindow)}</p> : null}
        </CoreCard>
        <CoreCard note={snapshot.reels.find(({ state }) => state === "recommended") ? "recommended" : "inventory only"} title="Selected Reel">
          {snapshot.reels.find(({ state }) => state === "recommended") ? (
            <p className="m-0 text-[length:var(--admin-type-body)]">{snapshot.reels.find(({ state }) => state === "recommended")!.concept}</p>
          ) : <p className="m-0 text-[length:var(--admin-type-body)] text-[var(--admin-foreground-muted)]">No owner-grounded Reel is selected. NO_POST remains valid.</p>}
        </CoreCard>
        <CoreCard note={`${percent(snapshot.today.personalRatio)} personal`} title="Content policy">
          <p className="m-0 text-[length:var(--admin-type-body)]">At least 85% stays personal or personally authored. The remaining allowance is available only for bounded owner-manual references.</p>
          {snapshot.today.personalRatio < 0.85 ? <AdminStateMessage className="mt-3" state="held" title="The next venture-led item is blocked by the 85/15 floor." /> : null}
        </CoreCard>
      </div>
      <CoreCard note={manual ? manual.verdict : "no owner input"} title="Owner-manual venture reference">
        {manual ? (
          <div className="grid gap-2">
            <p className="m-0 font-semibold">{manual.sourceProject} · {manual.publicItemId}</p>
            <p className="m-0 text-[length:var(--admin-type-body)]">{manual.ownerCommentaryNote}</p>
            <a className="admin-focus-ring w-fit text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-information)]" href={manual.publicUrl} rel="noreferrer" target="_blank">Open owner-supplied public reference ↗</a>
          </div>
        ) : <AdminEmptyState description="Personal Growth does not scan company projects. A venture reference appears only after bounded owner input." title="No manual reference supplied" />}
      </CoreCard>
      <AdminStateMessage
        description={`Budget degradation is ${snapshot.today.budgetDegradation}. Publishing, replying and purchases remain disabled.`}
        state={snapshot.today.budgetDegradation === "healthy" ? "success" : "held"}
        title={snapshot.overview.monthlyHeadroomUsd === null ? "Recorded spend is unavailable" : `${usd(snapshot.overview.monthlyHeadroomUsd)} remains under the $20.00 nested cap`}
      />
    </div>
  );
}

function Timeline({ snapshot }: { snapshot: AdminPersonalGrowthSnapshot }) {
  return (
    <div className="grid min-w-0 gap-4" data-personal-growth-tab="timeline">
      <CoreCard note={`${displayDate(snapshot.timeline.rangeStart)}–${displayDate(snapshot.timeline.rangeEnd)}`} title="Thirty-day owner timeline">
        <div className="grid gap-3">
          {snapshot.timeline.anchors.map((anchor) => <PersonalGrowthAnchorForm currentDate={anchor.date} key={anchor.lane} lane={anchor.lane} />)}
        </div>
      </CoreCard>
      {snapshot.timeline.warnings.length ? <AdminStateMessage description={snapshot.timeline.warnings.join(" · ")} state="held" title="Timeline warning" /> : null}
      <AdminTableRegion label="Personal Growth recurring timeline">
        <AdminTable>
          <thead><tr><AdminTableHead>Lane</AdminTableHead><AdminTableHead>Scheduled</AdminTableHead><AdminTableHead>Status</AdminTableHead><AdminTableHead>History</AdminTableHead></tr></thead>
          <tbody>
            {snapshot.timeline.occurrences.map((occurrence) => (
              <tr key={occurrence.occurrenceId}>
                <AdminTableCell className="font-semibold uppercase">{occurrence.lane}</AdminTableCell>
                <AdminTableCell><span className="admin-tabular">{displayDate(occurrence.scheduledDate)}</span>{occurrence.originalDate !== occurrence.scheduledDate ? <span className="block text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-muted)]">from {displayDate(occurrence.originalDate)}</span> : null}</AdminTableCell>
                <AdminTableCell><AdminStatusBadge tone={statusTone[occurrence.status]}>{occurrence.status}</AdminStatusBadge></AdminTableCell>
                <AdminTableCell>{occurrence.source === "reschedule" ? "Correction preserved" : "10/3-day recurrence"}</AdminTableCell>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      </AdminTableRegion>
      <div className="grid gap-3 lg:grid-cols-2">
        {snapshot.timeline.occurrences.filter(({ status }) => !["completed", "skipped"].includes(status)).slice(0, 8).map((occurrence) => (
          <div className="grid gap-2" key={`action-${occurrence.occurrenceId}`}>
            <p className="m-0 text-[length:var(--admin-type-control)] font-semibold">{occurrence.lane.toUpperCase()} · {displayDate(occurrence.scheduledDate)}</p>
            <PersonalGrowthTimelineAction lane={occurrence.lane} occurrenceDate={occurrence.originalDate} />
          </div>
        ))}
      </div>
      <CoreCard note="deterministic ten-day rhythm" title="Personal, Story and Reel opportunities">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.timeline.rhythmOpportunities.map((opportunity) => (
            <div className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-3" key={opportunity.id}>
              <div className="flex items-center justify-between gap-2"><AdminEntityBadge>{opportunity.kind}</AdminEntityBadge><span className="admin-tabular text-[length:var(--admin-type-micro)]">{displayDate(opportunity.date)}</span></div>
              <p className="m-0 mt-2 text-[length:var(--admin-type-control)]">{opportunity.reason}</p>
            </div>
          ))}
        </div>
      </CoreCard>
    </div>
  );
}

function Suggestion({ suggestion, primary }: { suggestion: NonNullable<AdminPersonalGrowthSnapshot["threads"]["primary"]>; primary: boolean }) {
  return (
    <CoreCard note={primary ? "primary" : "alternative"} title={`${suggestion.language.toUpperCase()} · ${suggestion.personalPillar}`}>
      <blockquote className="m-0 whitespace-pre-wrap rounded-[var(--admin-radius)] bg-[var(--admin-surface-inset)] p-4 text-[length:var(--admin-type-body)] leading-relaxed">{suggestion.text}</blockquote>
      <div className="mt-3 flex flex-wrap gap-2">
        <AdminEntityBadge>{suggestion.characterCount} characters</AdminEntityBadge>
        <AdminEntityBadge>{suggestion.sourceLane}</AdminEntityBadge>
        <AdminEntityBadge>similarity {suggestion.recentSimilarity.toFixed(2)} · pass</AdminEntityBadge>
        {suggestion.topicTag ? <AdminEntityBadge>{suggestion.topicTag}</AdminEntityBadge> : null}
        {suggestion.goviralSignalId ? <AdminEntityBadge>GoVIRAL · {suggestion.goviralSignalId}</AdminEntityBadge> : null}
      </div>
      <dl className="mt-3 grid gap-2 text-[length:var(--admin-type-control)] sm:grid-cols-2">
        <div><dt className="font-semibold">Why</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{suggestion.selectionReason}</dd></div>
        <div><dt className="font-semibold">Conversation purpose</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{suggestion.conversationPurpose}</dd></div>
      </dl>
      {primary ? <div className="mt-4"><PersonalGrowthThreadActions suggestionId={suggestion.suggestionId} text={suggestion.text} /></div> : null}
    </CoreCard>
  );
}

function Threads({ snapshot }: { snapshot: AdminPersonalGrowthSnapshot }) {
  return (
    <div className="grid min-w-0 gap-4" data-personal-growth-tab="threads">
      {!snapshot.threads.primary ? (
        <AdminStateMessage description={snapshot.threads.noPostReason ?? "No owner-grounded candidate is recorded."} state={snapshot.threads.state === "unreadable" ? "malformed" : "unavailable"} title={snapshot.threads.decision === "HELD" ? "Threads recommendation held" : "No Threads recommendation"} />
      ) : <Suggestion primary suggestion={snapshot.threads.primary} />}
      {snapshot.threads.alternatives.map((suggestion) => <Suggestion key={suggestion.suggestionId} primary={false} suggestion={suggestion} />)}
      <CoreCard note={snapshot.threads.conversationStatus} title="Public conversation opportunities">
        {snapshot.threads.conversationOpportunities.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {snapshot.threads.conversationOpportunities.map((opportunity) => <li className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3" key={opportunity.opportunityId}><a className="admin-focus-ring font-semibold text-[var(--admin-information)]" href={opportunity.publicUrl} rel="noreferrer" target="_blank">{opportunity.purpose} ↗</a><p className="m-0 mt-1 text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-muted)]">{opportunity.provider} · manual reply only · expires {displayDate(opportunity.expiresAt.slice(0, 10))}</p></li>)}
          </ul>
        ) : <AdminEmptyState description="No official search or accepted GoVIRAL conversation evidence is available. Replies are never automated." title="Conversation lane unavailable" />}
      </CoreCard>
    </div>
  );
}

function Instagram({ snapshot }: { snapshot: AdminPersonalGrowthSnapshot }) {
  const item = snapshot.instagram;
  return (
    <div className="grid min-w-0 gap-4" data-personal-growth-tab="instagram">
      {item.state !== "present" ? <AdminStateMessage description="The planner remains usable without an Instagram recommendation." state={item.state === "unreadable" ? "malformed" : "unavailable"} title="Instagram recommendation unavailable" /> : null}
      <CoreCard note={item.actionType ?? "unavailable"} title="Strategic recommendation">
        <p className="m-0 text-[length:var(--admin-type-section)] font-semibold">{item.reason ?? "No owner-grounded action is recorded."}</p>
        <dl className="mt-4 grid gap-3 text-[length:var(--admin-type-control)] sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="font-semibold">Format</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{item.format ?? "Unavailable"}</dd></div>
          <div><dt className="font-semibold">Pillar / goal</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{item.pillar ?? "Unavailable"} · {item.goal ?? "Unavailable"}</dd></div>
          <div><dt className="font-semibold">Due / collaborator</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{displayDate(item.dueWindow)} · {item.collaborator ?? "none"}</dd></div>
          <div><dt className="font-semibold">Content mix</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{item.projectedPersonalRatio === null ? "Unavailable" : percent(item.projectedPersonalRatio)}</dd></div>
          <div><dt className="font-semibold">GoVIRAL / experiment</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{item.goviralSignalId ?? "none"} · {item.experimentId ?? "none"}</dd></div>
          <div><dt className="font-semibold">Manual reference</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{item.manualVentureReferenceId ?? "none supplied"}</dd></div>
        </dl>
      </CoreCard>
      <div className="grid gap-4 lg:grid-cols-3">
        {[{ title: "Assets", items: item.assetChecklist }, { title: "Distribution", items: item.distributionChecklist }, { title: "Stories support", items: item.storiesSupport }].map((group) => (
          <CoreCard key={group.title} title={group.title}>
            {group.items.length ? <ul className="m-0 grid gap-2 pl-5 text-[length:var(--admin-type-control)]">{group.items.map((entry) => <li key={entry}>{entry}</li>)}</ul> : <AdminEmptyState title="No checklist recorded" />}
          </CoreCard>
        ))}
      </div>
      <AdminCallout tone="warning">OKRAJ carousel text and BBARAK article prose remain entirely owner-authored and are structurally absent from this view.</AdminCallout>
    </div>
  );
}

function Reels({ snapshot }: { snapshot: AdminPersonalGrowthSnapshot }) {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2" data-personal-growth-tab="reels">
      {snapshot.reels.map((reel) => (
        <CoreCard key={reel.series} note={reel.state} title={reel.series.replaceAll("-", " ")}>
          <p className="m-0 text-[length:var(--admin-type-body)] font-semibold">{reel.concept}</p>
          <p className="m-0 mt-2 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{reel.purpose}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminEntityBadge>{reel.durationBandSeconds ? `${reel.durationBandSeconds[0]}–${reel.durationBandSeconds[1]} sec` : "duration unavailable"}</AdminEntityBadge>
            <AdminEntityBadge>{reel.language ? `${reel.language.toUpperCase()}${reel.subtitleLanguages.length ? ` + ${reel.subtitleLanguages.join("/")} subtitles` : ""}` : "language not selected"}</AdminEntityBadge>
            <AdminEntityBadge>{reel.considerTrialReel ? "consider Trial Reel" : "ordinary lane"}</AdminEntityBadge>
          </div>
          {[{ title: "Real assets / locations", values: reel.assetChecklist }, { title: "Simple shots", values: reel.shotChecklist }].map((group) => group.values.length ? <div className="mt-3" key={group.title}><p className="m-0 text-[length:var(--admin-type-control)] font-semibold">{group.title}</p><ul className="m-0 mt-1 pl-5 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{group.values.map((value) => <li key={value}>{value}</li>)}</ul></div> : null)}
          {reel.trendExpiresAt ? <p className="m-0 mt-3 text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-muted)]">Trend expires {displayDate(reel.trendExpiresAt.slice(0, 10))}</p> : null}
        </CoreCard>
      ))}
    </div>
  );
}

function TrendRadar({ snapshot }: { snapshot: AdminPersonalGrowthSnapshot }) {
  return (
    <div className="grid min-w-0 gap-4" data-personal-growth-tab="trend-radar">
      <CoreCard note={`${snapshot.trends.sourceHealth} · quota ${snapshot.trends.quota}`} title="Bounded GoVIRAL packet">
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{snapshot.trends.packetId ?? "No packet recorded"}{snapshot.trends.expiresAt ? ` · expires ${displayDate(snapshot.trends.expiresAt.slice(0, 10))}` : ""}</p>
          <Link className="admin-focus-ring ml-auto rounded-[var(--admin-radius)] px-2 py-1 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-information)]" href={snapshot.trends.workspaceHref}>Open broader GoVIRAL workspace →</Link>
        </div>
      </CoreCard>
      {snapshot.trends.opportunities.length ? snapshot.trends.opportunities.map((trend) => (
        <CoreCard key={trend.opportunityId} note={trend.disposition} title={`${trend.pillar} · ${trend.format}`}>
          <div className="flex flex-wrap gap-2"><AdminStatusBadge tone={trend.disposition === "use" ? "success" : trend.disposition === "watch" ? "information" : "neutral"}>{trend.disposition}</AdminStatusBadge><AdminEntityBadge>fit {trend.fit}</AdminEntityBadge><AdminEntityBadge>risk {trend.risk}</AdminEntityBadge><AdminEntityBadge>relevance {trend.relevance.toFixed(2)}</AdminEntityBadge></div>
          <dl className="mt-3 grid gap-3 text-[length:var(--admin-type-control)] sm:grid-cols-2">
            <div><dt className="font-semibold">Observed / shelf life</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{displayDate(trend.observedAt.slice(0, 10))} → {displayDate(trend.expiresAt.slice(0, 10))}</dd></div>
            <div><dt className="font-semibold">Owner outcome</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{trend.status} · {trend.outcome} · overload {trend.overload}</dd></div>
            <div><dt className="font-semibold">Evidence</dt><dd className="m-0 break-all text-[var(--admin-foreground-muted)]">{trend.evidenceRefs.join(", ")}</dd></div>
            <div><dt className="font-semibold">Sources</dt><dd className="m-0 break-all text-[var(--admin-foreground-muted)]">{trend.sourceRefs.join(", ")}</dd></div>
          </dl>
        </CoreCard>
      )) : <AdminStateMessage description="The personal desk does not rerun collectors or invent a trend. Existing owner planning remains available." state={snapshot.trends.state === "unreadable" ? "malformed" : "unavailable"} title="GoVIRAL packet unavailable" />}
      <AdminCallout tone="warning">GoVIRAL supplies expiring intelligence and evidence only. It never supplies the final Threads text, Instagram caption, Reel script or publishing action.</AdminCallout>
    </div>
  );
}

function metricLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function Results({ snapshot }: { snapshot: AdminPersonalGrowthSnapshot }) {
  return (
    <div className="grid min-w-0 gap-4" data-personal-growth-tab="results">
      {snapshot.insightsUnreadable.forbidden ? <AdminStateMessage description={`${snapshot.insightsUnreadable.forbidden} cross-boundary or private result ${snapshot.insightsUnreadable.forbidden === 1 ? "input was" : "inputs were"} dropped before projection.`} state="held" title="Isolated inputs rejected" /> : null}
      <CoreCard note={snapshot.results.baseline.status} title="28-day baseline">
        {snapshot.results.baseline.state === "present" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AdminMetric label="Baseline window" note={`${displayDate(snapshot.results.baseline.startsOn)}–${displayDate(snapshot.results.baseline.endsOn)}`} value={`${snapshot.results.baseline.elapsedDays ?? 0} / 28 days`} />
            <AdminMetric label="Accepted results" note="valid Personal Growth records" value={String(snapshot.results.baseline.acceptedResultCount ?? 0)} />
            <AdminMetric label="Dropped inputs" note="malformed or isolated" value={String(snapshot.results.baseline.droppedResultCount)} />
            <AdminMetric label="Targets" note="owner decision required" value={snapshot.results.baseline.targetProposalRequired ? "Proposal due" : "Not activated"} />
          </div>
        ) : <AdminStateMessage description="No valid baseline artifact is recorded. Results below remain usable and no target is invented." state={snapshot.results.baseline.state === "unreadable" ? "malformed" : "unavailable"} title="Baseline unavailable" />}
      </CoreCard>
      <PersonalGrowthResultCreateForm />
      {snapshot.results.windows.map((window) => (
        <CoreCard key={window.days} note={`${window.days} days`} title={`${displayDate(window.startsOn)}–${displayDate(window.endsOn)}`}>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-border)] lg:grid-cols-4">
            <AdminMetric label="Recorded results" note={`${window.manualOnlyCount} manual-only · ${window.apiObservedCount} API-observed`} value={String(window.resultCount)} />
            <AdminMetric label="Follower direction" note="needs two valid observations" value={window.followerDirection === null ? "Unavailable" : `${window.followerDirection >= 0 ? "+" : ""}${window.followerDirection}`} />
            <AdminMetric label="Personal ratio" note={`${window.ownerManualVentureCount} owner-manual venture records`} progress={window.personalRatio === null ? undefined : window.personalRatio * 100} value={window.personalRatio === null ? "Unavailable" : percent(window.personalRatio)} />
            <AdminMetric label="Owner actions" note={`${window.missedDeadlines} missed deadlines`} value={`${window.completedOwnerActions} completed`} />
          </div>
          <AdminTableRegion className="mt-4" label={`${window.days}-day Personal Growth measurements`}>
            <AdminTable><thead><tr><AdminTableHead>Metric</AdminTableHead><AdminTableHead>Recorded aggregate</AdminTableHead><AdminTableHead>State</AdminTableHead></tr></thead><tbody>{window.metrics.map((metric) => <tr key={metric.name}><AdminTableCell className="font-semibold capitalize">{metricLabel(metric.name)}</AdminTableCell><AdminTableCell className="admin-tabular">{metric.value === null ? "Unavailable" : metric.value.toLocaleString("en-US", { maximumFractionDigits: 4 })}</AdminTableCell><AdminTableCell>{metric.value === null ? metric.unavailableReason ?? "unavailable" : "measured"}</AdminTableCell></tr>)}</tbody></AdminTable>
          </AdminTableRegion>
          <AdminTableRegion className="mt-4" label={`${window.days}-day Personal Growth breakdowns`}>
            <AdminTable><thead><tr><AdminTableHead>Dimension</AdminTableHead><AdminTableHead>Group</AdminTableHead><AdminTableHead>Results</AdminTableHead><AdminTableHead>Typical reach/views</AdminTableHead></tr></thead><tbody>{window.breakdowns.length ? window.breakdowns.map((row) => <tr key={`${row.dimension}-${row.label}`}><AdminTableCell>{row.dimension}</AdminTableCell><AdminTableCell className="font-semibold">{row.label}</AdminTableCell><AdminTableCell>{row.resultCount}</AdminTableCell><AdminTableCell>{row.typicalReachOrViews === null ? "Unavailable" : row.typicalReachOrViews.toLocaleString("en-US", { maximumFractionDigits: 2 })}</AdminTableCell></tr>) : <tr><AdminTableCell colSpan={4}>No valid result groups exist for this window.</AdminTableCell></tr>}</tbody></AdminTable>
          </AdminTableRegion>
          <p className="m-0 mt-3 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">Current-month Personal Growth spend alongside outcomes: {usd(window.currentMonthSpendUsd)}. Sparse data stays tabular; no trend line is fabricated.</p>
        </CoreCard>
      ))}
      <AdminSectionHeading description="Manual/API provenance, latest bounded observation and append-only corrections." title="Result records" />
      {snapshot.results.items.length ? snapshot.results.items.map((result) => (
        <CoreCard key={result.resultId} note={result.provenance} title={`${result.platform} · ${result.format} · ${displayDate(result.publishedAt.slice(0, 10))}`}>
          <div className="flex flex-wrap gap-2"><AdminEntityBadge>{result.personalPillar}</AdminEntityBadge><AdminEntityBadge>{result.goviralAssisted ? "GoVIRAL-assisted" : "ordinary personal"}</AdminEntityBadge>{result.manualVentureReference ? <AdminEntityBadge>owner-manual venture reference</AdminEntityBadge> : null}{result.publicationRelation ? <AdminEntityBadge>{result.publicationRelation} collaboration</AdminEntityBadge> : null}{result.reelSeries ? <AdminEntityBadge>{result.reelSeries}</AdminEntityBadge> : null}</div>
          <dl className="mt-3 grid gap-2 text-[length:var(--admin-type-control)] sm:grid-cols-2"><div><dt className="font-semibold">Last observation</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{result.latestObservationAt ? displayDate(result.latestObservationAt.slice(0, 10)) : "Manual-only · unavailable"}</dd></div><div><dt className="font-semibold">Corrections / rating</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{result.correctionCount} · {result.ownerRating ?? "unavailable"}</dd></div></dl>
          <a className="admin-focus-ring mt-3 inline-block text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-information)]" href={result.url} rel="noreferrer" target="_blank">Open public result ↗</a>
          <PersonalGrowthResultCorrectionForm result={result} />
        </CoreCard>
      )) : <AdminEmptyState description="Record a real owner-supplied result above. The Admin does not create example performance." title="No valid Personal Growth results" />}
    </div>
  );
}

function Experiments({ snapshot }: { snapshot: AdminPersonalGrowthSnapshot }) {
  return (
    <div className="grid min-w-0 gap-4" data-personal-growth-tab="experiments">
      <AdminStateMessage description={`${snapshot.experiments.activeCount} of ${snapshot.experiments.maximumActive} experiments are active or under review. Every experiment remains zero-cost and cannot publish.`} state={snapshot.experiments.activeCount >= snapshot.experiments.maximumActive ? "held" : "success"} title="Two-live-experiment ceiling" />
      <CoreCard note="creates in backlog" title="New bounded experiment"><PersonalGrowthExperimentCreateForm /></CoreCard>
      {snapshot.experiments.items.map((experiment) => (
        <CoreCard key={experiment.id} note={experiment.status} title={experiment.hypothesis}>
          <div className="flex flex-wrap gap-2"><AdminStatusBadge tone={experiment.status === "completed" ? "success" : experiment.status === "stopped" ? "risk" : experiment.status === "active" || experiment.status === "review" ? "information" : "neutral"}>{experiment.status}</AdminStatusBadge><AdminEntityBadge>{experiment.changedVariable}</AdminEntityBadge><AdminEntityBadge>{experiment.platform} · {experiment.format}</AdminEntityBadge><AdminEntityBadge>$0 · no publishing</AdminEntityBadge></div>
          <dl className="mt-3 grid gap-3 text-[length:var(--admin-type-control)] sm:grid-cols-2 lg:grid-cols-3"><div><dt className="font-semibold">Primary metric</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{metricLabel(experiment.primaryMetric)}</dd></div><div><dt className="font-semibold">Evidence</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{experiment.evidenceResultIds.length} / {experiment.minimumSample} minimum · {experiment.verdict}</dd></div><div><dt className="font-semibold">Window</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{experiment.evaluationWindowDays} days from {displayDate(experiment.startDate)}</dd></div><div className="sm:col-span-2"><dt className="font-semibold">Guardrail</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{experiment.secondaryGuardrail}</dd></div><div><dt className="font-semibold">Latest owner note</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{experiment.note ?? "None recorded"}</dd></div></dl>
          {experiment.status === "completed" || experiment.status === "stopped" ? <AdminStateMessage className="mt-3" description={`Final evidence verdict: ${experiment.verdict}. Earlier preregistration and evidence remain immutable.`} state={experiment.status === "completed" ? "success" : "held"} title={`Experiment ${experiment.status}`} /> : <PersonalGrowthExperimentActions experiment={experiment} />}
        </CoreCard>
      ))}
    </div>
  );
}

function hashPreview(value: string | null): string {
  return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : "Unavailable";
}

function VoiceStrategy({ snapshot }: { snapshot: AdminPersonalGrowthSnapshot }) {
  const strategy = snapshot.strategy;
  return (
    <div className="grid min-w-0 gap-4" data-personal-growth-tab="voice-strategy">
      <AdminCallout tone="information">Only non-reconstructive metadata reaches this page. Source text, retrieved chunks, embeddings and unpublished writing are never loaded into the client snapshot.</AdminCallout>
      <div className="grid gap-4 lg:grid-cols-2">{snapshot.voice.journals.map((journal) => <CoreCard key={journal.language} note={journal.state} title={`${journal.language.toUpperCase()} Rapovej deník health`}><dl className="grid gap-2 text-[length:var(--admin-type-control)] sm:grid-cols-2"><div><dt className="font-semibold">Source / title hashes</dt><dd className="m-0 font-mono text-[var(--admin-foreground-muted)]">{hashPreview(journal.sourceHash)} · {hashPreview(journal.titleHash)}</dd></div><div><dt className="font-semibold">Style profile</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{journal.versionId ?? "Unavailable"}</dd></div><div><dt className="font-semibold">Last ingestion / retrieval</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{journal.generatedAt ? displayDate(journal.generatedAt.slice(0, 10)) : "Unavailable"} · {journal.retrievalAvailable === null ? "unavailable" : journal.retrievalAvailable ? "available" : "held"}</dd></div><div><dt className="font-semibold">Samples / exemplars</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{journal.styleSampleCount ?? "Unavailable"} sentences · {journal.boundedExemplarCount ?? "Unavailable"} bounded exemplars</dd></div><div><dt className="font-semibold">Profile cost / state</dt><dd className="m-0 text-[var(--admin-foreground-muted)]">{usd(journal.costUsd)} · {journal.costStatus}</dd></div></dl></CoreCard>)}</div>
      <CoreCard note={`${snapshot.voice.profile.completedSections}/${snapshot.voice.profile.totalSections} sections`} title="GoVIRAL owner profile"><p className="m-0 text-[length:var(--admin-type-body)]">Completeness is measured without returning profile text. Private-store status: {snapshot.voice.privateStoreStatus}. Latest leak gate: {snapshot.voice.leakGate}.</p><Link className="admin-focus-ring mt-3 inline-block text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-information)]" href={snapshot.voice.profile.workspaceHref}>Open GoVIRAL workspace →</Link></CoreCard>
      {strategy ? <><CoreCard note={`revision ${strategy.policy.revision} · ${strategy.historyCount} history entries`} title="Language and platforms actually used"><PersonalGrowthSettingsForm strategy={strategy} /></CoreCard><CoreCard note="85/15 safe bounds" title="Personal-content policy"><p className="m-0 mb-3 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">Owner-manual provenance and owner commentary remain mandatory; automatic discovery and nomination remain unavailable.</p><PersonalGrowthPolicyForm strategy={strategy} /></CoreCard><AdminSectionHeading description="Each status, weight and explicit veto change is recorded with a reason." title="Personal pillars" />{strategy.pillars.map((pillar) => <CoreCard key={pillar.pillar} note={`${pillar.status} · ${percent(pillar.weight)}`} title={pillar.pillar}><PersonalGrowthPillarForm pillar={pillar} /></CoreCard>)}</> : <AdminStateMessage description="The content strategy is missing or malformed. No defaults are fabricated and no write is offered." state="malformed" title="Strategy unavailable" />}
    </div>
  );
}

function Budget({ snapshot }: { snapshot: AdminPersonalGrowthSnapshot }) {
  const budget = snapshot.budget;
  return (
    <div className="grid min-w-0 gap-4" data-personal-growth-tab="budget">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-border)] lg:grid-cols-4"><AdminMetric label="Nested cap" note="cannot be raised here" value="$20.00" /><AdminMetric label="Recorded spend" note="current UTC month" value={usd(budget.monthlySpendUsd)} /><AdminMetric label="Effective headroom" note="minimum of nested and company headroom" value={usd(budget.remainingUsd)} /><AdminMetric label="Company interaction" note={`${usd(budget.companyRecordedSpendUsd)} recorded of $50.00`} value={usd(budget.companyRemainingUsd)} /></div>
      <AdminStateMessage description={`Current allocation is ${budget.activeMode}. Effective state is ${budget.degradation}; the company cap always remains authoritative.`} state={budget.degradation === "healthy" ? "success" : budget.degradation === "exhausted" ? "held" : "unavailable"} title={`Budget ${budget.degradation}`} />
      <CoreCard note="authorised modes only" title="Allocation control"><PersonalGrowthBudgetModeForm activeMode={budget.activeMode} /><AdminTableRegion className="mt-4" label="Personal Growth allocation modes"><AdminTable><thead><tr><AdminTableHead>Mode</AdminTableHead><AdminTableHead>Synthesis</AdminTableHead><AdminTableHead>Research</AdminTableHead><AdminTableHead>Scheduling</AdminTableHead><AdminTableHead>Reserve</AdminTableHead></tr></thead><tbody>{budget.allocations.map((mode) => <tr key={mode.id}><AdminTableCell className="font-semibold">{mode.id}{mode.id === budget.activeMode ? " · active" : ""}</AdminTableCell><AdminTableCell>{usd(mode.synthesisUsd)}</AdminTableCell><AdminTableCell>{usd(mode.researchUsd)}</AdminTableCell><AdminTableCell>{usd(mode.schedulingUsd)}</AdminTableCell><AdminTableCell>{usd(mode.reserveUsd)}</AdminTableCell></tr>)}</tbody></AdminTable></AdminTableRegion></CoreCard>
      <CoreCard note="actuals only" title="Spend by category and provider"><AdminTableRegion label="Personal Growth recorded spend"><AdminTable><thead><tr><AdminTableHead>Class</AdminTableHead><AdminTableHead>Source</AdminTableHead><AdminTableHead>Actual USD</AdminTableHead><AdminTableHead>State</AdminTableHead></tr></thead><tbody>{budget.spendByCategory.map((row) => <tr key={`${row.category}-${row.label}`}><AdminTableCell>{row.category}</AdminTableCell><AdminTableCell className="font-semibold">{row.label}</AdminTableCell><AdminTableCell>{usd(row.usd)}</AdminTableCell><AdminTableCell>{row.state}</AdminTableCell></tr>)}</tbody></AdminTable></AdminTableRegion><p className="m-0 mt-3 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">GoVIRAL incremental attribution: {usd(budget.goviralIncrementalUsd)} · Meta provider cost status: {budget.metaProviderStatus}; no cost is inferred without a receipt.</p></CoreCard>
      <CoreCard note="optional · held by default" title="Buffer capability"><p className="m-0 text-[length:var(--admin-type-body)]">Adapter {budget.buffer.adapterEnabled === null ? "unavailable" : budget.buffer.adapterEnabled ? "enabled" : "disabled"}; queue {budget.buffer.queueEnabled ? "enabled" : "held"}; subscription {budget.buffer.subscriptionStatus}. Purchase and publishing authority are both absent.</p></CoreCard>
      <AdminSectionHeading description="Enabled capabilities may only be disabled here. There is no enable, purchase, upgrade, cap or publishing action." title="Feature flags" />
      <div className="grid gap-3 lg:grid-cols-2">{budget.featureFlags.map((flag) => <CoreCard key={flag.id} note={flag.enabled ? "enabled" : "held"} title={flag.id}>{flag.canDisable ? <PersonalGrowthDisableCapability capability={flag.id} /> : <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">No activation control is available.</p>}</CoreCard>)}</div>
    </div>
  );
}

export function PersonalGrowthPanel({
  snapshot,
  tab
}: {
  snapshot: AdminPersonalGrowthSnapshot;
  tab: PersonalGrowthCoreTab;
}) {
  if (tab === "results") return <Results snapshot={snapshot} />;
  if (tab === "experiments") return <Experiments snapshot={snapshot} />;
  if (tab === "voice-strategy") return <VoiceStrategy snapshot={snapshot} />;
  if (tab === "budget") return <Budget snapshot={snapshot} />;
  if (tab === "timeline") return <Timeline snapshot={snapshot} />;
  if (tab === "threads") return <Threads snapshot={snapshot} />;
  if (tab === "instagram") return <Instagram snapshot={snapshot} />;
  if (tab === "reels") return <Reels snapshot={snapshot} />;
  if (tab === "trend-radar") return <TrendRadar snapshot={snapshot} />;
  return <Today snapshot={snapshot} />;
}
