"use client";

import { useState } from "react";
import { RatingWidget } from "@/components/admin/rating-widget";
import { DoorMoneyResultEntry } from "@/components/admin/door-money-result-entry";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  AdminButton as Button,
  AdminCallout as Callout,
  AdminCard as Card,
  AdminCardContent as CardContent,
  AdminEntityBadge,
  AdminInput,
  AdminLabel,
  AdminStateMessage,
  AdminStatusBadge as Badge,
  AdminTextarea,
} from "./admin-primitives";
import type {
  AdminDoorMoneyRecommendation,
  AdminDoorMoneyRecommendations
} from "@/lib/admin-door-money";
import type { DoorMoneyCopyBlock } from "@/lib/door-money-recommendation-model";
import { isDoorMoneyResultPlatform } from "@/lib/door-money-result-model";

type ReviewMode = "closed" | "edit" | "reject";
type Decision =
  | { action: "approve"; editedCopyBlocks?: DoorMoneyCopyBlock[]; approvalNote?: string }
  | { action: "reject"; reason: string }
  | { action: "posted"; postedUrl: string };

function statusTone(status: AdminDoorMoneyRecommendation["status"]): "neutral" | "success" | "destructive" | "warning" {
  if (status === "approved" || status === "posted") return "success";
  if (status === "rejected" || status === "archived") return "destructive";
  return "warning";
}

function effectiveCopy(recommendation: AdminDoorMoneyRecommendation): DoorMoneyCopyBlock[] {
  return [...(recommendation.owner.editedCopyBlocks ?? recommendation.copyBlocks)]
    .sort((left, right) => left.ordinal - right.ordinal);
}

function copyLabel(kind: DoorMoneyCopyBlock["kind"]): string {
  return kind.replaceAll("-", " ");
}

