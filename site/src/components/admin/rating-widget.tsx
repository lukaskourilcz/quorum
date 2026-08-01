"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  const noteId = `rating-note-${ventureId}-${contentHash.replace(":", "-")}`;
  const [history, setHistory] = useState(initialHistory);
  const [active, setActive] = useState<RatingValue | null>(initialHistory[0]?.rating ?? null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function rate(value: RatingValue): Promise<void> {
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
    <div className="border-t border-[var(--border)] pt-5">
      <fieldset>
        <legend className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">
          Your rating
        </legend>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {choices.map((choice) => (
            <Button
              aria-pressed={active === choice.value}
              className={active === choice.value
                ? choice.value === "bad"
                  ? "border-[var(--destructive)] bg-[var(--destructive-soft)] text-[var(--destructive)]"
                  : "border-[var(--accent)] bg-[var(--accent)] text-[var(--obsidian)]"
                : "px-3"
              }
              disabled={pending}
              key={choice.value}
              onClick={() => rate(choice.value)}
              type="button"
              variant="secondary"
            >
              {choice.label}
            </Button>
          ))}
        </div>
      </fieldset>
      <label className="mt-4 block" htmlFor={noteId}>
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">
          Note (optional)
        </span>
        <textarea
          className="mt-2 min-h-24 w-full rounded-[var(--radius-button)] border border-[var(--steel)] bg-[var(--surface)] p-3 text-base leading-6 text-[var(--foreground)] placeholder:text-[var(--fog)] disabled:opacity-50"
          disabled={pending}
          id={noteId}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What should the style reviewer learn from this?"
          value={note}
        />
      </label>
      <div aria-live="polite" className="mt-2 min-h-5 text-sm" role={error ? "alert" : "status"}>
        {error ? <span className="text-[var(--destructive)]">{error}</span> : <span className="text-[var(--fog)]">{message}</span>}
      </div>
      {history.length ? (
        <details className="mt-3 text-sm text-[var(--fog)]">
          <summary className="min-h-11 cursor-pointer content-center font-semibold text-[var(--mist)]">
            Rating history ({history.length})
          </summary>
          <ol className="mt-2 grid gap-3 border-l border-[var(--border)] pl-4">
            {history.map((rating) => (
              <li key={rating.id}>
                <p><strong className="capitalize text-[var(--foreground)]">{rating.rating}</strong> · <time dateTime={rating.ratedAt}>{new Date(rating.ratedAt).toLocaleString()}</time></p>
                {rating.note ? <p className="mt-1 leading-5">{rating.note}</p> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
