import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gavel } from "lucide-react";
import { AgentPortrait } from "@/components/agent-portrait";
import { publicAgentText, publicAgentTitle, publicDecisionLabel } from "@/components/agent-language";
import { PageShell } from "@/components/page-shell";
import { RoomMessageList } from "@/components/room-message-list";
import { formatRoomClock, formatRoomDateTime } from "@/components/room-timeline";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { agentById } from "@/data/agents";
import { getPublicMeetingRecord, getPublicMeetingRecords } from "@/lib/meeting-records";
import { formatDate, formatUsd } from "@/lib/utils";

const meetingCopy: Record<string, { name: string; title: string }> = {
  "cu-edition": { name: "Edition production", title: "Produce today's edition" },
  "cu-product": { name: "Product meeting", title: "Decide the product idea" },
  "tt-marketing": { name: "Marketing meeting", title: "Shape the season" },
  "incubator-scan": { name: "Idea research", title: "Find ideas with real sources" },
  "incubator-synthesis": { name: "Idea review", title: "Choose ideas without starting a project" },
  "mma-intake": { name: "FightAIQ data meeting", title: "Check the fight data" },
  "mma-analysis": { name: "FightAIQ analysis meeting", title: "Review the model without guessing" },
  "mag-editorial": { name: "MMA Files story meeting", title: "Choose or reject both article slots" },
  "mag-desk": { name: "MMA Files desk meeting", title: "Check today’s articles and social drafts" }
};

export async function generateStaticParams() {
  return (await getPublicMeetingRecords()).map((meeting) => ({ id: meeting.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meeting = await getPublicMeetingRecord(id);
  return {
    description: meeting ? publicAgentText(meeting.operatingBrief) : "BoardlessAI project meeting record.",
    robots: meeting?.fixture ? { follow: true, index: false } : undefined,
    title: meeting ? `${meetingCopy[meeting.kind]?.name ?? "Project meeting"} · ${formatDate(meeting.date)}` : "Meeting"
  };
}

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await getPublicMeetingRecord(id);
  if (!meeting) notFound();
  const transcript = meeting.roomTranscript;
  const roomName = meetingCopy[meeting.kind]?.name ?? "Project meeting";
  const roomTitle = meetingCopy[meeting.kind]?.title ?? "Review the work";
  const speakers = Array.from(new Set(transcript.turns.map((turn) => turn.agent)))
    .map((agent) => agentById.get(agent))
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent));
  return (
    <PageShell>
      <article>
        <header className="border-b border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-10 md:py-18">
            <Link className={buttonVariants({ size: "small", variant: "ghost" })} href="/#week-board">
              <ArrowLeft aria-hidden="true" className="size-4" /> Five-day schedule
            </Link>
            <div className="mt-9 grid items-end gap-8 md:grid-cols-12">
              <div className="md:col-span-8">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="accent">{roomName}</Badge>
                  <Badge>{meeting.fixture ? "Test example" : "Saved"}</Badge>
                  <Badge tone={meeting.status === "HELD" ? "success" : meeting.status === "NEEDS_RECONCILIATION" ? "danger" : "warning"}>{publicDecisionLabel(meeting.status)}</Badge>
                </div>
                <h1 className="mt-6 max-w-5xl text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.88] tracking-[-0.065em]">
                  {roomTitle}<span className="text-[var(--magenta-spark)]">.</span>
                </h1>
              </div>
              <div className="md:col-span-4">
                <p className="text-base leading-7 text-[var(--fog)]">{publicAgentText(meeting.operatingBrief)}</p>
                <p className="mt-4 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]">{formatDate(meeting.date)} · {transcript.turns.length} messages · {speakers.length} AI roles</p>
              </div>
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-24">
          <SectionHeading
            eyebrow="Recorded decision"
            title={publicDecisionLabel(meeting.decision.outcome)}
            description={publicAgentText(meeting.decision.summary)}
          />
          <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-[var(--border)] sm:grid-cols-3">
            {[
              ["Actual meeting cost", meeting.ledger.actual === null ? "Not recorded" : formatUsd(meeting.ledger.actual)],
              ["Maximum expected cost", formatUsd(meeting.ledger.estimate)],
              ["Month / limit", `${formatUsd(meeting.ledger.monthAllIn)} / ${formatUsd(meeting.ledger.cap)}`]
            ].map(([label, value]) => <div className="bg-[var(--surface)] p-6" key={label}><p className="mono-label text-[0.625rem] text-[var(--fog)]">{label}</p><p className="mt-3 text-xl font-semibold">{value}</p></div>)}
          </div>

          <div className="mt-16 grid gap-10 md:grid-cols-12">
            <div className="md:col-span-7">
              <SectionHeading eyebrow="Public messages" title="Every saved message" description={meeting.fixture ? "This is clearly marked sample data and used no paid AI service. Internal codes are replaced with plain words here; the saved source file keeps the original wording." : "This public view removes private system data and replaces internal codes with plain words. The saved source file keeps the original wording."} />
            </div>
            <aside className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 md:col-span-5">
              <div className="flex items-start justify-between gap-4"><p className="text-sm text-[var(--mist)]">{formatRoomDateTime(transcript.openedAt)} to {formatRoomClock(transcript.closedAt)}</p><Gavel aria-label={`${transcript.gavel} led the meeting`} className="size-5 text-[var(--magenta-spark)]" /></div>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">{speakers.map((speaker) => <li className="flex items-center gap-3" key={speaker.id}><AgentPortrait agent={speaker} className="size-10 rounded-full" /><div><p className="text-sm font-semibold">{publicAgentTitle(speaker)}</p><p className="text-xs text-[var(--fog)]">AI role</p></div></li>)}</ul>
            </aside>
          </div>

          <RoomMessageList className="mt-10" transcript={transcript} />

          <section className="mt-18 border-t border-[var(--border)] pt-12">
            <SectionHeading eyebrow="Decision record" title="Votes and blocks" />
            <div className="grid gap-3 md:grid-cols-2">{meeting.voteMatrix.map((vote) => <div className="flex items-center justify-between gap-4 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-5" key={vote.voter}><div><p className="font-semibold">{publicAgentTitle(agentById.get(vote.voter)!)}</p><p className="mt-1 text-sm text-[var(--fog)]">{publicDecisionLabel(vote.firstChoice)}</p></div><Badge tone={vote.veto ? "danger" : "success"}>{vote.veto ? "Blocked" : "Recorded"}</Badge></div>)}</div>
          </section>
        </section>
      </article>
    </PageShell>
  );
}
