import Link from "next/link";
import type {
  AdminOperationHealth,
  AdminOperationNode,
  AdminOperationsSnapshot
} from "@/lib/admin-operations";
import { OperationsCopyDiagnostics } from "./operations-actions";
import { OperationsNodeTable } from "./operations-node-table";
import {
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminEntityBadge,
  AdminMetric,
  AdminSectionHeading,
  AdminStateMessage,
  AdminStatusBadge
} from "./admin-primitives";

const HEALTH_PRESENTATION: Readonly<Record<AdminOperationHealth, {
  label: string;
  tone: "neutral" | "information" | "success" | "warning" | "risk" | "destructive";
}>> = {
  healthy: { label: "Healthy", tone: "success" },
  quiet: { label: "Quiet", tone: "information" },
  held: { label: "Held", tone: "warning" },
  degraded: { label: "Degraded", tone: "risk" },
  stale: { label: "Stale", tone: "warning" },
  failing: { label: "Failing", tone: "destructive" },
  paused: { label: "Paused", tone: "neutral" },
  "setup-needed": { label: "Setup needed", tone: "risk" },
  unavailable: { label: "Unavailable", tone: "warning" }
};

type OperationsView = "overview" | "nodes" | "schedule" | "incidents" | "capabilities" | "plans";

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Prague" }).format(new Date(value));
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function formatCount(value: number | null): string {
  return value === null ? "Unavailable" : String(value);
}

function nodeHref(nodeId: string): string {
  return `/admin/operations?view=nodes&node=${encodeURIComponent(nodeId)}`;
}

function HealthBadge({ state }: { state: AdminOperationHealth }) {
  const presentation = HEALTH_PRESENTATION[state];
  return <AdminStatusBadge tone={presentation.tone}>{presentation.label}</AdminStatusBadge>;
}

function SnapshotNotice({ snapshot }: { snapshot: AdminOperationsSnapshot }) {
  if (snapshot.state === "unavailable") {
    return <AdminStateMessage description="The versioned Operations registries are unavailable or malformed. Runtime state is not inferred from venture content." state="unavailable" title="Operations configuration unavailable" />;
  }
  if (snapshot.state === "partial") {
    const missing = Object.entries(snapshot.sourceStates).filter(([, state]) => state !== "present").map(([source, state]) => `${source}: ${state}`);
    return (
      <AdminStateMessage
        description={`Showing each independently validated record and preserving unavailable states. ${missing.join("; ") || "Some records are unreadable"}. Isolated records: ${snapshot.unreadableRecords}.`}
        state="malformed"
        title="Operations evidence is partial"
      />
    );
  }
  return null;
}

