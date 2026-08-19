"use client";

import { useState } from "react";
import { AdminButton, AdminLabel, AdminStateMessage, AdminTextarea } from "./admin-primitives";
import { useAdminWritesEnabled } from "@/components/admin/admin-write-mode";
import { formatDateTime } from "@/lib/utils";
import type {
  RatingObjectKind,
  RatingRecord,
  RatingValue
} from "@/lib/rating-model";

interface RatingWidgetProps {
  ventureId: string;
  objectKind: RatingObjectKind;
  objectId: string;
  contentHash: string;
  initialHistory: RatingRecord[];
}

const choices: Array<{ value: RatingValue; label: string }> = [
  { value: "perfect", label: "Perfect" },
  { value: "good", label: "Good" },
  { value: "bad", label: "Bad" }
];

function ratingId(ratedAt: string): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `r-${ratedAt.slice(0, 10)}-${suffix}`;
}

export function RatingWidget({
  ventureId,
  objectKind,
  objectId,
  contentHash,
  initialHistory
}: RatingWidgetProps) {
  const writesEnabled = useAdminWritesEnabled();
  const noteId = `rating-note-${ventureId}-${contentHash.replace(":", "-")}`;
  const [history, setHistory] = useState(initialHistory);
  const [active, setActive] = useState<RatingValue | null>(initialHistory[0]?.rating ?? null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function rate(value: RatingValue): Promise<void> {
    if (!writesEnabled) return;
    const previous = active;
    const ratedAt = new Date().toISOString();
    const record: RatingRecord = {
      schemaVersion: "rating/1",
      id: ratingId(ratedAt),
      ventureId,
      objectKind,
      objectRef: { id: objectId, contentHash },
      rating: value,
      ...(note.trim() ? { note: note.trim() } : {}),
      ratedAt
    };
    setPending(true);
    setActive(value);
    setMessage("Saving rating…");
    setError("");
    try {
      const response = await fetch("/admin/api/ratings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record)
      });
      const payload = await response.json() as { record?: RatingRecord; error?: string };
      if (!response.ok || !payload.record) {
        throw new Error(payload.error ?? `Rating write failed with ${response.status}.`);
      }
      setHistory((current) => [payload.record!, ...current.filter((entry) => entry.id !== payload.record!.id)]);
      setNote("");
      setMessage("Rating saved to the permanent history.");
    } catch (caught) {
      setActive(previous);
      setMessage("");
      setError(caught instanceof Error ? caught.message : "Rating write failed. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-t border-[var(--admin-border)] pt-5">
      <fieldset>
        <legend className="font-mono text-[length:var(--admin-type-label)] font-semibold uppercase tracking-[var(--admin-tracking-label)] text-[var(--admin-foreground)]">
          Your rating
        </legend>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {choices.map((choice) => (
            <AdminButton
              aria-pressed={active === choice.value}
              className={active === choice.value
                ? choice.value === "bad"
                  ? "border-[var(--admin-destructive)] bg-[var(--admin-destructive-soft)] text-[var(--admin-destructive)]"
                  : "border-[var(--admin-section-accent)] bg-[var(--admin-surface-selected)] text-[var(--admin-foreground)]"
                : "px-3"
              }
              disabled={pending || !writesEnabled}
              key={choice.value}
              onClick={() => rate(choice.value)}
              type="button"
              variant="secondary"
            >
              {choice.label}
            </AdminButton>
          ))}
        </div>
      </fieldset>
      <div className="mt-4">
        <AdminLabel htmlFor={noteId}>Note (optional)</AdminLabel>
        <AdminTextarea
          disabled={pending || !writesEnabled}
          id={noteId}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What should the style reviewer learn from this?"
          value={note}
        />
      </div>
      <div aria-live="polite" className="mt-2" role={error ? "alert" : "status"}>
        {error ? <AdminStateMessage state="error" title={error} /> : null}
        {!error && message === "Saving rating…" ? <AdminStateMessage state="loading" title={message} /> : null}
        {!error && message && message !== "Saving rating…" ? <AdminStateMessage state="success" title={message} /> : null}
      </div>
      {history.length ? (
        <details className="mt-3 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
          <summary className="admin-focus-ring min-h-[var(--admin-touch-target)] cursor-pointer content-center rounded-[var(--admin-radius-sm)] font-semibold text-[var(--admin-foreground)]">
            Rating history ({history.length})
          </summary>
          <ol className="mt-2 grid gap-3 border-l border-[var(--admin-border)] pl-4">
            {history.map((rating) => (
              <li key={rating.id}>
                <p><strong className="capitalize text-[var(--admin-foreground)]">{rating.rating}</strong> · <time className="admin-tabular" dateTime={rating.ratedAt}>{formatDateTime(rating.ratedAt)}</time></p>
                {rating.note ? <p className="mt-1 leading-5">{rating.note}</p> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
