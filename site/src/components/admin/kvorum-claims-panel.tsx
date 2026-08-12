"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import type { AdminKvorumLedgerClaim, AdminKvorumStoreState } from "@/lib/admin-kvorum";

const STATUS_COLOUR: Record<AdminKvorumLedgerClaim["status"], string> = {
  standing: "#86efac",
  corrected: "#f5d90a",
  retracted: "#f87171"
};

const buttonClass =
  "rounded-[8px] border border-[#665f16] bg-[#111005] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#f5d90a] disabled:cursor-not-allowed disabled:opacity-40";

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
          resolution
        })
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

  const colour = STATUS_COLOUR[claim.status];
  return (
    <article className="rounded-[10px] border border-[#26262b] bg-[#101013] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ borderColor: colour, color: colour }}>
          {claim.status}
        </span>
        <span className="rounded-full border border-[#3f3f46] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#d4d4d8]">
          {claim.type}
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#94949c]">
          {claim.recommendationStatus === "posted" ? "manual post recorded" : "approved draft · not published"}
        </span>
      </div>
      <p className="mt-3 text-[14px] leading-[1.65] text-[#e4e4e7]">{claim.claim}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {claim.sources.map((source) => (
          <li key={`${claim.id}-${source.sourceId}-${source.url}`}>
            <a className="text-[11.5px] text-[#f5d90a] underline underline-offset-2" href={source.url} rel="noreferrer" target="_blank">
              {source.sourceName}
            </a>
            {source.discoveryOnly ? <span className="ml-1.5 text-[10px] text-[#f5a524]">context only</span> : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#94949c]">
        Recorded {claim.createdAt}{claim.publishedAt ? ` · posted ${claim.publishedAt}` : ""}
      </p>
      {claim.recommendationStatus === "posted" && claim.status === "standing" ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-[#26262b] pt-4">
          <button className={buttonClass} disabled={!writesEnabled || busy} onClick={() => void draft("corrected")} type="button">
            Draft correction
          </button>
          <button className={`${buttonClass} border-[#7f1d1d] text-[#f87171]`} disabled={!writesEnabled || busy} onClick={() => void draft("retracted")} type="button">
            Draft retraction
          </button>
        </div>
      ) : claim.hasCorrectionDraft ? (
        <Link className="mt-4 inline-block text-[11.5px] text-[#f5d90a] underline underline-offset-2" href="/admin?venture=kvorum&tab=recommendations" scroll={false}>
          Open the correction draft →
        </Link>
      ) : (
        <p className="mt-4 text-[11.5px] leading-[1.55] text-[#94949c]">
          Correction controls stay closed until the owner records a manual post URL.
        </p>
      )}
      <div aria-live="polite" className="mt-3 min-h-5 font-mono text-[10.5px]" role={error ? "alert" : "status"}>
        {error ? <span className="text-[#f87171]">{error}</span> : <span className="text-[#a1a1aa]">{message}</span>}
      </div>
    </article>
  );
}

export function KvorumClaimsPanel({
  claims,
  state,
  unreadable
}: {
  claims: AdminKvorumLedgerClaim[];
  state: AdminKvorumStoreState;
  unreadable: number;
}) {
  if (claims.length === 0) {
    const message = state === "missing"
      ? "No claim records are stored yet. Approval records claims without calling them published."
      : state === "unreadable"
        ? "Claim records exist, but none can be read safely."
        : "The claims store exists and contains no record.";
    return <p className="rounded-[9px] border border-[#3f3f46] bg-[#101013] p-3 text-[13px] leading-[1.55] text-[#d4d4d8]">{message}</p>;
  }
  return (
    <div className="grid gap-4">
      {unreadable > 0 ? (
        <p className="rounded-[9px] border border-[#92400e] bg-[#160f07] p-3 text-[12px] text-[#f5a524]">
          {unreadable} claim {unreadable === 1 ? "record was" : "records were"} dropped because it could not be read.
        </p>
      ) : null}
      <p className="text-[11.5px] leading-[1.55] text-[#94949c]">
        Approved drafts are captured here for continuity, but only rows with a manual post receipt are published claims.
        Every correction opens a new recommendation for owner review; this control never posts.
      </p>
      {claims.map((claim) => <ClaimCard initial={claim} key={claim.id} />)}
    </div>
  );
}
