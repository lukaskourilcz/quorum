import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import routingSource from "../../../../config/agent-routing.json";
import { AgentPortrait } from "@/components/agent-portrait";
import { BoardroomArchive } from "@/components/boardroom-archive";
import {
  CouncilSimulator,
  type OperatingNeed
} from "@/components/council-simulator";
import {
  buildCouncilRoomPreviews,
  type RoutingPreviewConfig
} from "@/components/council-simulator-model";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { roomIdForStandup } from "@/components/room-timeline";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { agentById, agents } from "@/data/agents";
import { getPublicStandups } from "@/lib/standup-records";
import { formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  description:
    "Explore BoardlessAI's three-shift boardroom archive, inspect each seat and watch every recorded episode.",
  title: "Boardroom"
};

const roomPreviews = buildCouncilRoomPreviews(
  routingSource satisfies RoutingPreviewConfig,
  agents.map((agent) => agent.id)
);

const principles = [
  {
    step: "01",
    title: "Minimal packet",
    text: "Objective, evidence references, risk tags, cost, owner and required decision."
  },
  {
    step: "02",
    title: "Bounded positions",
    text: "Brief summaries and evidence references; no private chain-of-thought is published."
  },
  {
    step: "03",
    title: "Closed memo",
    text: "Outcome, owner, evidence, actual cost and latency become the public projection."
  }
] as const;

