"use client";

import { useState } from "react";
import {
  AdminButton,
  AdminCard,
  AdminCardContent,
  AdminEntityBadge,
  AdminInput,
  AdminLabel,
  AdminStateMessage,
  AdminStatusBadge,
} from "./admin-primitives";
import { RatingWidget } from "@/components/admin/rating-widget";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import type { ProposalDay, ProposalSnapshot, ProposalVariant } from "@/lib/titty-tuesdays-proposals";

/** Automatic checks do not replace the three owner-only visual checks below. */
const CHECKLIST = [
  "No person, body part or mannequin anywhere in the frame",
  "The wordmark reads exactly TITTY TUESDAYS",
  "On brand — this is a garment this company would sell",
];

function Variant({ day, variant }: { day: ProposalDay; variant: ProposalVariant }) {
  const writesEnabled = useAdminWritesEnabled();
  const [showPrompt, setShowPrompt] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<{ kind: "loading" | "success" | "error"; text: string } | null>(null);
  const [removed, setRemoved] = useState(variant.status === "doctrine-rejected");

  async function reject(): Promise<void> {
    if (!writesEnabled) return;
    setStatus({ kind: "loading", text: "Removing the image" });
    try {
      const response = await fetch("/admin/api/titty-tuesdays/doctrine-reject", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: day.date, variantId: variant.variantId, reason }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The rejection was not saved.");
      setRemoved(true);
      setRejecting(false);
      setStatus({ kind: "success", text: "Removed. The record keeps the hash, prompt and your reason." });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "The rejection was not saved." });
    }
  }

  return (
    <AdminCard>
      <AdminCardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AdminEntityBadge>{variant.provider}</AdminEntityBadge>
          <span className="admin-tabular text-[length:var(--admin-type-micro)] text-[var(--admin-foreground-muted)]">{variant.model} · ${variant.usd.toFixed(4)}</span>
          {removed ? <AdminStatusBadge tone="destructive">Removed on doctrine</AdminStatusBadge> : null}
        </div>

        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[var(--admin-radius)] bg-[var(--admin-surface-muted)]">
          {removed || !variant.imageHref ? (
            <div className="grid gap-1 px-4 py-6 text-center">
              <p className="m-0 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-destructive)]">Image removed</p>
              <p className="m-0 text-[length:var(--admin-type-control)] leading-5 text-[var(--admin-foreground-muted)]">{variant.reason ?? (reason || "The image should not exist; the record kept everything else.")}</p>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={variant.altText} className="h-full w-full object-cover" loading="lazy" src={variant.imageHref} />
          )}
        </div>

        <AdminButton className="justify-self-start" onClick={() => setShowPrompt((open) => !open)} type="button" variant="ghost">
          {showPrompt ? "Hide the prompt" : "Show the prompt"}
        </AdminButton>
        {showPrompt ? <pre className="admin-focus-ring m-0 max-h-40 max-w-full overflow-auto whitespace-pre-wrap rounded-[var(--admin-radius)] bg-[var(--admin-surface-inset)] p-3 text-[length:var(--admin-type-label)] leading-5 text-[var(--admin-foreground-muted)]" tabIndex={0}>{variant.prompt}</pre> : null}

        {removed ? null : (
          <>
            <ul className="m-0 grid list-none gap-1 p-0">
              {CHECKLIST.map((line) => <li className="flex items-baseline gap-2 text-[length:var(--admin-type-control)] leading-5" key={line}><span aria-hidden className="text-[var(--admin-foreground-subtle)]">○</span>{line}</li>)}
            </ul>
            <p className="m-0 text-[length:var(--admin-type-label)] leading-5 text-[var(--admin-foreground-muted)]">Nothing automatic checked those three. You are the only thing that can.</p>

            <RatingWidget contentHash={variant.contentHash} initialHistory={variant.ratings} objectId={`${day.date}/${variant.variantId}`} objectKind="visual" ventureId="titty-tuesdays" />

            {rejecting ? (
              <div className="grid gap-3 rounded-[var(--admin-radius)] border border-[var(--admin-destructive)] bg-[var(--admin-destructive-soft)] p-3">
                <p className="m-0 text-[length:var(--admin-type-control)] leading-5">This deletes the image. The record keeps the hash, prompt and your reason. Use <strong>Bad</strong> above if the design is merely poor; the taste loop learns from that rating.</p>
                <div><AdminLabel htmlFor={`doctrine-reason-${day.date}-${variant.variantId}`}>Reason</AdminLabel><AdminInput id={`doctrine-reason-${day.date}-${variant.variantId}`} onChange={(event) => setReason(event.target.value)} placeholder="What is wrong with it?" value={reason} /></div>
                <div className="flex flex-wrap gap-2">
                  <AdminButton disabled={!writesEnabled || reason.trim().length === 0} onClick={() => void reject()} type="button" variant="destructive">Delete the image</AdminButton>
                  <AdminButton onClick={() => setRejecting(false)} type="button" variant="secondary">Cancel</AdminButton>
                </div>
              </div>
            ) : <AdminButton className="justify-self-start" disabled={!writesEnabled} onClick={() => setRejecting(true)} type="button" variant="destructive">Reject on doctrine</AdminButton>}
          </>
        )}

        <div aria-live="polite" role={status?.kind === "error" ? "alert" : "status"}>
          {status ? <AdminStateMessage state={status.kind} title={status.text} /> : null}
        </div>
      </AdminCardContent>
    </AdminCard>
  );
}

export function TittyTuesdaysProposalsPanel({ snapshot }: { snapshot: ProposalSnapshot }) {
  if (snapshot.days.length === 0) {
    return (
      <AdminStateMessage
        description="Two are produced a day, one from each renderer, only after the switch, both keys and all six approvals are in place."
        state="held"
        title="No garment renders have been proposed yet"
      />
    );
  }

  return (
    <div className="grid gap-5">
      {snapshot.days.map((day) => (
        <section className="grid gap-3" key={day.date}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-[length:var(--admin-type-section)] font-semibold">{day.conceptTitle}</h3>
            <AdminEntityBadge>{day.date} · {day.axis}</AdminEntityBadge>
            {day.colorway ? <span className="text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">{day.colorway}</span> : null}
          </div>
          <div className="grid gap-3 xl:grid-cols-2">{day.variants.map((variant) => <Variant day={day} key={variant.variantId} variant={variant} />)}</div>
          {day.failures.length ? (
            <AdminStateMessage description={day.failures.map((failure) => `${failure.provider}: ${failure.reason}`).join(" · ")} state="unavailable" title={`${day.failures.length} ${day.failures.length === 1 ? "renderer produced" : "renderers produced"} no image`} />
          ) : null}
        </section>
      ))}
      {snapshot.unreadable.length ? (
        <AdminStateMessage description={snapshot.unreadable.join(", ")} state="malformed" title={`${snapshot.unreadable.length} proposal ${snapshot.unreadable.length === 1 ? "file" : "files"} could not be read`} />
      ) : null}
    </div>
  );
}
