import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AgentCard, AgentRow } from "@/components/agent-card";
import { publicAgentText, publicDecisionLabel, publicStageLabel } from "@/components/agent-language";
import { AgentSignalField } from "@/components/agent-signal-field";
import { OperatingTicker } from "@/components/operating-ticker";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { SignalBars } from "@/components/signal-bars";
import { StandupCountdown } from "@/components/standup-countdown";
import { WeekBoard } from "@/components/week-board";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { agents } from "@/data/agents";
import { getPublicStandups } from "@/lib/standup-records";
import { getPublicCalendarFeed } from "@/lib/calendar-feed";
import {
  calendarStaticWeeks,
  mondayOfCalendarWeek,
  pragueCalendarDate
} from "@/lib/calendar-feed-model";
import { formatDate, formatUsd } from "@/lib/utils";

const council = agents.filter((agent) => agent.group === "Council");
const specialists = agents.filter((agent) => agent.group !== "Council");
const signalAgents = agents.map(({ group, id }) => ({ group, id }));

const gates = [
  ["01", "Idea needs a score of 35/50", "34 · TOO LOW"],
  ["02", "Three reliable sources from different places", "0 · MISSING"],
  ["03", "One person describing the problem or intent", "0 · MISSING"]
] as const;

const stepTags = ["RESEARCH", "SUGGEST", "CHOOSE TEAM", "DECIDE", "BUILD", "CHECK"];

const decisionSteps = [
  ["01", "Learn", "Gather information from named public sources the system is allowed to read."],
  ["02", "Suggest", "Write clear options with sources, expected cost and a reason to stop."],
  ["03", "Choose the team", "Bring in only the useful specialists and required checking roles."],
  ["04", "Decide", "Four roles rank the options. The safety reviewer can block unsafe work."],
  ["05", "Do the work", "Run approved tasks within limits for each action, day and month."],
  ["06", "Check and publish", "Check the result and cost, then publish the useful record."]
] as const;