export default async function BoardroomPage() {
  const standups = await getPublicStandups();
  const standup = standups[0]!;
  const operatingNeeds: readonly OperatingNeed[] = [
    {
      id: "evidence",
      label: "Eligible evidence",
      value: 0,
      max: 3,
      valueLabel: "0 / 3 signals",
      state: "blocked",
      detail: "Three independent eligible signals are required for a venture decision."
    },
    {
      id: "scope",
      label: "Internal scope",
      value: 1,
      max: 1,
      valueLabel: "Bounded",
      state: "ready",
      detail: "Current shift work stays inside the hobby / non-commercial boundary."
    },
    {
      id: "budget",
      label: "Budget headroom",
      value: standup.ledger.cap - standup.ledger.monthAllIn,
      max: standup.ledger.cap,
      valueLabel: `${formatUsd(standup.ledger.cap - standup.ledger.monthAllIn)} available`,
      state: "ready",
      detail: `${formatUsd(standup.ledger.monthAllIn)} spent against the monthly cap.`
    },
    {
      id: "reachability",
      label: "Audience reachability",
      value: null,
      max: 1,
      valueLabel: "Unverified",
      state: "unknown",
      detail: "No attributable channel or reachable segment is in the record."
    }
  ];
  const selected = standup.participants.filter((item) => item.participated);
  const skipped = standup.participants.filter((item) => !item.participated);

  return (
    <PageShell>
      <PageIntro
        aside={
          <div className="rounded-[1rem] border border-[var(--slate)] bg-[var(--card)] p-7">
            <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
              Hard room caps
            </p>
            <p className="mt-4 text-[2.125rem] font-semibold tracking-[-0.05em]">
              2 rounds
            </p>
            <p className="mt-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--fog)]">
              6 turns · 12k tokens · 30 min TTL
            </p>
          </div>
        }
        description="Three shifts create recurring episodes without weakening the controls. Every room is dated, every participant has a reason and every handoff is public."
        eyebrow="Decision rooms"
        title="The boardroom"
      />

      <BoardroomArchive records={standups} />

      <section className="mx-auto max-w-[var(--container)] px-5 pt-24 md:px-10">
        <div className="panel-grid md:grid-cols-12">
          <div className="bg-[var(--card)] p-7 md:col-span-4 md:p-10">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{standup.fixture ? "Closed fixture" : "Closed live record"}</Badge>
              <Badge>Council</Badge>
            </div>
            <p className="mt-10 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">
              {roomIdForStandup(standup)}
            </p>
            <h2 className="mt-4 text-4xl font-semibold leading-[0.98] tracking-[-0.055em]">
              {standup.fixture ? "Select a venture or return NO_ACTION" : standup.decision.outcome}
            </h2>
            <p className="mt-9 flex items-center gap-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]">
              <span className="status-pulse size-1.5 rounded-full bg-[var(--accent)]" />
              {standup.fixture ? "Deterministic offline cycle" : "Live guarded cycle"}
            </p>
          </div>
          <div className="bg-[var(--surface)] p-7 md:col-span-8 md:p-10">
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                ["Owner", "VIZE"],
                ["Budget impact", formatUsd(standup.ledger.estimate)],
                ["Outcome", "NO_ACTION"]
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                    {label}
                  </p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <div className="my-8 h-px bg-[var(--border)]" />
            <h3 className="text-[1.375rem] font-semibold tracking-[-0.035em]">
              Objective
            </h3>
            <p className="mt-3.5 max-w-3xl text-base leading-7 text-[var(--fog)]">
              {standup.fixture
                ? "Choose at most one opportunity that passes all evidence, score, feasibility and first-experiment gates. Otherwise explicitly choose NO_ACTION."
                : standup.operatingBrief}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className={buttonVariants({ variant: "primary" })}
                href={`/standups/${standup.id}/room`}
              >
                Watch Decision Replay
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link
                className={buttonVariants({ variant: "secondary" })}
                href={`/standups/${standup.id}`}
              >
                Full standup record
              </Link>
            </div>
          </div>
        </div>
      </section>

      <CouncilSimulator
        agents={agents}
        operatingNeeds={operatingNeeds}
        previews={roomPreviews}
        replayHref={`/standups/${standup.id}/room`}
        transcript={standup.roomTranscript}
      />

      <section className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-4">
            <p className="mono-label text-[var(--accent)]">Roster</p>
            <h2 className="mt-5 text-[2.5rem] font-semibold leading-none tracking-[-0.055em]">
              Routed with reasons
            </h2>
            <p className="mt-5 text-base leading-7 text-[var(--fog)]">
              Council seats and LEDGER are required in every shift episode.
              Specialists enter only when a topic or control rule needs them.
            </p>
            <div className="mt-8 flex h-2 gap-2 overflow-hidden rounded-full bg-[var(--border)]">
              <span className="w-[35.7%] bg-[var(--accent)]" />
              <span className="flex-1 bg-[var(--slate)]" />
            </div>
            <p className="mt-3 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
              {selected.length} selected / {skipped.length} skipped
            </p>
          </div>
          <div className="grid gap-4 md:col-span-8 lg:grid-cols-2">
            {[
              {
                label: "Selected",
                people: selected,
                countClass: "text-[var(--accent)]",
                dimmed: false
              },
              {
                label: "Skipped",
                people: skipped,
                countClass: "text-[var(--fog)]",
                dimmed: true
              }
            ].map((group) => (
              <div
                className="overflow-hidden rounded-[1.125rem] border border-[var(--border)] bg-[var(--card)]"
                key={group.label}
              >
                <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5">
                  <h3 className="font-semibold">{group.label}</h3>
                  <span
                    className={`font-mono text-[0.6875rem] ${group.countClass}`}
                  >
                    {group.people.length}
                  </span>
                </div>
                <div className="py-2">
                  {group.people.map((participant) => {
                    const agent = agentById.get(participant.agent);
                    if (!agent) return null;
                    return (
                      <div
                        className="grid grid-cols-[2.25rem_1fr] gap-3.5 px-6 py-3.5"
                        key={participant.agent}
                      >
                        <AgentPortrait
                          agent={agent}
                          className={`size-9 rounded-lg ${
                            group.dimmed ? "brightness-75" : ""
                          }`}
                        />
                        <div>
                          <p className="text-[0.84375rem] font-semibold">
                            {participant.agent}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[var(--fog)]">
                            {participant.reason}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10">
          <div className="panel-grid md:grid-cols-3">
            {principles.map((item) => (
              <div
                className="min-h-56 bg-[var(--surface)] p-8 transition-colors hover:bg-[var(--surface-raised)] md:p-10"
                key={item.step}
              >
                <p className="font-mono text-xs tracking-[0.1em] text-[var(--accent)]">
                  {item.step}
                </p>
                <h3 className="mt-10 text-2xl font-semibold tracking-[-0.04em]">
                  {item.title}
                </h3>
                <p className="mt-4 text-sm leading-6 text-[var(--fog)]">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
