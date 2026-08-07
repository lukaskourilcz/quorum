import type { CalendarKind } from "@/lib/calendar-feed-model";

const labels: Record<CalendarKind, string> = {
  "cu-edition": "DNESKAi edition production",
  "venture-morning": "Morning company meeting",
  "incubator-scan": "Magazine idea research",
  "tt-marketing": "Titty Tuesdays marketing meeting",
  "gv-brief": "GoVIRAL trend and marketing meeting",
  "ms-daily": "marketingShark daily carousel meeting",
  "venture-afternoon": "Afternoon company meeting",
  "cu-product": "DNESKAi product meeting",
  "incubator-synthesis": "Magazine idea review",
  "venture-night": "Night company meeting",
  "mma-intake": "Fight data check",
  "mma-analysis": "Fight analysis review",
  "mag-editorial": "MMA Files story meeting",
  "mag-desk": "MMA Files desk review",
  "article-am": "Morning MMA Files article",
  "article-pm": "Evening MMA Files article",
  "studio": "Carousel Studio template review"
};

/**
 * What a slot is called, everywhere it is named.
 *
 * The board had this map and nothing else did: the decisions feed carried its own chain of
 * conditionals that sent five of the nine meeting kinds to "Incubator synthesis", and the
 * results table printed the raw kind. One map, three readers.
 */
export function publicKindLabel(kind: string): string {
  return labels[kind as CalendarKind]
    ?? (kind === "morning" || kind === "afternoon" || kind === "night"
      ? labels[`venture-${kind}` as CalendarKind]
      : undefined)
    ?? kind.replaceAll("-", " ").replaceAll("_", " ");
}

/**
 * An article run states why its slot died as a machine token. `buildCalendarFeed` copies that
 * token into `decisionOneLiner` unchanged, and every board that prints one is where an owner
 * reads it, so each token gets a sentence here. A reason absent from this map is printed
 * verbatim, not guessed at.
 *
 * Shared, because it was not: the five-day board translated these and the walkthrough's own
 * calendar did not, so the same Monday slot read "The story meeting chose no subject" on
 * `/calendar` and `missing_editorial_slate` on the home page.
 */
const articleRunReasonCopy: Record<string, string> = {
  missing_editorial_slate: "The story meeting chose no subject, so this slot had nothing to write.",
  missing_sourced_subject: "The story meeting named no source-backed subject for this slot.",
  no_sourced_subject_on_file: "No subject from the story meeting, and none left on file.",
  budget_decision_not_countersigned: "The budget decision this slot runs under is not countersigned yet.",
  portfolio_gate_closed: "Portfolio work is switched off, so this slot did not open.",
  mma_files_gate_closed: "MMA Files live publishing is switched off, so this slot did not open."
};

/** The sentence a recorded slot reason reads as, or the reason itself when it is already prose. */
export function readableSlotReason(reason: string | undefined): string | undefined {
  if (!reason) return reason;
  return articleRunReasonCopy[reason] ?? reason;
}