function Overview({ snapshot }: { snapshot: AdminOperationsSnapshot }) {
  const attention = snapshot.nodes.filter((node) => ["degraded", "stale", "failing", "setup-needed", "unavailable"].includes(node.health)).length;
  const sloSatisfied = snapshot.nodes.filter((node) => node.sloState === "satisfied").length;
  const sloMissed = snapshot.nodes.filter((node) => node.sloState === "missed").length;
  const sloDenominator = sloSatisfied + sloMissed;
  return (
    <div className="grid min-w-0 gap-5">
      <div className="grid overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] md:grid-cols-4 md:divide-x md:divide-[var(--admin-border)]">
        <AdminMetric label="Registered nodes" note="Exact registry coverage" value={snapshot.nodes.length} />
        <AdminMetric label="Healthy or quiet" note="Current bounded evidence" value={snapshot.healthCounts.healthy + snapshot.healthCounts.quiet} />
        <AdminMetric label="Needs attention" note="Degraded, stale, failing, setup or unavailable" value={attention} />
        <AdminMetric label="Active incidents" note="Canonical owner-attention conditions" value={formatCount(snapshot.incidents.activeCount)} />
      </div>
      <div className="grid overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] md:grid-cols-4 md:divide-x md:divide-[var(--admin-border)]">
        <AdminMetric label="SLO compliance" note={`${sloDenominator} nodes with valid evidence`} value={sloDenominator ? `${sloSatisfied}/${sloDenominator}` : "Unavailable"} />
        <AdminMetric label="Due / running" note="Canonical capacity plan" value={snapshot.capacity.counts ? `${snapshot.capacity.counts.due} / ${snapshot.capacity.counts.running}` : "Unavailable"} />
        <AdminMetric label="Held / deferred" note="No replacement work inferred" value={snapshot.capacity.counts ? `${snapshot.capacity.counts.held} / ${snapshot.capacity.counts.deferred}` : "Unavailable"} />
        <AdminMetric label="Budget headroom" note="Current plan only" value={snapshot.capacity.budget ? formatUsd(snapshot.capacity.budget.headroomUsd) : "Unavailable"} />
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <AdminCard>
          <AdminCardHeader><AdminSectionHeading title="Current operating posture" /></AdminCardHeader>
          <AdminCardContent className="grid gap-3">
            <p className="m-0">Last bounded evidence: <strong>{formatDate(snapshot.generatedAt)}</strong></p>
            <p className="m-0 text-[var(--admin-foreground-muted)]">Snapshot <span className="font-mono">{snapshot.snapshotHash.slice(0, 16)}</span> · {snapshot.unreadableRecords} isolated unreadable record{snapshot.unreadableRecords === 1 ? "" : "s"}</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(snapshot.healthCounts).filter(([, count]) => count > 0).map(([state, count]) => <AdminEntityBadge key={state}>{HEALTH_PRESENTATION[state as AdminOperationHealth].label}: {count}</AdminEntityBadge>)}
            </div>
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader><AdminSectionHeading title="Guardrails" /></AdminCardHeader>
          <AdminCardContent className="grid gap-2 text-[length:var(--admin-type-control)]">
            <p className="m-0"><strong>Deployment:</strong> {snapshot.deployment.posture}</p>
            <p className="m-0"><strong>Capabilities:</strong> deny by default; {formatCount(snapshot.capabilities.allowed)} allowed, {formatCount(snapshot.capabilities.held)} held.</p>
            <p className="m-0"><strong>Recovery:</strong> kill switch {snapshot.incidents.killSwitchActive === null ? "unavailable" : snapshot.incidents.killSwitchActive ? "active" : "inactive"}; {formatCount(snapshot.incidents.statistics?.ownerRequired ?? null)} owner-required attempts.</p>
            <p className="m-0"><strong>Monetization is information only; execution is disabled by owner policy.</strong> Operations cannot create accounts, publish, spend, buy, sell or change a business model.</p>
          </AdminCardContent>
        </AdminCard>
      </div>
      <AdminCard><AdminCardHeader><AdminSectionHeading description="Compact projection from the same canonical #419 snapshot; full evidence remains in Implementation Plans." title="Current implementation phase" /></AdminCardHeader><AdminCardContent className="grid gap-2 text-[length:var(--admin-type-control)]"><p className="m-0">Program: <strong>{snapshot.implementation.currentProgramId ?? "Unavailable"}</strong></p><p className="m-0">Current item: <strong>{snapshot.implementation.currentItemId ?? "Unavailable"}</strong>{snapshot.implementation.currentItemState ? ` · ${snapshot.implementation.currentItemState}` : ""}</p><p className="m-0">Final gate: {snapshot.implementation.finalGateReady === null ? "Unavailable" : snapshot.implementation.finalGateReady ? "ready" : "not ready"} · owner actions {formatCount(snapshot.implementation.ownerActions)}</p></AdminCardContent></AdminCard>
      <OperationsNodeTable capacityJobs={snapshot.capacity.jobs} capacityState={snapshot.capacity.state} incidentState={snapshot.incidents.state} incidents={snapshot.incidents.records} nodes={snapshot.nodes} />
    </div>
  );
}

