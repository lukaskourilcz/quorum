import { atomicWriteJson } from "../state.js";
import { loadArticlePackages } from "./store.js";
import { articleQueue } from "./publish.js";

/**
 * End a parked article that the magazine can never accept.
 *
 * Six packages have sat parked on `hash_conflict` since August, re-read by every run and refused
 * every time, because the desk wrote the same subject on consecutive mornings and the magazine
 * refuses a slug it already serves. Their receipts say so in as many words —
 * "2026-08-08:am reuses the slug of 2026-08-05:am". Retrying them forever is not patience, it is a
 * queue that reads as stalled when the honest answer is that this story is already published.
 *
 * The rule is narrow on purpose, and provable without a network call: a parked package may be
 * retired only when another package **with the same slug and an earlier publish time** carries a
 * `delivered` receipt. That is what makes retirement lossless — the story reached readers, under
 * its first date. No delivered sibling, no retirement; a package that has never been published
 * anywhere stays parked and stays the owner's problem, which is the right answer for it.
 *
 * Nothing here mutates an article. Retirement is a receipt beside the package, exactly like
 * delivery is, and the package stays on disk for anyone reading the history back.
 */

export interface RetirementCandidate {
  packageHash: string;
  label: string;
  slug: string;
  publishAt: string;
  /** The earlier package that carries the delivered receipt this one duplicates. */
  supersededBy: { packageHash: string; publishAt: string };
}

export interface RetirementSurvey {
  retirable: RetirementCandidate[];
  /** Parked packages with no delivered sibling. Reported, never retired. */
  keep: Array<{ packageHash: string; label: string; reason: string }>;
}

function receiptPath(packageHash: string): string {
  return `ventures/mma-files/deliveries/articles/${packageHash}.json`;
}

export async function surveyRetirableArticles(root: string): Promise<RetirementSurvey> {
  const [queue, articles] = await Promise.all([articleQueue(root), loadArticlePackages(root)]);
  const byHash = new Map(articles.map((article) => [article.packageHash, article]));
  const deliveredHashes = new Set(
    queue.filter((entry) => entry.state === "delivered").map((entry) => entry.packageHash)
  );

  const retirable: RetirementCandidate[] = [];
  const keep: RetirementSurvey["keep"] = [];
  for (const entry of queue) {
    if (entry.state !== "parked") continue;
    const article = byHash.get(entry.packageHash);
    if (!article) {
      // A receipt with no package is a record of something already gone; leave it alone.
      keep.push({ packageHash: entry.packageHash, label: entry.label, reason: "no package on file" });
      continue;
    }
    const superseding = articles
      .filter((candidate) =>
        candidate.slug === article.slug &&
        candidate.publishAt < article.publishAt &&
        deliveredHashes.has(candidate.packageHash))
      .sort((left, right) => left.publishAt.localeCompare(right.publishAt))[0];
    if (!superseding) {
      keep.push({
        packageHash: entry.packageHash,
        label: entry.label,
        reason: "no earlier delivered article shares its slug"
      });
      continue;
    }
    retirable.push({
      packageHash: entry.packageHash,
      label: entry.label,
      slug: article.slug,
      publishAt: article.publishAt,
      supersededBy: { packageHash: superseding.packageHash, publishAt: superseding.publishAt }
    });
  }
  return { retirable, keep };
}

/**
 * Write the terminal receipt.
 *
 * `retired`, never `delivered`: nothing reached the magazine from these bytes and a reader of
 * `deliveries/articles/` must not be told otherwise. `supersededBy` names the package that did
 * reach it, so the reason survives without anyone re-deriving it.
 */
export async function retireArticle(root: string, candidate: RetirementCandidate): Promise<void> {
  await atomicWriteJson(root, receiptPath(candidate.packageHash), {
    schemaVersion: "mma-files-delivery-receipt/1",
    kind: "article",
    packageHash: candidate.packageHash,
    status: "retired",
    code: "superseded_slug",
    detail: `${candidate.publishAt.slice(0, 10)} reuses the slug of ${candidate.supersededBy.publishAt.slice(0, 10)}, which the magazine already serves.`,
    supersededBy: candidate.supersededBy.packageHash,
    recordedAt: new Date().toISOString()
  });
}
