import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CalendarClock, CircleDollarSign, Landmark, LockKeyhole, Target } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import {
  getPublicMoneySnapshot,
  type KpiStatus,
  type KpiUnit,
  type MonetizationStatus,
  type PublicKpiStatus
} from "@/lib/money-records";
import { formatDate, formatDateTime, formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  description: "BoardlessAI quarterly targets, monetization gates, confirmed costs and recognized revenue.",
  title: "Money"
};

const ventureLabels: Record<string, string> = {
  company: "Company",
  "caught-up": "Caught Up",
  "mma-files": "MMA Files",
  fightaiq: "FightAIQ",
  "titty-tuesdays": "Titty Tuesdays",
  incubator: "Incubator",
  board: "Board"
};

const statusLabels: Record<KpiStatus, string> = {
  "on-track": "On track",
  "at-risk": "At risk",
  "off-track": "Off track",
  unavailable: "No data"
};

function statusTone(status: KpiStatus): "success" | "warning" | "danger" | "neutral" {
  if (status === "on-track") return "success";
  if (status === "at-risk") return "warning";
  if (status === "off-track") return "danger";
  return "neutral";
}

function moneyStatusLabel(status: MonetizationStatus): string {
  const labels: Record<MonetizationStatus, string> = {
    locked: "Waiting",
    ready: "Ready for a plan",
    proposed: "Waiting for owner",
    active: "Active"
  };
  return labels[status];
}

function moneyStatusTone(status: MonetizationStatus): "success" | "warning" | "accent" | "neutral" {
  if (status === "active") return "success";
  if (status === "proposed") return "warning";
  if (status === "ready") return "accent";
  return "neutral";
}

