import type { CalendarKind } from "@/lib/calendar-feed-model";

const labels: Record<CalendarKind, string> = {
  "cu-edition": "DNESKAi edition production",
  "venture-morning": "Morning company meeting",
  "incubator-scan": "Magazine idea research",
  "tt-marketing": "Titty Tuesdays marketing meeting",
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
