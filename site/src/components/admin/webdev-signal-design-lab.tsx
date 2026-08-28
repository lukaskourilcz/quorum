import { AdminCallout, AdminCard, AdminCardContent, AdminEntityBadge, AdminStatusBadge } from "./admin-primitives";
import type { WebDevDesignLabSnapshot } from "@/lib/webdev-signal-design-lab";

export function WebDevSignalDesignLab({ snapshot }: { snapshot: WebDevDesignLabSnapshot }) {
  if (snapshot.entries.length === 0) {
    return (
      <AdminCallout tone={snapshot.unreadable > 0 ? "warning" : "information"}>
        No recorded WebDev Signal render receipts yet{snapshot.unreadable > 0 ? `; ${snapshot.unreadable} malformed pair(s) were isolated` : ""}.
      </AdminCallout>
    );
  }
  return (
    <div className="grid gap-4" data-webdev-design-lab>
      {snapshot.entries.map((entry) => (
        <AdminCard key={entry.receiptRef}>
          <AdminCardContent className="grid gap-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="m-0 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">
                  {entry.edition} · {entry.template.id}@{entry.template.version} · {entry.brand.id}@{entry.brand.version}
                </p>
                <h3 className="m-0 mt-1 text-base font-semibold">{entry.panels[0]?.heading ?? entry.packageRef}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <AdminStatusBadge tone={entry.outcome === "success" ? "success" : entry.outcome === "held" ? "warning" : "destructive"}>{entry.outcome}</AdminStatusBadge>
                <AdminEntityBadge>{entry.status}</AdminEntityBadge>
                <AdminEntityBadge>{entry.cacheState}</AdminEntityBadge>
              </div>
            </header>
            {entry.reason ? <AdminCallout tone="warning">{entry.reason}</AdminCallout> : null}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {entry.panels.map((panel) => (
                <section className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-4" key={panel.id}>
                  <p className="m-0 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">{panel.id} · {panel.semantics.join(" + ")}</p>
                  <h4 className="m-0 mt-2 font-semibold">{panel.heading}</h4>
                  <p className="m-0 mt-2 text-sm leading-6 text-[var(--admin-foreground-muted)]">{panel.body}</p>
                  {panel.sourceRefs.map((ref) => <p className="m-0 mt-2 break-all font-mono text-xs" key={ref}>{ref}</p>)}
                </section>
              ))}
            </div>
            <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(entry.checks).map(([check, status]) => (
                <div className="rounded-[var(--admin-radius-sm)] bg-[var(--admin-surface-secondary)] p-3" key={check}>
                  <dt className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">{check}</dt>
                  <dd className="m-0 mt-1 font-semibold">{status}</dd>
                </div>
              ))}
            </dl>
            <p className="m-0 break-all font-mono text-xs text-[var(--admin-foreground-muted)]">
              payload {entry.payloadHash} · outputs {entry.outputHashes.join(", ")} · correction {entry.correctionSequence}
            </p>
          </AdminCardContent>
        </AdminCard>
      ))}
    </div>
  );
}
