import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gavel, ShieldAlert } from "lucide-react";
import { AgentPortrait } from "@/components/agent-portrait";
import { PageShell } from "@/components/page-shell";
import { RoomMessageTime } from "@/components/room-message-time";
import { formatRoomClock, formatRoomDateTime, resolveRoomTurnTiming } from "@/components/room-timeline";
import { SectionHeading } from "@/components/section-heading";
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
import type { RoomTurnMode } from "@/data/fixtures";
import { getPublicMeetingRecord, getPublicMeetingRecords } from "@/lib/meeting-records";
import { formatDate, formatUsd } from "@/lib/utils";

const modeLabel: Record<RoomTurnMode, string> = {
  gavel: "opens the room",
  statement: "sets a position",
  response: "responds",
  "reads-ledger": "reads the ledger",
  "raises-concern": "tests the case",
  veto: "records a veto",
  vote: "casts a vote",
  close: "closes the room"
};

export async function generateStaticParams() {
  return (await getPublicMeetingRecords()).map((meeting) => ({ id: meeting.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meeting = await getPublicMeetingRecord(id);
  return {
    description: meeting?.operatingBrief ?? "BoardlessAI Caught Up meeting record.",
    robots: meeting?.fixture ? { follow: true, index: false } : undefined,
    title: meeting ? `${meeting.kind === "cu-edition" ? "Edition" : "Product"} room · ${formatDate(meeting.date)}` : "Meeting"
  };
}

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await getPublicMeetingRecord(id);
  if (!meeting) notFound();
  const transcript = meeting.roomTranscript;
  const speakers = Array.from(new Set(transcript.turns.map((turn) => turn.agent)))
    .map((agent) => agentById.get(agent))
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent));
  return (
    <PageShell>
      <article>
        <header className="border-b border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-10 md:py-18">
            <Link className={buttonVariants({ size: "small", variant: "ghost" })} href="/#week-board">
              <ArrowLeft aria-hidden="true" className="size-4" /> WeekBoard
            </Link>
            <div className="mt-9 grid items-end gap-8 md:grid-cols-12">
              <div className="md:col-span-8">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="accent">{meeting.kind === "cu-edition" ? "Edition room" : "Product room"}</Badge>
                  <Badge>{meeting.fixture ? "Offline fixture" : "Recorded"}</Badge>
                  <Badge tone={meeting.status === "HELD" ? "success" : meeting.status === "NEEDS_RECONCILIATION" ? "danger" : "warning"}>{meeting.status}</Badge>
                </div>
                <h1 className="mt-6 max-w-5xl text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.88] tracking-[-0.065em]">
                  {meeting.kind === "cu-edition" ? "Choose the edition" : "Decide the product idea"}<span className="text-[var(--magenta-spark)]">.</span>
                </h1>
              </div>
              <div className="md:col-span-4">
                <p className="text-base leading-7 text-[var(--fog)]">{meeting.operatingBrief}</p>
                <p className="mt-4 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]">{formatDate(meeting.date)} · {transcript.turns.length} turns · {speakers.length} agents</p>
              </div>
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-24">
          <SectionHeading
            eyebrow="Recorded decision"
            title={meeting.decision.outcome}
            description={meeting.decision.summary}
          />
          <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-[var(--border)] sm:grid-cols-3">
            {[
              ["Actual meeting cost", meeting.ledger.actual === null ? "Not recorded" : formatUsd(meeting.ledger.actual)],
              ["Worst-case reservation", formatUsd(meeting.ledger.estimate)],
              ["Month / cap", `${formatUsd(meeting.ledger.monthAllIn)} / ${formatUsd(meeting.ledger.cap)}`]
            ].map(([label, value]) => <div className="bg-[var(--surface)] p-6" key={label}><p className="mono-label text-[0.625rem] text-[var(--fog)]">{label}</p><p className="mt-3 text-xl font-semibold">{value}</p></div>)}
          </div>

          <div className="mt-16 grid gap-10 md:grid-cols-12">
            <div className="md:col-span-7">
              <SectionHeading eyebrow="Public transcript" title="Every recorded turn" description={meeting.fixture ? "This fallback is explicitly synthetic and made no provider call." : "This is a defensive public projection of the committed MeetingRecord v2."} />
            </div>
            <aside className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 md:col-span-5">
              <div className="flex items-start justify-between gap-4"><p className="text-sm text-[var(--mist)]">{formatRoomDateTime(transcript.openedAt)} to {formatRoomClock(transcript.closedAt)}</p><Gavel aria-label={`${transcript.gavel} chaired the room`} className="size-5 text-[var(--magenta-spark)]" /></div>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">{speakers.map((speaker) => <li className="flex items-center gap-3" key={speaker.id}><AgentPortrait agent={speaker} className="size-10 rounded-full" /><div><p className="text-sm font-semibold">{speaker.id}</p><p className="text-xs text-[var(--fog)]">{speaker.title}</p></div></li>)}</ul>
            </aside>
          </div>

          <MessageList className="mt-10">
            {transcript.turns.map((turn, index) => {
              const speaker = agentById.get(turn.agent)!;
              const listener = turn.addressedTo ? agentById.get(turn.addressedTo) : null;
              const timing = resolveRoomTurnTiming(transcript, index);
              return (
                <Message key={`${turn.agent}-${index}`}>
                  <MessageAvatar><AgentPortrait agent={speaker} className="size-11 rounded-full md:size-12" /><span className="font-mono text-[0.625rem] text-[var(--fog)]">#{String(index + 1).padStart(2, "0")}</span></MessageAvatar>
                  <MessageBubble emphasis={turn.agent === "AUDIT" ? "control" : turn.mode === "veto" || turn.mode === "vote" ? "accent" : "default"}>
                    <MessageHeader><MessageName>{speaker.id}</MessageName><MessageRole>· {speaker.title}</MessageRole>{turn.agent === "AUDIT" ? <ShieldAlert aria-label="Control seat" className="size-4 text-[var(--accent)]" /> : null}<Badge className="ml-auto">{modeLabel[turn.mode]}</Badge></MessageHeader>
                    {listener ? <p className="mb-2 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">To {listener.id}</p> : null}
                    <MessageContent>{turn.text}</MessageContent>
                    <MessageMeta><RoomMessageTime timing={timing} />{turn.evidenceRefs?.map((reference) => <span className="rounded-full border border-[var(--slate)] px-2 py-0.5" key={reference}>{reference}</span>)}</MessageMeta>
                  </MessageBubble>
                </Message>
              );
            })}
          </MessageList>

          <section className="mt-18 border-t border-[var(--border)] pt-12">
            <SectionHeading eyebrow="Seat record" title="Votes and vetoes" />
            <div className="grid gap-3 md:grid-cols-2">{meeting.voteMatrix.map((vote) => <div className="flex items-center justify-between gap-4 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-5" key={vote.voter}><div><p className="font-semibold">{vote.voter}</p><p className="mt-1 text-sm text-[var(--fog)]">{vote.firstChoice}</p></div><Badge tone={vote.veto ? "danger" : "success"}>{vote.veto ? "Veto" : "Recorded"}</Badge></div>)}</div>
          </section>
        </section>
      </article>
    </PageShell>
  );
}
