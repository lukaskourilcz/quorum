import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { SignalBars } from "@/components/signal-bars";
import { formatPhaseLabel } from "@/components/standup-countdown-model";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getPublicStandups } from "@/lib/standup-records";
import { formatDate, formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  description:
    "Three daily shift episodes with public operating briefs, participation, costs and outcomes.",
  title: "Shift episodes"
};

const gates = [
  ["01", "Score threshold 35/50", "34 — FAILED"],
  ["02", "Three independent eligible sources", "0 — FAILED"],
  ["03", "One direct problem or intent signal", "0 — FAILED"]
] as const;

export default async function StandupsPage() {
  const standups = await getPublicStandups();
  const actualCost = standups.reduce((total, standup) => total + standup.ledger.actual, 0);
  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="rounded-[0.875rem] border border-[var(--slate)] bg-[var(--card)] p-5 text-sm leading-6 text-[var(--fog)]">
            <span className="mono-label inline-flex items-center gap-2 text-[0.65625rem] text-[var(--accent)]">
              <span className="status-pulse size-1.5 rounded-full bg-[var(--accent)]" />
              Fixture policy
            </span>
            <p className="mt-3.5">
              Fixtures are clearly labeled and never mixed with live operating
              results.
            </p>
          </div>
        }
        description="Morning, Afternoon and Night shifts form a continuous operating story. Every episode records the cast, the cost, the decision and the next handoff."
        eyebrow="Public record"
        title="Shift episodes"
      />

      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Cycles recorded", String(standups.length)],
            ["Latest decision", standups[0]?.decision.outcome ?? "n/a"],
            ["Actual cost to date", formatUsd(actualCost)],
            ["Tasks evaluated", String(standups[0]?.tasks.length ?? 0)]
          ].map(([label, value]) => (
            <div className="bg-[var(--surface)] p-7 md:px-8" key={label}>
              <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                {label}
              </p>
              <p className="mt-4 text-3xl font-semibold tracking-[-0.05em] tabular-nums">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-10 md:py-24">
        <div className="mb-7 flex items-baseline justify-between gap-6">
          <h2 className="text-[1.625rem] font-semibold tracking-[-0.04em]">
            Episode index
          </h2>
          <span className="font-mono text-[0.65625rem] uppercase tracking-[0.14em] text-[var(--fog)]">
            {standups.length} record / newest first
          </span>
        </div>

        <div className="grid gap-5">
          {standups.map((standup) => {
            const participantCount = standup.participants.filter(
              (item) => item.participated
            ).length;

            return (
              <article
                className="panel-grid md:grid-cols-12"
                key={standup.id}
              >
                <div className="bg-[var(--card)] p-7 md:col-span-4 md:p-10">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="accent">{standup.status}</Badge>
                    {standup.fixture ? <Badge>Fixture</Badge> : null}
                  </div>
                  <p className="mt-9 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--fog)]">
                    {formatDate(standup.date)} /{" "}
                    {formatPhaseLabel(standup.phase)}
                  </p>
                  <h3 className="mt-3.5 text-[2.375rem] font-semibold leading-none tracking-[-0.055em]">
                    {standup.fixture ? "No venture was selected" : standup.decision.outcome}
                  </h3>
                  <SignalBars className="mt-9 h-11" />
                  <p className="mt-3 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                    Signal sample / 0 eligible
                  </p>
                </div>
                <div className="bg-[var(--surface)] p-7 md:col-span-8 md:p-10">
                  <p className="text-lg leading-8 text-[var(--mist)]">
                    {standup.operatingBrief}
                  </p>
                  <div className="mt-9 grid grid-cols-2 gap-6 border-t border-[var(--border)] pt-6 sm:grid-cols-4">
                    {[
                      ["Estimated", formatUsd(standup.ledger.estimate)],
                      ["Actual", formatUsd(standup.ledger.actual)],
                      ["Tasks", String(standup.tasks.length)],
                      [
                        "Participants",
                        `${participantCount} / ${standup.participants.length}`
                      ]
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                          {label}
                        </p>
                        <p className="mt-2.5 text-[1.375rem] font-semibold tracking-[-0.04em] tabular-nums">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 grid gap-3.5 border-t border-[var(--border)] pt-6">
                    {(standup.fixture
                      ? gates
                      : [
                          ["01", "Project mode", "HOBBY / INTERNAL"],
                          ["02", "External action", "NOT APPROVED"],
                          ["03", "Public record", "TIMESTAMPED"]
                        ]).map(([number, label, state]) => (
                      <div
                        className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-4 text-sm"
                        key={number}
                      >
                        <span className="font-mono text-[0.6875rem] text-[var(--fog)]">
                          {number}
                        </span>
                        <span className="text-[var(--ash)]">{label}</span>
                        <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-[var(--accent)]">
                          {state}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-9 flex flex-wrap gap-3">
                    <Link
                      className={buttonVariants({ variant: "primary" })}
                      href={`/standups/${standup.id}/room`}
                    >
                      Watch episode replay
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                    <Link
                      className={buttonVariants({ variant: "secondary" })}
                      href={`/standups/${standup.id}`}
                    >
                      Full episode record
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </PageShell>
  );
}