function NodeDetail({ node, snapshot }: { node: AdminOperationNode; snapshot: AdminOperationsSnapshot }) {
  const totalHolds = node.holds ? Object.values(node.holds).reduce((sum, count) => sum + count, 0) : null;
  const capacityJobs = snapshot.capacity.jobs.filter((job) => job.nodeId === node.id);
  const capabilityEdges = snapshot.capabilities.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const incidents = snapshot.incidents.records.filter((incident) => incident.nodeId === node.id);
  return (
    <div className="grid min-w-0 gap-5">
      <Link className="admin-focus-ring w-fit rounded-sm font-medium text-[var(--admin-link)] underline-offset-4 hover:underline" href="/admin/operations?view=nodes">← All nodes</Link>
      <AdminCard>
        <AdminCardHeader><AdminSectionHeading actions={<HealthBadge state={node.health} />} description={`${node.classification} · ${node.lifecycleStage} · ${node.id}`} title={node.displayName} /></AdminCardHeader>
        <AdminCardContent className="grid gap-4">
          <p className="m-0 text-[var(--admin-foreground-muted)]">{node.reason}</p>
          <dl className="m-0 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div><dt className="text-[length:var(--admin-type-label)] font-semibold uppercase text-[var(--admin-foreground-muted)]">Last valid</dt><dd className="m-0 mt-1">{formatDate(node.lastValidAt)}</dd></div>
            <div><dt className="text-[length:var(--admin-type-label)] font-semibold uppercase text-[var(--admin-foreground-muted)]">Next expected</dt><dd className="m-0 mt-1">{formatDate(node.nextExpectedAt)}</dd></div>
            <div><dt className="text-[length:var(--admin-type-label)] font-semibold uppercase text-[var(--admin-foreground-muted)]">Queue</dt><dd className="m-0 mt-1">{node.queue.state}{node.queue.pending === null ? "" : ` · ${node.queue.pending} pending`}</dd></div>
            <div><dt className="text-[length:var(--admin-type-label)] font-semibold uppercase text-[var(--admin-foreground-muted)]">Explicit holds</dt><dd className="m-0 mt-1">{formatCount(totalHolds)}</dd></div>
          </dl>
        </AdminCardContent>
      </AdminCard>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <AdminCard><AdminCardHeader><AdminSectionHeading title="SLO and cadence" /></AdminCardHeader><AdminCardContent className="grid gap-2 text-[length:var(--admin-type-control)]"><p className="m-0">Policy {node.slo.policyVersion} · target {node.slo.rollingValidRunTarget === null ? "unavailable" : `${(node.slo.rollingValidRunTarget * 100).toFixed(0)}%`} · {node.sloState}</p><p className="m-0">Cadence: {node.cadence.kind} in {node.cadence.timezone} · freshness {node.freshnessState}</p><ul className="m-0 grid gap-1 pl-5">{node.cadence.windows.map((window) => <li key={window}>{window}</li>)}</ul><p className="m-0 text-[var(--admin-foreground-muted)]">Due window: {node.dueWindow ?? "unavailable"} · maximum lateness: {node.slo.maximumLatenessMinutes ?? "not set"} min · staleness: {node.slo.maximumStalenessMinutes ?? "not set"} min · recovery target: {node.slo.recoveryTargetMinutes ?? "not set"} min</p>{node.rollingOutcomes ? <p className="m-0">Recent: {node.rollingOutcomes.satisfying}/{node.rollingOutcomes.considered} satisfying · {node.rollingOutcomes.quiet} quiet · {node.rollingOutcomes.held} held · {node.rollingOutcomes.failed} failed · {node.rollingOutcomes.consecutiveFailures} consecutive failures</p> : <p className="m-0 text-[var(--admin-foreground-muted)]">No valid rolling outcome evidence.</p>}</AdminCardContent></AdminCard>
        <AdminCard><AdminCardHeader><AdminSectionHeading title="Bounded recovery" /></AdminCardHeader><AdminCardContent className="grid gap-2 text-[length:var(--admin-type-control)]"><p className="m-0">Maximum {formatCount(node.recovery.maximumAttempts)} automatic attempts; {formatCount(node.recovery.cooldownMinutes)} minute cooldown.</p><p className="m-0">Automatic transient resume: {node.recovery.automaticResume === null ? "unavailable" : node.recovery.automaticResume ? "policy permits after all gates" : "disabled"}</p>{node.recovery.permittedActions.length ? <div className="flex flex-wrap gap-1.5">{node.recovery.permittedActions.map((action) => <AdminEntityBadge key={action}>{action}</AdminEntityBadge>)}</div> : <p className="m-0 text-[var(--admin-foreground-muted)]">No automatic recovery action is permitted.</p>}</AdminCardContent></AdminCard>
        <AdminCard><AdminCardHeader><AdminSectionHeading title="Capability boundary" /></AdminCardHeader><AdminCardContent className="grid gap-2 text-[length:var(--admin-type-control)]"><p className="m-0">Authority: {node.capability.authorityRequirement}</p><p className="m-0">Privacy: {node.capability.privacyClassification}</p><p className="m-0">Data actions: {node.capability.dataActionClasses.join(", ") || "unavailable"}</p><p className="m-0 text-[var(--admin-foreground-muted)]">Inbound {formatCount(node.capability.inboundAllowed)} allowed / {formatCount(node.capability.inboundHeld)} held · outbound {formatCount(node.capability.outboundAllowed)} allowed / {formatCount(node.capability.outboundHeld)} held.</p></AdminCardContent></AdminCard>
        <AdminCard><AdminCardHeader><AdminSectionHeading title="Operational evidence" /></AdminCardHeader><AdminCardContent className="grid gap-2 text-[length:var(--admin-type-control)]"><p className="m-0">Health record: {node.recordState}</p><p className="m-0">Dependency health refs: {node.dependencyHealthRefs.length}</p><p className="m-0">Run evidence refs: {node.evidenceRefs.length}</p><p className="m-0">Owner attention refs: {node.ownerAttentionRefs.length}</p></AdminCardContent></AdminCard>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <AdminCard><AdminCardHeader><AdminSectionHeading title={`Next work and capacity (${capacityJobs.length})`} /></AdminCardHeader><AdminCardContent className="grid gap-2 text-[length:var(--admin-type-control)]">{capacityJobs.length ? capacityJobs.map((job) => <div className="border-b border-[var(--admin-border)] pb-2 last:border-0 last:pb-0" key={job.id}><p className="m-0 font-semibold">{job.phase} · {job.decision}</p><p className="m-0 text-[var(--admin-foreground-muted)]">{job.reason}</p><p className="m-0">{formatUsd(job.expectedCostUsd)} · next {formatDate(job.nextEligibleAt ?? job.dueAt)} · {job.acceptedArtifactRef ? "accepted artifact reusable" : "no accepted artifact ref"}</p></div>) : <p className="m-0 text-[var(--admin-foreground-muted)]">No valid current capacity decision for this node.</p>}</AdminCardContent></AdminCard>
        <AdminCard><AdminCardHeader><AdminSectionHeading title={`Dependencies and edges (${capabilityEdges.length})`} /></AdminCardHeader><AdminCardContent className="grid gap-2 text-[length:var(--admin-type-control)]"><p className="m-0">Declared dependencies: {node.dependencyNodeIds.join(", ") || "none"}</p>{capabilityEdges.map((edge) => <p className="m-0" key={`${edge.source}:${edge.target}:${edge.capability}`}>{edge.source} → {edge.target}: <strong>{edge.capability}</strong> ({edge.decision})</p>)}</AdminCardContent></AdminCard>
        <AdminCard><AdminCardHeader><AdminSectionHeading title={`Incidents and owner attention (${incidents.length})`} /></AdminCardHeader><AdminCardContent className="grid gap-2 text-[length:var(--admin-type-control)]">{incidents.length ? incidents.map((incident) => <div key={incident.id}><p className="m-0 font-semibold">{incident.status}: {incident.impact}</p><p className="m-0 text-[var(--admin-foreground-muted)]">{incident.exactOwnerAction}</p></div>) : <p className="m-0 text-[var(--admin-foreground-muted)]">No independently valid incident record.</p>}{node.unavailableReasons.map((reason) => <p className="m-0 text-[var(--admin-foreground-muted)]" key={reason}>{reason}</p>)}</AdminCardContent></AdminCard>
      </div>
    </div>
  );
}

