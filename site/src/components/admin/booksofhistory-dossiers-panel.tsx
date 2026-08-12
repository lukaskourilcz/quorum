import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import type { AdminBhClaim, AdminBhDossier, AdminBooksofhistorySnapshot } from "@/lib/admin-booksofhistory";
import { formatUsd } from "@/lib/utils";
import { Panel } from "./panel";

const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, style: "percent" });

function verificationTone(state: AdminBhClaim["verificationState"]): "success" | "warning" | "danger" | "neutral" {
  if (state === "verified") return "success";
  if (state === "probable" || state === "single-source") return "warning";
  if (state === "legend" || state === "rejected") return "danger";
  return "neutral";
}

function ClaimCard({ claim }: { claim: AdminBhClaim }) {
  return (
    <li className="rounded-[8px] border border-[#26262b] bg-[#101013] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={verificationTone(claim.verificationState)}>{claim.verificationState}</Badge>
        <Badge>{percent.format(claim.confidence)} confidence</Badge>
        <Badge>{claim.corroboration} {claim.corroboration === 1 ? "source" : "sources"}</Badge>
        {claim.publicationSuitable ? <Badge tone="success">publication suitable</Badge> : <Badge tone="danger">withhold</Badge>}
      </div>
      <p className="mt-3 text-sm leading-6 text-[#d4d4d8]">{claim.text}</p>
      <ul className="mt-3 grid gap-2">
        {claim.sources.map((source) => (
          <li className="text-xs text-[#a1a1aa]" key={`${claim.claimId}-${source.url}`}>
            <a className="inline-flex min-h-8 items-center gap-2 underline underline-offset-4 hover:text-white" href={source.url} rel="noreferrer" target="_blank">
              {source.title} <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
            <span className="ml-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#94949c]">{source.category}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function Dossier({ dossier, initiallyOpen }: { dossier: AdminBhDossier; initiallyOpen: boolean }) {
  const unused = dossier.stories.filter((story) => !story.used).length;
  return (
    <details className="rounded-[10px] border border-[#2d2d33] bg-[#101013]" open={initiallyOpen}>
      <summary className="cursor-pointer list-none px-4 py-4 marker:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-xl font-semibold">{dossier.title}</h3><p className="mt-1 text-sm text-[#a1a1aa]">{dossier.author}</p></div>
          <div className="flex flex-wrap gap-2"><Badge>{dossier.claims.length} claims</Badge><Badge tone={unused ? "success" : "neutral"}>{unused} unused stories</Badge></div>
        </div>
      </summary>
      <div className="grid gap-5 border-t border-[#26262b] p-4">
        <section><h4 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">Claims and sources</h4><ul className="mt-3 grid gap-3">{dossier.claims.map((claim) => <ClaimCard claim={claim} key={claim.claimId} />)}</ul></section>
        <section><h4 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">Story shelf</h4>{dossier.stories.length ? <ul className="mt-3 grid gap-3 sm:grid-cols-2">{dossier.stories.map((story) => <li className="rounded-[8px] border border-[#26262b] bg-[#0c0c0f] p-3" key={story.storyId}><div className="flex items-start justify-between gap-3"><p className="font-semibold">{story.angle}</p><span className="font-mono text-lg tabular-nums text-[#f4ecd8]">{story.score}</span></div><div className="mt-3 flex flex-wrap gap-2"><Badge tone={story.used ? "neutral" : "success"}>{story.used ? "used" : "unused"}</Badge><Badge>{story.claimRefs.length} {story.claimRefs.length === 1 ? "claim" : "claims"}</Badge></div></li>)}</ul> : <Callout className="mt-3">No story candidates are recorded in this dossier.</Callout>}</section>
        <section><h4 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c]">Attributed quotes</h4>{dossier.quotes.length ? <ul className="mt-3 grid gap-3">{dossier.quotes.map((quote) => <li className="border-l-2 border-[#684d08] pl-3" key={`${quote.claimRef}-${quote.text}`}><blockquote className="text-sm leading-6 text-[#d4d4d8]">“{quote.text}”</blockquote><a className="mt-1 inline-flex min-h-8 items-center gap-2 text-xs text-[#a1a1aa] underline underline-offset-4 hover:text-white" href={quote.sourceUrl} rel="noreferrer" target="_blank">— {quote.attribution}<ExternalLink aria-hidden="true" className="size-3.5" /></a></li>)}</ul> : <p className="mt-3 text-sm text-[#a1a1aa]">No attributed quote is stored.</p>}</section>
      </div>
    </details>
  );
}

export function BooksofhistoryDossiersPanel({ snapshot }: { snapshot: AdminBooksofhistorySnapshot }) {
  return (
    <div className="grid gap-4">
      <Panel note="Used paid books ÷ paid books" title="Research efficiency">
        {snapshot.researchEfficiency === null ? <Callout>No paid research is recorded yet, so efficiency is not measurable.</Callout> : <div><p className="text-3xl font-semibold tabular-nums">{percent.format(snapshot.researchEfficiency)}</p><p className="mt-2 text-sm leading-6 text-[#a1a1aa]">Share of distinct books with paid research whose dossier has supplied a used story.</p></div>}
      </Panel>

      <Panel note={`${snapshot.dossiers.length} ${snapshot.dossiers.length === 1 ? "dossier" : "dossiers"}`} title="Knowledge shelf">
        {snapshot.dossiers.length ? <div className="grid gap-3">{snapshot.dossiers.map((dossier, index) => <Dossier dossier={dossier} initiallyOpen={index === 0} key={dossier.bookId} />)}</div> : <Callout>No valid dossiers are stored yet.</Callout>}
      </Panel>

      <Panel note={`${snapshot.ledger.length} ${snapshot.ledger.length === 1 ? "line" : "lines"}`} title="Research ledger">
        {snapshot.ledger.length ? <div className="overflow-x-auto" data-horizontal-scroll><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead><tr className="border-b border-[#26262b] font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#94949c]"><th className="px-2 py-3 font-medium">Book / step</th><th className="px-2 py-3 font-medium">Provider / model</th><th className="px-2 py-3 font-medium">Reason</th><th className="px-2 py-3 font-medium">Requested by</th><th className="px-2 py-3 text-right font-medium">Cost</th><th className="px-2 py-3 text-right font-medium">Outcome</th></tr></thead><tbody>{snapshot.ledger.map((entry) => <tr className="border-b border-[#1e1e22] align-top" key={`${entry.cycleId}-${entry.bookId}-${entry.step}-${entry.completedAt}`}><td className="px-2 py-3"><p className="font-semibold">{entry.bookId}</p><p className="mt-1 font-mono text-[10px] uppercase text-[#94949c]">{entry.step}</p></td><td className="px-2 py-3"><p>{entry.provider}</p><p className="mt-1 text-xs text-[#94949c]">{entry.model}</p></td><td className="px-2 py-3">{entry.reason}</td><td className="px-2 py-3">{entry.requestingMeetingId}</td><td className="px-2 py-3 text-right font-mono tabular-nums">{formatUsd(entry.costUsd)}</td><td className="px-2 py-3 text-right"><Badge tone={entry.used ? "success" : "neutral"}>{entry.used ? "used" : "not used"}</Badge></td></tr>)}</tbody></table></div> : <Callout>No research spend is recorded.</Callout>}
      </Panel>
    </div>
  );
}
