"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import {
  AdminButton,
  AdminCallout,
  AdminCard,
  AdminCardContent,
  AdminEntityBadge,
  AdminStateMessage,
  AdminStatusBadge,
} from "./admin-primitives";
import type { AdminKvorumLedgerClaim, AdminKvorumStoreState } from "@/lib/admin-kvorum";

function claimTone(status: AdminKvorumLedgerClaim["status"]): "success" | "warning" | "destructive" {
  if (status === "standing") return "success";
  if (status === "corrected") return "warning";
  return "destructive";
}

export function kvorumClaimActionRef(claim: Pick<AdminKvorumLedgerClaim, "date" | "slug">): string {
  return `state/ventures/kvorum/claims/${claim.date}-${claim.slug}.json`;
}

function ClaimCard({ initial }: { initial: AdminKvorumLedgerClaim }) {
  const writesEnabled = useAdminWritesEnabled();
  const [claim, setClaim] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function draft(resolution: "corrected" | "retracted") {
    if (!writesEnabled || busy || claim.recommendationStatus !== "posted" || claim.status !== "standing") return;
    setBusy(true);
    setMessage("Drafting the correction record…");
    setError("");
    try {
      const response = await fetch("/admin/api/kvorum/claims", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft-correction",
          ref: kvorumClaimActionRef(claim),
          resolution,
        }),
      });
      const payload = await response.json() as { error?: string; status?: AdminKvorumLedgerClaim["status"] };
      if (!response.ok || payload.status !== resolution) {
        throw new Error(payload.error ?? `Correction draft failed with ${response.status}.`);
      }
      setClaim({ ...claim, status: resolution, hasCorrectionDraft: true });
      setMessage("A new correction recommendation is waiting for owner review. Nothing was published.");
    } catch (caught) {
      setMessage("");
      setError(caught instanceof Error ? caught.message : "The correction draft was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCard>
      <AdminCardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatusBadge tone={claimTone(claim.status)}>{claim.status}</AdminStatusBadge>
          <AdminEntityBadge>{claim.type}</AdminEntityBadge>
          <AdminStatusBadge tone={claim.recommendationStatus === "posted" ? "success" : "warning"}>
            {claim.recommendationStatus === "posted" ? "manual post recorded" : "approved draft · not published"}
          </AdminStatusBadge>
        </div>
        <p className="m-0 text-[length:var(--admin-type-body)] leading-6">{claim.claim}</p>
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-2 p-0">
          {claim.sources.map((source) => (
            <li className="flex flex-wrap items-center gap-1.5" key={`${claim.id}-${source.sourceId}-${source.url}`}>
              <a className="admin-focus-ring rounded-[var(--admin-radius-sm)] text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-link)] underline underline-offset-2" href={source.url} rel="noreferrer" target="_blank">
                {source.sourceName}
              </a>
              {source.discoveryOnly ? <AdminStatusBadge tone="warning">Context only</AdminStatusBadge> : null}
            </li>
          ))}
        </ul>
        <p className="m-0 break-all text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">
          Recorded {claim.createdAt}{claim.publishedAt ? ` · posted ${claim.publishedAt}` : ""}
        </p>
        {claim.recommendationStatus === "posted" && claim.status === "standing" ? (
          <div className="flex flex-wrap gap-2 border-t border-[var(--admin-border)] pt-3">
            <AdminButton disabled={!writesEnabled || busy} onClick={() => void draft("corrected")}>Draft correction</AdminButton>
            <AdminButton disabled={!writesEnabled || busy} onClick={() => void draft("retracted")} variant="destructive">Draft retraction</AdminButton>
          </div>
        ) : claim.hasCorrectionDraft ? (
          <Link className="admin-focus-ring w-fit rounded-[var(--admin-radius-sm)] text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-link)] underline underline-offset-2" href="/admin?venture=kvorum&tab=recommendations" scroll={false}>
            Open the correction draft →
          </Link>
        ) : (
          <AdminStateMessage state="held" title="Correction controls stay closed until the owner records a manual post URL." />
        )}
        <div aria-live="polite" className="min-h-5 text-[length:var(--admin-type-control)]" role={error ? "alert" : "status"}>
          {error ? <span className="text-[var(--admin-destructive)]">{error}</span> : <span className="text-[var(--admin-foreground-muted)]">{message}</span>}
        </div>
      </AdminCardContent>
    </AdminCard>
  );
}

export function KvorumClaimsPanel({
  claims,
  state,
  unreadable,
}: {
  claims: AdminKvorumLedgerClaim[];
  state: AdminKvorumStoreState;
  unreadable: number;
}) {
  if (claims.length === 0) {
    const title = state === "missing"
      ? "No claim records are stored yet. Approval records claims without calling them published."
      : state === "unreadable"
        ? "Claim records exist, but none can be read safely."
        : "The claims store exists and contains no record.";
    return <AdminStateMessage state={state === "unreadable" ? "malformed" : "initial-empty"} title={title} />;
  }
  return (
    <div className="grid gap-4">
      {unreadable > 0 ? (
        <AdminCallout tone="warning">
          {unreadable} claim {unreadable === 1 ? "record was" : "records were"} dropped because it could not be read.
        </AdminCallout>
      ) : null}
      <AdminCallout>
        Approved drafts are captured here for continuity, but only rows with a manual post receipt are published claims.
        Every correction opens a new recommendation for owner review; this control never posts.
      </AdminCallout>
      {claims.map((claim) => <ClaimCard initial={claim} key={claim.id} />)}
    </div>
  );
}