function ScheduleCapacity({ snapshot }: { snapshot: AdminOperationsSnapshot }) {
  const capacity = snapshot.capacity;
  const clock = <AdminCard><AdminCardHeader><AdminSectionHeading description="Read from registered SLO cadence. This view cannot add, move or execute a window." title="Canonical Europe/Prague operating clock" /></AdminCardHeader><div className="overflow-x-auto" data-horizontal-scroll><table className="w-full min-w-[720px] border-collapse text-left text-[length:var(--admin-type-control)]"><thead className="bg-[var(--admin-surface-muted)]"><tr><th className="px-4 py-2.5" scope="col">Node</th><th className="px-4 py-2.5" scope="col">Cadence</th><th className="px-4 py-2.5" scope="col">Windows</th><th className="px-4 py-2.5" scope="col">Stage</th></tr></thead><tbody>{snapshot.nodes.map((node) => <tr className="border-t border-[var(--admin-border)]" key={node.id}><td className="px-4 py-3"><Link className="font-semibold text-[var(--admin-link)]" href={nodeHref(node.id)}>{node.displayName}</Link></td><td className="px-4 py-3">{node.cadence.kind}</td><td className="px-4 py-3">{node.cadence.windows.join("; ") || "Unavailable"}</td><td className="px-4 py-3">{node.lifecycleStage}</td></tr>)}</tbody></table></div></AdminCard>;
  if (capacity.state !== "present" || !capacity.budget || !capacity.counts) return <div className="grid min-w-0 gap-5">{clock}<AdminStateMessage description="No valid current capacity plan exists. Operations does not infer due work or allocate replacement capacity." state={capacity.state === "malformed" ? "malformed" : "unavailable"} title="Capacity plan unavailable" /></div>;
  return (
    <div className="grid min-w-0 gap-5">
      <AdminCallout tone="information"><p className="m-0"><strong>The Europe/Prague dispatcher remains the sole scheduler.</strong> This plan can hold, defer or reuse declared work; it cannot invent work, raise a budget or schedule deployment.</p></AdminCallout>
      {clock}
      <div className="grid overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] md:grid-cols-4 md:divide-x md:divide-[var(--admin-border)]">
        <AdminMetric label="Budget headroom" note={`${formatUsd(capacity.budget.spentUsd)} spent · ${formatUsd(capacity.budget.reservedUsd)} reserved`} value={formatUsd(capacity.budget.headroomUsd)} />
        <AdminMetric label="Due" note={`${capacity.counts.running} selected to run`} value={capacity.counts.due} />
        <AdminMetric label="Reuse / skip" note="Duplicate work avoided" value={`${capacity.counts.reused} / ${capacity.counts.skipped}`} />
        <AdminMetric label="Held / deferred" note={`${formatCount(capacity.collisionCount)} resource collisions`} value={`${capacity.counts.held} / ${capacity.counts.deferred}`} />
      </div>
      <AdminCard><AdminCardHeader><AdminSectionHeading description={`Period ${capacity.period} · generated ${formatDate(capacity.generatedAt)} · ${capacity.activeLeaseRefs.length} active lease refs`} title={`Capacity decisions (${capacity.jobs.length})`} /></AdminCardHeader><div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-[length:var(--admin-type-control)]"><thead className="bg-[var(--admin-surface-muted)]"><tr><th className="px-4 py-2.5" scope="col">Job</th><th className="px-4 py-2.5" scope="col">Due</th><th className="px-4 py-2.5" scope="col">Decision</th><th className="px-4 py-2.5" scope="col">Cost / headroom</th><th className="px-4 py-2.5" scope="col">Reason</th></tr></thead><tbody>{capacity.jobs.map((job) => <tr className="border-t border-[var(--admin-border)] align-top" key={job.id}><td className="px-4 py-3"><Link className="font-semibold text-[var(--admin-link)]" href={nodeHref(job.nodeId)}>{job.nodeId}</Link><p className="m-0 mt-1">{job.phase} · {job.classification}</p></td><td className="px-4 py-3">{formatDate(job.dueAt)}</td><td className="px-4 py-3"><AdminStatusBadge tone={job.decision === "run" ? "success" : job.decision === "held" ? "warning" : "neutral"}>{job.decision}</AdminStatusBadge></td><td className="px-4 py-3">{formatUsd(job.expectedCostUsd)} / {formatUsd(job.nodeBudgetHeadroomUsd)}</td><td className="px-4 py-3 text-[var(--admin-foreground-muted)]">{job.reason}</td></tr>)}</tbody></table></div></AdminCard>
      <AdminCard><AdminCardHeader><AdminSectionHeading title="Provider headroom" /></AdminCardHeader><AdminCardContent>{capacity.providerHeadroom.length ? <div className="flex flex-wrap gap-2">{capacity.providerHeadroom.map((provider) => <AdminEntityBadge key={provider.providerId}>{provider.providerId}: {provider.remaining}</AdminEntityBadge>)}</div> : <p className="m-0 text-[var(--admin-foreground-muted)]">No provider headroom was declared.</p>}</AdminCardContent></AdminCard>
    </div>
  );
}

