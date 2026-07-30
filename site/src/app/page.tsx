import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AgentCard, AgentRow } from "@/components/agent-card";
import { AgentSignalField } from "@/components/agent-signal-field";
import { OperatingTicker } from "@/components/operating-ticker";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { SignalBars } from "@/components/signal-bars";
import { StandupCountdown } from "@/components/standup-countdown";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { agents } from "@/data/agents";
import { governanceSteps, publicState, standups } from "@/data/fixtures";
import { formatDate, formatUsd } from "@/lib/utils";

const latestStandup = standups[0]!;
const council = agents.filter((agent) => agent.group === "Council");
const specialists = agents.filter((agent) => agent.group !== "Council");
const signalAgents = agents.map(({ group, id }) => ({ group, id }));

const gates = [
  ["01", "Score threshold 35/50", "34 — FAILED"],
  ["02", "Three independent eligible sources", "0 — FAILED"],
  ["03", "One direct problem or intent signal", "0 — FAILED"]
] as const;

const stepTags = ["SCOUT", "COUNCIL", "PEOPLE", "BORDA", "FORGE", "LEDGER"];

export default function HomePage() {
  return (
    <PageShell>
      <OperatingTicker />

      <section className="relative overflow-hidden border-b border-[var(--border)]">
        <div className="editorial-grid absolute inset-0" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="scan-line absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-[color-mix(in_srgb,var(--accent)_6%,transparent)] to-transparent" />
        </div>
        <div className="absolute left-1/2 top-[-30%] size-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_13%,transparent),transparent_62%)]" />
        <AgentSignalField agents={signalAgents} />
        <div className="relative z-10 mx-auto grid min-h-[calc(100svh-7.5rem)] max-w-[var(--container)] content-between gap-18 px-5 py-16 md:px-10 md:py-22">
          <div>
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex flex-wrap items-center gap-4 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--fog)]">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--slate)] px-3.5 py-1.5 text-[var(--foreground)]">
                  <span className="status-pulse size-1.5 rounded-full bg-[var(--accent)]" />
                  Operating in discovery
                </span>
                <span>Cycle 001</span>
                <span className="text-[var(--slate)]">/</span>
                <span>Public operating system</span>
              </div>
              <StandupCountdown />
            </div>
            <h1 className="text-balance mt-8 max-w-[80rem] text-[clamp(3.6rem,10.4vw,10.5rem)] font-semibold leading-[0.83] tracking-[-0.062em]">
              The AI company that governs itself
              <span className="text-[var(--accent)]">.</span>
            </h1>
          </div>
          <div className="grid items-end gap-8 md:grid-cols-12 md:gap-10">
            <p className="max-w-[38rem] text-lg leading-8 text-[var(--ash)] md:col-span-6 md:text-[1.1875rem]">
              Four council seats decide. Specialists execute. Every claim,
              dollar, skipped participant and unknown is held to a public
              control.
            </p>
            <div className="flex flex-wrap gap-3 md:col-span-6 md:justify-end">
              <Link
                className={buttonVariants({ size: "large", variant: "accent" })}
                href={`/standups/${latestStandup.date}/room`}
              >
                Watch the latest decision
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link
                className={buttonVariants({
                  size: "large",
                  variant: "secondary"
                })}
                href={`/standups/${latestStandup.date}`}
              >
                Read the latest standup
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Best candidate score", "34/50", "GATE 35", "68%", "1 point below the evidence gate"],
            ["Eligible evidence", "0", "NEEDS 3", "0%", "No independent source qualified"],
            [
              "Actual API spend",
              formatUsd(publicState.actualSpendUsd),
              "CAP $20",
              "0%",
              "Offline fixture / no calls billed"
            ],
            ["Agents on duty", String(agents.length), "4 VOTING", "100%", "10 bounded specialists + controls"]
          ].map(([label, value, tag, width, foot]) => (
            <div
              className="flex min-h-48 flex-col justify-between bg-[var(--surface)] p-7 transition-colors hover:bg-[var(--surface-raised)] md:p-8"
              key={label}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                  {label}
                </p>
                <span className="font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--accent)]">
                  {tag}
                </span>
              </div>
              <div>
                <p className="text-[2.75rem] font-semibold leading-none tracking-[-0.055em] tabular-nums">
                  {value}
                </p>
                <div className="mt-5 h-0.75 overflow-hidden bg-[var(--border)]">
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{ width }}
                  />
                </div>
                <p className="mt-3 font-mono text-[0.65625rem] uppercase tracking-[0.08em] text-[var(--fog)]">
                  {foot}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10 md:py-30">
        <SectionHeading
          action={
            <Link
              className={buttonVariants({ variant: "secondary" })}
              href={`/standups/${latestStandup.date}/room`}
            >
              Replay the room
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          }
          description="A truthful non-decision is a valid result. This offline founding fixture demonstrates the evidence gate without inventing a business."
          eyebrow={`Latest standup / ${formatDate(latestStandup.date)}`}
          title="No venture selected."
        />

        <div className="panel-grid md:grid-cols-12">
          <div className="bg-[var(--card)] p-7 md:col-span-5 md:p-11">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">Fixture</Badge>
              <Badge>{latestStandup.stage}</Badge>
            </div>
            <p className="mt-11 text-[clamp(2.6rem,4.2vw,3.2rem)] font-semibold leading-[0.98] tracking-[-0.055em]">
              Insufficient
              <br />
              evidence<span className="text-[var(--accent)]">.</span>
            </p>
            <p className="mt-6 max-w-md text-sm leading-6 text-[var(--fog)]">
              No real candidate met 35/50, three independent eligible sources
              and one direct problem or intent signal.
            </p>
            <SignalBars className="mt-10" />
            <p className="mt-3 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
              Signal sample / 10 sources / 0 eligible
            </p>
          </div>
          <div className="bg-[var(--surface)] p-7 md:col-span-7 md:p-11">
            <p className="text-lg leading-8 text-[var(--mist)] md:text-[1.1875rem]">
              The operating system evaluated three synthetic opportunity cards.
              None can establish a business: every supporting record is a
              fixture, the strongest score is{" "}
              <span className="text-[var(--accent)]">34/50</span> and no
              eligible independent market signal exists.
            </p>
            <div className="mt-11 grid gap-px bg-[var(--border)] sm:grid-cols-2">
              <div className="bg-[var(--surface)] pr-7">
                <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                  Estimated
                </p>
                <p className="mt-3 text-[2.375rem] font-semibold tracking-[-0.05em] tabular-nums">
                  {formatUsd(latestStandup.ledger.estimate)}
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--fog)]">
                  Worst-case reservation, not spend
                </p>
              </div>
              <div className="bg-[var(--surface)] pt-6 sm:pl-7 sm:pt-0">
                <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                  Actual
                </p>
                <p className="mt-3 text-[2.375rem] font-semibold tracking-[-0.05em] tabular-nums">
                  {formatUsd(latestStandup.ledger.actual)}
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--fog)]">
                  Offline fixture made no API call
                </p>
              </div>
            </div>
            <div className="mt-11 grid gap-3.5 border-t border-[var(--border)] pt-6">
              {gates.map(([number, label, state]) => (
                <div
                  className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-4 text-sm"
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
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10 md:py-30">
          <SectionHeading
            action={
              <Link
                className={buttonVariants({ variant: "secondary" })}
                href="/governance"
              >
                Full protocol
              </Link>
            }
            description="Autonomy is bounded by attributable evidence, deterministic voting, permission gates and an all-in operating cap."
            eyebrow="Control loop"
            title="How a decision becomes an action"
          />
          <div className="border-t border-[var(--border)]">
            {governanceSteps.map((step, index) => (
              <div
                className="grid gap-4 border-b border-[var(--border)] px-4 py-7 transition-colors hover:bg-[var(--surface-raised)] md:grid-cols-12 md:items-baseline md:gap-8"
                key={step.number}
              >
                <span className="font-mono text-xs tracking-[0.1em] text-[var(--accent)] md:col-span-1">
                  {step.number}
                </span>
                <h3 className="text-[1.6875rem] font-semibold leading-tight tracking-[-0.04em] md:col-span-3">
                  {step.title}
                </h3>
                <p className="max-w-3xl text-[0.96875rem] leading-7 text-[var(--fog)] md:col-span-7">
                  {step.description}
                </p>
                <span className="font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)] md:col-span-1 md:justify-self-end">
                  {stepTags[index]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10 md:py-30">
        <SectionHeading
          action={
            <Link
              className={buttonVariants({ variant: "secondary" })}
              href="/agents"
            >
              All role contracts
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          }
          description="Four formal voting seats and ten bounded specialists. Each role has a mandate, output, metric and route reason. These are autonomous software roles, not human employees."
          eyebrow="The roster"
          title={
            <>
              Fourteen agents.
              <br />
              No hidden board.
            </>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {council.map((agent) => (
            <AgentCard agent={agent} key={agent.id} />
          ))}
        </div>
        <div className="mt-4 overflow-hidden rounded-[1.125rem] border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-6 py-5 font-mono text-[0.65625rem] uppercase tracking-[0.14em] text-[var(--fog)]">
            <span>Specialists &amp; controls / 10 roles</span>
            <span>Bounded · non-voting</span>
          </div>
          <div className="grid md:grid-cols-2">
            {specialists.map((agent) => (
              <AgentRow agent={agent} compact key={agent.id} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 pb-24 md:px-10 md:pb-30">
        <div className="editorial-grid overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]">
          <div className="grid md:grid-cols-12">
            <div className="p-8 md:col-span-7 md:p-14">
              <p className="mono-label text-[var(--accent)]">Budget guard</p>
              <h2 className="mt-6 max-w-3xl text-[clamp(2.6rem,4.6vw,3.9rem)] font-semibold leading-none tracking-[-0.055em]">
                The monthly operating ceiling is $20.
              </h2>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--fog)]">
                API usage, media, treasury payments, recurring commitments and
                verified external costs share one hard cap. Pre-profit, 20%
                remains reserved.
              </p>
              <div className="mt-10 flex flex-wrap gap-8 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                <span>
                  Reserve <strong className="text-[var(--foreground)]">20%</strong>
                </span>
                <span>
                  Uncapped categories{" "}
                  <strong className="text-[var(--foreground)]">0</strong>
                </span>
                <span>
                  Overruns to date{" "}
                  <strong className="text-[var(--foreground)]">0</strong>
                </span>
              </div>
            </div>
            <div className="border-t border-[var(--border)] bg-[var(--surface)] p-8 md:col-span-5 md:border-l md:border-t-0 md:p-12">
              <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                Month to date
              </p>
              <p className="mt-5 text-7xl font-semibold leading-none tracking-[-0.07em] tabular-nums">
                $0.00
              </p>
              <Progress className="mt-7" max={20} value={0} />
              <div className="mt-4 flex items-center justify-between font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--fog)]">
                <span>Verified all-in</span>
                <span className="text-[var(--foreground)]">$20.00 cap</span>
              </div>
              <Link
                className={`${buttonVariants({ variant: "primary" })} mt-9 w-full`}
                href="/metrics"
              >
                Review the ledger strip
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
