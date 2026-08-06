import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gavel } from "lucide-react";
import { AgentPortrait } from "@/components/agent-portrait";
import { publicAgentText, publicAgentTitle, publicDecisionLabel } from "@/components/agent-language";
import { PageShell } from "@/components/page-shell";
import { ArticleJsonDisclosure } from "@/components/article-json-disclosure";
import { RoomMessageList } from "@/components/room-message-list";
import { formatRoomClock, formatRoomDateTime } from "@/components/room-timeline";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { agentById } from "@/data/agents";
import { calendarStaticWeeks, mondayOfCalendarWeek } from "@/lib/calendar-feed-model";
import { deliveredArticlePackage, deliveredEditionPackage } from "@/lib/delivered-packages";
import { agendaIdFromRef, getMeetingAgendaSummaries } from "@/lib/meeting-agendas";
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

/**
 * A PAUSED record is the note that a room had no agenda due, so it never convened and has no
 * discussion to show. Building a page for it invited a reader to open a meeting that did not
 * happen; the calendar cell carries the one sentence there is to say.
 */
export async function generateStaticParams() {
  return (await getPublicMeetingRecords())
    .filter((meeting) => meeting.status !== "PAUSED")
    .map((meeting) => ({ id: meeting.id }));
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
  if (!meeting || meeting.status === "PAUSED") notFound();
  const transcript = meeting.roomTranscript;
  const roomName = meetingCopy[meeting.kind]?.name ?? "Project meeting";
  const roomTitle = meetingCopy[meeting.kind]?.title ?? "Review the work";
  const speakers = Array.from(new Set(transcript.turns.map((turn) => turn.agent)))
    .map((agent) => agentById.get(agent))
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent));
  const agendaId = meeting.agendaRef ? agendaIdFromRef(meeting.agendaRef) : null;
  const agendaSummary = agendaId ? (await getMeetingAgendaSummaries()).get(agendaId) : undefined;
  // The one deliberate machine artifact: on a day this room produced an article, the package
  // that left the building is available to open under the discussion that decided it.
  const delivered = meeting.kind === "cu-edition"
    ? await deliveredEditionPackage(meeting.date, meeting.editionRef)
    : meeting.kind === "mag-editorial"
      ? await deliveredArticlePackage(meeting.date)
      : null;
  // The reader arrives from a week on the calendar, so the way back is that week and not
  // always the current one. Weeks outside the built range fall back to the home board.
  const week = mondayOfCalendarWeek(meeting.date);
  const backHref = calendarStaticWeeks(new Date()).includes(week) ? `/calendar/${week}` : "/#week-board";
  return (
    <PageShell>
      <article>
        <header className="border-b border-[var(--border)] bg-[var(--card)]">
          <div className="mx-auto max-w-[var(--container)] px-5 py-8 md:px-10 md:py-10">
            <Link className={buttonVariants({ size: "small", variant: "ghost" })} href={backHref}>
              <ArrowLeft aria-hidden="true" className="size-4" /> Back to the week
            </Link>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Badge tone="accent">{roomName}</Badge>
              <Badge>{meeting.fixture ? "Test example" : "Saved"}</Badge>
              <Badge tone={meeting.status === "HELD" ? "success" : meeting.status === "NEEDS_RECONCILIATION" ? "danger" : "warning"}>{publicDecisionLabel(meeting.status)}</Badge>
              <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]">{formatDate(meeting.date)} · {transcript.turns.length} messages · {speakers.length} AI roles</span>
            </div>
            <h1 className="mt-4 max-w-4xl text-[clamp(1.875rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
              {roomTitle}<span className="text-[var(--magenta-spark)]">.</span>
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--fog)]">
              {agendaSummary
                ? `What this meeting was asked to decide: ${publicAgentText(agendaSummary)}`
                : publicAgentText(meeting.operatingBrief)}
            </p>
          </div>
        </header>

        <section className="mx-auto max-w-[var(--container)] px-5 py-12 md:px-10 md:py-16">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="text-[1.375rem] font-semibold tracking-[-0.035em]">Every saved message</h2>
            <p className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)]">
              <Gavel aria-hidden="true" className="size-4 text-[var(--magenta-spark)]" />
              <span>{publicAgentTitle(agentById.get(transcript.gavel)!)} led the meeting</span>
              <span>·</span>
              <span>{formatRoomDateTime(transcript.openedAt)} to {formatRoomClock(transcript.closedAt)}</span>
            </p>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--fog)]">
            {meeting.fixture
              ? "This is clearly marked sample data and used no paid AI service. Internal codes are replaced with plain words here; the saved source file keeps the original wording."
              : "This public view removes private system data and replaces internal codes with plain words. The saved source file keeps the original wording."}
          </p>

          <RoomMessageList className="mt-8" transcript={transcript} />

          {delivered ? (
            <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 md:p-6">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <AgentPortrait agent={agentById.get("RELAY")!} className="size-9 shrink-0 rounded-full" />
                <span className="font-mono text-[0.8125rem] font-semibold">
                  {publicAgentTitle(agentById.get("RELAY")!)}
                </span>
                <span className="text-[0.75rem] text-[var(--fog)]">· AI role</span>
                {delivered.articleUrl ? (
                  <a
                    className="ml-auto font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--accent)] underline-offset-2 hover:underline"
                    href={delivered.articleUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Read the published article
                  </a>
                ) : null}
              </div>
              <p className="mt-3 text-[0.9375rem] leading-7 text-[var(--mist)]">
                This meeting produced an article, and it was delivered.
              </p>
              <ArticleJsonDisclosure json={delivered.json} {...(delivered.note ? { note: delivered.note } : {})} />
            </div>
          ) : null}

          <details className="mt-12 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]">
            <summary className="cursor-pointer px-6 py-5 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--mist)]">
              The rest of the record: decision, votes, cost and who joined
            </summary>
            <div className="border-t border-[var(--border)] px-6 py-8 md:px-8">
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
                ].map(([label, value]) => <div className="bg-[var(--card)] p-6" key={label}><p className="mono-label text-[0.625rem] text-[var(--fog)]">{label}</p><p className="mt-3 text-xl font-semibold">{value}</p></div>)}
              </div>

              <div className="mt-12">
                <SectionHeading eyebrow="Decision record" title="Votes and blocks" />
                <div className="grid gap-3 md:grid-cols-2">{meeting.voteMatrix.map((vote) => <div className="flex items-center justify-between gap-4 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-5" key={vote.voter}><div><p className="font-semibold">{publicAgentTitle(agentById.get(vote.voter)!)}</p><p className="mt-1 text-sm text-[var(--fog)]">{publicDecisionLabel(vote.firstChoice)}</p></div><Badge tone={vote.veto ? "danger" : "success"}>{vote.veto ? "Blocked" : "Recorded"}</Badge></div>)}</div>
              </div>

              <div className="mt-12">
                <SectionHeading eyebrow="Who joined" title="Roles in the meeting" />
                <ul className="grid gap-3 sm:grid-cols-2">{meeting.participants.map((participant) => <li className="flex items-center gap-3 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--card)] p-4" key={participant.agent}><AgentPortrait agent={agentById.get(participant.agent)!} className="size-10 shrink-0 rounded-full" /><div className="min-w-0"><p className="text-sm font-semibold">{publicAgentTitle(agentById.get(participant.agent)!)}</p><p className="mt-0.5 text-xs leading-5 text-[var(--fog)]">{publicAgentText(participant.reason)}</p></div></li>)}</ul>
              </div>
            </div>
          </details>
        </section>
      </article>
    </PageShell>
  );
}
