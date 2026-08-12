"use client";

import { useState } from "react";
import { RatingWidget } from "@/components/admin/rating-widget";
import { DoorMoneyResultEntry } from "@/components/admin/door-money-result-entry";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
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

const fieldClass =
  "w-full rounded-[var(--radius-button)] border border-[var(--steel)] bg-[var(--surface)] px-3 py-2.5 text-base leading-6 text-[var(--foreground)] placeholder:text-[var(--fog)] disabled:opacity-50";

function statusTone(status: AdminDoorMoneyRecommendation["status"]): "neutral" | "success" | "danger" | "warning" {
  if (status === "approved" || status === "posted") return "success";
  if (status === "rejected" || status === "archived") return "danger";
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
      <CardContent className="grid gap-6">
        <header>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {recommendation.formats.map((format) => <Badge key={format}>{format}</Badge>)}
              {recommendation.platforms.map((platform) => <Badge key={platform} tone="dark">{platform}</Badge>)}
            </div>
            <Badge tone={statusTone(recommendation.status)}>{recommendation.status}</Badge>
          </div>
          <h3 className="mt-5 text-2xl font-semibold leading-tight tracking-[-0.04em]">
            {recommendation.hook}
          </h3>
          <p className="mt-2 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">
            {recommendation.date} · {recommendation.id}
          </p>
        </header>

        <section aria-labelledby={`${formId}-copy`}>
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]" id={`${formId}-copy`}>
            Adapted copy
          </h4>
          <ol className="mt-3 grid gap-3">
            {shownCopy.map((block) => (
              <li className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4" key={`${block.kind}-${block.ordinal}`}>
                <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
                  {block.ordinal} · {copyLabel(block.kind)}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{block.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby={`${formId}-source`} className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--secondary)] p-4">
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]" id={`${formId}-source`}>
            Source passage · {recommendation.evidence.excerptChunkId}
          </h4>
          <blockquote className="mt-3 border-l-2 border-[var(--accent)] pl-4 text-sm leading-6 text-[var(--foreground)]">
            {recommendation.evidence.excerpt.slice(0, 600)}
          </blockquote>
          <p className="mt-3 break-all font-mono text-[0.6875rem] leading-5 text-[var(--fog)]">
            Private-store pointer, not a web link: {recommendation.evidence.privateStoreLink}
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Why this works</h4>
            <p className="mt-2 text-sm leading-6 text-[var(--fog)]">{recommendation.rationale}</p>
          </div>
          <div>
            <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Gate results</h4>
            <ul className="mt-2 grid gap-2 text-sm leading-6 text-[var(--fog)]">
              {recommendation.gateResults.map((result) => (
                <li key={result.gate}><strong className="text-[var(--success)]">Passed · {result.gate}</strong><br />{result.detail}</li>
              ))}
            </ul>
          </div>
        </section>

        {recommendation.status === "draft" ? (
          <section aria-label="Owner decision" className="border-t border-[var(--border)] pt-5">
            {mode === "edit" ? (
              <form className="grid gap-4" onSubmit={(event) => {
                event.preventDefault();
                void decide({ action: "approve", editedCopyBlocks: editedCopy, ...(approvalNote.trim() ? { approvalNote: approvalNote.trim() } : {}) });
              }}>
                <fieldset className="grid gap-3">
                  <legend className="font-semibold text-[var(--foreground)]">Edit copy, then approve</legend>
                  {editedCopy.map((block, index) => (
                    <label key={`${block.kind}-${block.ordinal}`}>
                      <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">{block.ordinal} · {copyLabel(block.kind)}</span>
                      <textarea className={`${fieldClass} mt-2 min-h-28`} disabled={pending || !writesEnabled} maxLength={4_000}
                        onChange={(event) => setEditedCopy((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, text: event.target.value } : entry))}
                        required value={block.text} />
                    </label>
                  ))}
                </fieldset>
                <label htmlFor={`${formId}-approval-note`}>
                  <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">Approval note (optional)</span>
                  <textarea className={`${fieldClass} mt-2 min-h-20`} disabled={pending || !writesEnabled} id={`${formId}-approval-note`}
                    maxLength={1_000} onChange={(event) => setApprovalNote(event.target.value)} value={approvalNote} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={pending || !writesEnabled || editedCopy.some(({ text }) => !text.trim())} type="submit">{pending ? "Saving…" : "Approve edited copy"}</Button>
                  <Button disabled={pending} onClick={() => setMode("closed")} type="button" variant="ghost">Cancel</Button>
                </div>
              </form>
            ) : mode === "reject" ? (
              <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void decide({ action: "reject", reason: rejectionReason.trim() }); }}>
                <label htmlFor={`${formId}-rejection`}>
                  <span className="font-semibold text-[var(--foreground)]">Why should this recommendation be rejected?</span>
                  <textarea className={`${fieldClass} mt-2 min-h-24`} disabled={pending || !writesEnabled} id={`${formId}-rejection`}
                    maxLength={1_000} onChange={(event) => setRejectionReason(event.target.value)} required value={rejectionReason} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button className="border-[var(--destructive)] text-[var(--destructive)]" disabled={pending || !writesEnabled || !rejectionReason.trim()}
                    type="submit" variant="secondary">{pending ? "Saving…" : "Confirm rejection"}</Button>
                  <Button disabled={pending} onClick={() => setMode("closed")} type="button" variant="ghost">Cancel</Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button disabled={pending || !writesEnabled} onClick={() => void decide({ action: "approve" })}>Approve for manual posting</Button>
                <Button disabled={pending || !writesEnabled} onClick={() => setMode("edit")} variant="secondary">Edit and approve</Button>
                <Button className="border-[var(--destructive)] text-[var(--destructive)]" disabled={pending || !writesEnabled}
                  onClick={() => setMode("reject")} variant="secondary">Reject</Button>
              </div>
            )}
          </section>
        ) : null}

        {recommendation.status === "approved" ? (
          <form className="grid gap-3 border-t border-[var(--border)] pt-5" onSubmit={(event) => {
            event.preventDefault();
            void decide({ action: "posted", postedUrl: postedUrl.trim() });
          }}>
            <label htmlFor={`${formId}-posted-url`}>
              <span className="font-semibold text-[var(--foreground)]">URL after you post it by hand</span>
              <input className={`${fieldClass} mt-2`} disabled={pending || !writesEnabled} id={`${formId}-posted-url`} maxLength={2_000}
                onChange={(event) => setPostedUrl(event.target.value)} placeholder="https://…" required type="url" value={postedUrl} />
            </label>
            <p className="text-sm leading-6 text-[var(--fog)]">Saving this URL records your manual post. It does not contact a platform.</p>
            <Button className="justify-self-start" disabled={pending || !writesEnabled || !postedUrl.trim()} type="submit">
              {pending ? "Saving…" : "Record posted URL"}
            </Button>
          </form>
        ) : null}

        {recommendation.owner.postedUrl ? (
          <section className="border-t border-[var(--border)] pt-5">
            <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Recorded post URL</h4>
            <p className="mt-2 break-all text-sm text-[var(--foreground)]">{recommendation.owner.postedUrl}</p>
          </section>
        ) : null}

        <DoorMoneyResultEntry initialResults={recommendation.results} intent={recommendation.rationale}
          platforms={recommendation.platforms.filter(isDoorMoneyResultPlatform)} postedUrl={recommendation.owner.postedUrl}
          recommendationId={recommendation.id} />

        <div aria-live="polite" className="min-h-6 text-sm" role={error ? "alert" : "status"}>
          {error ? <span className="text-[var(--destructive)]">{error}</span> : <span className="text-[var(--fog)]">{message}</span>}
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
      <Callout>No Door Money recommendation store exists yet.</Callout>
      {recommendations.unreadable > 0 ? (
        <Callout tone="warning">{recommendations.unreadable} Door Money rating record{recommendations.unreadable === 1 ? "" : "s"} could not be read.</Callout>
      ) : null}
    </div>
  );
  if (recommendations.items.length === 0) {
    return <Callout tone={recommendations.state === "unreadable" ? "warning" : "neutral"}>No readable Door Money recommendations are stored.</Callout>;
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
