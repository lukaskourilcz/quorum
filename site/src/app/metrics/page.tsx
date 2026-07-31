import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { metrics } from "@/data/fixtures";
import { getPublicStandups } from "@/lib/standup-records";
import { formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  description:
    "BoardlessAI KPI status, finance semantics and operating scorecard.",
  title: "Metrics"
};

function metricValue(metric: (typeof metrics)[number]) {
  if (metric.value === null) return "n/a";
  if (metric.label.includes("rate")) return `${metric.value * 100}%`;
  return metric.value;
}

export default async function MetricsPage() {
  const latestStandup = (await getPublicStandups())[0]!;
  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="rounded-[0.875rem] border border-[var(--slate)] bg-[var(--card)] p-5">
            <p className="mono-label text-[0.65625rem] text-[var(--accent)]">
              Reading rule
            </p>
            <p className="mt-3.5 text-sm leading-6 text-[var(--fog)]">
              <span className="font-mono text-[var(--foreground)]">n/a</span>{" "}
              means no verified measurement is available.{" "}
              <span className="font-mono text-[var(--foreground)]">0</span>{" "}
              means a connected measurement observed zero. They are never
              interchangeable.
            </p>
          </div>
        }
        description="A compact scorecard for strategy, shipping, growth, quality, organization and finance—with warm-up windows and missing instrumentation kept explicit."
        eyebrow="Operating scorecard"
        title="Metrics without theatre"
      />

      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Stage", latestStandup.stage, "Gate not met", "text-[var(--foreground)]"],
            ["Eligible evidence", "0", "Fixture records excluded", "text-[var(--accent)]"],
            ["Recognized revenue", "$0.00", "No revenue event accepted", "text-[var(--accent)]"],
            ["Month all-in", formatUsd(latestStandup.ledger.monthAllIn), "$20 hard cap", "text-[var(--foreground)]"]
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
          description="Targets are versioned contracts. Loosening one creates a human-review item instead of quietly making performance look better."
          eyebrow="KPI registry"
          title="Current observations"
        />
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)]">
          <Table>
            <thead>
              <tr>
                <TableHead className="pl-8">Owner</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-8">Context</TableHead>
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
                    <TableCell className="pl-8 font-mono text-xs font-semibold tracking-[0.08em]">
                      {metric.owner}
                    </TableCell>
                    <TableCell className="text-[var(--mist)]">
                      {metric.label}
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
                      {metric.note}
                    </TableCell>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="flex flex-col gap-2 px-8 py-5 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)] sm:flex-row sm:items-center sm:justify-between">
            <span>6 contracts / 2 pass / 4 unmeasured</span>
            <span>Targets versioned</span>
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
          <SectionHeading
            description="Financial totals are derived only from verified, uniquely reconciled entries."
            eyebrow="Finance"
            title="Measured revenue and unavailable data stay separate"
          />
          <div className="panel-grid md:grid-cols-3">
            {[
              ["Recognized revenue", "$0.00", "Operating ledger records no accepted revenue", false],
              ["Verified operating cost", formatUsd(latestStandup.ledger.monthAllIn), "API + treasury + other; no double count", false],
              ["Gross profit", "n/a", "Unavailable until revenue source exists", true]
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
    </PageShell>
  );
}