function metricValue(value: number | null, unit: KpiUnit): string {
  if (value === null) return "No data";
  if (unit === "ratio") return `${Math.round(value * 100)}%`;
  if (unit === "usd") return formatUsd(value);
  if (unit === "boolean") return value >= 1 ? "Yes" : "No";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function targetValue(kpi: PublicKpiStatus): string {
  const value = metricValue(kpi.target, kpi.unit);
  return `${kpi.direction === "at-least" ? "At least" : "At most"} ${value}`;
}

function groupedStatuses(statuses: PublicKpiStatus[]): Array<[string, PublicKpiStatus[]]> {
  const groups = new Map<string, PublicKpiStatus[]>();
  for (const status of statuses) groups.set(status.venture, [...(groups.get(status.venture) ?? []), status]);
  return [...groups.entries()];
}

export default async function MoneyPage() {
  const snapshot = await getPublicMoneySnapshot();
  const moneyCards: Array<{ label: string; value: string; note: string; icon: LucideIcon }> = snapshot ? [
    { label: "Current monthly cost", value: formatUsd(snapshot.costs.totalMonthlyBurnUsd), note: "API use this month plus saved fixed monthly costs", icon: CircleDollarSign },
    { label: "Spend recorded so far", value: formatUsd(snapshot.costs.cumulativeSpendUsd), note: "All saved API receipts plus fixed costs since their start dates", icon: Landmark },
    { label: "Recognized revenue", value: formatUsd(snapshot.revenue.recognizedUsd), note: "Only verified revenue entries", icon: CircleDollarSign }
  ] : [];
  return (
    <PageShell>
      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-10 px-5 py-20 md:px-10 md:py-28 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">Money</Badge>
              <Badge>{snapshot?.quarter.id ?? "Quarter not loaded"}</Badge>
            </div>
            <h1 className="mt-7 max-w-4xl text-[clamp(3.4rem,8vw,7rem)] font-semibold leading-[0.9] tracking-[-0.07em]">
              Money, targets, and what happens next<span className="text-[var(--accent)]">.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--fog)]">
              Real costs and revenue stay separate from estimates. Every quarterly target shows its source-backed progress, and no earning method starts without owner approval.
            </p>
          </div>
          <div className="lg:col-span-4">
            {snapshot ? (
              <Card>
                <CardContent>
                  <div className="flex items-center gap-3"><CalendarClock aria-hidden="true" className="size-5 text-[var(--accent)]" /><p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--fog)]">Quarter countdown</p></div>
                  <p className="mt-5 text-6xl font-semibold tracking-[-0.06em] tabular-nums">{snapshot.quarter.daysRemaining}</p>
                  <p className="mt-2 text-sm text-[var(--fog)]">days left · {formatDate(snapshot.quarter.start)} to {formatDate(snapshot.quarter.end)}</p>
                  <p className="mt-5 border-t border-[var(--border)] pt-4 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">Checked {formatDateTime(snapshot.generatedAt)}</p>
                </CardContent>
              </Card>
            ) : <Callout tone="warning">The first Money check has not been saved yet. Run the 06:00 company cycle after this release.</Callout>}
          </div>
        </div>
      </section>

      {!snapshot ? null : (
        <>
          <section className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
            <SectionHeading
              action={<Link className={buttonVariants({ variant: "secondary" })} href="/metrics">Open Results <ArrowRight aria-hidden="true" className="size-4" /></Link>}
              description="A threshold can prepare a plan, but it cannot switch income on. Ready methods get a detailed owner proposal in the protected admin area."
              eyebrow="Earning methods"
              title="Revenue stays owner-controlled"
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {snapshot.monetization.map((method) => (
                <Card key={method.id}>
                  <CardContent className="flex h-full flex-col">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--accent)]">{ventureLabels[method.venture] ?? method.venture}</p>
                        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{method.method}</h2>
                      </div>
                      <Badge tone={moneyStatusTone(method.status)}>{moneyStatusLabel(method.status)}</Badge>
                    </div>
                    <p className="mt-5 text-sm leading-6 text-[var(--fog)]">{method.note}</p>
                    <div className="mt-6 rounded-[var(--radius-button)] bg-[var(--surface)] p-4">
                      <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">What must happen first</p>
                      <p className="mt-2 text-sm leading-6">{method.activationKpi}</p>
                      <p className="mt-3 text-xs leading-5 text-[var(--fog)]">{method.readiness.detail}</p>
                    </div>
                    <div className="mt-auto flex items-center gap-2 pt-5 text-xs font-semibold text-[var(--fog)]"><LockKeyhole aria-hidden="true" className="size-4 text-[var(--accent)]" />Owner approval is always required</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="border-y border-[var(--border)] bg-[var(--surface)]">
            <div className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
              <SectionHeading
                action={<div className="flex flex-wrap gap-2"><Badge tone="success">On track</Badge><Badge tone="warning">At risk</Badge><Badge tone="danger">Off track</Badge><Badge>No data</Badge></div>}
                description="Daily checks compare confirmed results with the pace needed for the quarter. Content and social targets have a 14-day Q1 setup period. Missing measurements stay marked as no data."
                eyebrow="Quarterly targets"
                title="Progress without made-up numbers"
              />
              <div className="grid gap-6">
                {groupedStatuses(snapshot.quarter.statuses).map(([venture, statuses]) => (
                  <Card key={venture}>
                    <CardContent className="p-0 md:p-0">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-5 md:px-7">
                        <div className="flex items-center gap-3"><Target aria-hidden="true" className="size-5 text-[var(--accent)]" /><h2 className="text-xl font-semibold">{ventureLabels[venture] ?? venture}</h2></div>
                        <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">{statuses.filter((status) => status.status === "on-track").length} on track · {statuses.length} total</p>
                      </div>
                      <Table>
                        <thead><tr><TableHead className="first:pl-5 md:first:pl-7">Target</TableHead><TableHead>Measured</TableHead><TableHead>Quarter goal</TableHead><TableHead>Pace today</TableHead><TableHead className="last:pr-5 md:last:pr-7">Status</TableHead></tr></thead>
                        <tbody>
                          {statuses.map((status) => (
                            <tr key={status.id}>
                              <TableCell className="min-w-64 first:pl-5 md:first:pl-7"><p className="font-semibold">{status.name}</p>{status.critical ? <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--warning-soft)]">Critical</p> : null}{status.reason ? <p className="mt-2 max-w-md text-xs leading-5 text-[var(--fog)]">{status.reason}</p> : null}</TableCell>
                              <TableCell className="font-semibold tabular-nums">{metricValue(status.actual, status.unit)}</TableCell>
                              <TableCell className="min-w-36 text-[var(--fog)]">{targetValue(status)}</TableCell>
                              <TableCell className="min-w-32 text-[var(--fog)]">{status.rampActive ? "Setup period" : metricValue(status.paceTarget, status.unit)}</TableCell>
                              <TableCell className="last:pr-5 md:last:pr-7"><Badge tone={statusTone(status.status)}>{statusLabels[status.status]}</Badge></TableCell>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
            <SectionHeading
              description="API receipts, owner-entered fixed costs, and verified income are counted separately. Empty inputs are explained instead of filled with estimates."
              eyebrow="Costs and revenue"
              title="Only confirmed money counts"
            />
            <div className="panel-grid md:grid-cols-3">
              {moneyCards.map(({ label, value, note, icon: Icon }) => (
                <div className="flex min-h-64 flex-col justify-between bg-[var(--card)] p-7 md:p-9" key={label}>
                  <div className="flex items-center justify-between gap-3"><p className="mono-label text-[0.65625rem] text-[var(--fog)]">{label}</p><Icon aria-hidden="true" className="size-5 text-[var(--accent)]" /></div>
                  <div><p className="text-[clamp(2.7rem,5vw,4.4rem)] font-semibold leading-none tracking-[-0.06em] tabular-nums">{value}</p><p className="mt-4 text-sm leading-6 text-[var(--fog)]">{note}</p></div>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <Card><CardContent><p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--accent)]">API use · {snapshot.costs.api.month}</p><p className="mt-4 text-4xl font-semibold tracking-[-0.05em] tabular-nums">{formatUsd(snapshot.costs.api.monthlyUsd)}</p><p className="mt-3 text-sm text-[var(--fog)]">Cumulative API spend: {formatUsd(snapshot.costs.api.cumulativeUsd)}</p></CardContent></Card>
              <Card><CardContent><p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--accent)]">Fixed monthly costs</p><p className="mt-4 text-4xl font-semibold tracking-[-0.05em] tabular-nums">{formatUsd(snapshot.costs.fixed.monthlyUsd)}</p>{snapshot.costs.fixed.byCategory.length ? <ul className="mt-4 space-y-2 text-sm text-[var(--fog)]">{snapshot.costs.fixed.byCategory.map((category) => <li className="flex justify-between gap-4" key={category.category}><span className="capitalize">{category.category}</span><span className="tabular-nums">{formatUsd(category.monthlyUsd)}</span></li>)}</ul> : <p className="mt-3 text-sm leading-6 text-[var(--fog)]">No fixed costs have been entered. $0 here is not an estimate.</p>}</CardContent></Card>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="max-w-2xl text-sm leading-6 text-[var(--fog)]">Results explains the delivery and quality measurements behind several quarterly targets.</p>
              <Link className={buttonVariants({ variant: "secondary" })} href="/metrics">See Results <ArrowRight aria-hidden="true" className="size-4" /></Link>
            </div>
          </section>
        </>
      )}
    </PageShell>
  );
}
