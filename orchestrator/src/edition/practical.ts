import {
  practicalBlockErrors,
  practicalVariantForDate,
  type PracticalBlockShape,
  type PracticalItem
} from "../contracts/practical.js";
import { reviewArticleText } from "./stet.js";

/** The one "problem" that is not a fault: the desk was asked and filed nothing. */
export const PRACTICAL_NOT_FILED = "not_filed";

export interface PracticalCheck {
  /** The block to publish, or nothing at all. Never a partial one. */
  block: PracticalBlockShape | null;
  /** Why it was dropped, for the run record. Empty when the block is good. */
  problems: string[];
}

export interface PracticalCheckInput {
  /** What the desk filed, already parsed against `PracticalItemSchema`. */
  items: readonly PracticalItem[] | undefined;
  /** The publishing date, which decides the variant and whether a Friday shape is allowed. */
  date: string;
  /**
   * Exactly the URLs the delivered frontmatter will carry: the cited sources and the verified
   * Watchlist. The delivery boundary sees only those, so grounding against anything wider here
   * would accept a block that delivery refuses, and that costs an edition rather than an extra.
   */
  groundedUrls: ReadonlySet<string>;
}

/**
 * Check the practical block the desk filed, and drop the whole thing if any part of it fails.
 *
 * The same posture as `checkVisualBrief`: validation rather than trust, all-or-nothing rather
 * than repair, and no retry. The practical item is an extra, and an extra may never cost the
 * edition it travels with — a desk that invented a tool URL has misunderstood the instruction,
 * and the three items it wrote under that misunderstanding are not evidence of anything either.
 * The edition publishes without it, and the run record says why.
 *
 * The copy rules run over the reader-facing text because a practical item is reader-facing
 * Czech, and the register that bans emoji and hype in the article does not stop at its edge.
 * They run here, where a violation costs the extra, rather than in `reviewCzechArticle`, where
 * one hype word in a tool tip would cost a paid rewrite of an article that was already clean.
 */
export function checkPractical(input: PracticalCheckInput): PracticalCheck {
  const items = (input.items ?? []).map((item) => ({
    kind: item.kind,
    title: item.title.trim(),
    body: item.body.trim(),
    source_url: item.source_url
  }));
  // The desk was asked and filed nothing. A normal day, and still worth one line in the run
  // record: a week of them is a prompt that has stopped being followed.
  if (items.length === 0) return { block: null, problems: [PRACTICAL_NOT_FILED] };
  const block: PracticalBlockShape = { variant: practicalVariantForDate(input.date), items };
  const problems = practicalBlockErrors({
    block,
    date: input.date,
    groundedUrls: input.groundedUrls
  });
  for (const item of items) {
    for (const violation of reviewArticleText(`${item.title}\n${item.body}`, "cs")) {
      problems.push(`copy:${violation.code}`);
    }
  }
  if (problems.length > 0) return { block: null, problems };
  return { block, problems };
}