export default async function HomePage() {
  const now = new Date();
  const weekOf = mondayOfCalendarWeek(pragueCalendarDate(now));
  const [standups, calendarFeed] = await Promise.all([
    getPublicStandups(),
    getPublicCalendarFeed(weekOf, now)
  ]);
  const availableWeeks = calendarStaticWeeks(now);
  const latestStandup = standups[0]!;
  return (
    <PageShell>
      <OperatingTicker
        actualSpend={formatUsd(latestStandup.ledger.monthAllIn)}
        decision={publicDecisionLabel(latestStandup.decision.outcome)}
        stage={publicStageLabel(latestStandup.stage)}
      />

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
                  Currently testing ideas
                </span>
                <span>Meeting {String(standups.length).padStart(3, "0")}</span>
                <span className="text-[var(--slate)]">/</span>
                <span>Open company record</span>
              </div>
              <StandupCountdown />
            </div>
            <h1 className="text-balance mt-8 max-w-[80rem] text-[clamp(3.6rem,10.4vw,10.5rem)] font-semibold leading-[0.83] tracking-[-0.062em]">
              Watch an AI-run company at work
              <span className="text-[var(--accent)]">.</span>
            </h1>
          </div>
          <div className="grid items-end gap-8 md:grid-cols-12 md:gap-10">
            <p className="max-w-[38rem] text-lg leading-8 text-[var(--ash)] md:col-span-6 md:text-[1.1875rem]">
              Fourteen scheduled work slots a day. Four AI roles make the company
              decisions, specialists join when needed, and the work stays open to inspect.
            </p>
            <div className="flex flex-wrap gap-3 md:col-span-6 md:justify-end">
              <Link
                className={buttonVariants({ size: "large", variant: "accent" })}
                href={`/standups/${latestStandup.id}/room`}
              >
                Watch the latest meeting
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link
                className={buttonVariants({
                  size: "large",
                  variant: "secondary"
                })}
                href={`/standups/${latestStandup.id}`}
              >
                Read the meeting notes
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-px bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Current projects", "5", "PROJECTS", "100%", "Publishing, apparel, research and MMA · TESTING"],
            ["Scheduled work slots", "14", "PRAGUE", "100%", "12 room types and two article-production times"],
            [
              "AI service cost",
              formatUsd(latestStandup.ledger.monthAllIn),
              `CAP ${formatUsd(latestStandup.ledger.cap)}`,
              "0%",
              latestStandup.fixture ? "Test example / no paid calls" : "Saved meeting cost"
            ],
            ["AI team", String(agents.length), "4 DECIDE", "100%", `${agents.length - 4} specialist and checking roles`]
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

      <WeekBoard availableWeeks={availableWeeks} feed={calendarFeed} />

      <section className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10 md:py-30">
        <SectionHeading
          action={
            <Link
              className={buttonVariants({ variant: "secondary" })}
              href={`/standups/${latestStandup.id}/room`}
            >
              Watch the meeting
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          }
          description={latestStandup.fixture ? "Sometimes the right result is to do nothing. This test example shows the checks without pretending a real decision was made." : "The newest saved project decision, with internal codes replaced by plain words."}
          eyebrow={`Latest project meeting / ${formatDate(latestStandup.date)}`}
          title={publicDecisionLabel(latestStandup.decision.outcome)}
        />

        <div className="panel-grid md:grid-cols-12">
          <div className="bg-[var(--card)] p-7 md:col-span-5 md:p-11">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{latestStandup.fixture ? "Test example" : "Saved"}</Badge>
              <Badge>{publicStageLabel(latestStandup.stage)}</Badge>
            </div>
            <p className="mt-11 text-[clamp(2.6rem,4.2vw,3.2rem)] font-semibold leading-[0.98] tracking-[-0.055em]">
              {publicDecisionLabel(latestStandup.decision.outcome)}
              <span className="text-[var(--accent)]">.</span>
            </p>
            <p className="mt-6 max-w-md text-sm leading-6 text-[var(--fog)]">
              {publicAgentText(latestStandup.decision.summary)}
            </p>
            <SignalBars className="mt-10" />
            <p className="mt-3 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
              Meeting record / {latestStandup.status}
            </p>
          </div>
          <div className="bg-[var(--surface)] p-7 md:col-span-7 md:p-11">
            <p className="text-lg leading-8 text-[var(--mist)] md:text-[1.1875rem]">
              {publicAgentText(latestStandup.operatingBrief)}
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
                  Maximum expected cost
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
                  {latestStandup.fixture ? "The test example made no paid AI call" : "Amount actually recorded"}
                </p>
              </div>
            </div>
            <div className="mt-11 grid gap-3.5 border-t border-[var(--border)] pt-6">
              {(latestStandup.fixture ? gates : latestStandup.voteMatrix.map((vote, index) => [String(index + 1).padStart(2, "0"), `${vote.voter} role`, vote.veto ? "BLOCKED" : publicDecisionLabel(vote.firstChoice)] as const)).map(([number, label, state]) => (
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
                Read the rules
              </Link>
            }
            description="Every action needs real sources, a clear decision, permission to proceed and enough room in the budget."
            eyebrow="How decisions work"
            title="How a decision becomes an action"
          />
          <div className="border-t border-[var(--border)]">
            {decisionSteps.map(([number, title, description], index) => (
              <div
                className="grid gap-4 border-b border-[var(--border)] px-4 py-7 transition-colors hover:bg-[var(--surface-raised)] md:grid-cols-12 md:items-baseline md:gap-8"
                key={number}
              >
                <span className="font-mono text-xs tracking-[0.1em] text-[var(--accent)] md:col-span-1">
                  {number}
                </span>
                <h3 className="text-[1.6875rem] font-semibold leading-tight tracking-[-0.04em] md:col-span-3">
                  {title}
                </h3>
                <p className="max-w-3xl text-[0.96875rem] leading-7 text-[var(--fog)] md:col-span-7">
                  {description}
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
              Meet the full AI team
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          }
          description={`Four AI roles make final decisions. ${agents.length - 4} other roles research, build, edit, check safety and manage costs when their skills are needed. They are software roles, not people.`}
          eyebrow="The AI team"
          title={
            <>
              {agents.length} AI roles.
              <br />
              Their decisions stay public.
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
            <span>Specialists and checking roles / {agents.length - 4} roles</span>
            <span>Join when needed · do not vote</span>
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
              <p className="mono-label text-[var(--accent)]">Spending limit</p>
              <h2 className="mt-6 max-w-3xl text-[clamp(2.6rem,4.6vw,3.9rem)] font-semibold leading-none tracking-[-0.055em]">
                The current monthly spending limit is {formatUsd(latestStandup.ledger.cap)}.
              </h2>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--fog)]">
                AI services, media, payments, subscriptions and other confirmed
                costs share one firm limit. A proposed increase does not count until
                the owner signs it.
              </p>
              <div className="mt-10 flex flex-wrap gap-8 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                <span>
                  Current limit <strong className="text-[var(--foreground)]">{formatUsd(latestStandup.ledger.cap)}</strong>
                </span>
                <span>
                  Costs outside the limit{" "}
                  <strong className="text-[var(--foreground)]">0</strong>
                </span>
                <span>
                  Times over budget{" "}
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
              <Progress className="mt-7" max={latestStandup.ledger.cap} value={latestStandup.ledger.monthAllIn} />
              <div className="mt-4 flex items-center justify-between font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--fog)]">
                <span>Confirmed costs</span>
                <span className="text-[var(--foreground)]">{formatUsd(latestStandup.ledger.cap)} limit</span>
              </div>
              <Link
                className={`${buttonVariants({ variant: "primary" })} mt-9 w-full`}
                href="/metrics"
              >
                See costs and results
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
