import Link from "next/link";
import { ArrowRight, CircleDollarSign, ListChecks } from "lucide-react";
import {
  AdminCallout,
  AdminMetric,
  AdminSectionHeading,
  AdminStateMessage,
  AdminStatusBadge,
  adminButtonVariants,
} from "./admin-primitives";
import type { KpiStatus, MonetizationStatus, PublicMoneySnapshot } from "@/lib/money-records";

const kpiTone = (status: KpiStatus): "success" | "warning" | "destructive" | "neutral" => status === "on-track" ? "success" : status === "at-risk" ? "warning" : status === "off-track" ? "destructive" : "neutral";
const moneyTone = (status: MonetizationStatus): "success" | "warning" | "information" | "neutral" => status === "active" ? "success" : status === "proposed" ? "warning" : status === "ready" ? "information" : "neutral";

const KPI_LABEL: Readonly<Record<KpiStatus, string>> = {
  "on-track": "On track",
  "at-risk": "Slipping",
  "off-track": "Off track",
  unavailable: "Not measured yet",
};

const MONEY_LABEL: Readonly<Record<MonetizationStatus, string>> = {
  active: "Earning",
  proposed: "Waiting for you",
  ready: "Ready to start",
  locked: "Not yet",
};

export function AdminMoneyPanel({ snapshot }: { snapshot: PublicMoneySnapshot | null }) {
  if (!snapshot) {
    return <AdminStateMessage state="unavailable" title="Quarterly targets and earning methods will appear after the next 06:00 company cycle" />;
  }
  const kpiCounts = (["on-track", "at-risk", "off-track", "unavailable"] as const).map((status) => ({
    status,
    count: snapshot.quarter.statuses.filter((entry) => entry.status === status).length,
  }));

  return (
    <section aria-labelledby="admin-money-heading" className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <CircleDollarSign aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--admin-section-accent)]" />
          <AdminSectionHeading description="What needs attention before money can move." title="Quarter and earning plans" />
        </div>
        <Link className={adminButtonVariants({ variant: "secondary" })} href="/results#money">Public Money <ArrowRight aria-hidden className="size-4" /></Link>
      </div>
      <span className="sr-only" id="admin-money-heading">Quarter and earning plans</span>

      <div className="grid gap-px overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-border)] sm:grid-cols-2 xl:grid-cols-4">
        {kpiCounts.map(({ status, count }) => (
          <AdminMetric key={status} label={KPI_LABEL[status]} note="of this quarter’s targets" value={String(count)} />
        ))}
      </div>

      {snapshot.monetization.length > 0 && snapshot.monetization.every((method) => method.status === "locked") ? (
        <AdminStateMessage
          description="The site has no measured audience. Each method gets a plan only when it is close enough to be worth writing."
          state="held"
          title="No earning method can start yet"
        />
      ) : null}

      <div className="divide-y divide-[var(--admin-border)] border-y border-[var(--admin-border)]">
        {snapshot.monetization.map((method) => (
          <article className="grid gap-3 py-4" key={method.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">{method.venture.replaceAll("-", " ")}</p>
                <h3 className="m-0 mt-1 text-[length:var(--admin-type-section)] font-semibold">{method.method}</h3>
              </div>
              <AdminStatusBadge tone={moneyTone(method.status)}>{MONEY_LABEL[method.status]}</AdminStatusBadge>
            </div>
            <p className="m-0 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{method.readiness.detail}</p>
            {method.proposal ? (
              <AdminCallout tone="information">
                <div className="flex items-center gap-2"><ListChecks aria-hidden className="size-4" /><strong>Owner proposal</strong></div>
                <p className="m-0 mt-2">{method.proposal.summary}</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <div><h4 className="m-0 font-semibold">Checklist</h4><ol className="mt-1 list-decimal space-y-1 pl-5">{method.proposal.ownerChecklist.map((item) => <li key={item}>{item}</li>)}</ol></div>
                  {method.proposal.channels.length ? <div><h4 className="m-0 font-semibold">Channels</h4><ul className="mt-1 list-disc space-y-1 pl-5">{method.proposal.channels.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                  {method.proposal.constraints.length ? <div><h4 className="m-0 font-semibold">Limits</h4><ul className="mt-1 list-disc space-y-1 pl-5">{method.proposal.constraints.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                </div>
              </AdminCallout>
            ) : null}
          </article>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {kpiCounts.map(({ status, count }) => <AdminStatusBadge key={status} tone={kpiTone(status)}>{KPI_LABEL[status]} · {count}</AdminStatusBadge>)}
      </div>
    </section>
  );
}
