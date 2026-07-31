import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FlaskConical, Gavel, Search } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { getIncubatorSnapshot, type IncubatorProposalStatus, type PublicIncubatorProposal } from "@/lib/incubator-records";
import { formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  description: "The public BoardlessAI magazine incubator: evidenced niche proposals, owner ratings, shortlist and research rooms.",
  robots: { follow: true, index: false },
  title: "Magazine Incubator"
};

function tone(status: IncubatorProposalStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "shortlist") return "success";
  if (status === "archived") return "danger";
  if (status === "proposed") return "warning";
  return "neutral";
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
      Evidence <ArrowUpRight aria-hidden="true" className="size-4" />
    </a>
  ) : <code className="break-all text-xs text-[var(--fog)]">{reference}</code>;
}

function ProposalCard({ proposal }: { proposal: PublicIncubatorProposal }) {
  return (
    <article className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone={tone(proposal.status)}>{proposal.status}</Badge>
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">
          {proposal.rating ? `Owner rating ${proposal.rating.value} · ${proposal.rating.ratedAt.slice(0, 10)}` : "Owner rating not recorded"}
        </p>
      </div>
      <h3 className="mt-6 text-3xl font-semibold tracking-[-0.045em]">{proposal.domain}</h3>
      <p className="mt-3 text-lg leading-7 text-[var(--mist)]">{proposal.oneLiner}</p>
      <p className="mt-5 text-sm leading-6 text-[var(--fog)]">{proposal.whyPeopleCareDaily}</p>
      <dl className="mt-7 grid gap-px overflow-hidden rounded-[var(--radius-button)] bg-[var(--border)] sm:grid-cols-2">
        <div className="bg-[var(--card)] p-4"><dt className="mono-label text-[0.625rem] text-[var(--fog)]">Reader hypothesis</dt><dd className="mt-2 text-sm leading-6">{proposal.audience.regions.join(", ")} · ages {proposal.audience.ageMin}–{proposal.audience.ageMax} · {proposal.audience.interests.join(", ")}</dd></div>
        <div className="bg-[var(--card)] p-4"><dt className="mono-label text-[0.625rem] text-[var(--fog)]">Content shape</dt><dd className="mt-2 text-sm leading-6">{proposal.cadence} · {proposal.formats.join(", ")}</dd></div>
      </dl>
      <p className="mt-5 text-sm leading-6"><span className="font-semibold">Machinery reuse:</span> <span className="text-[var(--fog)]">{proposal.caughtUpReuseNotes}</span></p>
      <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-5">
        <Link className={buttonVariants({ size: "small", variant: "secondary" })} href={`/meetings/${proposal.originMeetingId}`}>
          Origin room <Gavel aria-hidden="true" className="size-4" />
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
            <div className="flex flex-wrap gap-2"><Badge tone="dark">Exploration</Badge><Badge>Research, not founding</Badge></div>
            <h1 className="mt-7 text-[clamp(3.4rem,8vw,8rem)] font-semibold leading-[0.86] tracking-[-0.07em]">The hunt<br />in public<span className="text-[var(--accent)]">.</span></h1>
          </div>
          <div className="self-end md:col-span-4">
            <p className="text-lg leading-8 text-[var(--mist)]">A magazine niche earns a proposal through evidence, a daily reader loop and a bounded audience—not a brainstorming quota.</p>
            <div className="mt-7 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.1em] text-[var(--fog)]"><FlaskConical aria-hidden="true" className="size-4 text-[var(--accent)]" /> Measured API spend {formatUsd(snapshot.apiSpendUsd)}</div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-24">
        <SectionHeading eyebrow="Owner pick-list" title="Shortlist" description="Perfect moves a proposal here. The list is an input to an owner decision, never permission for an agent to found a venture." />
        {snapshot.shortlist.length ? (
          <div className="grid gap-3 md:grid-cols-2">{snapshot.shortlist.map((proposal) => <Link className="rounded-[var(--radius-button)] border border-[var(--accent)] bg-[var(--surface)] p-5 text-xl font-semibold" href={`#${proposal.id}`} key={proposal.id}>{proposal.domain}</Link>)}</div>
        ) : <Callout>No proposal is shortlisted. The dry bootstrap returned zero candidates because it had no external evidence.</Callout>}
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--secondary)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-24">
          <SectionHeading eyebrow="Proposal ledger" title="Evidenced directions" description="Ratings are public operating state. Notes are not projected here; the rating value and date are rendered plainly." />
          {snapshot.unreadableFiles.length ? <Callout className="mb-6" tone="warning">{snapshot.unreadableFiles.length} proposal file failed the public projection and is hidden.</Callout> : null}
          {snapshot.proposals.length ? (
            <div className="grid gap-5 xl:grid-cols-2">{snapshot.proposals.map((proposal) => <div id={proposal.id} key={proposal.id}><ProposalCard proposal={proposal} /></div>)}</div>
          ) : (
            <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--steel)] bg-[var(--surface)] p-8 md:p-12">
              <Search aria-hidden="true" className="size-7 text-[var(--accent)]" />
              <h3 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">No invented demo niches.</h3>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--fog)]">The canonical proposal directory is empty. Live synthesis may add zero to two validated records after a cited scan.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-24">
        <SectionHeading eyebrow="Dry rooms" title="The refusal is recorded" description="Both fixtures made no provider call and spent nothing. They prove that empty input does not become a fabricated market thesis." />
        <div className="grid gap-4 md:grid-cols-2">
          {snapshot.meetingIds.map((id) => (
            <Link className="group rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-7" href={`/meetings/${id}`} key={id}>
              <Badge>{id.endsWith("scan") ? "Divergent · max 12 turns" : "Convergent · max 18 turns"}</Badge>
              <h3 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">{id.endsWith("scan") ? "Evidence scan" : "Proposal synthesis"}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--fog)]">Open the public room transcript <ArrowUpRight aria-hidden="true" className="ml-1 inline size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></p>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-[var(--graphite)] text-[var(--paper)]">
        <div className="mx-auto max-w-[var(--container)] px-5 py-16 md:px-10">
          <p className="mono-label text-[0.6875rem] text-[var(--ash)]">Lifecycle</p>
          <p className="mt-5 max-w-5xl text-2xl font-semibold leading-10 tracking-[-0.025em] md:text-4xl">Proposed → rated → shortlist or archived. Only a countersigned owner decision can turn a future winner into a venture.</p>
        </div>
      </section>
    </PageShell>
  );
}
