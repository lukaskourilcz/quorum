import type { ArticlePackage } from "../contracts/mma-files.js";
import type { BoutRecord } from "../contracts/mma.js";

/**
 * How long a subject stays spent after the desk covers it.
 *
 * The rule used to be "ever": every ref an article declared was spent for good, against a
 * 92-fighter roster and, since the cadence became one article a day, a single slot. That is a
 * countdown — a little under three months of material and then a desk with nothing left to write
 * about and no way back. Six weeks is long enough that a reader never sees the same fighter twice
 * in a month and a half, and short enough that the roster refills faster than the slot drains it.
 *
 * The window is not the only way back. A fighter who has fought since the desk last covered them
 * is a new story on the day of the fight, whatever the calendar says, so a completed bout after
 * the last coverage clears them immediately.
 */
export const SUBJECT_REPEAT_WINDOW_DAYS = 42;

const DAY_MS = 86_400_000;

/** Every ref an article declared: its subject, and everything else it committed to covering. */
function declaredRefs(article: ArticlePackage): string[] {
  return [...article.fighterRefs, ...(article.eventRef ? [article.eventRef] : [])];
}

/**
 * The subjects the desk may not assign today.
 *
 * One implementation for the two callers that need it — `deriveEditorialSlate` and the rescue
 * path in the portfolio room — because the two disagreeing about what "fresh" means would show
 * up as the desk assigning on alternating days a subject the other path considers spent.
 *
 * `bouts` is optional: a caller with no bout records loaded gets the window and nothing else,
 * which is the conservative half of the rule.
 */
export function spentSubjectRefs(input: {
  articles: readonly ArticlePackage[];
  bouts?: readonly BoutRecord[];
  now: Date;
}): Set<string> {
  const lastCovered = new Map<string, number>();
  for (const article of input.articles) {
    const at = Date.parse(article.publishAt);
    if (Number.isNaN(at)) continue;
    for (const ref of declaredRefs(article)) {
      lastCovered.set(ref, Math.max(lastCovered.get(ref) ?? 0, at));
    }
  }

  // When each fighter last finished a bout, from the bout records rather than from the fighter
  // card's own history: the card's history is a summary the intake rewrites, and a bout record is
  // the dated, sourced fact that a fight happened.
  const lastFought = new Map<string, number>();
  for (const bout of input.bouts ?? []) {
    if (bout.status !== "completed") continue;
    const at = Date.parse(bout.event.startsAtUtc);
    if (Number.isNaN(at)) continue;
    for (const ref of [bout.fighters.red, bout.fighters.blue]) {
      lastFought.set(ref, Math.max(lastFought.get(ref) ?? 0, at));
    }
  }

  const cutoff = input.now.getTime() - (SUBJECT_REPEAT_WINDOW_DAYS * DAY_MS);
  const spent = new Set<string>();
  for (const [ref, coveredAt] of lastCovered) {
    if (coveredAt <= cutoff) continue;
    const fought = lastFought.get(ref);
    if (fought !== undefined && fought > coveredAt) continue;
    spent.add(ref);
  }
  return spent;
}
