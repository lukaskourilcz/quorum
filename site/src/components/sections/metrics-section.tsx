import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { SectionHeading } from "@/components/section-heading";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { metrics } from "@/data/fixtures";
import { CURRENT_MONTHLY_OPERATING_LIMIT_USD } from "@/data/operating-policy";
import { getPublicStandups } from "@/lib/standup-records";
import { fighterName, getPublicFightStatsEntries, getPublicFighters } from "@/lib/fightaiq-records";
import { formatUsd } from "@/lib/utils";

const metricCopy: Record<string, { label: string; note: string }> = {
  "Selected opportunity score": { label: "Chosen idea score", note: "No idea was chosen from the scored sample set" },
  "Release success rate": { label: "Successful releases", note: "Only the BoardlessAI site release is counted so far" },
  "Security incidents": { label: "Security problems", note: "None recorded" },
  "Over-budget commitments": { label: "Times work went over budget", note: "None recorded" },
  "USD per validated learning": { label: "Cost of each useful finding", note: "No useful finding has been confirmed yet" }
};

function metricValue(metric: (typeof metrics)[number]) {
  if (metric.value === null) return "n/a";
  if (metric.label.includes("rate")) return `${metric.value * 100}%`;
  return metric.value;
}

export async function MeasuresSection() {
  const [latestStandup, fightStats] = await Promise.all([
    getPublicStandups().then((items) => items[0]!),
    getPublicFightStatsEntries()
  ]);
  const fighterNames = new Map(
    fightStats.length
      ? (await getPublicFighters()).fighters.map((fighter) => [fighter.id, fighterName(fighter)] as const)
      : []
  );
  return (
    <>
      <PageIntro
        aside={
          <div className="rounded-[0.875rem] border border-[var(--slate)] bg-[var(--card)] p-5">
            <p className="mono-label text-[0.65625rem] text-[var(--accent)]">
              Reading rule
            </p>
            <p className="mt-3.5 text-sm leading-6 text-[var(--fog)]">
              <span className="font-mono text-[var(--foreground)]">n/a</span>{" "}
              means no confirmed number is available.{" "}
              <span className="font-mono text-[var(--foreground)]">0</span>{" "}
              means the system checked and found zero. Those meanings are
              different.
            </p>
          </div>
        }
        description="The numbers we can prove for projects, releases, safety, the team and money. Visitor and engagement measurement is off by design."
        eyebrow="Current results"
        title="Numbers without the spin"
      />

      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Current step", "Testing ideas", "Needs more proof", "text-[var(--foreground)]"],
            ["Real sources", "0", "Sample records do not count", "text-[var(--accent)]"],
            ["Confirmed revenue", "$0.00", "No payment has been recorded", "text-[var(--accent)]"],
            ["Cost this month", formatUsd(latestStandup.ledger.monthAllIn), `${formatUsd(CURRENT_MONTHLY_OPERATING_LIMIT_USD)} monthly limit`, "text-[var(--foreground)]"]
          ].map(([label, value, foot, color]) => (
            <div
              className="flex min-h-42 flex-col justify-between bg-[var(--surface)] p-7 transition-colors hover:bg-[var(--surface-raised)] md:p-8"
              key={label}
            >
              <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                {label}
              </p>
              <div>
                <p
                  className={`text-[2.375rem] font-semibold leading-none tracking-[-0.055em] tabular-nums ${color}`}
                >
                  {value}
                </p>
                <p className="mt-3 font-mono text-[0.65625rem] uppercase tracking-[0.08em] text-[var(--fog)]">
                  {foot}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
        <SectionHeading
          description="Each target is saved in the code. Making a target easier requires a human review, so the team cannot quietly make its results look better."
          eyebrow="What we track"
          title="Current measures"
        />
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)]">
          <Table>
            <thead>
              <tr>
                <TableHead className="first:pl-8">Role</TableHead>
                <TableHead>Measure</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-8">Note</TableHead>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => {
                const statusColor =
                  metric.status === "Pass"
                    ? "var(--success-soft)"
                    : "var(--warning-soft)";
                return (
                  <tr
                    className="transition-colors hover:bg-[var(--surface-raised)]"
                    key={`${metric.owner}-${metric.label}`}
                  >
                    <TableCell className="first:pl-8 font-mono text-xs font-semibold tracking-[0.08em]">
                      {metric.owner}
                    </TableCell>
                    <TableCell className="text-[var(--mist)]">
                      {metricCopy[metric.label]?.label ?? metric.label}
                    </TableCell>
                    <TableCell className="text-lg font-semibold tabular-nums">
                      {metricValue(metric)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[var(--fog)]">
                      {metric.target}
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.1em]"
                        style={{ color: statusColor }}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ background: statusColor }}
                        />
                        {metric.status}
                      </span>
                    </TableCell>
                    <TableCell className="pr-8 text-[var(--fog)]">
                      {metricCopy[metric.label]?.note ?? metric.note}
                    </TableCell>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="flex flex-col gap-2 px-8 py-5 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)] sm:flex-row sm:items-center sm:justify-between">
            <span>5 measures / 2 passing / 3 without data</span>
            <span>Targets saved in code</span>
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
          <SectionHeading
            description="FightAIQ saves a forecast only after both fighter files pass the evidence checks. These are early model outputs, not betting advice. Market prices are optional and the model records whether it used them."
            eyebrow="FightAIQ"
            title="Current fight forecasts"
          />
          {fightStats.length ? <div className="grid gap-4 lg:grid-cols-2">{fightStats.map((entry) => <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-7 md:p-8" key={entry.id}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-[0.08em] text-[var(--fog)]">{entry.status} · {entry.uncertainty.replaceAll("-", " ")}</p><h3 className="mt-2 text-2xl font-semibold">{fighterNames.get(entry.fighterRefs[0]) ?? entry.fighterRefs[0]} vs {fighterNames.get(entry.fighterRefs[1]) ?? entry.fighterRefs[1]}</h3></div><Badge tone={entry.status === "active" ? "warning" : entry.status === "scored" ? "success" : "neutral"}>{entry.marketUsed ? "model + market" : "model only"}</Badge></div>
            <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-button)] bg-[var(--border)]"><div className="bg-[var(--surface)] p-4"><p className="text-xs text-[var(--fog)]">Red corner</p><p className="mt-1 text-3xl font-semibold tabular-nums">{Math.round(entry.redWin * 100)}%</p></div><div className="bg-[var(--surface)] p-4"><p className="text-xs text-[var(--fog)]">Blue corner</p><p className="mt-1 text-3xl font-semibold tabular-nums">{Math.round(entry.blueWin * 100)}%</p></div></div>
            <p className="mt-5 text-sm font-medium text-[var(--warning-soft)]">Early model · Model output, not betting advice.</p>
            {entry.status === "scored" && entry.brierContribution !== null ? <p className="mt-2 text-xs text-[var(--fog)]">Brier score for this forecast: {entry.brierContribution.toFixed(3)}</p> : null}
            <p className="mt-3 break-all font-mono text-[0.6875rem] text-[var(--fog)]">{entry.modelVersion} · {entry.boutRef}</p>
          </div>)}</div> : <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-8 text-[var(--fog)]">No confirmed bout has two analysis-ready fighter cards. FightAIQ has not published a forecast.</div>}
        </div>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
          <SectionHeading
            action={<Link className={buttonVariants({ variant: "secondary" })} href="/results#money">Open Money</Link>}
            description="Only confirmed money records count. Duplicate or unmatched entries are left out."
            eyebrow="Money"
            title="Confirmed income and unknowns stay separate"
          />
          <div className="panel-grid md:grid-cols-3">
            {[
              ["Confirmed revenue", "$0.00", "No payment has been accepted", false],
              ["Confirmed running cost", formatUsd(latestStandup.ledger.monthAllIn), "AI services, payments and other costs, counted once", false],
              ["Profit before other costs", "n/a", "Cannot be calculated until revenue exists", true]
            ].map(([label, value, foot, muted]) => (
              <div
                className="flex min-h-56 flex-col justify-between bg-[var(--surface)] p-8 transition-colors hover:bg-[var(--surface-raised)] md:p-10"
                key={String(label)}
              >
                <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                  {String(label)}
                </p>
                <div>
                  <p
                    className={`text-[3.25rem] font-semibold leading-none tracking-[-0.06em] ${
                      muted ? "text-[var(--fog)]" : ""
                    }`}
                  >
                    {String(value)}
                  </p>
                  <p className="mt-4 text-[0.8125rem] leading-5 text-[var(--fog)]">
                    {String(foot)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
