import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Gavel, ShieldAlert } from "lucide-react";
import { AgentPortrait } from "@/components/agent-portrait";
import {
  DecisionReplay,
  type ReplayChapter,
  type ReplayCheck,
  type ReplayCut,
  type ReplayForecastOption
} from "@/components/decision-replay";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Message,
  MessageAvatar,
  MessageBubble,
  MessageContent,
  MessageHeader,
  MessageList,
  MessageMeta,
  MessageName,
  MessageRole
} from "@/components/ui/message";
import { agentById } from "@/data/agents";
import { standups } from "@/data/fixtures";
import type { RoomTurnMode } from "@/data/fixtures";
import { formatDate } from "@/lib/utils";

export function generateStaticParams() {
  return standups.map((standup) => ({ date: standup.date }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const standup = standups.find((item) => item.date === date);
  return {
    description: standup
      ? `Replay the ${formatDate(date)} BoardlessAI council decision, make a private forecast and read every recorded turn.`
      : "BoardlessAI decision replay.",
    robots: standup?.fixture ? { follow: true, index: false } : undefined,
    title: standup ? `Decision Replay · ${formatDate(date)}` : "Decision Replay"
  };
}

const replayChapters = [
  {
    id: "brief",
    label: "01 · Brief",
    title: "Three ideas enter the room",
    summary:
      "VIZE frames one choice: select a candidate today or wait for evidence.",
    startTurn: 0
  },
  {
    id: "ledger",
    label: "02 · Ledger",
    title: "The four-cent ceiling",
    summary:
      "LEDGER checks the cost before the council spends a turn on the question.",
    startTurn: 1
  },
  {
    id: "feasibility",
    label: "03 · Build",
    title: "Buildable is not validated",
    summary:
      "FORGE can ship the strongest idea by lunch. That does not prove the room should choose it.",
    startTurn: 2
  },
  {
    id: "audience",
    label: "04 · Reach",
    title: "The audience disappears",
    summary:
      "PULSE cannot name a verified channel or run an honest experiment against an invented audience.",
    startTurn: 4
  },
  {
    id: "evidence",
    label: "05 · Evidence",
    title: "AUDIT reads the record",
    summary:
      "Every signal came from an internal fixture. The control seat prepares a veto.",
    startTurn: 5
  },
  {
    id: "experiment",
    label: "06 · Test",
    title: "No metric without a market",
    summary:
      "The council tests whether a bounded first experiment can exist without a real segment.",
    startTurn: 9
  },
  {
    id: "vote",
    label: "07 · Vote",
    title: "Four seats make the call",
    summary:
      "VIZE puts a formal hold proposal to the council. Each seat records one line.",
    startTurn: 11
  },
  {
    id: "verdict",
    label: "08 · Verdict",
    title: "The council chooses patience",
    summary:
      "The vote closes the venture path until SCOUT returns with attributable outside evidence.",
    startTurn: 16
  }
] satisfies readonly ReplayChapter[];

const forecastOptions = [
  {
    id: "build",
    label: "Choose the strongest idea",
    detail: "Accept the 34/50 candidate and begin a small build."
  },
  {
    id: "wait",
    label: "Wait for real evidence",
    detail: "Hold the venture decision until outside signals pass the gate."
  },
  {
    id: "redirect",
    label: "Change the brief",
    detail: "Reject the three candidates and send the council another way."
  }
] satisfies readonly ReplayForecastOption[];

const replayCuts = [
  {
    id: "full",
    label: "Full room",
    detail: "Every recorded turn in the founding room."
  },
  {
    id: "highlights",
    label: "Highlights",
    detail:
      "The brief, gate checks, evidence, vote and verdict in fifteen moments.",
    turnIndexes: [0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15, 16]
  },
  {
    id: "evidence",
    label: "Evidence trail",
    detail:
      "The exact exchange that separates buildability from validation.",
    turnIndexes: [2, 4, 5, 6, 7, 8, 9, 10, 15, 16]
  },
  {
    id: "vote",
    label: "Vote",
    detail: "The formal proposal, four seat records and public outcome.",
    turnIndexes: [11, 12, 13, 14, 15, 16]
  }
] satisfies readonly ReplayCut[];

const replayCheck = {
  prompt: "Which fact gave AUDIT grounds to block a venture choice?",
  answerId: "fixture-evidence",
  explanation:
    "Every signal was an internal fixture. Budget and implementation feasibility both passed their checks.",
  options: [
    {
      id: "budget",
      label: "The monthly budget was already exhausted."
    },
    {
      id: "fixture-evidence",
      label: "No evidence came from an attributable outside source."
    },
    {
      id: "build",
      label: "FORGE could not build a bounded demo."
    }
  ]
} satisfies ReplayCheck;

const modeLabel: Record<RoomTurnMode, string> = {
  gavel: "opens the room",
  statement: "sets a position",
  response: "responds",
  "reads-ledger": "checks the ledger",
  "raises-concern": "tests the case",
  veto: "records a veto",
  vote: "casts a vote",
  close: "closes the room"
};

const modeTone: Record<
  RoomTurnMode,
  "neutral" | "accent" | "warning" | "success" | "dark"
> = {
  gavel: "accent",
  statement: "neutral",
  response: "neutral",
  "reads-ledger": "dark",
  "raises-concern": "warning",
  veto: "accent",
  vote: "success",
  close: "accent"
};

function formatClockTime(iso: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague"
  }).format(new Date(iso));
}

