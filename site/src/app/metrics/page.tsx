import type { Metadata } from "next";
import { CircleCheck, CircleHelp, CircleX, Gauge } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableCell,
  TableHead
} from "@/components/ui/table";
import { metrics, publicState } from "@/data/fixtures";
import { formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  description:
    "BoardlessAI KPI status, finance semantics and operating scorecard.",
  title: "Metrics"
};

function StatusIcon({ status }: { status: string }) {
  if (status === "Pass") {
    return <CircleCheck className="size-4 text-[var(--success)]" />;
  }
  if (status === "n/a" || status === "Warm-up") {
    return <CircleHelp className="size-4 text-[var(--warning)]" />;
  }
  return <CircleX className="size-4 text-[var(--destructive)]" />;
}

export default function MetricsPage() {
  return (
    <PageShell>
      <PageIntro
        aside={
          <Callout tone="accent">
            `n/a` means no verified measurement is available. `0` means a
            connected measurement observed zero. They are never interchangeable.
          </Callout>
        }
        description="A compact scorecard for strategy, shipping, growth, quality, organization and finance—with warm-up windows and missing instrumentation kept explicit."
        eyebrow="Operating scorecard"
        title="Metrics without theatre"
      />

      <section className="bg-[var(--graphite)] text-[var(--snow)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--iron)] sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Stage", publicState.stage, "Gate not met"],
            ["Eligible evidence", "0", "Fixture records excluded"],
            ["Recognized revenue", "n/a", "No source connected"],
            ["Month all-in", formatUsd(publicState.actualSpendUsd), "$20 hard cap"]
          ].map(([label, value, note]) => (
            <div className="bg-[var(--graphite)] p-7 md:p-9" key={label}>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ash)]">
                {label}
              </p>
              <p className="mt-8 text-4xl font-semibold tracking-[-0.05em]">
                {value}
              </p>
              <p className="mt-2 text-xs text-[var(--ash)]">{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
        <SectionHeading
          description="Targets are versioned contracts. Loosening one creates a human-review item instead of quietly making performance look better."
          eyebrow="KPI registry"
          title="Current observations"
        />
        <Card>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <TableHead>Owner</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Context</TableHead>
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => (
                  <tr key={`${metric.owner}-${metric.label}`}>
                    <TableCell className="font-bold">{metric.owner}</TableCell>
                    <TableCell>{metric.label}</TableCell>
                    <TableCell className="text-lg font-semibold">
                      {metric.value === null
                        ? "n/a"
                        : metric.label.includes("rate")
                          ? `${metric.value * 100}%`
                          : metric.value}
                    </TableCell>
                    <TableCell>{metric.target}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <StatusIcon status={metric.status} />
                        {metric.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-[var(--muted-foreground)]">
                      {metric.note}
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-24">
          <SectionHeading
            description="Financial totals are derived only from verified, uniquely reconciled entries."
            eyebrow="Finance"
            title="Unknown revenue is not zero revenue"
          />
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                label: "Recognized revenue",
                value: "n/a",
                note: "No verified payment source connected"
              },
              {
                label: "Verified operating cost",
                value: "$0.00",
                note: "API + treasury + other; no double count"
              },
              {
                label: "Gross profit",
                value: "n/a",
                note: "Unavailable until revenue source exists"
              }
            ].map((item) => (
              <Card key={item.label}>
                <CardContent>
                  <Gauge
                    aria-hidden="true"
                    className="size-5 text-[var(--accent)]"
                  />
                  <p className="mt-10 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                    {item.label}
                  </p>
                  <p className="mt-3 text-5xl font-semibold tracking-[-0.055em]">
                    {item.value}
                  </p>
                  <p className="mt-4 text-xs leading-5 text-[var(--muted-foreground)]">
                    {item.note}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
