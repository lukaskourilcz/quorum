"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import type { AdminDeck } from "@/lib/admin-decks";

const STYLES = ["mesh", "editorial", "spotlight", "contrast", "aurora"] as const;

function slideUrl(deck: AdminDeck, style: string, slide: number): string {
  return `/admin/api/carousel-studio/deck/${deck.venture}/${encodeURIComponent(deck.slug)}/${deck.date}/${style}/${slide}`;
}

/** A venture, a slug and a date. Three redeliveries of one event are three of these. */
export function deckKey(deck: Pick<AdminDeck, "venture" | "slug" | "date">): string {
  return `${deck.venture}/${deck.slug}/${deck.date}`;
}

/**
 * What the save badge is saying, which is never what the preview is showing.
 *
 * Looking and keeping used to be the same action: a failed POST reset the chip, so the owner
 * clicked a design, watched it appear, and watched it disappear again a second later with no
 * explanation. Viewing a design costs nothing and cannot fail — it is a render. Only the badge
 * moves when a save does.
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

function Deck({ deck }: { deck: AdminDeck }) {
  // The engine picks a style from the date or the slug so a replay renders the same bytes.
  // Picking one here saves it, and the render path reads what is saved — the preview and the
  // shipped deck are the same design. Looking without choosing changes nothing.
  const [style, setStyle] = useState<string>(deck.style);
  const [save, setSave] = useState<SaveState>({ kind: "rest", style: deck.style });

  async function choose(candidate: string): Promise<void> {
    // Unconditional, and first. The preview is a render of a template the engine already has;
    // nothing about showing it depends on a network call succeeding.
    setStyle(candidate);
    if (save.kind !== "warning" && candidate === save.style) return;
    setSave({ kind: "saving", style: candidate });
    try {
      const response = await fetch("/admin/api/carousel-studio/deck-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venture: deck.venture, slug: deck.slug, date: deck.date, style: candidate })
      });
      const body = await response.json().catch(() => ({})) as { error?: string; cause?: string; commit?: string | null };
      if (!response.ok) {
        const cause = body.cause ?? "unknown";
        setSave({ kind: "warning", style: candidate, cause, message: warningFor(cause, body.error) });
        return;
      }
      setSave({ kind: "saved", style: candidate, commit: body.commit ?? null });
    } catch {
      setSave({
        kind: "warning",
        style: candidate,
        cause: "network",
        message: "jen náhled — nevydrží obnovení stránky. Server neodpověděl."
      });
    }
  }

  return (
    <article className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-[var(--card-foreground)]">{deck.title}</h3>
          <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">
            {deck.venture} · {deck.date} · {deck.slides.length} slidů · nejdelší {deck.longestSlideWords} slov
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {deck.hasHero ? null : <Badge tone="warning">bez obrázku</Badge>}
          <Badge tone={deck.publishable ? "success" : "danger"}>
            {deck.publishable ? "připraveno" : "neúplné"}
          </Badge>
        </div>
      </header>

      {deck.problems.length > 0 ? (
        <div className="px-5 pt-4">
          <Callout tone="warning">
            {deck.problems.join(" ")}
          </Callout>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 px-5 pt-4">
        {STYLES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => { void choose(candidate); }}
            aria-pressed={style === candidate}
            className={`rounded-full border px-3 py-1 font-mono text-[0.65625rem] uppercase tracking-[0.12em] transition ${
              style === candidate
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--background)]"
                : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--accent)] hover:text-[var(--card-foreground)]"
            }`}
          >
            {candidate}
          </button>
        ))}
        <DeckSaveBadge save={save} />
      </div>

      {save.kind === "warning" ? (
        <div className="px-5 pt-3">
          <Callout tone="warning">{save.message}</Callout>
        </div>
      ) : null}

      <div className="w-full overflow-x-auto px-5 py-4" data-horizontal-scroll>
        <ol className="flex gap-3">
          {deck.slides.map((slide, index) => (
            <li key={`${deckKey(deck)}/${style}/${index}`} className="shrink-0">
              {/* Rendered by the pipeline's own renderer, so this is the bytes that would ship. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slideUrl(deck, style, index + 1)}
                alt={`Slide ${index + 1}: ${slide.text}`}
                width={216}
                height={270}
                loading="lazy"
                className="rounded-[var(--radius-card)] border border-[var(--border)]"
              />
              <p className="mt-1 font-mono text-[0.625rem] text-[var(--fog)]">
                {index + 1}/{deck.slides.length}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {deck.heroCredit ? (
        // The slide has nowhere to print this, and most of these photographs are CC BY: whoever
        // publishes the carousel has to carry the credit in the caption or it is a breach.
        <p className="border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--fog)]">
          Foto na první slajd: {deck.heroCredit} — uveďte v popisku.
        </p>
      ) : null}
    </article>
  );
}

export function ArticleDecksPanel({ decks }: { decks: AdminDeck[] }) {
  if (decks.length === 0) {
    return (
      <Callout tone="accent">
        Zatím tu není žádný článek, ze kterého by šel karusel postavit.
      </Callout>
    );
  }
  return (
    <div className="grid gap-4">
      <Callout tone="accent">
        Karusely se skládají ke každému článku a nikam se neposílají. Publikování je zavřené
        rozhodnutím social-2026-08a, dokud každý magazín nevydá deset článků.
      </Callout>
      {decks.map((deck) => <Deck key={deckKey(deck)} deck={deck} />)}
    </div>
  );
}
