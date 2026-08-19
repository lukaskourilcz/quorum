import { ExternalLink } from "lucide-react";
import {
  AdminEntityBadge,
  AdminMetric,
  AdminStateMessage,
  AdminStatusBadge,
  AdminTable,
  AdminTableCell,
  AdminTableHead,
  AdminTableRegion,
} from "./admin-primitives";
import { Panel } from "./panel";
import type { AdminBhClaim, AdminBhDossier, AdminBooksofhistorySnapshot } from "@/lib/admin-booksofhistory";
import { formatUsd } from "@/lib/utils";

const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, style: "percent" });

function verificationTone(state: AdminBhClaim["verificationState"]): "success" | "warning" | "destructive" | "neutral" {
  if (state === "verified") return "success";
  if (state === "probable" || state === "single-source") return "warning";
  if (state === "legend" || state === "rejected") return "destructive";
  return "neutral";
}

function ClaimRow({ claim }: { claim: AdminBhClaim }) {
  return (
    <li className="grid gap-2 border-b border-[var(--admin-border)] py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <AdminStatusBadge tone={verificationTone(claim.verificationState)}>{claim.verificationState}</AdminStatusBadge>
        <AdminEntityBadge>{percent.format(claim.confidence)} confidence</AdminEntityBadge>
        <AdminEntityBadge>{claim.corroboration} {claim.corroboration === 1 ? "source" : "sources"}</AdminEntityBadge>
        <AdminStatusBadge tone={claim.publicationSuitable ? "success" : "destructive"}>{claim.publicationSuitable ? "Publication suitable" : "Withhold"}</AdminStatusBadge>
      </div>
      <p className="m-0 text-[length:var(--admin-type-control)] leading-5">{claim.text}</p>
      <ul className="m-0 grid list-none gap-1 p-0">
        {claim.sources.map((source) => (
          <li className="min-w-0 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]" key={`${claim.claimId}-${source.url}`}>
            <a className="admin-focus-ring inline-flex min-h-[var(--admin-touch-target)] max-w-full items-center gap-2 break-all underline underline-offset-2 md:min-h-[var(--admin-control-height)]" href={source.url} rel="noreferrer" target="_blank">{source.title} <ExternalLink aria-hidden className="size-3.5 shrink-0" /></a>
            <span className="ml-2 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-subtle)]">{source.category}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function Dossier({ dossier, initiallyOpen }: { dossier: AdminBhDossier; initiallyOpen: boolean }) {
  const unused = dossier.stories.filter((story) => !story.used).length;
  return (
    <details className="rounded-[var(--admin-radius)] border border-[var(--admin-border)]" open={initiallyOpen}>
      <summary className="admin-focus-ring cursor-pointer list-none rounded-[var(--admin-radius)] px-4 py-3 marker:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="m-0 text-[length:var(--admin-type-section)] font-semibold">{dossier.title}</h3><p className="m-0 mt-1 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{dossier.author}</p></div>
          <div className="flex flex-wrap gap-2"><AdminEntityBadge>{dossier.claims.length} claims</AdminEntityBadge><AdminStatusBadge tone={unused ? "success" : "neutral"}>{unused} unused stories</AdminStatusBadge></div>
        </div>
      </summary>
      <div className="grid gap-5 border-t border-[var(--admin-border)] p-4">
        <section><h4 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Claims and sources</h4><ul className="m-0 mt-2 grid list-none p-0">{dossier.claims.map((claim) => <ClaimRow claim={claim} key={claim.claimId} />)}</ul></section>
        <section><h4 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Story shelf</h4>{dossier.stories.length ? <ul className="m-0 mt-2 grid list-none divide-y divide-[var(--admin-border)] p-0">{dossier.stories.map((story) => <li className="grid gap-2 py-3 first:pt-0 last:pb-0" key={story.storyId}><div className="flex items-start justify-between gap-3"><p className="m-0 font-semibold">{story.angle}</p><span className="admin-tabular text-[length:var(--admin-type-section)] font-semibold">{story.score}</span></div><div className="flex flex-wrap gap-2"><AdminStatusBadge tone={story.used ? "neutral" : "success"}>{story.used ? "Used" : "Unused"}</AdminStatusBadge><AdminEntityBadge>{story.claimRefs.length} {story.claimRefs.length === 1 ? "claim" : "claims"}</AdminEntityBadge></div></li>)}</ul> : <AdminStateMessage className="mt-2" state="initial-empty" title="No story candidates are recorded in this dossier" />}</section>
        <section><h4 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">Attributed quotes</h4>{dossier.quotes.length ? <ul className="m-0 mt-2 grid list-none gap-3 p-0">{dossier.quotes.map((quote) => <li className="border-l-2 border-[var(--admin-section-accent)] pl-3" key={`${quote.claimRef}-${quote.text}`}><blockquote className="m-0 text-[length:var(--admin-type-control)] leading-5">“{quote.text}”</blockquote><a className="admin-focus-ring mt-1 inline-flex min-h-[var(--admin-touch-target)] items-center gap-2 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)] underline underline-offset-2 md:min-h-[var(--admin-control-height)]" href={quote.sourceUrl} rel="noreferrer" target="_blank">— {quote.attribution}<ExternalLink aria-hidden className="size-3.5" /></a></li>)}</ul> : <AdminStateMessage className="mt-2" state="initial-empty" title="No attributed quote is stored" />}</section>
      </div>
    </details>
  );
}

export function BooksofhistoryDossiersPanel({ snapshot }: { snapshot: AdminBooksofhistorySnapshot }) {
  return (
    <div className="grid gap-4">
      <Panel note="Used paid books ÷ paid books" title="Research efficiency">
        {snapshot.researchEfficiency === null ? <AdminStateMessage description="efficiency is not measurable until paid research exists." state="unavailable" title="No paid research is recorded yet" /> : <AdminMetric className="p-0" label="Research efficiency" note="Share of distinct paid-research books whose dossier supplied a used story." value={percent.format(snapshot.researchEfficiency)} />}
      </Panel>
      <Panel note={`${snapshot.dossiers.length} ${snapshot.dossiers.length === 1 ? "dossier" : "dossiers"}`} title="Knowledge shelf">
        {snapshot.dossiers.length ? <div className="grid gap-3">{snapshot.dossiers.map((dossier, index) => <Dossier dossier={dossier} initiallyOpen={index === 0} key={dossier.bookId} />)}</div> : <AdminStateMessage state="initial-empty" title="No valid dossiers are stored yet." />}
      </Panel>
      <Panel note={`${snapshot.ledger.length} ${snapshot.ledger.length === 1 ? "line" : "lines"}`} title="Research ledger">
        {snapshot.ledger.length ? (
          <AdminTableRegion label="BOOKSOFHISTORY research ledger">
            <AdminTable className="min-w-[48rem]"><thead><tr><AdminTableHead>Book / step</AdminTableHead><AdminTableHead>Provider / model</AdminTableHead><AdminTableHead>Reason</AdminTableHead><AdminTableHead>Requested by</AdminTableHead><AdminTableHead className="text-right">Cost</AdminTableHead><AdminTableHead className="text-right">Outcome</AdminTableHead></tr></thead><tbody>{snapshot.ledger.map((entry) => <tr className="align-top" key={`${entry.cycleId}-${entry.bookId}-${entry.step}-${entry.completedAt}`}><AdminTableCell><p className="m-0 font-semibold">{entry.bookId}</p><p className="m-0 mt-1 text-[length:var(--admin-type-micro)] uppercase text-[var(--admin-foreground-muted)]">{entry.step}</p></AdminTableCell><AdminTableCell><p className="m-0">{entry.provider}</p><p className="m-0 mt-1 text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{entry.model}</p></AdminTableCell><AdminTableCell>{entry.reason}</AdminTableCell><AdminTableCell className="break-all">{entry.requestingMeetingId}</AdminTableCell><AdminTableCell className="admin-tabular text-right">{formatUsd(entry.costUsd)}</AdminTableCell><AdminTableCell className="text-right"><AdminStatusBadge tone={entry.used ? "success" : "neutral"}>{entry.used ? "Used" : "Not used"}</AdminStatusBadge></AdminTableCell></tr>)}</tbody></AdminTable>
          </AdminTableRegion>
        ) : <AdminStateMessage state="initial-empty" title="No research spend is recorded." />}
      </Panel>
    </div>
  );
}
