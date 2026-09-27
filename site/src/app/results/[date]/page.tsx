import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DailyResultBody } from "@/components/daily-result-body";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { getDailyResults, type DailyResult } from "@/lib/daily-results";
import { formatDate, formatUsd } from "@/lib/utils";

/**
 * One day of the operating record, at its own URL.
 *
 * /results is the whole ledger on one page, which is the right shape for reading down it and the
 * wrong shape for pointing somebody at a particular day. This route is the permalink: the same
 * rows, the same sanitising boundary, one day at a time, with the neighbouring recorded days
 * reachable from it.
 *
 * It reads nothing but the digest receipts already committed under state/notify/digest, through
 * `getDailyResults`. No fetch, no model, no clock: `generateStaticParams` enumerates the dates on
 * disk, so the set of pages is decided by what has been recorded rather than by when the build ran.
 */
export async function generateStaticParams() {
  return (await getDailyResults()).map((day) => ({ date: day.date }));
}

/** The recorded day, and the days either side of it. Newest first, as `getDailyResults` returns. */
async function resolveDay(date: string): Promise<{
  day: DailyResult;
  newer: string | null;
  older: string | null;
} | null> {
  const days = await getDailyResults();
  const index = days.findIndex((candidate) => candidate.date === date);
  if (index < 0) return null;
  return {
    day: days[index]!,
    newer: days[index - 1]?.date ?? null,
    older: days[index + 1]?.date ?? null
  };
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const resolved = await resolveDay(date);
  if (!resolved) return { title: "Day report" };
  return {
    description: resolved.day.portfolioLine
      || `What each BoardlessAI project produced on ${formatDate(date)}, and what it cost.`,
    title: `Day report · ${formatDate(date)}`
  };
}

export default async function ResultsDayPage({
  params
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const resolved = await resolveDay(date);
  if (!resolved) notFound();
  const { day, newer, older } = resolved;

  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="rounded-[0.875rem] border border-[var(--slate)] bg-[var(--card)] p-5">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--ash)]">
              Day total
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
              {formatUsd(day.totalCostUsd)}
            </p>
            <p className="mt-1 text-xs text-[var(--fog)]">
              {day.rows.length} {day.rows.length === 1 ? "room" : "rooms"} on record
            </p>
          </div>
        }
        description="One row per project: what it produced, whether that counted as output, what it cost, and the reason recorded for anything that failed. The morning after this day, the summary was written from the records its rooms had already left behind."
        eyebrow="Operating report"
        title={formatDate(day.date)}
      />

      <section className="mx-auto max-w-[var(--container)] px-5 py-16 md:px-10 md:py-20">
        <Link className={buttonVariants({ variant: "ghost", size: "small" })} href="/results">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Every recorded day
        </Link>

        <div className="mt-10">
          <DailyResultBody day={day} />
        </div>

        <nav
          aria-label="Neighbouring days"
          className="mt-12 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-8"
        >
          {older ? (
            <Link className={buttonVariants({ variant: "secondary" })} href={`/results/${older}`}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              {formatDate(older)}
            </Link>
          ) : (
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-[var(--fog)]">
              Earliest day on record
            </p>
          )}
          {newer ? (
            <Link
              className={`${buttonVariants({ variant: "secondary" })} ml-auto`}
              href={`/results/${newer}`}
            >
              {formatDate(newer)}
            </Link>
          ) : (
            <p className="ml-auto font-mono text-xs uppercase tracking-[0.1em] text-[var(--fog)]">
              Latest day on record
            </p>
          )}
        </nav>
      </section>
    </PageShell>
  );
}