function IncidentsRecovery({ snapshot }: { snapshot: AdminOperationsSnapshot }) {
  const incidents = snapshot.incidents;
  return (
    <div className="grid min-w-0 gap-5">
      {incidents.state !== "present" ? <AdminStateMessage description="No valid incident snapshot exists. Individual owner-attention records remain visible only when independently valid." state={incidents.state === "malformed" ? "malformed" : "unavailable"} title="Incident summary unavailable" /> : null}
      {incidents.killSwitchActive ? <AdminStateMessage description="Automatic recovery is held across the registered kill-switch scope." state="held" title="Recovery kill switch active" /> : null}
      {incidents.statistics ? <div className="grid overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] md:grid-cols-4 md:divide-x md:divide-[var(--admin-border)]"><AdminMetric label="Active incidents" value={formatCount(incidents.activeCount)} /><AdminMetric label="Recovered" note={`${incidents.statistics.consideredAttempts} attempts considered`} value={incidents.statistics.recovered} /><AdminMetric label="Failed / ambiguous" value={`${incidents.statistics.failed} / ${incidents.statistics.ambiguous}`} /><AdminMetric label="Recovery cost" note="Shared recovery is bounded to $0" value={formatUsd(incidents.statistics.costUsd)} /></div> : null}
      <AdminCard><AdminCardHeader><AdminSectionHeading description={`Next retry: ${formatDate(incidents.nextRetryAt)} · ${incidents.pausedScopes.length} paused scopes`} title={`Owner-attention incidents (${incidents.records.length})`} /></AdminCardHeader>{incidents.records.length ? <ul className="m-0 list-none p-0">{incidents.records.map((incident) => <li className="grid gap-2 border-b border-[var(--admin-border)] px-4 py-3 last:border-b-0" key={incident.id}><div className="flex flex-wrap items-center justify-between gap-2"><Link className="font-semibold text-[var(--admin-link)]" href={nodeHref(incident.nodeId)}>{incident.nodeId}</Link><AdminStatusBadge tone={incident.status === "active" ? "risk" : "neutral"}>{incident.status}</AdminStatusBadge></div><p className="m-0"><strong>Impact:</strong> {incident.impact}</p><p className="m-0"><strong>Owner action:</strong> {incident.exactOwnerAction}</p><p className="m-0 text-[var(--admin-foreground-muted)]"><strong>Unaffected:</strong> {incident.unaffectedScope}</p><p className="m-0 text-[var(--admin-foreground-muted)]"><strong>Retry:</strong> {incident.retryCondition}</p><p className="m-0 font-mono text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">Policy {incident.sourcePolicyRef} · {incident.correctionCount} corrections · {incident.evidenceRefs.length} evidence refs</p></li>)}</ul> : <AdminCardContent><p className="m-0 text-[var(--admin-foreground-muted)]">No independently valid owner-attention incident is recorded.</p></AdminCardContent>}</AdminCard>
    </div>
  );
}

