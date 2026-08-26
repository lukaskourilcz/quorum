"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { AdminOperationCapacityJob, AdminOperationHealth, AdminOperationIncident, AdminOperationNode } from "@/lib/admin-operations";
import { AdminCard, AdminCardHeader, AdminSectionHeading, AdminStatusBadge } from "./admin-primitives";

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

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Prague" }).format(new Date(value));
}

function nodeHref(nodeId: string): string {
  return `/admin/operations?view=nodes&node=${encodeURIComponent(nodeId)}`;
}

function Filter({ children, label }: { children: ReactNode; label: string }) {
  return <label className="grid min-w-36 gap-1 text-[length:var(--admin-type-label)] font-semibold text-[var(--admin-foreground-muted)]">{label}{children}</label>;
}

export function OperationsNodeTable({
  capacityJobs = [],
  capacityState = "missing",
  incidentState = "missing",
  incidents = [],
  nodes
}: {
  capacityJobs?: readonly AdminOperationCapacityJob[];
  capacityState?: "present" | "missing" | "malformed";
  incidentState?: "present" | "missing" | "malformed";
  incidents?: readonly AdminOperationIncident[];
  nodes: readonly AdminOperationNode[];
}) {
  const [health, setHealth] = useState("all");
  const [slo, setSlo] = useState("all");
  const [stage, setStage] = useState("all");
  const [classification, setClassification] = useState("all");
  const [autonomy, setAutonomy] = useState("all");
  const [attention, setAttention] = useState("all");
  const [dependency, setDependency] = useState("all");
  const classifications = useMemo(() => [...new Set(nodes.map((node) => node.classification))].sort(), [nodes]);
  const dependencies = useMemo(() => [...new Set(nodes.flatMap((node) => node.dependencyNodeIds))].sort(), [nodes]);
  const filtered = nodes.filter((node) =>
    (health === "all" || node.health === health) &&
    (slo === "all" || node.sloState === slo) &&
    (stage === "all" || node.lifecycleStage === stage) &&
    (classification === "all" || node.classification === classification) &&
    (autonomy === "all" || (autonomy === "eligible" ? node.autonomyEligible === true : node.autonomyEligible !== true)) &&
    (dependency === "all" || (dependency === "none" ? node.dependencyNodeIds.length === 0 : node.dependencyNodeIds.includes(dependency))) &&
    (attention === "all" || (attention === "required"
      ? node.ownerAttentionRefs.length + (node.holds?.owner ?? 0) > 0
      : node.ownerAttentionRefs.length === 0 && (node.holds?.owner ?? 0) === 0))
  );
  const selectClass = "admin-focus-ring min-h-11 rounded-[var(--admin-radius)] border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 py-2 text-[length:var(--admin-type-control)] font-medium text-[var(--admin-foreground)]";
  return (
    <AdminCard>
      <AdminCardHeader><AdminSectionHeading description="Filter operational metadata only. No content, private payload, credential or provider response crosses this boundary." title={`Ventures and services (${nodes.length})`} /></AdminCardHeader>
      <div className="flex min-w-0 flex-wrap gap-3 border-t border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-4 py-3">
        <Filter label="Health"><select className={selectClass} onChange={(event) => setHealth(event.target.value)} value={health}><option value="all">All states</option>{Object.entries(HEALTH_PRESENTATION).map(([value, presentation]) => <option key={value} value={value}>{presentation.label}</option>)}</select></Filter>
        <Filter label="SLO"><select className={selectClass} onChange={(event) => setSlo(event.target.value)} value={slo}><option value="all">All SLO states</option><option value="satisfied">Satisfied</option><option value="missed">Missed or late</option><option value="unavailable">Unavailable</option></select></Filter>
        <Filter label="Stage"><select className={selectClass} onChange={(event) => setStage(event.target.value)} value={stage}><option value="all">All stages</option>{[...new Set(nodes.map((node) => node.lifecycleStage))].sort().map((value) => <option key={value} value={value}>{value}</option>)}</select></Filter>
        <Filter label="Classification"><select className={selectClass} onChange={(event) => setClassification(event.target.value)} value={classification}><option value="all">All classes</option>{classifications.map((value) => <option key={value} value={value}>{value}</option>)}</select></Filter>
        <Filter label="Autonomy"><select className={selectClass} onChange={(event) => setAutonomy(event.target.value)} value={autonomy}><option value="all">All scopes</option><option value="eligible">Eligible now</option><option value="review">Review or held</option></select></Filter>
        <Filter label="Dependency"><select className={selectClass} onChange={(event) => setDependency(event.target.value)} value={dependency}><option value="all">All dependencies</option><option value="none">No dependency</option>{dependencies.map((value) => <option key={value} value={value}>{value}</option>)}</select></Filter>
        <Filter label="Owner attention"><select className={selectClass} onChange={(event) => setAttention(event.target.value)} value={attention}><option value="all">All nodes</option><option value="required">Action recorded</option><option value="none">No action</option></select></Filter>
      </div>
      <p aria-live="polite" className="m-0 border-t border-[var(--admin-border)] px-4 py-2 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]" role="status">Showing {filtered.length} of {nodes.length} nodes.</p>
      <div className="overflow-x-auto" data-horizontal-scroll>
        <table className="w-full min-w-[1280px] border-collapse text-left text-[length:var(--admin-type-control)]">
          <thead className="bg-[var(--admin-surface-muted)] text-[var(--admin-foreground-muted)]"><tr><th className="px-4 py-2.5 font-semibold" scope="col">Node</th><th className="px-4 py-2.5 font-semibold" scope="col">Type / stage</th><th className="px-4 py-2.5 font-semibold" scope="col">Health / SLO</th><th className="px-4 py-2.5 font-semibold" scope="col">Autonomy / constraints</th><th className="px-4 py-2.5 font-semibold" scope="col">Last / next</th><th className="px-4 py-2.5 font-semibold" scope="col">Capacity</th><th className="px-4 py-2.5 font-semibold" scope="col">Incidents / progress</th></tr></thead>
          <tbody>{filtered.map((node) => {
            const presentation = HEALTH_PRESENTATION[node.health];
            const jobs = capacityJobs.filter((job) => job.nodeId === node.id);
            const expectedCost = jobs.reduce((total, job) => total + job.expectedCostUsd, 0);
            const reused = jobs.filter((job) => job.decision === "reuse").length;
            const activeIncidents = incidents.filter((incident) => incident.nodeId === node.id && incident.status === "active").length;
            const constraintCount = node.holds ? Object.values(node.holds).reduce((total, count) => total + count, 0) : null;
            return <tr className="border-t border-[var(--admin-border)] align-top" key={node.id}><td className="px-4 py-3"><Link className="admin-focus-ring rounded-sm font-semibold text-[var(--admin-link)] underline-offset-4 hover:underline" href={nodeHref(node.id)}>{node.displayName}</Link><p className="m-0 mt-1 font-mono text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{node.id}</p></td><td className="px-4 py-3">{node.classification}<p className="m-0 mt-1 text-[var(--admin-foreground-muted)]">{node.lifecycleStage}</p></td><td className="px-4 py-3"><AdminStatusBadge tone={presentation.tone}>{presentation.label}</AdminStatusBadge><p className="m-0 mt-1">SLO: {node.sloState}</p><p className="m-0 mt-1 max-w-sm text-[var(--admin-foreground-muted)]">{node.reason}</p></td><td className="px-4 py-3">{node.autonomyEligible === null ? "Unavailable" : node.autonomyEligible ? "Eligible" : "Review or held"}<p className="m-0 mt-1 text-[var(--admin-foreground-muted)]">{node.dependencyNodeIds.length} dependencies · {constraintCount === null ? "holds unavailable" : `${constraintCount} holds`}</p></td><td className="px-4 py-3"><time dateTime={node.lastValidAt ?? undefined}>{formatDate(node.lastValidAt)}</time><p className="m-0 mt-1 text-[var(--admin-foreground-muted)]">Next {formatDate(node.nextExpectedAt)}</p></td><td className="px-4 py-3">{capacityState === "present" ? `${jobs.length} jobs · $${expectedCost.toFixed(2)}` : "Unavailable"}<p className="m-0 mt-1 text-[var(--admin-foreground-muted)]">{capacityState === "present" ? `${reused} reused · queue ${node.queue.state}` : "No valid capacity plan"}</p></td><td className="px-4 py-3">{incidentState === "present" ? `${activeIncidents} active` : "Unavailable"}<p className="m-0 mt-1 text-[var(--admin-foreground-muted)]">{node.implementation ? `${node.implementation.programId}: ${node.implementation.state}` : "No node-specific program"}</p></td></tr>;
          })}</tbody>
        </table>
      </div>
    </AdminCard>
  );
}
