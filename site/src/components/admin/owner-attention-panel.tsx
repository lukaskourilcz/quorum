import Link from "next/link";
import { AdminEntityBadge, AdminStateMessage, AdminStatusBadge } from "./admin-primitives";
import type { OwnerAttentionItem, OwnerAttentionSnapshot } from "@/lib/owner-attention";

/** Read-only projections. Items are resolved only at their canonical source. */

const URGENCY = {
  blocking: { label: "Blocking", tone: "destructive" },
  soon: { label: "Soon", tone: "warning" },
  whenever: { label: "Whenever", tone: "neutral" },
} as const;

function sourceHref(item: OwnerAttentionItem): string | null {
  if (item.sourceKind === "inbox") return "/admin?venture=global";
  return null;
}

function Item({ item }: { item: OwnerAttentionItem }) {
  const urgency = URGENCY[item.urgency];
  const href = sourceHref(item);
  return (
    <li className="grid min-w-0 gap-2 border-b border-[var(--admin-border)] py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <AdminStatusBadge tone={urgency.tone}>{urgency.label}</AdminStatusBadge>
        <span className="text-[length:var(--admin-type-section)] font-semibold text-[var(--admin-foreground)]">{item.title}</span>
        {item.since ? <AdminEntityBadge>Since {item.since}</AdminEntityBadge> : null}
      </div>
      <p className="m-0 max-w-[70ch] text-[length:var(--admin-type-body)] leading-5 text-[var(--admin-foreground)]">{item.plain}</p>
      {item.steps.length ? (
        <ol className="m-0 grid list-decimal gap-1 pl-5 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">
          {item.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-subtle)]">
        <span className="break-all">{item.sourceKind === "runtime" ? `setting · ${item.sourceRef}` : item.sourceRef}</span>
        {href ? <Link className="admin-focus-ring underline underline-offset-2" href={href}>Open the file</Link> : null}
        {item.needsPlainCopy ? <AdminStatusBadge tone="warning">No plain description yet</AdminStatusBadge> : null}
      </div>
    </li>
  );
}

export function OwnerAttentionPanel({ kind, snapshot }: { kind: "approvals" | "manual-tasks"; snapshot: OwnerAttentionSnapshot }) {
  const items = kind === "approvals" ? snapshot.approvals : snapshot.manualTasks;
  const lead = kind === "approvals"
    ? "Everything waiting for your yes. Each one names exactly what it approves and what it costs, so you do not have to think twice."
    : "Everything only you can do: keys, accounts and switches. Nothing here can be done by the system on your behalf.";

  if (snapshot.state === "missing") {
    return (
      <div className="grid gap-3">
        <p className="m-0 max-w-[70ch] text-[length:var(--admin-type-body)] leading-5 text-[var(--admin-foreground-muted)]">{lead}</p>
        <AdminStateMessage
          description={<>The next daily cycle builds it from <code>state/INBOX.md</code>, <code>docs/NEEDED.md</code>, and settings that are not yet in place.</>}
          state="unavailable"
          title="The owner-attention list has not been written yet"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="m-0 max-w-[70ch] text-[length:var(--admin-type-body)] leading-5 text-[var(--admin-foreground-muted)]">{lead}</p>
      {items.length === 0 ? (
        <AdminStateMessage
          description={kind === "manual-tasks" ? "Every key and switch the system needs is in place." : undefined}
          state="initial-empty"
          title={kind === "approvals" ? "Nothing is waiting for your approval" : "Nothing is waiting on you"}
        />
      ) : <ul className="m-0 grid list-none p-0">{items.map((item) => <Item item={item} key={`${item.sourceKind}-${item.id}`} />)}</ul>}
      {snapshot.unreadable > 0 ? (
        <AdminStateMessage state="malformed" title={`${snapshot.unreadable} ${snapshot.unreadable === 1 ? "entry" : "entries"} could not be read`} />
      ) : null}
      {snapshot.generatedAt ? (
        <p className="admin-tabular m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-subtle)]">
          Rebuilt {snapshot.generatedAt.slice(0, 10)} · resolve an item where it came from and it disappears on the next run
        </p>
      ) : null}
    </div>
  );
}