function CapabilityBoundaries({ snapshot }: { snapshot: AdminOperationsSnapshot }) {
  return (
    <div className="grid min-w-0 gap-5">
      <AdminCallout tone="information"><p className="m-0"><strong>Deny by default.</strong> A missing edge grants no read, content, spend or action authority. Operations itself receives health metadata only.</p></AdminCallout>
      <div className="grid overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] md:grid-cols-4 md:divide-x md:divide-[var(--admin-border)]"><AdminMetric label="Map version" value={snapshot.capabilities.mapVersion ?? "Unavailable"} /><AdminMetric label="Allowed edges" value={formatCount(snapshot.capabilities.allowed)} /><AdminMetric label="Held edges" value={formatCount(snapshot.capabilities.held)} /><AdminMetric label="Isolation rules" value={snapshot.capabilities.isolationRules.length} /></div>
      <AdminCard><AdminCardHeader><AdminSectionHeading description="Exact directional capability and payload schema. Missing edges remain denied." title={`Registered capability edges (${snapshot.capabilities.edges.length})`} /></AdminCardHeader><div className="overflow-x-auto" data-horizontal-scroll><table className="w-full min-w-[940px] border-collapse text-left text-[length:var(--admin-type-control)]"><thead className="bg-[var(--admin-surface-muted)]"><tr><th className="px-4 py-2.5" scope="col">Source → target</th><th className="px-4 py-2.5" scope="col">Capability / schema</th><th className="px-4 py-2.5" scope="col">Decision</th><th className="px-4 py-2.5" scope="col">Reason</th><th className="px-4 py-2.5" scope="col">Enforcement / probe</th></tr></thead><tbody>{snapshot.capabilities.edges.map((edge) => <tr className="border-t border-[var(--admin-border)] align-top" key={`${edge.source}:${edge.target}:${edge.capability}:${edge.dataSchemaVersion}`}><td className="px-4 py-3"><Link className="font-semibold text-[var(--admin-link)]" href={nodeHref(edge.source)}>{edge.source}</Link> → <Link className="font-semibold text-[var(--admin-link)]" href={nodeHref(edge.target)}>{edge.target}</Link></td><td className="px-4 py-3">{edge.capability}<p className="m-0 mt-1 font-mono text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{edge.dataSchemaVersion}</p></td><td className="px-4 py-3"><AdminStatusBadge tone={edge.decision === "allowed" ? "success" : edge.decision === "held" ? "warning" : "neutral"}>{edge.decision}</AdminStatusBadge></td><td className="px-4 py-3 text-[var(--admin-foreground-muted)]">{edge.reason}<p className="m-0 mt-1 text-[length:var(--admin-type-label)]">{edge.governingReference}</p></td><td className="px-4 py-3 font-mono text-[length:var(--admin-type-label)]">{edge.runtimeEnforcementPoint}<br />{edge.testProbeReference}</td></tr>)}</tbody></table></div></AdminCard>
      <AdminCard><AdminCardHeader><AdminSectionHeading description="Permanent content and private-data boundaries enforced before any cross-node handoff." title="Isolation policy" /></AdminCardHeader><ul className="m-0 list-none p-0">{snapshot.capabilities.isolationRules.map((rule) => <li className="border-b border-[var(--admin-border)] px-4 py-3 last:border-b-0" key={rule.id}><p className="m-0 font-semibold">{rule.id}</p><p className="m-0 mt-1 text-[var(--admin-foreground-muted)]">{rule.reason}</p><p className="m-0 mt-1 text-[length:var(--admin-type-label)]">{rule.governingReference}</p></li>)}</ul></AdminCard>
      <OperationsNodeTable capacityJobs={snapshot.capacity.jobs} capacityState={snapshot.capacity.state} incidentState={snapshot.incidents.state} incidents={snapshot.incidents.records} nodes={snapshot.nodes} />
    </div>
  );
}

function PlansProgress({ snapshot }: { snapshot: AdminOperationsSnapshot }) {
  const progress = snapshot.implementation;
  return (
    <div className="grid min-w-0 gap-5">
      {progress.state !== "present" ? <AdminStateMessage description="The compact card does not infer plan state. Open Implementation Plans for the full missing or malformed-state explanation." state={progress.state === "malformed" ? "malformed" : "unavailable"} title="Implementation progress unavailable" /> : null}
      <div className="grid overflow-hidden rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] md:grid-cols-4 md:divide-x md:divide-[var(--admin-border)]"><AdminMetric label="Programs" value={formatCount(progress.programs)} /><AdminMetric label="Mandatory complete" value={progress.mandatoryCompleted === null || progress.mandatoryTotal === null ? "Unavailable" : `${progress.mandatoryCompleted}/${progress.mandatoryTotal}`} /><AdminMetric label="Owner actions" value={formatCount(progress.ownerActions)} /><AdminMetric label="Evidence risks" note={`${formatCount(progress.unreadableItems)} unreadable records`} value={formatCount(progress.evidenceRisks)} /></div>
      <AdminCard><AdminCardHeader><AdminSectionHeading title="Active Autonomous Operations work" /></AdminCardHeader><AdminCardContent className="grid gap-2"><p className="m-0">{progress.currentProgramId ?? "Program unavailable"} · {progress.currentItemId ?? "current item unavailable"}{progress.currentItemState ? ` · ${progress.currentItemState}` : ""} · final gate {progress.finalGateReady === null ? "unavailable" : progress.finalGateReady ? "ready" : "not ready"}</p><p className="m-0">Next unblocked: {progress.nextUnblockedItemIds.join(", ") || "none recorded"} · owner waiting: {progress.ownerWaitingItemIds.join(", ") || "none recorded"}</p></AdminCardContent></AdminCard>
      <AdminCard><AdminCardHeader><AdminSectionHeading description={`Generated ${formatDate(progress.generatedAt)} · source ${progress.sourceFreshness}`} title="Canonical implementation snapshot" /></AdminCardHeader><AdminCardContent><p className="m-0">This is a compact projection of the same #419 snapshot. Work-item detail, probes, blockers, pull requests and final gates remain owned by Implementation Plans.</p></AdminCardContent><div className="border-t border-[var(--admin-border)] px-4 py-3"><Link className="admin-focus-ring rounded-sm font-semibold text-[var(--admin-link)] underline-offset-4 hover:underline" href="/admin/implementation-plans">Open Implementation Plans →</Link></div></AdminCard>
    </div>
  );
}

export function OperationsControlCenter({
  selectedNodeId,
  selectedView = "overview",
  snapshot
}: {
  selectedNodeId?: string;
  selectedView?: string;
  snapshot: AdminOperationsSnapshot;
}) {
  const views: readonly OperationsView[] = ["overview", "nodes", "schedule", "incidents", "capabilities", "plans"];
  const view = views.includes(selectedView as OperationsView) ? selectedView as OperationsView : "overview";
  const node = selectedNodeId ? snapshot.nodes.find((candidate) => candidate.id === selectedNodeId) : null;
  const invalidNode = Boolean(selectedNodeId && !node);
  const diagnostics = `Operations snapshot ${snapshot.snapshotHash}; state ${snapshot.state}; generated ${snapshot.generatedAt ?? "never"}; unreadable ${snapshot.unreadableRecords}; attention ${snapshot.nodes.filter((candidate) => !["healthy", "quiet", "held", "paused"].includes(candidate.health)).length}; incidents ${snapshot.incidents.activeCount ?? "unavailable"}.`;
  return (
    <div className="grid min-w-0 gap-5">
      <SnapshotNotice snapshot={snapshot} />
      <nav aria-label="Operations views" className="flex min-w-0 flex-wrap gap-2">
        {views.map((candidate) => <Link aria-current={view === candidate ? "page" : undefined} className={`admin-focus-ring rounded-[var(--admin-radius)] border px-3 py-2 text-[length:var(--admin-type-control)] font-semibold ${view === candidate ? "border-[var(--admin-primary)] bg-[var(--admin-primary)] text-[var(--admin-primary-foreground)]" : "border-[var(--admin-border-strong)] bg-[var(--admin-surface)] text-[var(--admin-foreground)] hover:bg-[var(--admin-surface-hover)]"}`} href={`/admin/operations?view=${candidate}`} key={candidate}>{candidate === "schedule" ? "Schedule & capacity" : candidate === "incidents" ? "Incidents & recovery" : candidate === "capabilities" ? "Capability boundaries" : candidate === "plans" ? "Plans & progress" : candidate[0]!.toUpperCase() + candidate.slice(1)}</Link>)}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3 text-[length:var(--admin-type-control)]"><p className="m-0 text-[var(--admin-foreground-muted)]">Server-sanitized, read-only snapshot · <span className="font-mono">{snapshot.snapshotHash.slice(0, 16)}</span></p><OperationsCopyDiagnostics value={diagnostics} /></div>
      {invalidNode ? <AdminStateMessage description="The requested node is absent from the validated Operations registry." state="unavailable" title="Operational node not found" /> : null}
      {view === "overview" ? <Overview snapshot={snapshot} /> : null}
      {view === "nodes" ? node ? <NodeDetail node={node} snapshot={snapshot} /> : <OperationsNodeTable capacityJobs={snapshot.capacity.jobs} capacityState={snapshot.capacity.state} incidentState={snapshot.incidents.state} incidents={snapshot.incidents.records} nodes={snapshot.nodes} /> : null}
      {view === "schedule" ? <ScheduleCapacity snapshot={snapshot} /> : null}
      {view === "incidents" ? <IncidentsRecovery snapshot={snapshot} /> : null}
      {view === "capabilities" ? <CapabilityBoundaries snapshot={snapshot} /> : null}
      {view === "plans" ? <PlansProgress snapshot={snapshot} /> : null}
    </div>
  );
}
