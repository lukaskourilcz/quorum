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
  "kv-desk": "Kvórum political recommendation desk",
  "article-am": "Morning MMA Files article",
  "article-pm": "Evening MMA Files article",
  "studio": "Design Lab template review"
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

/**
 * What each article slot did, written out.
 *
 * The MMA Files story meeting records its outcome as `AM: assigned; PM: killed` — two slots and
 * their states, in the desk's own shorthand. It is exact and it is unreadable: a visitor cannot
 * tell whether "killed" is a failure, and nothing on the page says the two halves are the day's
 * morning and evening article slots. The shorthand stays in the record; this is how it reads.
 */
const slotStateCopy: Record<string, string> = {
  assigned: "got a subject",
  killed: "was dropped",
  published: "published its article",
  skipped: "was skipped"
};

function readableSlateSummary(reason: string): string | undefined {
  const match = /^AM:\s*([a-z_]+)\s*[;,]\s*PM:\s*([a-z_]+)\.?$/iu.exec(reason.trim());
  if (!match) return undefined;
  const morning = slotStateCopy[match[1]!.toLowerCase()];
  const evening = slotStateCopy[match[2]!.toLowerCase()];
  if (!morning || !evening) return undefined;
  return morning === evening
    ? `Both of the day's article slots ${morning}.`
    : `The morning article slot ${morning}; the evening slot ${evening}.`;
}

/** The sentence a recorded slot reason reads as, or the reason itself when it is already prose. */
export function readableSlotReason(reason: string | undefined): string | undefined {
  if (!reason) return reason;
  return articleRunReasonCopy[reason] ?? readableSlateSummary(reason) ?? reason;
}
