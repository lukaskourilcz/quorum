import {
  deliveredPractical,
  practicalErrors,
  type PracticalFiled,
  type PracticalShape
} from "../contracts/practical.js";
import { reviewArticleText } from "./stet.js";

/** The one "problem" that is not a fault: the desk was asked and filed nothing. */
export const PRACTICAL_NOT_FILED = "not_filed";

export interface PracticalCheck {
  /** The item to publish, or nothing at all. */
  practical: PracticalShape | null;
  /** Why it was dropped, for the run record. Empty when the item is good. */
  problems: string[];
}

export interface PracticalCheckInput {
  /** What the desk filed, already parsed against `PracticalFiledSchema`. */
  filed: PracticalFiled | undefined;
  /** The publishing date, which becomes the item's `verified_at`. */
  date: string;
  /**
   * Exactly the URLs the delivered frontmatter will carry: the cited sources and the verified
   * Watchlist. The delivery boundary sees only those, so grounding against anything wider here
   * would accept an item that delivery refuses, and that costs an edition rather than an extra.
   */
  groundedUrls: ReadonlySet<string>;
}

/**
 * Check the practical item the desk filed, and drop it if any part of it fails.
 *
 * The same posture as `checkVisualBrief`: validation rather than trust, drop rather than repair,
 * and no retry. The practical item is an extra, and an extra may never cost the edition it travels
 * with — a desk that invented a tool URL has misunderstood the instruction. The edition publishes
 * without it, and the run record says why. It is only ever sourced from the edition's own ledger:
 * its URL has to be one the frontmatter already cites or lists on the Watchlist.
 *
 * The copy rules run over the reader-facing text because a practical item is reader-facing
 * Czech, and the register that bans emoji and hype in the article does not stop at its edge.
 * They run here, where a violation costs the extra, rather than in `reviewCzechArticle`, where
 * one hype word in a tool tip would cost a paid rewrite of an article that was already clean.
 */
export function checkPractical(input: PracticalCheckInput): PracticalCheck {
  if (!input.filed) return { practical: null, problems: [PRACTICAL_NOT_FILED] };
  const practical = deliveredPractical(input.filed, input.date);
  const problems = practicalErrors({ practical, date: input.date, groundedUrls: input.groundedUrls });
  for (const violation of reviewArticleText(`${practical.title}\n${practical.text}`, "cs")) {
    problems.push(`copy:${violation.code}`);
  }
  return problems.length > 0 ? { practical: null, problems } : { practical, problems };
}
