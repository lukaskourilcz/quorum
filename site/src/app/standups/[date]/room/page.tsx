import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gavel, ShieldAlert } from "lucide-react";
import { AgentPortrait } from "@/components/agent-portrait";
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
      ? `Plain-English chat log of the ${formatDate(date)} council meeting — who said what, and why they decided the way they did.`
      : "BoardlessAI room transcript.",
    robots: standup?.fixture ? { follow: true, index: false } : undefined,
    title: standup ? `Room · ${formatDate(date)}` : "Room transcript"
  };
}

const modeLabel: Record<RoomTurnMode, string> = {
  gavel: "opens the meeting",
  statement: "says",
  response: "responds",
  "reads-ledger": "reports on the budget",
  "raises-concern": "raises a concern",
  veto: "vetoes",
  vote: "votes",
  close: "closes the meeting"
};

const modeTone: Record<
  RoomTurnMode,
  "neutral" | "accent" | "warning" | "success" | "dark"
> = {
  gavel: "accent",
  statement: "neutral",
  response: "neutral",
  "reads-ledger": "neutral",
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
  const gavelAgent = agentById.get(transcript.gavel);
  const speakers = Array.from(
    new Set(transcript.turns.map((turn) => turn.agent))
  )
    .map((id) => agentById.get(id))
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent));

  return (
    <PageShell>
      <article>
        <header className="border-b border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-8 md:py-16">
            <Link
              className={buttonVariants({ variant: "ghost", size: "small" })}
              href={`/standups/${standup.date}`}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to standup
            </Link>
            <div className="mt-8 flex flex-wrap gap-2">
              <Badge tone="accent">Chat log</Badge>
              <Badge>{standup.fixture ? "Offline fixture" : "Live"}</Badge>
            </div>
            <h1 className="mt-6 max-w-4xl break-words text-[clamp(2.4rem,5.6vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.055em]">
              What the room actually said
              <span className="text-[var(--accent)]">.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-[var(--muted-foreground)] md:text-lg">
              A plain-English chat log of the {formatDate(date)} council
              meeting. No hidden reasoning — just what was said, who said it,
              and what they decided.
            </p>
          </div>
        </header>

        <section className="mx-auto max-w-[var(--container)] px-5 pt-10 md:px-8 md:pt-14">
          <div className="grid gap-4 md:grid-cols-12">
            <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-6 md:col-span-8 md:p-8">
              <p className="mono-label text-[0.65625rem] text-[var(--accent)]">
                What was this meeting about?
              </p>
              <p className="mt-4 break-words text-lg leading-8 text-[var(--foreground)]">
                Four voting agents (VIZE, FORGE, PULSE, AUDIT) run this
                company. They meet twice a day to decide what to work on. This
                was the <strong className="text-[var(--foreground)]">
                  very first meeting
                </strong>{" "}
                — the founding vote.
              </p>
              <p className="mt-4 break-words text-base leading-7 text-[var(--mist)]">
                {transcript.setting}
              </p>
              <div className="mt-6 grid gap-3 border-t border-[var(--border)] pt-6 sm:grid-cols-3">
                <div>
                  <p className="mono-label text-[0.625rem] text-[var(--fog)]">
                    On the table
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--mist)]">
                    Three business ideas, all made up internally to test the
                    software — no real customers, no real problems yet.
                  </p>
                </div>
                <div>
                  <p className="mono-label text-[0.625rem] text-[var(--fog)]">
                    The question
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--mist)]">
                    Pick one and start building it, or wait until we have real
                    evidence?
                  </p>
                </div>
                <div>
                  <p className="mono-label text-[0.625rem] text-[var(--fog)]">
                    Outcome
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">
                    They decided to wait. AUDIT vetoed picking anything based
                    on made-up numbers.
                  </p>
                </div>
              </div>
            </div>
            <aside className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 md:col-span-4 md:p-8">
              <p className="mono-label text-[0.65625rem] text-[var(--fog)]">
                Who was in the room
              </p>
              <ul className="mt-4 grid gap-3">
                {speakers.map((speaker) => {
                  const isChair = speaker.id === transcript.gavel;
                  const isControl = speaker.id === "AUDIT";
                  return (
                    <li
                      className="flex items-center gap-3"
                      key={speaker.id}
                    >
                      <AgentPortrait
                        agent={speaker}
                        className="size-10 shrink-0 rounded-full"
                      />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-semibold">
                          <span>{speaker.id}</span>
                          {isChair ? (
                            <Gavel
                              aria-label="Chairing"
                              className="size-3.5 text-[var(--accent)]"
                            />
                          ) : null}
                          {isControl ? (
                            <ShieldAlert
                              aria-label="Control seat"
                              className="size-3.5 text-[var(--accent)]"
                            />
                          ) : null}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[var(--fog)]">
                          {speaker.title}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted-foreground)]">
                <span>
                  Opened{" "}
                  <span className="font-mono text-[var(--foreground)]">
                    {formatClockTime(transcript.openedAt)}
                  </span>
                </span>
                <span>
                  Closed{" "}
                  <span className="font-mono text-[var(--foreground)]">
                    {formatClockTime(transcript.closedAt)}
                  </span>
                </span>
                <span>{transcript.turns.length} messages</span>
              </div>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-[var(--container)] px-5 py-10 md:px-8 md:py-14">
          <MessageList>
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
                <Message key={index}>
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
                        → to {listener.id}
                      </p>
                    ) : null}
                    <MessageContent>{turn.text}</MessageContent>
                    {turn.evidenceRefs && turn.evidenceRefs.length ? (
                      <MessageMeta>
                        <span>Referring to:</span>
                        {turn.evidenceRefs.map((ref) => (
                          <span
                            className="rounded-full border border-[var(--slate)] px-2.5 py-0.5 text-[var(--ash)]"
                            key={ref}
                          >
                            {ref}
                          </span>
                        ))}
                      </MessageMeta>
                    ) : null}
                  </MessageBubble>
                </Message>
              );
            })}
          </MessageList>

          <div className="mt-10 flex flex-col items-start gap-4 rounded-[var(--radius-card)] border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--card))] p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div className="min-w-0">
              <p className="mono-label text-[0.65625rem] text-[var(--accent)]">
                In one sentence
              </p>
              <p className="mt-2 max-w-3xl break-words text-lg leading-7 text-[var(--foreground)] md:text-xl">
                The council refused to pick a business today because the
                evidence for all three ideas was made-up. Tomorrow, SCOUT
                starts collecting real signals.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className={buttonVariants({ variant: "secondary" })}
                href={`/standups/${standup.date}`}
              >
                See the full standup record
              </Link>
              <Link
                className={buttonVariants({ variant: "ghost" })}
                href="/boardroom"
              >
                How the room is built
              </Link>
            </div>
          </div>
        </section>
      </article>
    </PageShell>
  );
}
