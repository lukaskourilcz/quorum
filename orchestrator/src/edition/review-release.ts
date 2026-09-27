import { rm } from "node:fs/promises";
import path from "node:path";
import { EditorialReviewSchema } from "../contracts/editorial-review.js";
import { MeetingRecordSchema } from "../contracts/meeting-record.js";
import { atomicWriteJson, readJson } from "../state.js";
import { configRoot, repoRoot, stateRoot } from "../paths.js";
import { storeEditionCarouselSummary } from "../studio/carousel-summary-store.js";
import { composeEditionSocialPack } from "../social/pack.js";
import { approvedEditorialPackage, reviewFiles } from "./review.js";

/** Runs inside the serialized cycle workflow; the admin only records the owner's decision. */
export async function releaseReviewedArticles(input: { root?: string; repositoryRoot?: string; configurationRoot?: string; now?: Date } = {}): Promise<string[]> {
  const root = input.root ?? stateRoot;
  const repositoryRoot = input.repositoryRoot ?? repoRoot;
  const now = input.now ?? new Date();
  const artifacts: string[] = [];
  for (const file of await reviewFiles(root)) {
    const review = EditorialReviewSchema.safeParse(await readJson<unknown>(root, `editorial/reviews/${file}`, null));
    if (!review.success) continue;
    const decision = await readJson<unknown>(root, `editorial/decisions/${file}`, null);
    const approved = approvedEditorialPackage(review.data, decision);
    if (!approved || approved.status !== "edition") continue;
    const receiptPath = `editorial/releases/${file}`;
    const receipt = await readJson<{ packageHash?: string } | null>(root, receiptPath, null);
    if (receipt?.packageHash === approved.idempotencyKey) continue;
    const releaseLockPath = `editorial/releases/date-${approved.date}.json`;
    const releaseLock = await readJson<{ reviewId?: string } | null>(root, releaseLockPath, null);
    if (releaseLock && releaseLock.reviewId !== review.data.id) throw new Error(`An article for ${approved.date} was already released; existing social drafts must not be overwritten`);
    const outbox = `edition/outbox/${approved.date}-${approved.idempotencyKey}.json`;
    // Stage 2 must be ready before a release receipt. Retry never re-approves social drafts.
    const meeting = MeetingRecordSchema.parse(await readJson(root, `meetings/${approved.date}-cu-edition.json`, null));
    const baseUrl = process.env.CAUGHT_UP_SITE_URL;
    if (!baseUrl) throw new Error("CAUGHT_UP_SITE_URL is required to prepare reviewed article social drafts");
    await storeEditionCarouselSummary(root, approved);
    const pack = await composeEditionSocialPack({ editionPackage: approved, meeting,
      destinations: { cs: new URL(`/articles/${approved.article.cs.frontmatter.slug}`, baseUrl).toString() },
      repoRoot: repositoryRoot, stateRoot: root, configRoot: input.configurationRoot ?? configRoot, now, hostFrames: true });
    if (!pack) throw new Error("The approved article's social drafts could not be prepared");
    await atomicWriteJson(root, outbox, approved);
    await atomicWriteJson(root, releaseLockPath, { reviewId: review.data.id, packageHash: approved.idempotencyKey });
    await atomicWriteJson(root, receiptPath, { schemaVersion: "editorial-release/1", reviewId: review.data.id,
      packageHash: approved.idempotencyKey, releasedAt: now.toISOString(), socialApproval: "required" });
    const original = `edition/outbox/${approved.date}-${review.data.id}.json`;
    if (original !== outbox) await rm(path.join(root, original), { force: true });
    artifacts.push(outbox, original, receiptPath, ...pack.artifactPaths);
  }
  return artifacts;
}
