import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Gavel, ShieldAlert } from "lucide-react";
import { AgentPortrait } from "@/components/agent-portrait";
import { publicAgentText, publicAgentTitle, publicReferenceLabel } from "@/components/agent-language";
import {
  DecisionReplay,
  type ReplayChapter,
  type ReplayCheck,
  type ReplayCut,
  type ReplayForecastOption
} from "@/components/decision-replay";
import { PageShell } from "@/components/page-shell";
import { RoomMessageTime } from "@/components/room-message-time";
import {
  formatRoomClock,
  formatRoomDateTime,
  resolveRoomTurnTiming
} from "@/components/room-timeline";
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
import { getPublicStandup, getPublicStandups } from "@/lib/standup-records";
import type { RoomTurnMode } from "@/data/fixtures";
import { formatDate } from "@/lib/utils";

export async function generateStaticParams() {
  return (await getPublicStandups()).map((standup) => ({ date: standup.id }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const standup = await getPublicStandup(date);
  return {
    description: standup
      ? standup.fixture
        ? `Watch the ${formatDate(standup.date)} BoardlessAI test meeting, make a private guess and read every saved message.`
        : `Watch the ${formatDate(standup.date)} BoardlessAI meeting and read every public message with its time.`
      : "BoardlessAI meeting replay.",
    robots: standup?.fixture ? { follow: true, index: false } : undefined,
    title: standup
      ? `Meeting replay · ${formatDate(standup.date)}`
      : "Meeting replay"
  };
}

const replayChapters = [
  {
    id: "brief",
    label: "01 · Brief",
    title: "Three ideas enter the meeting",
    summary:
      "The strategy lead frames one choice: select an idea today or wait for reliable sources.",
    startTurn: 0
  },
  {
    id: "ledger",
    label: "02 · Budget",
    title: "The four-cent limit",
    summary:
      "The budget keeper checks the cost before the team spends time on the question.",
    startTurn: 1
  },
  {
    id: "feasibility",
    label: "03 · Build",
    title: "Possible to build does not mean people want it",
    summary:
      "FORGE can build the strongest idea by lunch. That does not prove the team should choose it.",
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
    label: "05 · Sources",
    title: "AUDIT reads the record",
    summary:
      "Every sign came from sample data. The safety reviewer prepares to block the idea.",
    startTurn: 5
  },
  {
    id: "experiment",
    label: "06 · Test",
    title: "No metric without a market",
    summary:
      "The team asks whether a small first test can work without a real audience.",
    startTurn: 9
  },
  {
    id: "vote",
    label: "07 · Vote",
    title: "Four roles make the call",
    summary:
      "VIZE suggests waiting. Each decision maker records one short reason.",
    startTurn: 11
  },
  {
    id: "verdict",
    label: "08 · Decision",
    title: "The team chooses to wait",
    summary:
      "The project waits until SCOUT returns with reliable information from outside sources.",
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
    label: "Wait for real sources",
    detail: "Pause the project decision until outside sources show real interest."
  },
  {
    id: "redirect",
    label: "Change the brief",
    detail: "Reject the three ideas and give the team a different question."
  }
] satisfies readonly ReplayForecastOption[];

const replayCuts = [
  {
    id: "full",
    label: "Full meeting",
    detail: "Every saved message in the first test meeting."
  },
  {
    id: "highlights",
    label: "Highlights",
    detail:
      "The question, required checks, sources, vote and decision in fifteen points.",
    turnIndexes: [0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15, 16]
  },
  {
    id: "evidence",
    label: "Source trail",
    detail:
      "The exact exchange that separates what can be built from what has been proven.",
    turnIndexes: [2, 4, 5, 6, 7, 8, 9, 10, 15, 16]
  },
  {
    id: "vote",
    label: "Vote",
    detail: "The final suggestion, four votes and public result.",
    turnIndexes: [11, 12, 13, 14, 15, 16]
  }
] satisfies readonly ReplayCut[];

const replayCheck = {
  prompt: "Which fact gave AUDIT a reason to block a project choice?",
  answerId: "fixture-evidence",
  explanation:
    "Every sign came from sample data. The budget and ability to build both passed their checks.",
  options: [
    {
      id: "budget",
      label: "The monthly budget was already exhausted."
    },
    {
      id: "fixture-evidence",
      label: "No reliable information came from an outside source."
    },
    {
      id: "build",
      label: "The product builder could not make a small test version."
    }
  ]
} satisfies ReplayCheck;

const modeLabel: Record<RoomTurnMode, string> = {
  gavel: "opens the meeting",
  statement: "sets a position",
  response: "responds",
  "reads-ledger": "checks the budget record",
  "raises-concern": "tests the case",
  veto: "records a veto",
  vote: "casts a vote",
  close: "closes the meeting"
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

export default async function StandupRoomPage({
  params
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const standup = await getPublicStandup(date);
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
            <div className="flex flex-wrap gap-2">
              <Link
                className={buttonVariants({
                  variant: "ghost",
                  size: "small"
                })}
                href={`/standups/${standup.id}`}
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back to meeting notes
              </Link>
              <Link
                className={buttonVariants({
                  variant: "secondary",
                  size: "small"
                })}
                href="/boardroom#room-archive"
              >
                All meetings
              </Link>
            </div>
            <div className="mt-8 grid items-end gap-8 md:grid-cols-12">
              <div className="md:col-span-8">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="accent">Meeting replay</Badge>
                  <Badge>{standup.fixture ? "Test example" : "Saved"}</Badge>
                </div>
                <h1 className="mt-6 max-w-5xl text-[clamp(2.8rem,7.4vw,7.4rem)] font-semibold leading-[0.88] tracking-[-0.067em]">
                  Watch the AI team make the call
                  <span className="text-[var(--accent)]">.</span>
                </h1>
              </div>
              <div className="md:col-span-4">
                <p className="text-base leading-7 text-[var(--fog)]">
                  Make a private guess. Watch every saved message. See which
                  source changes the decision.
                </p>
                <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
                  <span>{transcript.turns.length} messages</span>
                  <span>{speakers.length} AI roles</span>
                  <span>{replayChapters.length} parts</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {standup.fixture ? (
          <DecisionReplay
            agents={speakers}
            chapters={replayChapters}
            cuts={replayCuts}
            forecastOptions={forecastOptions}
            replayCheck={replayCheck}
            transcript={transcript}
            verdict={{
              outcomeId: "wait",
              label: "Wait for real sources",
              summary:
                "The team refused to start a project from sample data. SCOUT must return with reliable outside sources before another vote."
            }}
          />
        ) : null}

        <section
          className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-26"
          id="full-transcript"
        >
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-7">
              <p className="mono-label text-[var(--accent)]">Public record</p>
              <h2 className="mt-5 text-[clamp(2.5rem,5vw,4.8rem)] font-semibold leading-[0.92] tracking-[-0.06em]">
                Read every message.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--fog)]">
                This replay does not add dialogue, reactions or private model reasoning. Internal codes are replaced with plain words here; the saved source file keeps the original wording. {standup.fixture
                  ? "The test label stays visible because no live team decision occurred. Message times follow the saved test timeline."
                  : "Each message time was saved when the live response arrived."}
              </p>
            </div>
            <aside className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 md:col-span-5 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mono-label text-[0.625rem] text-[var(--fog)]">
                    Who joined
                  </p>
                  <p className="mt-3 text-sm text-[var(--mist)]">
                    {formatRoomDateTime(transcript.openedAt)} to{" "}
                    {formatRoomClock(transcript.closedAt)}
                  </p>
                </div>
                <Gavel
                  aria-label={`${transcript.gavel} led the meeting`}
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
                      <p className="text-sm font-semibold">{publicAgentTitle(speaker)}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--fog)]">
                        AI role
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
              const turnTiming = resolveRoomTurnTiming(transcript, index);

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
                      <MessageName>{publicAgentTitle(speaker)}</MessageName>
                      <MessageRole>· AI role</MessageRole>
                      {isAudit ? (
                        <ShieldAlert
                          aria-label="Safety reviewer"
                          className="size-4 shrink-0 text-[var(--accent)]"
                        />
                      ) : null}
                      <Badge className="ml-auto" tone={modeTone[turn.mode]}>
                        {modeLabel[turn.mode]}
                      </Badge>
                    </MessageHeader>
                    {listener ? (
                      <p className="mb-2 font-mono text-[0.65625rem] uppercase tracking-[0.14em] text-[var(--fog)]">
                        To {publicAgentTitle(listener)}
                      </p>
                    ) : null}
                    <MessageContent>{publicAgentText(turn.text)}</MessageContent>
                    <MessageMeta>
                      <RoomMessageTime
                        className="text-[var(--ash)]"
                        timing={turnTiming}
                      />
                      {turn.evidenceRefs?.length ? (
                        <>
                          <span>On record:</span>
                          {turn.evidenceRefs.map((reference) => (
                            <span
                              className="rounded-full border border-[var(--slate)] px-2.5 py-0.5 text-[var(--ash)]"
                              key={reference}
                            >
                              {publicReferenceLabel(reference)}
                            </span>
                          ))}
                        </>
                      ) : null}
                    </MessageMeta>
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
                  {publicAgentText(standup.decision.summary)}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 md:col-span-4 md:justify-end">
                <Link
                  className={buttonVariants({ variant: "secondary" })}
                  href={`/standups/${standup.id}`}
                >
                  Full meeting notes
                </Link>
                <Link
                  className={buttonVariants({ variant: "primary" })}
                  href="/boardroom#room-archive"
                >
                  All meetings
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
