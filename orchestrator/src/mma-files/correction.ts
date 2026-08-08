import type { ArticlePackage } from "../contracts/mma-files.js";
import { canonicalJson } from "./hash.js";

/**
 * Whether one package is a legitimate image-only correction of another.
 *
 * The whole of the extension is this predicate, and it is written twice on purpose: here, and
 * again in the consumer's own script in the mma-files repository. Neither end trusts the other's
 * word for it. A producer that got this wrong would otherwise be able to rewrite a published
 * article through a door that exists only for photographs.
 *
 * Everything but the picture has to be byte-identical. That includes the sources, the fighter
 * refs, the publication time, the format and — the point of the exercise — every word of the
 * Czech article. What may differ is `image`, the `correction` block itself, and the hash that
 * covers both.
 */
export const CORRECTABLE_FIELDS = ["image", "correction", "packageHash"] as const;

export function articleIdentity(article: Pick<ArticlePackage, "publishAt" | "slot">): string {
  return `${article.publishAt.slice(0, 10)}:${article.slot}`;
}

/** The package with everything a correction may change removed. Two of these must match. */
function withoutCorrectableFields(article: ArticlePackage): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(article)) {
    if ((CORRECTABLE_FIELDS as readonly string[]).includes(key)) continue;
    rest[key] = value;
  }
  return rest;
}

export interface CorrectionCheck {
  ok: boolean;
  problems: string[];
}

export function checkImageCorrection(input: {
  /** The package the consumer, or the store, currently holds. */
  current: ArticlePackage;
  /** The package offered in its place. */
  replacement: ArticlePackage;
}): CorrectionCheck {
  const problems: string[] = [];
  const correction = input.replacement.correction;
  if (!correction) return { ok: false, problems: ["no-correction-block"] };
  if (correction.supersedesPackageHash !== input.current.packageHash) {
    problems.push("supersedes-a-different-package");
  }
  if (articleIdentity(input.current) !== articleIdentity(input.replacement)) {
    problems.push("different-article");
  }
  if (input.current.packageHash === input.replacement.packageHash) {
    problems.push("nothing-changed");
  }
  if (canonicalJson(withoutCorrectableFields(input.current))
    !== canonicalJson(withoutCorrectableFields(input.replacement))) {
    problems.push("more-than-the-image-changed");
  }
  return { ok: problems.length === 0, problems };
}
