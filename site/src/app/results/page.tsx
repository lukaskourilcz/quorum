import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { getDailyResults, type DailyResultRow } from "@/lib/daily-results";
import { formatDate, formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  description:
    "What each BoardlessAI project produced on each day, what it cost, and why anything that failed did.",
  title: "Results"
};

const STATUS_LABEL: Record<DailyResultRow["status"], string> = {
  produced: "Produced",
  "no-output": "No output",
  failed: "Failed",
  "not-held": "Not held"
};

const STATUS_TONE: Record<DailyResultRow["status"], string> = {
  produced: "text-[var(--success)]",
  "no-output": "text-[var(--ash)]",
  failed: "text-[var(--danger)]",
  "not-held": "text-[var(--fog)]"
};

export default async function ResultsPage() {
  const days = await getDailyResults();
  const totalCost = days.reduce((sum, day) => sum + day.totalCostUsd, 0);

  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="rounded-[0.875rem] border border-[var(--slate)] bg-[var(--card)] p-5">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--ash)]">
              Recorded to date
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{formatUsd(totalCost)}</p>
            <p className="mt-1 text-xs text-[var(--fog)]">
              {days.length} {days.length === 1 ? "day" : "days"} on record
            </p>
          </div>
        }
        description="One table per day, one row per project. A day with no output is a normal result: the evidence gates stop work that cannot be supported, and stopping costs nothing."
        eyebrow="Daily results"
        title="What the company produced"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-10 md:py-24">
        {days.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">
            No day has been recorded yet. Each night cycle writes one summary, and it appears here the
            following morning.
          </p>
        ) : (
          <div className="flex flex-col gap-16">
            {days.map((day) => (
              <article key={day.date}>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
                  <h2 className="text-[1.625rem] font-semibold tracking-[-0.04em]">{formatDate(day.date)}</h2>
                  <p className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--ash)]">
                    Day total {formatUsd(day.totalCostUsd)}
                  </p>
                </div>

                {day.portfolioLine ? (
                  <p className="mb-5 max-w-3xl text-[var(--muted-foreground)]">{day.portfolioLine}</p>
                ) : null}

                <div className="overflow-x-auto">
                  <Table>
                    <thead>
                      <tr>
                        <TableHead>Project</TableHead>
                        <TableHead>Output</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Why it failed</TableHead>
                      </tr>
                    </thead>
                    <tbody>
                      {day.rows.map((row) => (
                        <tr key={`${day.date}-${row.ventureId}-${row.kind}`}>
                          <TableCell>
                            <span className="font-semibold">{row.ventureLabel}</span>
                            <span className="mt-0.5 block font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                              {row.kind}
                            </span>
                          </TableCell>
                          <TableCell>
                            {row.roomLink ? (
                              <Link className="underline underline-offset-4" href={row.roomLink}>
                                {row.output}
                              </Link>
                            ) : (
                              row.output
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</span>
                          </TableCell>
                          <TableCell>{formatUsd(row.costUsd)}</TableCell>
                          <TableCell>
                            {row.failureReason ?? <span className="text-[var(--fog)]">—</span>}
                          </TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
