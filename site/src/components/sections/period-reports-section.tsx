import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { Stat } from "@/components/stat";
import type { OperationsReport } from "@/lib/operations-reports";
import { formatUsd } from "@/lib/utils";

/**
 * One finished period, rendered from the record written when it closed.
 *
 * No chart library and no new dialect: the same Stat, Table, Badge and Callout the rest of the
 * site is built from. `null` renders "—" everywhere it appears, because the writers were careful
 * to record an absence as an absence and turning one into a zero here would undo that.
 */

function verdictTone(summary: string): "success" | "warning" | "danger" | "neutral" {
  if (summary === "on-track") return "success";
  if (summary === "needs-attention") return "warning";
  if (summary === "stalled") return "danger";
  return "neutral";
}

function periodLabel(report: OperationsReport): string {
  if (report.period === "monthly") {
    const [year, month] = report.periodKey.split("-");
    const name = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" })
      .format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
    return `${name} ${year}`;
  }
  const [year, week] = report.periodKey.split("-W");
  return `Week ${week}, ${year}`;
}

function ReportCard({ report }: { report: OperationsReport }) {
  const held = report.meetings.scheduled === 0
    ? "—"
    : `${report.meetings.held} of ${report.meetings.scheduled}`;

  return (
    <article className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-6 md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h3 className="text-[1.625rem] font-semibold tracking-[-0.04em]">{periodLabel(report)}</h3>
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--ash)]">
          Written {report.generatedAt.slice(0, 10)}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Meetings held" value={held} />
        <Stat label="Spent" value={formatUsd(report.spend.periodUsd)} detail={`of ${formatUsd(report.spend.capUsd)} a month`} />
        <Stat
          label="Published"
          value={report.published.length === 0
            ? "—"
            : String(report.published.reduce((sum, entry) => sum + entry.count, 0))}
          detail={report.published.length === 0 ? "nothing recorded" : report.published.map((entry) => entry.ventureId).join(", ")}
        />
        <Stat
          label="Average score"
          // null, not 0. A period the content gate never scored has no average at all.
          value={report.scores ? report.scores.avg.toFixed(2) : "—"}
          detail={report.scores ? `worst ${report.scores.worst}, best ${report.scores.best}` : "nothing scored"}
        />
      </div>

      {report.narrative ? (
        <p className="mt-6 max-w-3xl text-[0.9375rem] leading-7 text-[var(--muted-foreground)]">
          {report.narrative}
        </p>
      ) : (
        <p className="mt-6 max-w-3xl text-sm text-[var(--fog)]">
          The retro meeting did not write a summary for this period. The numbers above are the
          record; the reading of them is missing.
        </p>
      )}

      {report.meetings.skipped.length > 0 ? (
        <div className="mt-7">
          <h4 className="text-sm font-semibold">Meetings that did not happen</h4>
          <div className="mt-3 overflow-x-auto" data-horizontal-scroll>
            <Table>
              <thead>
                <tr>
                  <TableHead>Day</TableHead>
                  <TableHead>Meeting</TableHead>
                  <TableHead>Why</TableHead>
                </tr>
              </thead>
              <tbody>
                {report.meetings.skipped.map((skip) => (
                  <tr key={`${skip.date}-${skip.phase}`}>
                    <TableCell>{skip.date}</TableCell>
                    <TableCell><span className="font-semibold">{skip.phase}</span></TableCell>
                    <TableCell>{skip.reason}</TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      ) : null}

      {report.perVenture.length > 0 ? (
        <div className="mt-7">
          <h4 className="text-sm font-semibold">Where each project stood</h4>
          <div className="mt-3 overflow-x-auto" data-horizontal-scroll>
            <Table>
              <thead>
                <tr>
                  <TableHead>Project</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Output</TableHead>
                  <TableHead>Cost</TableHead>
                </tr>
              </thead>
              <tbody>
                {report.perVenture.map((entry) => (
                  <tr key={entry.ventureId}>
                    <TableCell><span className="font-semibold">{entry.ventureId}</span></TableCell>
                    <TableCell><Badge tone={verdictTone(entry.verdictSummary)}>{entry.verdictSummary}</Badge></TableCell>
                    <TableCell>{entry.outputs}</TableCell>
                    <TableCell>{formatUsd(entry.spendUsd)}</TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      ) : null}

      <div className="mt-7 flex flex-wrap gap-3">
        <Badge>{report.fixTasks.opened} fix {report.fixTasks.opened === 1 ? "task" : "tasks"} opened</Badge>
        <Badge>{report.fixTasks.closed} closed</Badge>
        {report.incidents.length > 0 ? (
          <Badge tone="warning">{report.incidents.length} incident{report.incidents.length === 1 ? "" : "s"}</Badge>
        ) : null}
        {report.meetings.missingDays.length > 0 ? (
          <Badge tone="warning">
            {report.meetings.missingDays.length} day{report.meetings.missingDays.length === 1 ? "" : "s"} with no schedule on record
          </Badge>
        ) : null}
      </div>

      {report.incidents.length > 0 ? (
        <ul className="mt-4 grid list-disc gap-1 pl-5 text-sm text-[var(--muted-foreground)]">
          {report.incidents.map((incident) => (
            <li key={`${incident.date}-${incident.kind}-${incident.note}`}>
              <span className="font-mono text-xs uppercase tracking-[0.1em] text-[var(--fog)]">
                {incident.date} · {incident.kind}
              </span>{" "}
              {incident.note}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function PeriodReportsSection({
  period,
  reports
}: {
  period: "weekly" | "monthly";
  reports: readonly OperationsReport[];
}) {
  if (reports.length === 0) {
    return (
      <Callout>
        No {period === "weekly" ? "week" : "month"} has closed with a report yet. One is written the
        night a period ends — Monday for the week that finished, the first of the month for the
        month before it — and appears here from then on.
      </Callout>
    );
  }
  return (
    <div className="flex flex-col gap-10">
      {reports.map((report) => <ReportCard key={report.periodKey} report={report} />)}
    </div>
  );
}