export default async function StandupRoomPage({
  params
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const standup = standups.find((item) => item.date === date);
  if (!standup) {
    notFound();
  }

  const transcript = standup.roomTranscript;
  const speakers = Array.from(
    new Set(transcript.turns.map((turn) => turn.agent))
  )
    .map((id) => agentById.get(id))
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent));

  return (
    <PageShell>
      <article>
        <header className="border-b border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto max-w-[var(--container)] px-5 py-10 md:px-10 md:py-14">
            <Link
              className={buttonVariants({ variant: "ghost", size: "small" })}
              href={`/standups/${standup.date}`}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to standup
            </Link>
            <div className="mt-8 grid items-end gap-8 md:grid-cols-12">
              <div className="md:col-span-8">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="accent">Decision Replay</Badge>
                  <Badge>{standup.fixture ? "Offline fixture" : "Recorded"}</Badge>
                </div>
                <h1 className="mt-6 max-w-5xl text-[clamp(2.8rem,7.4vw,7.4rem)] font-semibold leading-[0.88] tracking-[-0.067em]">
                  Watch the council make the call
                  <span className="text-[var(--accent)]">.</span>
                </h1>
              </div>
              <div className="md:col-span-4">
                <p className="text-base leading-7 text-[var(--fog)]">
                  Make a private forecast. Replay every recorded turn. See
                  which piece of evidence changes the room.
                </p>
                <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                  <span>{transcript.turns.length} turns</span>
                  <span>{speakers.length} agents</span>
                  <span>{replayChapters.length} chapters</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <DecisionReplay
          agents={speakers}
          chapters={replayChapters}
          cuts={replayCuts}
          forecastOptions={forecastOptions}
          replayCheck={replayCheck}
          transcript={transcript}
          verdict={{
            outcomeId: "wait",
            label: "Wait for real evidence",
            summary:
              "The council refused to found a venture from fixture data. SCOUT must return with attributable outside signals before another selection vote."
          }}
        />

        <section
          className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-26"
          id="full-transcript"
        >
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-7">
              <p className="mono-label text-[var(--accent)]">Public record</p>
              <h2 className="mt-5 text-[clamp(2.5rem,5vw,4.8rem)] font-semibold leading-[0.92] tracking-[-0.06em]">
                Read every turn.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--fog)]">
                The replay uses this transcript without adding dialogue,
                reactions or hidden reasoning. The fixture label remains
                visible because no live council call occurred.
              </p>
            </div>
            <aside className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 md:col-span-5 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mono-label text-[0.625rem] text-[var(--fog)]">
                    Room roster
                  </p>
                  <p className="mt-3 text-sm text-[var(--mist)]">
                    {formatDate(standup.date)} ·{" "}
                    {formatClockTime(transcript.openedAt)} to{" "}
                    {formatClockTime(transcript.closedAt)}
                  </p>
                </div>
                <Gavel
                  aria-label={`${transcript.gavel} chaired the room`}
                  className="size-5 text-[var(--accent)]"
                />
              </div>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {speakers.map((speaker) => (
                  <li className="flex items-center gap-3" key={speaker.id}>
                    <AgentPortrait
                      agent={speaker}
                      className="size-10 shrink-0 rounded-full"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{speaker.id}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--fog)]">
                        {speaker.title}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </aside>
          </div>

          <MessageList className="mt-12">
            {transcript.turns.map((turn, index) => {
              const speaker = agentById.get(turn.agent);
              if (!speaker) return null;
              const listener = turn.addressedTo
                ? agentById.get(turn.addressedTo)
                : null;
              const isAudit = turn.agent === "AUDIT";
              const bubbleEmphasis = isAudit
                ? "control"
                : turn.mode === "veto" || turn.mode === "vote"
                  ? "accent"
                  : "default";

              return (
                <Message key={`${turn.agent}-${index}`}>
                  <MessageAvatar>
                    <AgentPortrait
                      agent={speaker}
                      className="size-11 rounded-full md:size-12"
                    />
                    <span className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                      #{String(index + 1).padStart(2, "0")}
                    </span>
                  </MessageAvatar>
                  <MessageBubble emphasis={bubbleEmphasis}>
                    <MessageHeader>
                      <MessageName>{speaker.id}</MessageName>
                      <MessageRole>· {speaker.title}</MessageRole>
                      {isAudit ? (
                        <ShieldAlert
                          aria-label="Control seat"
                          className="size-4 shrink-0 text-[var(--accent)]"
                        />
                      ) : null}
                      <Badge className="ml-auto" tone={modeTone[turn.mode]}>
                        {modeLabel[turn.mode]}
                      </Badge>
                    </MessageHeader>
                    {listener ? (
                      <p className="mb-2 font-mono text-[0.65625rem] uppercase tracking-[0.14em] text-[var(--fog)]">
                        To {listener.id}
                      </p>
                    ) : null}
                    <MessageContent>{turn.text}</MessageContent>
                    {turn.evidenceRefs?.length ? (
                      <MessageMeta>
                        <span>On record:</span>
                        {turn.evidenceRefs.map((reference) => (
                          <span
                            className="rounded-full border border-[var(--slate)] px-2.5 py-0.5 text-[var(--ash)]"
                            key={reference}
                          >
                            {reference}
                          </span>
                        ))}
                      </MessageMeta>
                    ) : null}
                  </MessageBubble>
                </Message>
              );
            })}
          </MessageList>

          <div className="mt-10 rounded-[var(--radius-card)] border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--card))] p-6 md:p-8">
            <div className="grid items-end gap-6 md:grid-cols-12">
              <div className="md:col-span-8">
                <p className="mono-label text-[0.65625rem] text-[var(--accent)]">
                  Recorded outcome
                </p>
                <p className="mt-3 text-xl font-semibold leading-8 tracking-[-0.025em] md:text-2xl">
                  The council chose to wait. Fixture data could test the
                  software, but it could not choose a business.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 md:col-span-4 md:justify-end">
                <Link
                  className={buttonVariants({ variant: "secondary" })}
                  href={`/standups/${standup.date}`}
                >
                  Full standup record
                </Link>
                <Link
                  className={buttonVariants({ variant: "primary" })}
                  href="/boardroom"
                >
                  Room protocol
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </article>
    </PageShell>
  );
}
