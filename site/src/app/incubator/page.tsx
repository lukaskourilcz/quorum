import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FlaskConical, Gavel, Search } from "lucide-react";
import { publicAgentText } from "@/components/agent-language";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { getIncubatorSnapshot, type IncubatorProposalStatus, type PublicIncubatorProposal } from "@/lib/incubator-records";
import { formatDate, formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  description: "Magazine ideas BoardlessAI is researching, the sources behind them and the owner's ratings.",
  robots: { follow: true, index: false },
  title: "New magazine ideas"
};

function tone(status: IncubatorProposalStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "shortlist") return "success";
  if (status === "archived") return "danger";
  if (status === "proposed") return "warning";
  return "neutral";
}

function statusLabel(status: IncubatorProposalStatus): string {
  if (status === "shortlist") return "Keep reviewing";
  if (status === "archived") return "Closed";
  if (status === "proposed") return "Suggested";
  return "Rated by you";
}

function evidenceHref(reference: string): string | null {
  try {
    const url = new URL(reference);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function EvidenceReference({ reference }: { reference: string }) {
  const href = evidenceHref(reference);
  return href ? (
    <a className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--accent)] underline underline-offset-4" href={href} rel="noreferrer" target="_blank">
      Source <ArrowUpRight aria-hidden="true" className="size-4" />
    </a>
  ) : <code className="break-all text-xs text-[var(--fog)]">{reference}</code>;
}

function ProposalCard({ proposal }: { proposal: PublicIncubatorProposal }) {
  return (
    <article className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone={tone(proposal.status)}>{statusLabel(proposal.status)}</Badge>
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">
          {proposal.rating ? <>Your rating {proposal.rating.value} · <time dateTime={proposal.rating.ratedAt}>{formatDate(proposal.rating.ratedAt)}</time></> : "You have not rated this yet"}
        </p>
      </div>
      <h3 className="mt-6 text-3xl font-semibold tracking-[-0.045em]">{proposal.domain}</h3>
      <p className="mt-3 text-lg leading-7 text-[var(--mist)]">{proposal.oneLiner}</p>
      <p className="mt-5 text-sm leading-6 text-[var(--fog)]">{proposal.whyPeopleCareDaily}</p>
      <dl className="mt-7 grid gap-px overflow-hidden rounded-[var(--radius-button)] bg-[var(--border)] sm:grid-cols-2">
        <div className="bg-[var(--card)] p-4"><dt className="mono-label text-[0.625rem] text-[var(--fog)]">Who might read it</dt><dd className="mt-2 text-sm leading-6">{proposal.audience.regions.join(", ")} · ages {proposal.audience.ageMin}–{proposal.audience.ageMax} · {proposal.audience.interests.join(", ")}</dd></div>
        <div className="bg-[var(--card)] p-4"><dt className="mono-label text-[0.625rem] text-[var(--fog)]">How often and in what format</dt><dd className="mt-2 text-sm leading-6">{publicAgentText(proposal.cadence)} · {proposal.formats.map(publicAgentText).join(", ")}</dd></div>
      </dl>
      <p className="mt-5 text-sm leading-6"><span className="font-semibold">What Caught Up can already provide:</span> <span className="text-[var(--fog)]">{proposal.caughtUpReuseNotes}</span></p>
      <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-5">
        <Link className={buttonVariants({ size: "small", variant: "secondary" })} href={`/meetings/${proposal.originMeetingId}`}>
          See the meeting <Gavel aria-hidden="true" className="size-4" />
        </Link>
        {proposal.evidenceRefs.map((reference) => <EvidenceReference key={reference} reference={reference} />)}
      </div>
    </article>
  );
}

export default async function IncubatorPage() {
  const snapshot = await getIncubatorSnapshot();
  return (
    <PageShell>
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-10 px-5 py-16 md:grid-cols-12 md:px-10 md:py-24">
          <div className="md:col-span-8">
            <div className="flex flex-wrap gap-2"><Badge tone="dark">Magazine ideas</Badge><Badge>Research only</Badge></div>
            <h1 className="mt-7 text-[clamp(3.4rem,8vw,8rem)] font-semibold leading-[0.86] tracking-[-0.07em]">Finding the next<br />good idea<span className="text-[var(--accent)]">.</span></h1>
          </div>
          <div className="self-end md:col-span-4">
            <p className="text-lg leading-8 text-[var(--mist)]">A magazine idea must have credible sources, a reason for people to return and a clear group of readers.</p>
            <div className="mt-7 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.1em] text-[var(--fog)]"><FlaskConical aria-hidden="true" className="size-4 text-[var(--accent)]" /> Recorded AI service cost {formatUsd(snapshot.apiSpendUsd)}</div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-24">
        <SectionHeading eyebrow="Ideas you liked" title="Keep looking at these" description="Your highest rating moves an idea here. It still needs your direct approval before it can become a project." />
        {snapshot.shortlist.length ? (
          <div className="grid gap-3 md:grid-cols-2">{snapshot.shortlist.map((proposal) => <Link className="rounded-[var(--radius-button)] border border-[var(--accent)] bg-[var(--surface)] p-5 text-xl font-semibold" href={`#${proposal.id}`} key={proposal.id}>{proposal.domain}</Link>)}</div>
        ) : <Callout>No idea is on this list yet. The first test found no candidates because it had no outside sources.</Callout>}
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--secondary)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-24">
          <SectionHeading eyebrow="Ideas with sources" title="What the team has found" description="Your rating and its date are shown here. Your private notes stay private." />
          {snapshot.unreadableFiles.length ? <Callout className="mb-6" tone="warning">{snapshot.unreadableFiles.length} idea file could not be shown and is hidden.</Callout> : null}
          {snapshot.proposals.length ? (
            <div className="grid gap-5 xl:grid-cols-2">{snapshot.proposals.map((proposal) => <div id={proposal.id} key={proposal.id}><ProposalCard proposal={proposal} /></div>)}</div>
          ) : (
            <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--steel)] bg-[var(--surface)] p-8 md:p-12">
              <Search aria-hidden="true" className="size-7 text-[var(--accent)]" />
              <h3 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">No made-up examples.</h3>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--fog)]">No ideas have been saved yet. A research meeting may add up to two ideas when it finds credible sources.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-24">
        <SectionHeading eyebrow="Test meetings" title="The empty result is saved" description="Neither test used a paid AI service, and neither invented an idea when no sources were available." />
        <div className="grid gap-4 md:grid-cols-2">
          {snapshot.meetingIds.map((id) => (
            <Link className="group rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-7" href={`/meetings/${id}`} key={id}>
              <Badge>{id.endsWith("scan") ? "Find sources · up to 12 messages" : "Choose ideas · up to 18 messages"}</Badge>
              <h3 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">{id.endsWith("scan") ? "Find possible subjects" : "Choose the strongest ideas"}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--fog)]">Read the meeting notes <ArrowUpRight aria-hidden="true" className="ml-1 inline size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></p>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-[var(--graphite)] text-[var(--paper)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-16 md:px-10">
          <p className="mono-label text-[0.6875rem] text-[var(--ash)]">What happens next</p>
          <p className="mt-5 max-w-5xl text-2xl font-semibold leading-10 tracking-[-0.025em] md:text-4xl">Idea saved → you rate it → keep it or close it. Starting a new project still needs your approval.</p>
        </div>
      </section>
    </PageShell>
  );
}
