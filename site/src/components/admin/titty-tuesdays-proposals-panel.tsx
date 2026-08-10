"use client";

import { useState } from "react";
import { RatingWidget } from "@/components/admin/rating-widget";
import type { ProposalDay, ProposalSnapshot, ProposalVariant } from "@/lib/titty-tuesdays-proposals";

/**
 * The day's garment renders, and the two kinds of no.
 *
 * The automatic checks can confirm the bytes decoded, the prompt carried every doctrine clause and
 * the record is complete. They cannot confirm that no body appears in the frame, that the wordmark
 * rendered as those two words, or that the result is on-brand — so those three sit above the
 * rating as a checklist for a person, and the panel says plainly that the machine did not check
 * them.
 *
 * Plain `<img>`: the source is an authenticated route answering with a sandboxed CSP, and the
 * image optimiser would fetch it without the session and cache the failure.
 */

const CHECKLIST = [
  "No person, body part or mannequin anywhere in the frame",
  "The wordmark reads exactly TITTY TUESDAYS",
  "On brand — this is a garment this company would sell"
];

function Variant({ day, variant }: { day: ProposalDay; variant: ProposalVariant }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [removed, setRemoved] = useState(variant.status === "doctrine-rejected");

  async function reject(): Promise<void> {
    setStatus("Removing…");
    try {
      const response = await fetch("/admin/api/titty-tuesdays/doctrine-reject", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: day.date, variantId: variant.variantId, reason })
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The rejection was not saved.");
      setRemoved(true);
      setRejecting(false);
      setStatus("Removed. The record keeps the hash, the prompt and your reason.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The rejection was not saved.");
    }
  }

  return (
    <article className="grid gap-3 rounded-[10px] border border-[#26262b] bg-[#0e0e11] p-3.5">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#a1a1aa]">
          {variant.provider}
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#71717a]">
          {variant.model} · ${variant.usd.toFixed(4)}
        </span>
      </div>

      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[8px] bg-[#141418]">
        {removed || !variant.imageHref ? (
          // The tombstone. The picture is gone on purpose and the record says why.
          <div className="grid gap-1 px-4 py-6 text-center">
            <p className="m-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[#f87171]">
              Removed on doctrine
            </p>
            <p className="m-0 text-[12px] leading-[1.5] text-[#94949c]">
              {variant.reason ?? (reason || "The image should not exist; the record kept everything else.")}
            </p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={variant.altText} className="h-full w-full object-cover" loading="lazy" src={variant.imageHref} />
        )}
      </div>

      <button
        className="justify-self-start font-mono text-[10px] uppercase tracking-[0.12em] text-[#94949c] underline"
        onClick={() => setShowPrompt((open) => !open)}
        type="button"
      >
        {showPrompt ? "Hide the prompt" : "Show the prompt"}
      </button>
      {showPrompt ? (
        <p className="m-0 max-h-40 overflow-auto whitespace-pre-wrap rounded-[8px] bg-[#101013] p-2.5 font-mono text-[11px] leading-[1.55] text-[#a1a1aa]">
          {variant.prompt}
        </p>
      ) : null}

      {removed ? null : (
        <>
          <ul className="m-0 grid list-none gap-1 p-0">
            {CHECKLIST.map((line) => (
              <li className="flex items-baseline gap-2 text-[12.5px] leading-[1.5] text-[#d4d4d8]" key={line}>
                <span aria-hidden="true" className="font-mono text-[11px] text-[#71717a]">○</span>
                {line}
              </li>
            ))}
          </ul>
          <p className="m-0 text-[11.5px] leading-[1.5] text-[#94949c]">
            Nothing automatic checked those three. You are the only thing that can.
          </p>

          <RatingWidget
            contentHash={variant.contentHash}
            initialHistory={variant.ratings}
            objectId={`${day.date}/${variant.variantId}`}
            objectKind="visual"
            ventureId="titty-tuesdays"
          />

          {rejecting ? (
            <div className="grid gap-2 rounded-[8px] border border-[#f87171] p-2.5">
              <p className="m-0 text-[12px] leading-[1.55] text-[#d4d4d8]">
                This deletes the image. The record keeps the hash, the prompt and your reason.
                Use <span className="font-semibold">Bad</span> above instead if the design is
                merely poor — a bad design is what the taste loop learns from.
              </p>
              <input
                className="rounded-[7px] border border-[#3f3f46] bg-[#0d0d10] px-2 py-1.5 text-[13px] text-[#f4f4f5]"
                onChange={(event) => setReason(event.target.value)}
                placeholder="What is wrong with it?"
                value={reason}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-[9px] border border-[#f87171] bg-[#101013] px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#f87171] disabled:opacity-40"
                  disabled={reason.trim().length === 0}
                  onClick={() => void reject()}
                  type="button"
                >
                  Delete the image
                </button>
                <button
                  className="rounded-[9px] border border-[#3f3f46] bg-[#101013] px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#a1a1aa]"
                  onClick={() => setRejecting(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="justify-self-start rounded-[9px] border border-[#3f3f46] bg-[#101013] px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#f87171]"
              onClick={() => setRejecting(true)}
              type="button"
            >
              Reject on doctrine
            </button>
          )}
        </>
      )}

      {status ? <p className="m-0 font-mono text-[11px] text-[#d4d4d8]">{status}</p> : null}
    </article>
  );
}

export function TittyTuesdaysProposalsPanel({ snapshot }: { snapshot: ProposalSnapshot }) {
  if (snapshot.days.length === 0) {
    return (
      <p className="m-0 rounded-[9px] border border-[#3f3f46] bg-[#101013] p-3 text-[13px] leading-[1.55] text-[#d4d4d8]">
        No garment renders have been proposed yet. Two are produced a day — one from each renderer
        — once the switch, both keys and the six approvals are all in place.
      </p>
    );
  }

  return (
    <div className="grid gap-5">
      {snapshot.days.map((day) => (
        <section className="grid gap-3" key={day.date}>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h3 className="m-0 text-[14px] font-semibold text-[#f4f4f5]">{day.conceptTitle}</h3>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#71717a]">
              {day.date} · {day.axis}
            </span>
            {day.colorway ? (
              <span className="text-[12.5px] text-[#94949c]">{day.colorway}</span>
            ) : null}
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {day.variants.map((variant) => (
              <Variant day={day} key={variant.variantId} variant={variant} />
            ))}
          </div>

          {day.failures.length ? (
            <ul className="m-0 grid list-none gap-1 p-0 text-[12px] text-[#f5a524]">
              {day.failures.map((failure) => (
                <li key={failure.provider}>{failure.provider} produced nothing: {failure.reason}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      {snapshot.unreadable.length ? (
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[#f5a524]">
          {snapshot.unreadable.length} proposal {snapshot.unreadable.length === 1 ? "file" : "files"} could not be read: {snapshot.unreadable.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
