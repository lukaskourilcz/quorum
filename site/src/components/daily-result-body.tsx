import Link from "next/link";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import type { DailyResult, DailyResultRow } from "@/lib/daily-results";
import { formatUsd } from "@/lib/utils";

/**
 * One recorded day, without its heading.
 *
 * /results lists every day under an `h2`, and /results/[date] is the same day on its own under an
 * `h1`. The heading is the only part that differs, so it stays with each page and the body is
 * shared: extracted at the moment the second consumer appeared rather than after it had copied
 * the status maps and the five columns.
 *
 * Nothing here reads a file. The day arrives already parsed and already sanitised by
 * `lib/daily-results.ts`, which is the one boundary the digest receipts cross.
 */
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

export function DailyResultBody({ day }: { day: DailyResult }) {
  return (
    <>
      {day.missing ? (
        <p className="max-w-3xl text-[var(--muted-foreground)]">
          No summary was recorded for this day. The work still happened; the morning cycle did not
          write down what it was.
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
    </>
  );
}