function RecommendationCard({ initial }: { initial: AdminDoorMoneyRecommendation }) {
  const writesEnabled = useAdminWritesEnabled();
  const [recommendation, setRecommendation] = useState(initial);
  const [mode, setMode] = useState<ReviewMode>("closed");
  const [editedCopy, setEditedCopy] = useState(() => effectiveCopy(initial));
  const [approvalNote, setApprovalNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [postedUrl, setPostedUrl] = useState(initial.owner.postedUrl ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const formId = `door-money-${recommendation.id}`;

  async function decide(decision: Decision): Promise<void> {
    if (!writesEnabled || pending) return;
    setPending(true);
    setMessage("Saving owner decision…");
    setError("");
    try {
      const response = await fetch("/admin/api/door-money/recommendations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recommendation.id, ...decision })
      });
      const payload = await response.json() as {
        status?: AdminDoorMoneyRecommendation["status"];
        postedUrl?: string | null;
        contentHash?: string;
        error?: string;
      };
      if (!response.ok || !payload.status || !payload.contentHash || !/^sha256:[a-f0-9]{12}$/u.test(payload.contentHash)) {
        throw new Error(payload.error ?? `Owner decision failed with ${response.status}.`);
      }
      setRecommendation((current) => ({
        ...current,
        status: payload.status!,
        contentHash: payload.contentHash!,
        owner: {
          ...current.owner,
          ...(decision.action === "approve"
            ? { editedCopyBlocks: decision.editedCopyBlocks ?? current.owner.editedCopyBlocks,
                approvalNote: decision.approvalNote ?? null }
            : decision.action === "reject"
              ? { rejectionReason: decision.reason }
              : { postedUrl: payload.postedUrl ?? decision.postedUrl })
        }
      }));
      setMode("closed");
      setMessage(decision.action === "posted"
        ? "Post URL recorded. This action did not contact the platform."
        : decision.action === "reject"
          ? "Rejection recorded."
          : "Approval recorded. Eligible visual copy is ready in Design Lab; nothing was posted.");
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "The owner decision was not saved.");
    } finally {
      setPending(false);
    }
  }

  const shownCopy = effectiveCopy(recommendation);
  return (
    <Card className="scroll-mt-6" id={`door-money-recommendation-${recommendation.id}`}>
      <CardContent className="grid gap-4">
        <header>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {recommendation.formats.map((format) => <AdminEntityBadge key={format}>{format}</AdminEntityBadge>)}
              {recommendation.platforms.map((platform) => <AdminEntityBadge key={platform}>{platform}</AdminEntityBadge>)}
            </div>
            <Badge tone={statusTone(recommendation.status)}>{recommendation.status}</Badge>
          </div>
          <h3 className="m-0 mt-3 text-[length:var(--admin-type-section)] font-semibold leading-tight">
            {recommendation.hook}
          </h3>
          <p className="m-0 mt-1 break-all text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">
            {recommendation.date} · {recommendation.id}
          </p>
        </header>

        <section aria-labelledby={`${formId}-copy`}>
          <h4 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]" id={`${formId}-copy`}>
            Adapted copy
          </h4>
          <ol className="m-0 mt-2 grid list-none divide-y divide-[var(--admin-border)] border-y border-[var(--admin-border)] p-0">
            {shownCopy.map((block) => (
              <li className="py-3" key={`${block.kind}-${block.ordinal}`}>
                <p className="m-0 text-[length:var(--admin-type-micro)] uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]">
                  {block.ordinal} · {copyLabel(block.kind)}
                </p>
                <p className="m-0 mt-1 whitespace-pre-wrap text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground)]">{block.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby={`${formId}-source`} className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-4">
          <h4 className="m-0 text-[length:var(--admin-type-micro)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground-muted)]" id={`${formId}-source`}>
            Source passage · {recommendation.evidence.excerptChunkId}
          </h4>
          <blockquote className="m-0 mt-2 border-l-2 border-[var(--admin-section-accent)] pl-3 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground)]">
            {recommendation.evidence.excerpt.slice(0, 600)}
          </blockquote>
          <p className="m-0 mt-2 break-all text-[length:var(--admin-type-label)] leading-5 text-[var(--admin-foreground-muted)]">
            Private-store pointer, not a web link: {recommendation.evidence.privateStoreLink}
          </p>
        </section>

        <section className="grid min-w-0 gap-4 md:grid-cols-2">
          <div className="min-w-0">
            <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Why this works</h4>
            <p className="mt-2 text-sm leading-6 text-[var(--admin-foreground-muted)]">{recommendation.rationale}</p>
          </div>
          <div className="min-w-0">
            <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Gate results</h4>
            <ul className="mt-2 grid gap-2 text-sm leading-6 text-[var(--admin-foreground-muted)]">
              {recommendation.gateResults.map((result) => (
                <li className="min-w-0" key={result.gate}>
                  <strong className="text-[var(--admin-success)]">Passed · {result.gate}</strong>
                  <br />
                  <span className="break-all">{result.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {recommendation.status === "draft" ? (
          <section aria-label="Owner decision" className="border-t border-[var(--admin-border)] pt-5">
            {mode === "edit" ? (
              <form className="grid gap-4" onSubmit={(event) => {
                event.preventDefault();
                void decide({ action: "approve", editedCopyBlocks: editedCopy, ...(approvalNote.trim() ? { approvalNote: approvalNote.trim() } : {}) });
              }}>
                <fieldset className="grid gap-3">
                  <legend className="font-semibold text-[var(--admin-foreground)]">Edit copy, then approve</legend>
                  {editedCopy.map((block, index) => (
                    <div key={`${block.kind}-${block.ordinal}`}>
                      <AdminLabel htmlFor={`${formId}-copy-${block.ordinal}`}>{block.ordinal} · {copyLabel(block.kind)}</AdminLabel>
                      <AdminTextarea className="min-h-28" disabled={pending || !writesEnabled} id={`${formId}-copy-${block.ordinal}`} maxLength={4_000}
                        onChange={(event) => setEditedCopy((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, text: event.target.value } : entry))}
                        required value={block.text} />
                    </div>
                  ))}
                </fieldset>
                <div>
                  <AdminLabel htmlFor={`${formId}-approval-note`}>Approval note (optional)</AdminLabel>
                  <AdminTextarea className="min-h-20" disabled={pending || !writesEnabled} id={`${formId}-approval-note`}
                    maxLength={1_000} onChange={(event) => setApprovalNote(event.target.value)} value={approvalNote} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={pending || !writesEnabled || editedCopy.some(({ text }) => !text.trim())} type="submit">{pending ? "Saving…" : "Approve edited copy"}</Button>
                  <Button disabled={pending} onClick={() => setMode("closed")} type="button" variant="ghost">Cancel</Button>
                </div>
              </form>
            ) : mode === "reject" ? (
              <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void decide({ action: "reject", reason: rejectionReason.trim() }); }}>
                <div>
                  <AdminLabel htmlFor={`${formId}-rejection`}>Why should this recommendation be rejected?</AdminLabel>
                  <AdminTextarea disabled={pending || !writesEnabled} id={`${formId}-rejection`}
                    maxLength={1_000} onChange={(event) => setRejectionReason(event.target.value)} required value={rejectionReason} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={pending || !writesEnabled || !rejectionReason.trim()}
                    type="submit" variant="destructive">{pending ? "Saving…" : "Confirm rejection"}</Button>
                  <Button disabled={pending} onClick={() => setMode("closed")} type="button" variant="ghost">Cancel</Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button disabled={pending || !writesEnabled} onClick={() => void decide({ action: "approve" })}>Approve for manual posting</Button>
                <Button disabled={pending || !writesEnabled} onClick={() => setMode("edit")} variant="secondary">Edit and approve</Button>
                <Button disabled={pending || !writesEnabled} onClick={() => setMode("reject")} variant="destructive">Reject</Button>
              </div>
            )}
          </section>
        ) : null}

        {recommendation.status === "approved" ? (
          <form className="grid gap-3 border-t border-[var(--admin-border)] pt-5" onSubmit={(event) => {
            event.preventDefault();
            void decide({ action: "posted", postedUrl: postedUrl.trim() });
          }}>
            <div>
              <AdminLabel htmlFor={`${formId}-posted-url`}>URL after you post it by hand</AdminLabel>
              <AdminInput disabled={pending || !writesEnabled} id={`${formId}-posted-url`} maxLength={2_000}
                onChange={(event) => setPostedUrl(event.target.value)} placeholder="https://…" required type="url" value={postedUrl} />
            </div>
            <p className="text-sm leading-6 text-[var(--admin-foreground-muted)]">Saving this URL records your manual post. It does not contact a platform.</p>
            <Button className="justify-self-start" disabled={pending || !writesEnabled || !postedUrl.trim()} type="submit">
              {pending ? "Saving…" : "Record posted URL"}
            </Button>
          </form>
        ) : null}

        {recommendation.owner.postedUrl ? (
          <section className="border-t border-[var(--admin-border)] pt-5">
            <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Recorded post URL</h4>
            <p className="mt-2 break-all text-sm text-[var(--admin-foreground)]">{recommendation.owner.postedUrl}</p>
          </section>
        ) : null}

        <DoorMoneyResultEntry initialResults={recommendation.results} intent={recommendation.rationale}
          platforms={recommendation.platforms.filter(isDoorMoneyResultPlatform)} postedUrl={recommendation.owner.postedUrl}
          recommendationId={recommendation.id} />

        <div aria-live="polite" className="min-h-6 text-sm" role={error ? "alert" : "status"}>
          {error ? <span className="text-[var(--admin-destructive)]">{error}</span> : <span className="text-[var(--admin-foreground-muted)]">{message}</span>}
        </div>

        <RatingWidget contentHash={recommendation.contentHash} initialHistory={recommendation.ratings}
          objectId={recommendation.id} objectKind="recommendation" ventureId="door-money" />
      </CardContent>
    </Card>
  );
}

export function DoorMoneyRecommendationsPanel({ recommendations }: { recommendations: AdminDoorMoneyRecommendations }) {
  if (recommendations.state === "missing") return (
    <div className="grid gap-3">
      <AdminStateMessage state="initial-empty" title="No Door Money recommendation store exists yet." />
      {recommendations.unreadable > 0 ? (
        <Callout tone="warning">{recommendations.unreadable} Door Money rating record{recommendations.unreadable === 1 ? "" : "s"} could not be read.</Callout>
      ) : null}
    </div>
  );
  if (recommendations.items.length === 0) {
    return <AdminStateMessage state={recommendations.state === "unreadable" ? "malformed" : "initial-empty"} title="No readable Door Money recommendations are stored." />;
  }
  return (
    <div className="grid gap-5">
      {recommendations.unreadable > 0 ? (
        <Callout tone="warning">{recommendations.unreadable} Door Money review record{recommendations.unreadable === 1 ? "" : "s"} could not be read.</Callout>
      ) : null}
      {recommendations.items.map((recommendation) => <RecommendationCard initial={recommendation} key={recommendation.id} />)}
    </div>
  );
}
