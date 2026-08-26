import Link from "next/link";
import {
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminCardFooter,
  AdminCardHeader,
  AdminEntityBadge,
  AdminMetric,
  AdminSectionHeading,
  AdminStateMessage,
  AdminStatusBadge
} from "./admin-primitives";
import { ImplementationCopyButton, ImplementationCopyLinkButton } from "./implementation-plan-actions";
import type {
  AdminImplementationItem,
  AdminImplementationProgram,
  AdminImplementationProgress,
  AdminImplementationState
} from "@/lib/admin-implementation-plans";

const STATE_PRESENTATION: Readonly<Record<AdminImplementationState, {
  label: string;
  tone: "neutral" | "information" | "success" | "warning" | "risk" | "destructive";
}>> = {
  "not-started": { label: "Not started", tone: "neutral" },
  ready: { label: "Ready", tone: "information" },
  "in-progress": { label: "In progress", tone: "information" },
  "implemented-awaiting-verification": { label: "Awaiting verification", tone: "warning" },
  "owner-action": { label: "Owner action", tone: "risk" },
  blocked: { label: "Blocked", tone: "warning" },
  complete: { label: "Complete", tone: "success" },
  "held-optional": { label: "Held optional", tone: "neutral" },
  stale: { label: "Stale evidence", tone: "warning" },
  inconsistent: { label: "Inconsistent", tone: "destructive" },
  superseded: { label: "Superseded", tone: "neutral" }
};

function StateBadge({ state }: { state: AdminImplementationState }) {
  const presentation = STATE_PRESENTATION[state];
  return <AdminStatusBadge tone={presentation.tone}>{presentation.label}</AdminStatusBadge>;
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Prague" }).format(new Date(value));
}

function itemHref(itemId: string, programId?: string): string {
  const query = new URLSearchParams({ item: itemId });
  if (programId) query.set("program", programId);
  return `/admin/implementation-plans?${query.toString()}`;
}

function programHref(programId: string): string {
  return `/admin/implementation-plans?program=${encodeURIComponent(programId)}`;
}

function ItemLink({ id, items, programId }: { id: string; items: readonly AdminImplementationItem[]; programId?: string }) {
  const item = items.find((candidate) => candidate.id === id);
  return (
    <Link className="admin-focus-ring rounded-sm font-medium text-[var(--admin-link)] underline-offset-4 hover:underline" href={itemHref(id, programId)}>
      {item ? `#${item.issueNumber} ${item.title}` : id}
    </Link>
  );
}

function FreshnessNotice({ snapshot }: { snapshot: AdminImplementationProgress }) {
  if (snapshot.state === "missing") {
    return (
      <AdminStateMessage
        description="The orchestrator has not written state/programs/current.json yet. No progress is inferred from repository files in this view."
        state="unavailable"
        title="No implementation progress snapshot"
      />
    );
  }
  if (snapshot.state === "malformed") {
    return (
      <AdminStateMessage
        description={`The last snapshot could not be validated. ${snapshot.programs.length} program records and ${snapshot.items.length} item records remain safely readable; ${snapshot.unreadableItems} record${snapshot.unreadableItems === 1 ? " is" : "s are"} isolated.`}
        state="malformed"
        title="Implementation progress is only partially readable"
      />
    );
  }
  if (snapshot.sourceFreshness !== "fresh" || snapshot.unreadableItems > 0) {
    const failed = snapshot.github.failedItems;
    return (
      <AdminStateMessage
        description={`Showing the last valid bounded evidence. Source freshness: ${snapshot.sourceFreshness}; GitHub items unavailable: ${failed}; unreadable records or probes: ${snapshot.unreadableItems}. No replacement state was guessed.`}
        state={snapshot.sourceFreshness === "unavailable" ? "unavailable" : "malformed"}
        title="Some progress evidence needs attention"
      />
    );
  }
  return null;
}

