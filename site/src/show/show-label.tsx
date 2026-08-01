import { Clapperboard } from "lucide-react";
import { episodeLabel, seasonLabel, showPresentation } from "./config";

export function ShowLabel({ date, compact = false }: { date: string; compact?: boolean }) {
  return (
    <div
      aria-label={`${showPresentation.title}, ${seasonLabel(date)}, ${episodeLabel(date)}`}
      className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--show-muted)]"
      data-show-presentation
    >
      <span className="inline-flex items-center gap-2 font-semibold text-[var(--show-ink)]">
        <Clapperboard aria-hidden="true" className="size-4 text-[var(--accent)]" />
        {showPresentation.title}
      </span>
      <span aria-hidden="true" className="text-[var(--show-line)]">/</span>
      <span>{seasonLabel(date)}</span>
      <span aria-hidden="true" className="text-[var(--show-line)]">/</span>
      <span>{episodeLabel(date)}</span>
      {!compact ? <span className="normal-case tracking-normal text-[var(--show-muted)]">{showPresentation.subtitle}</span> : null}
    </div>
  );
}
