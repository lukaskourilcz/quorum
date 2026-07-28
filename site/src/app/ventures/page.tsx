import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { opportunities } from "@/data/fixtures";

export const metadata: Metadata = {
  description:
    "Candidate and active BoardlessAI ventures, stage gates, evidence and experiment state.",
  title: "Ventures"
};

const stages = [
  ["01", "DISCOVERY", "Evidence + opportunity"],
  ["02", "VALIDATION", "Qualified value signal"],
  ["03", "AUDIENCE", "Repeatable acquisition"],
  ["04", "MONETIZATION", "Verified revenue"],
  ["05", "OPTIMIZATION", "Measured economics"]
] as const;

export default function VenturesPage() {
  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="rounded-[1rem] border border-[var(--slate)] bg-[var(--card)] p-8">
            <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
              Selected ventures
            </p>
            <p className="mt-4 text-7xl font-semibold leading-none tracking-[-0.07em]">
              0
            </p>
            <p className="mt-3 text-[0.84375rem] text-[var(--fog)]">
              Correct while evidence is insufficient
            </p>
          </div>
        }
        description="The company operating system exists; a customer venture does not. Candidate cards stay in DISCOVERY until every deterministic gate passes."
        eyebrow="Business portfolio"
        title="No venture by default"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pt-22 md:px-10">
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--accent)]">
          <div className="grid md:grid-cols-12">
            <div className="bg-[var(--accent)] p-8 text-[var(--obsidian)] md:col-span-4 md:p-10">
              <p className="mono-label text-[0.65625rem] font-semibold">
                Council verdict
              </p>
              <p className="mt-11 text-[2rem] font-semibold leading-[1.05] tracking-[-0.05em] break-words">
                INSUFFICIENT_
                <wbr />
                EVIDENCE
              </p>
            </div>
            <div className="bg-[var(--card)] p-8 md:col-span-8 md:p-10">
              <h2 className="text-[1.625rem] font-semibold tracking-[-0.04em]">
                The founding fixture declined all candidates.
              </h2>
              <p className="mt-4 max-w-4xl text-base leading-7 text-[var(--fog)]">
                Fixture signals are useful for testing schemas, not for proving
                demand. The next valid action is evidence collection—not a
                manufactured product, launch page or social campaign.
              </p>
              <p className="mt-7 flex items-center gap-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                <span className="status-pulse size-1.5 rounded-full bg-[var(--accent)]" />
                {opportunities.length} cards evaluated / 0 passed
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-16 md:px-10 md:pb-24">
        <div className="grid gap-4 lg:grid-cols-3">
          {opportunities.map((opportunity) => (
            <article
              className="rounded-[1.125rem] border border-[var(--border)] bg-[var(--card)] p-8 transition-colors hover:border-[var(--iron)]"
              key={opportunity.id}
            >
              <div className="flex items-center justify-between gap-3">
                <Badge>Fixture</Badge>
                <span className="font-mono text-[0.65625rem] uppercase tracking-[0.14em] text-[var(--accent)]">
                  {opportunity.status}
                </span>
              </div>
              <h2 className="mt-7 text-[1.4375rem] font-semibold leading-tight tracking-[-0.04em]">
                {opportunity.title}
              </h2>
              <div className="mt-8 flex items-end justify-between">
                <div>
                  <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                    Score
                  </p>
                  <p className="mt-2 text-[2.5rem] font-semibold tracking-[-0.055em] tabular-nums">
                    {opportunity.score}
                    <span className="text-base text-[var(--fog)]">/50</span>
                  </p>
                </div>
                <span className="font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                  Gate 35
                </span>
              </div>
              <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${(opportunity.score / 50) * 100}%` }}
                />
              </div>
              <div className="relative mt-2 h-3">
                <span className="absolute left-[70%] top-0 h-1.5 w-px bg-[var(--iron)]" />
                <span className="absolute left-[calc(70%+0.375rem)] top-0 font-mono text-[0.59375rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                  Threshold
                </span>
              </div>
              <p className="mt-6 min-h-18 text-sm leading-6 text-[var(--fog)]">
                {opportunity.reason}
              </p>
              <Link
                className={buttonVariants({ variant: "secondary" })}
                href={`/ventures/${opportunity.slug}`}
              >
                Inspect card
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
          <p className="mono-label text-[var(--accent)]">Stage model</p>
          <h2 className="mt-5 max-w-4xl text-[clamp(2.4rem,5vw,4.2rem)] font-semibold leading-none tracking-[-0.055em]">
            Progress is earned through gates.
          </h2>
          <div className="panel-grid mt-13 md:grid-cols-5">
            {stages.map(([number, title, description], index) => (
              <div
                className={
                  index === 0
                    ? "flex min-h-45 flex-col justify-between bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))] p-7"
                    : "flex min-h-45 flex-col justify-between bg-[var(--surface)] p-7"
                }
                key={title}
              >
                <p
                  className={`font-mono text-[0.6875rem] tracking-[0.1em] ${
                    index === 0
                      ? "text-[var(--accent)]"
                      : "text-[var(--fog)]"
                  }`}
                >
                  {number}
                </p>
                <div>
                  <p
                    className={`text-[0.9375rem] font-bold tracking-[0.02em] ${
                      index === 0 ? "text-[var(--accent)]" : ""
                    }`}
                  >
                    {title}
                  </p>
                  <p className="mt-2.5 text-xs leading-5 text-[var(--fog)]">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
            Current stage / 01 discovery — gate not met
          </p>
        </div>
      </section>
    </PageShell>
  );
}