function ProgramSummary({ program }: { program: AdminImplementationProgram }) {
  const owner = program.stateCounts["owner-action"];
  const risks = program.stateCounts.inconsistent + program.stateCounts.stale;
  return (
    <AdminCard>
      <AdminCardHeader>
        <AdminSectionHeading
          actions={<AdminStatusBadge tone={program.finalGateComplete ? "success" : program.finalGateReady ? "information" : "neutral"}>{program.finalGateComplete ? "Released" : program.finalGateReady ? "Release gate ready" : "Release gated"}</AdminStatusBadge>}
          description={`Parent issue #${program.parentIssueNumber} · manifest ${program.manifestVersion}`}
          title={program.name}
        />
      </AdminCardHeader>
      <AdminCardContent className="grid min-w-0 gap-4">
        <p className="m-0 text-[length:var(--admin-type-body)] text-[var(--admin-foreground-muted)]">{program.description}</p>
        <div className="grid overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] sm:grid-cols-3 sm:divide-x sm:divide-[var(--admin-border)]">
          <AdminMetric
            label="Mandatory"
            note="Final gate still applies"
            progress={program.weightedProgressPercent ?? undefined}
            value={`${program.mandatoryCompleted}/${program.mandatoryTotal}`}
          />
          <AdminMetric label="Owner waiting" note="Explicit owner-only actions" value={owner} />
          <AdminMetric label="Evidence risks" note="Stale or inconsistent" value={risks} />
        </div>
        {program.weightedProgressPercent === null ? (
          <p className="m-0 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">Weighted progress is unavailable; exact mandatory counts are shown instead.</p>
        ) : null}
      </AdminCardContent>
      <AdminCardFooter className="flex flex-wrap items-center justify-between gap-2">
        <Link className="admin-focus-ring rounded-sm font-semibold text-[var(--admin-link)] underline-offset-4 hover:underline" href={programHref(program.id)}>Open program</Link>
        <a className="admin-focus-ring rounded-sm text-[length:var(--admin-type-control)] text-[var(--admin-link)] underline-offset-4 hover:underline" href={program.parentIssueUrl} rel="noreferrer" target="_blank">GitHub #{program.parentIssueNumber}</a>
      </AdminCardFooter>
    </AdminCard>
  );
}

export function ImplementationProgramCompactSummary({
  programId,
  snapshot
}: {
  programId: string;
  snapshot: AdminImplementationProgress;
}) {
  const program = snapshot.programs.find((candidate) => candidate.id === programId);
  if (!program) {
    return snapshot.state === "present" ? (
      <AdminStateMessage
        description="The program is absent from the current validated implementation registry snapshot."
        state="unavailable"
        title="No implementation summary for this workspace"
      />
    ) : <FreshnessNotice snapshot={snapshot} />;
  }
  return (
    <div className="grid min-w-0 gap-3">
      <FreshnessNotice snapshot={snapshot} />
      <ProgramSummary program={program} />
    </div>
  );
}

function ItemRow({ item, programId }: { item: AdminImplementationItem; programId?: string }) {
  return (
    <li className="grid min-w-0 gap-2 border-b border-[var(--admin-border)] px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <Link className="admin-focus-ring rounded-sm font-semibold text-[var(--admin-foreground)] underline-offset-4 hover:text-[var(--admin-link)] hover:underline" href={itemHref(item.id, programId)}>
          #{item.issueNumber} {item.title}
        </Link>
        <p className="m-0 mt-1 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{item.explanation}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.sharedWorkItemRef ? <AdminEntityBadge>Shared work item</AdminEntityBadge> : null}
          {item.finalGate ? <AdminEntityBadge>Final gate</AdminEntityBadge> : null}
          {item.posture !== "mandatory" ? <AdminEntityBadge>{item.posture}</AdminEntityBadge> : null}
          {item.programRefs.length > 1 ? <AdminEntityBadge>{item.programRefs.length} programs</AdminEntityBadge> : null}
        </div>
      </div>
      <StateBadge state={item.state} />
    </li>
  );
}

