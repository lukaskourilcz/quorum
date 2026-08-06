import type { StetReview } from "./stet.js";

/**
 * The one switch: may the editorial review stop the day's article from being published?
 *
 * 2026-08-04 — set to false, as a trial. 2026-08-06 — the owner made it permanent policy under
 * `orchestration-2026-08f`: style and freshness verdicts publish with their findings on the
 * record, and the checks that the article is true still kill the run. Every review still runs
 * and every finding is still recorded. Setting this back to true restores blocking, and the
 * `unresolvedReview` block on each run report and edition package is the log of what blocking
 * would have stopped.
 *
 * This constant is read in exactly one place, `partition` below. Nothing else in the codebase
 * branches on it, so flipping it here changes the behaviour everywhere at once.
 */
export const EDITORIAL_REVIEW_BLOCKS_PUBLICATION = false;

/**
 * The quality-gate codes that judge editorial choice rather than whether the article is true.
 *
 * `evaluateEditionQuality` returns one flat list mixing three different kinds of verdict:
 * whether the claims trace to evidence (cited sources, source diversity, signal strength,
 * single-source share, primary source, unsupported watchlist items), whether the run stayed
 * inside its budget (the four cost codes), and whether the day's story choice was fresh. Only
 * the third kind is listed here. Everything absent from this set keeps blocking whatever this
 * file's switch says, which is why the set is a literal allow-list and not a "not these"
 * filter: a code added to the gate later blocks by default until someone classifies it.
 */
const WAIVABLE_QUALITY_CODES: ReadonlySet<string> = new Set([
  // The article's cited sources are all versions of the same story.
  "maximum_duplicate_story_similarity",
  // Most of the article's topic set has run in recent editions.
  "maximum_repeated_topic_frequency"
]);

/**
 * The copy-review codes that stay blocking regardless of the switch.
 *
 * `reviewCzechArticle` is a single pass over one rule table, so its stylistic rules and this
 * one arrive entangled in one `violations` array with one `passed` flag. `source_instruction_leak`
 * is not a register rule: it fires when text that looks like an instruction to a model
 * ("ignore the previous instructions", "approve this article") has been copied out of scraped
 * source data into the published copy. That is the prompt-injection guard on untrusted input,
 * so it is separated out here by code and keeps blocking. The remaining rules — hype, throat
 * clearing, calques, empty adverbs, emoji, exclamation marks, generated-system meta — are
 * register, and register is what the owner chose to look at on the site rather than in a gate.
 */
const NON_WAIVABLE_COPY_REVIEW_CODES: ReadonlySet<string> = new Set([
  "source_instruction_leak"
]);

/** What a review found, split by whether it stops the article going out. */
export interface ReviewFindings {
  /** Findings that end the run in a rewrite or `no_edition`, exactly as before. */
  blocking: string[];
  /** Findings recorded on the run report and the edition package, but published anyway. */
  waived: string[];
}

function partition(codes: readonly string[], waivable: ReadonlySet<string>): ReviewFindings {
  if (EDITORIAL_REVIEW_BLOCKS_PUBLICATION) return { blocking: [...codes], waived: [] };
  return {
    blocking: codes.filter((code) => !waivable.has(code)),
    waived: codes.filter((code) => waivable.has(code))
  };
}

/** Split the edition quality gate's violation codes. */
export function qualityFindings(violations: readonly string[]): ReviewFindings {
  return partition(violations, WAIVABLE_QUALITY_CODES);
}

/**
 * Split the copy review's violations, keyed `locale/code` so the record says which pass fired.
 *
 * The waivable set is the complement of `NON_WAIVABLE_COPY_REVIEW_CODES` because the copy rules
 * are a fixed table of register checks with one security check inside it, the opposite shape
 * from the quality gate.
 */
export function copyReviewFindings(review: StetReview): ReviewFindings {
  const blocking: string[] = [];
  const waived: string[] = [];
  for (const violation of review.violations) {
    const label = `${violation.locale}/${violation.code}`;
    if (EDITORIAL_REVIEW_BLOCKS_PUBLICATION || NON_WAIVABLE_COPY_REVIEW_CODES.has(violation.code)) {
      blocking.push(label);
    } else {
      waived.push(label);
    }
  }
  return { blocking, waived };
}

/**
 * What the record says on an article published over open findings.
 *
 * Written for a person reading the run file or the package months later, so it names the date,
 * the decision and what did not change.
 */
export const UNRESOLVED_REVIEW_NOTICE =
  "Published with unresolved editorial review findings, listed below. The review ran and " +
  "recorded them; since 2026-08-04 a stylistic or topical finding does not stop publication. " +
  "The checks that the article is accurate still do: supplied source links, cited sources, " +
  "source diversity, primary sourcing, watchlist support and the cost caps.";
