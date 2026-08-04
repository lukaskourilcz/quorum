"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import type { AdminDeck } from "@/lib/admin-decks";

const STYLES = ["mesh", "editorial", "spotlight", "contrast", "aurora"] as const;

function slideUrl(deck: AdminDeck, style: string, slide: number): string {
  return `/admin/api/carousel-studio/deck/${deck.venture}/${encodeURIComponent(deck.slug)}/${style}/${slide}`;
}

function Deck({ deck }: { deck: AdminDeck }) {
  // The engine picks a style from the slug so a replay renders the same bytes. Here the
  // owner can look at the other four without changing what the pipeline would produce.
  const [style, setStyle] = useState<string>(deck.style);

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
            onClick={() => setStyle(candidate)}
            aria-pressed={style === candidate}
            className={`rounded-full border px-3 py-1 font-mono text-[0.65625rem] uppercase tracking-[0.12em] transition ${
              style === candidate
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--background)]"
                : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--accent)] hover:text-[var(--card-foreground)]"
            }`}
          >
            {candidate}
            {candidate === deck.style ? " ·" : ""}
          </button>
        ))}
      </div>

      <div className="w-full overflow-x-auto px-5 py-4" data-horizontal-scroll>
        <ol className="flex gap-3">
          {deck.slides.map((slide, index) => (
            <li key={`${style}-${index}`} className="shrink-0">
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
      {decks.map((deck) => <Deck key={`${deck.venture}-${deck.slug}`} deck={deck} />)}
    </div>
  );
}