function PortfolioView({ snapshot }: { snapshot: AdminImplementationProgress }) {
  return (
    <div className="grid min-w-0 gap-5">
      <section aria-labelledby="program-portfolio-heading" className="grid min-w-0 gap-3">
        <AdminSectionHeading
          description="Every registered implementation program, calculated from one versioned snapshot."
          title={<span id="program-portfolio-heading">Program portfolio</span>}
        />
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {snapshot.programs.map((program) => <ProgramSummary key={program.id} program={program} />)}
        </div>
      </section>
      <AdminCard>
        <AdminCardHeader>
          <AdminSectionHeading
            description="Canonical items appear once here, including work shared by more than one program."
            title={`All work items (${snapshot.items.length})`}
          />
        </AdminCardHeader>
        <ul className="m-0 list-none p-0">
          {snapshot.items.map((item) => <ItemRow item={item} key={item.id} />)}
        </ul>
      </AdminCard>
    </div>
  );
}

function ProgramDetail({ items, program }: { items: readonly AdminImplementationItem[]; program: AdminImplementationProgram }) {
  const programItems = items.filter((item) => item.programRefs.includes(program.id));
  const current = program.currentItemId ? items.find((item) => item.id === program.currentItemId) : null;
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="admin-focus-ring rounded-sm font-medium text-[var(--admin-link)] underline-offset-4 hover:underline" href="/admin/implementation-plans">← All programs</Link>
        <ImplementationCopyLinkButton />
      </div>
      <ProgramSummary program={program} />
      {current ? (
        <AdminCallout tone={current.state === "inconsistent" ? "destructive" : "information"}>
          <p className="m-0 font-semibold">Current item</p>
          <p className="m-0 mt-1"><ItemLink id={current.id} items={items} programId={program.id} /></p>
          <p className="m-0 mt-1 text-[length:var(--admin-type-control)]">{current.recommendedAction}</p>
        </AdminCallout>
      ) : null}
      <AdminCard>
        <AdminCardHeader><AdminSectionHeading description={`${program.phases.length} declared phases · shared items retain one canonical state`} title={`Program work (${programItems.length})`} /></AdminCardHeader>
        <ul className="m-0 list-none p-0">{programItems.map((item) => <ItemRow item={item} key={item.id} programId={program.id} />)}</ul>
      </AdminCard>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <AdminCard>
          <AdminCardHeader><AdminSectionHeading title="Next unblocked" /></AdminCardHeader>
          <AdminCardContent>
            {program.nextUnblockedItemIds.length ? <ul className="m-0 grid gap-2 pl-5">{program.nextUnblockedItemIds.map((id) => <li key={id}><ItemLink id={id} items={items} programId={program.id} /></li>)}</ul> : <p className="m-0 text-[var(--admin-foreground-muted)]">No item is currently ready.</p>}
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader><AdminSectionHeading title="Parallel-safe" /></AdminCardHeader>
          <AdminCardContent>
            {program.parallelSafeItemIds.length ? <ul className="m-0 grid gap-2 pl-5">{program.parallelSafeItemIds.map((id) => <li key={id}><ItemLink id={id} items={items} programId={program.id} /></li>)}</ul> : <p className="m-0 text-[var(--admin-foreground-muted)]">No parallel-safe item is declared.</p>}
          </AdminCardContent>
        </AdminCard>
      </div>
    </div>
  );
}

