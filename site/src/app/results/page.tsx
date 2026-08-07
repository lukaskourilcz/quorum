import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { MeasuresSection } from "@/components/sections/metrics-section";
import { MoneySection } from "@/components/sections/money-section";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import {
  getDailyResults,
  getVentureKpiStatuses,
  withMissingDays,
  type DailyResultRow
} from "@/lib/daily-results";
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

/**
 * Status colours that can actually be read on this page.
 *
 * `--success` is `#166534` and `--destructive` is `#b91c1c`: both are chosen to sit *behind*
 * light type, and both were used here as type on `#09090b`, which measures 2.79:1 against a 4.5:1
 * gate. The `-soft` variants are the same states rendered for a dark surface, and they are what
 * the wallboard already uses for On track / Off track.
 *
 * `--danger` was worse than low contrast: no such token exists, so the class resolved to nothing
 * and a failed row was rendered in the inherited body colour — indistinguishable from a row that
 * produced something.
 */
const STATUS_TONE: Record<DailyResultRow["status"], string> = {
  produced: "text-[var(--success-soft)]",
  "no-output": "text-[var(--ash)]",
  failed: "text-[var(--destructive-soft)]",
  "not-held": "text-[var(--fog)]"
};

export default async function ResultsPage() {
  const recorded = await getDailyResults();
  const days = withMissingDays(recorded);
  const kpiStatuses = await getVentureKpiStatuses();
  const totalCost = recorded.reduce((sum, day) => sum + day.totalCostUsd, 0);

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
              {recorded.length} {recorded.length === 1 ? "day" : "days"} on record
            </p>
          </div>
        }
        description="One table per day, one row per project. A day with no output is a normal result: the evidence gates stop work that cannot be supported, and stopping costs nothing."
        eyebrow="Daily results"
        title="What the company produced"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-10 md:py-24">
        {kpiStatuses.length > 0 ? (
          <div className="mb-16">
            <h2 className="text-[1.625rem] font-semibold tracking-[-0.04em]">
              Where each project stands this quarter
            </h2>
            <p className="mt-2 max-w-3xl text-[var(--muted-foreground)]">
              The day tables below say what was produced. This says whether producing it is moving
              the outcomes each project is measured on, from this morning&rsquo;s reading.
            </p>
            <div className="mt-5 overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <TableHead>Project</TableHead>
                    <TableHead>On track</TableHead>
                    <TableHead>At risk</TableHead>
                    <TableHead>Off track</TableHead>
                    <TableHead>Not measurable yet</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {kpiStatuses.map((entry) => (
                    <tr key={entry.ventureId}>
                      <TableCell>
                        <span className="font-semibold">{entry.ventureLabel}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-[var(--success-soft)]">{entry.onTrack}</span>
                      </TableCell>
                      <TableCell>{entry.atRisk}</TableCell>
                      <TableCell>
                        <span className={entry.offTrack > 0 ? "text-[var(--destructive-soft)]" : undefined}>
                          {entry.offTrack}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-[var(--fog)]">{entry.unavailable}</span>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        ) : null}

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
                    {day.missing ? "No summary recorded" : `Day total ${formatUsd(day.totalCostUsd)}`}
                  </p>
                </div>

                {day.missing ? (
                  <p className="max-w-3xl text-[var(--muted-foreground)]">
                    No summary was recorded for this day. The work still happened; the night cycle
                    did not write down what it was.
                  </p>
                ) : null}

                {day.portfolioLine ? (
                  <p className="mb-5 max-w-3xl text-[var(--muted-foreground)]">{day.portfolioLine}</p>
                ) : null}

                {day.missing ? null : (
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
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Money and the measures used to be two more entries in an eleven-item navigation bar.
          They answer the same question this page does — what came of the work — so they are
          sections of it, and /money and /metrics redirect here. */}
      <section aria-label="Money" id="money">
        <MoneySection />
      </section>
      <section aria-label="Measures" id="measures">
        <MeasuresSection />
      </section>
    </PageShell>
  );
}
