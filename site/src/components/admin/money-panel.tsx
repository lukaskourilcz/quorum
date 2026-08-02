import Link from "next/link";
import { ArrowRight, CircleDollarSign, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { KpiStatus, MonetizationStatus, PublicMoneySnapshot } from "@/lib/money-records";

const kpiTone = (status: KpiStatus): "success" | "warning" | "danger" | "neutral" => status === "on-track" ? "success" : status === "at-risk" ? "warning" : status === "off-track" ? "danger" : "neutral";
const moneyTone = (status: MonetizationStatus): "success" | "warning" | "accent" | "neutral" => status === "active" ? "success" : status === "proposed" ? "warning" : status === "ready" ? "accent" : "neutral";
const statusLabel = (status: string) => status.replaceAll("-", " ");

export function AdminMoneyPanel({ snapshot }: { snapshot: PublicMoneySnapshot | null }) {
  if (!snapshot) {
    return <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8"><Callout tone="warning">Quarterly targets and earning methods will appear after the next 06:00 company cycle.</Callout></section>;
  }
  const kpiCounts = (["on-track", "at-risk", "off-track", "unavailable"] as const).map((status) => ({
    status,
    count: snapshot.quarter.statuses.filter((entry) => entry.status === status).length
  }));
  return (
    <section aria-labelledby="admin-money-heading" className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><CircleDollarSign aria-hidden="true" className="size-5 text-[var(--accent)]" /><p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--accent)]">Quarter and earning plans</p></div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]" id="admin-money-heading">What needs attention before money can move</h2>
        </div>
        <Link className={buttonVariants({ variant: "secondary" })} href="/money">Public Money <ArrowRight aria-hidden="true" className="size-4" /></Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCounts.map(({ status, count }) => <div className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-4" key={status}><Badge tone={kpiTone(status)}>{statusLabel(status)}</Badge><p className="mt-3 text-3xl font-semibold tabular-nums">{count}</p><p className="mt-1 text-xs text-[var(--fog)]">quarterly targets</p></div>)}
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {snapshot.monetization.map((method) => (
          <article className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-5 md:p-6" key={method.id}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--accent)]">{method.venture.replaceAll("-", " ")}</p><h3 className="mt-2 text-xl font-semibold">{method.method}</h3></div><Badge tone={moneyTone(method.status)}>{statusLabel(method.status)}</Badge></div>
            <p className="mt-4 text-sm leading-6 text-[var(--fog)]">{method.readiness.detail}</p>
            {method.proposal ? (
              <div className="mt-5 rounded-[var(--radius-button)] border border-[var(--accent)] bg-[var(--surface)] p-5">
                <div className="flex items-center gap-2"><ListChecks aria-hidden="true" className="size-4 text-[var(--accent)]" /><p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--accent)]">Owner proposal</p></div>
                <p className="mt-3 text-sm leading-6">{method.proposal.summary}</p>
                <h4 className="mt-5 text-sm font-semibold">Checklist</h4>
                <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--fog)]">{method.proposal.ownerChecklist.map((item) => <li key={item}>{item}</li>)}</ol>
                {method.proposal.channels.length ? <><h4 className="mt-5 text-sm font-semibold">Channels</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--fog)]">{method.proposal.channels.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
                {method.proposal.constraints.length ? <><h4 className="mt-5 text-sm font-semibold">Limits</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--fog)]">{method.proposal.constraints.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
              </div>
            ) : <p className="mt-4 rounded-[var(--radius-button)] bg-[var(--surface)] p-4 text-xs leading-5 text-[var(--fog)]">A detailed proposal appears here only after the activation threshold is met.</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