function ItemDetail({ item, items, programs }: { item: AdminImplementationItem; items: readonly AdminImplementationItem[]; programs: readonly AdminImplementationProgram[] }) {
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="admin-focus-ring rounded-sm font-medium text-[var(--admin-link)] underline-offset-4 hover:underline" href={item.programRefs.length === 1 ? programHref(item.programRefs[0]!) : "/admin/implementation-plans"}>← Back to program</Link>
        <div className="flex flex-wrap gap-2"><ImplementationCopyButton value={item.recommendedAction} /><ImplementationCopyLinkButton /></div>
      </div>
      <AdminCard>
        <AdminCardHeader>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="m-0 text-[length:var(--admin-type-label)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Work item #{item.issueNumber}</p>
              <h2 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold text-[var(--admin-foreground)]">{item.title}</h2>
              <p className="m-0 mt-1 text-[length:var(--admin-type-body)] text-[var(--admin-foreground-muted)]">{item.summary}</p>
            </div>
            <StateBadge state={item.state} />
          </div>
        </AdminCardHeader>
        <AdminCardContent className="grid min-w-0 gap-5">
          <AdminCallout tone={item.state === "inconsistent" ? "destructive" : item.state === "owner-action" ? "risk" : "neutral"}>
            <p className="m-0 font-semibold">Why this state</p><p className="m-0 mt-1">{item.explanation}</p>
          </AdminCallout>
          <dl className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div><dt className="text-[length:var(--admin-type-label)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Programs</dt><dd className="m-0 mt-1 flex flex-wrap gap-2">{item.programRefs.map((id) => { const program = programs.find((candidate) => candidate.id === id); return <Link className="admin-focus-ring rounded-sm text-[var(--admin-link)] underline-offset-4 hover:underline" href={programHref(id)} key={id}>{program?.name ?? id}</Link>; })}</dd></div>
            <div><dt className="text-[length:var(--admin-type-label)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Issue evidence</dt><dd className="m-0 mt-1"><a className="admin-focus-ring rounded-sm text-[var(--admin-link)] underline-offset-4 hover:underline" href={item.issueUrl} rel="noreferrer" target="_blank">GitHub #{item.issueNumber} · {item.issueState ?? "unavailable"}</a></dd></div>
            <div><dt className="text-[length:var(--admin-type-label)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Last issue update</dt><dd className="m-0 mt-1">{formatDate(item.issueUpdatedAt)}</dd></div>
            <div><dt className="text-[length:var(--admin-type-label)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Deliverables</dt><dd className="m-0 mt-1">{item.expectedDeliverables.join(", ")}</dd></div>
            <div><dt className="text-[length:var(--admin-type-label)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Protected groups</dt><dd className="m-0 mt-1">{item.protectedFileGroups.join(", ") || "None"}</dd></div>
            <div><dt className="text-[length:var(--admin-type-label)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Safe parallel group</dt><dd className="m-0 mt-1">{item.safeParallelGroup ?? "None"}</dd></div>
          </dl>
          <div>
            <h3 className="m-0 text-[length:var(--admin-type-body)] font-semibold">Recommended action</h3>
            <p className="m-0 mt-1 rounded-[var(--admin-radius)] bg-[var(--admin-surface-inset)] p-3 font-mono text-[length:var(--admin-type-control)]">{item.recommendedAction}</p>
          </div>
        </AdminCardContent>
      </AdminCard>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <AdminCard>
          <AdminCardHeader><AdminSectionHeading title={`Verification probes (${item.probes.length})`} /></AdminCardHeader>
          <AdminCardContent>{item.probes.length ? <ul className="m-0 grid gap-3 pl-5">{item.probes.map((probe) => <li key={probe.id}><strong>{probe.status.toUpperCase()}</strong> · {probe.detail}{probe.evidenceRef ? <div className="mt-1 break-words font-mono text-[length:var(--admin-type-micro)]">{probe.evidenceRef}</div> : null}</li>)}</ul> : <p className="m-0 text-[var(--admin-foreground-muted)]">No probes declared.</p>}</AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader><AdminSectionHeading title="Dependencies and blockers" /></AdminCardHeader>
          <AdminCardContent className="grid gap-4">
            <div><h3 className="m-0 text-[length:var(--admin-type-control)] font-semibold">Dependencies</h3>{item.dependencyIds.length ? <ul className="m-0 mt-2 grid gap-2 pl-5">{item.dependencyIds.map((id) => <li key={id}><ItemLink id={id} items={items} /></li>)}</ul> : <p className="m-0 mt-1 text-[var(--admin-foreground-muted)]">None.</p>}</div>
            <div><h3 className="m-0 text-[length:var(--admin-type-control)] font-semibold">Active blockers</h3>{item.blockerItemIds.length ? <ul className="m-0 mt-2 grid gap-2 pl-5">{item.blockerItemIds.map((id) => <li key={id}><ItemLink id={id} items={items} /></li>)}</ul> : <p className="m-0 mt-1 text-[var(--admin-foreground-muted)]">None.</p>}</div>
          </AdminCardContent>
        </AdminCard>
      </div>
      {item.ownerActions.length || item.discrepancies.length ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {item.ownerActions.length ? <AdminCallout tone="risk"><p className="m-0 font-semibold">Owner-only actions</p><ul className="mb-0 mt-2 pl-5">{item.ownerActions.map((action) => <li key={action}>{action}</li>)}</ul></AdminCallout> : null}
          {item.discrepancies.length ? <AdminCallout tone="destructive"><p className="m-0 font-semibold">Discrepancies</p><ul className="mb-0 mt-2 pl-5">{item.discrepancies.map((entry) => <li key={entry}>{entry}</li>)}</ul></AdminCallout> : null}
        </div>
      ) : null}
      {item.pullRequests.length ? <AdminCard><AdminCardHeader><AdminSectionHeading title="Linked pull requests" /></AdminCardHeader><AdminCardContent><ul className="m-0 grid gap-2 pl-5">{item.pullRequests.map((pull) => <li key={pull.number}><a className="text-[var(--admin-link)] underline-offset-4 hover:underline" href={pull.url} rel="noreferrer" target="_blank">PR #{pull.number}</a> · {pull.merged ? "merged" : pull.state} · checks {pull.checksPassed === null ? "unknown" : pull.checksPassed ? "passed" : "failed"}</li>)}</ul></AdminCardContent></AdminCard> : null}
    </div>
  );
}

export function ImplementationPlansView({
  selectedItemId,
  selectedProgramId,
  snapshot
}: {
  selectedItemId?: string;
  selectedProgramId?: string;
  snapshot: AdminImplementationProgress;
}) {
  const selectedItem = selectedItemId ? snapshot.items.find((item) => item.id === selectedItemId) : null;
  const selectedProgram = selectedProgramId ? snapshot.programs.find((program) => program.id === selectedProgramId) : null;
  const invalidSelection = (selectedItemId && !selectedItem) || (!selectedItemId && selectedProgramId && !selectedProgram);
  return (
    <div className="grid min-w-0 gap-5">
      <FreshnessNotice snapshot={snapshot} />
      {snapshot.state === "present" ? (
        <AdminCallout className="flex flex-wrap items-center justify-between gap-3" tone="neutral">
          <p className="m-0 text-[length:var(--admin-type-control)]"><strong>Snapshot:</strong> {formatDate(snapshot.generatedAt)} · <strong>GitHub cache:</strong> {snapshot.github.cacheStatus} · <strong>rate remaining:</strong> {snapshot.github.rateRemaining ?? "unknown"}</p>
          <a className="admin-focus-ring rounded-sm font-medium text-[var(--admin-link)] underline-offset-4 hover:underline" href="https://github.com/lukaskourilcz/quorum/issues" rel="noreferrer" target="_blank">Open GitHub issues</a>
        </AdminCallout>
      ) : null}
      {invalidSelection ? <AdminStateMessage description="The requested id is absent from the current validated snapshot." state="unavailable" title="Implementation record not found" /> : null}
      {selectedItem ? <ItemDetail item={selectedItem} items={snapshot.items} programs={snapshot.programs} /> : selectedProgram ? <ProgramDetail items={snapshot.items} program={selectedProgram} /> : <PortfolioView snapshot={snapshot} />}
    </div>
  );
}
