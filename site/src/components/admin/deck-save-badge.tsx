"use client";

/**
 * What a save is saying, which is never what the preview is showing.
 *
 * Looking and keeping used to be one action: a failed POST reset the chip, so the owner clicked a
 * design, watched it appear, and watched it disappear again a second later with no explanation.
 * Viewing a design costs nothing and cannot fail — it is a render. Only the badge moves when a
 * save does, and it says which of the two persistence failures it was, because a missing token
 * and a token GitHub has begun refusing look identical and are fixed differently.
 */

export type SaveState =
  | { kind: "rest"; style: string }
  | { kind: "saving"; style: string }
  | { kind: "saved"; style: string; commit: string | null }
  | { kind: "warning"; style: string; message: string; cause: string };

/**
 * The two ways writing can be unavailable, told apart.
 *
 * A missing token and a token GitHub has stopped accepting produce the same non-save. The
 * second one arrives without warning — fine-grained tokens expire — so the banner has to name
 * which it is, or the next occurrence costs another afternoon of reading deployment logs.
 */
const WARNINGS: Record<string, string> = {
  "no-token": "Jen náhled — nevydrží obnovení stránky. Na tomhle nasazení chybí BOARDLESSAI_GITHUB_TOKEN.",
  "token-refused": "Jen náhled — nevydrží obnovení stránky. BOARDLESSAI_GITHUB_TOKEN existuje, ale GitHub ho odmítl: vypršel, nebo už nemá Contents read/write."
};

export function warningFor(cause: string, fallback?: string): string {
  return WARNINGS[cause] ?? fallback ?? "Design se neuložil.";
}

/** The one line the badge shows. Separated from the chip so a failed save can never move a chip. */
export function DeckSaveBadge({ save }: { save: SaveState }) {
  const text = save.kind === "saving" ? "ukládám…"
    : save.kind === "saved" ? `uloženo ${save.style}${save.commit ? ` · ${save.commit}` : ""}`
    : save.kind === "warning" ? "neuloženo"
    : `vychází ${save.style}`;
  return (
    <span
      data-save-state={save.kind}
      aria-live="polite"
      className={`self-center font-mono text-[0.65625rem] uppercase tracking-[0.12em] ${
        save.kind === "warning" ? "text-[var(--warning)]" : "text-[var(--fog)]"
      }`}
    >
      {text}
    </span>
  );
}
