import { readFile, rm, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { VerifiedSocialAsset } from "./media/assets.js";
import { CapabilityAwareQueueItemSchema, type CapabilityAwareQueueItem } from "./queue.js";

/**
 * The publisher's claims: which queue items one run marked `publishing` before it sent anything.
 *
 * The run is split in two (quorum#574 review). The claim phase writes each item it will send as
 * `publishing` with an attempt, and the workflow pushes that to the branch before any provider is
 * called. The Queue replaces an item only against the version it read, so an owner's hold, edit or
 * reject that lands before the push makes the push conflict and nothing is sent; one that comes
 * after it finds a `publishing` item and is refused. The send phase then acts only on the claims
 * this file names, and only while the item on the branch still carries the same claim.
 *
 * The file lives in the runner's temporary directory and is never committed. It carries each
 * item's exact text before the claim, so a claim that is not sent (a hold, a pause that landed in
 * between, a window that closed) is put back byte for byte, and the frames the asset gate proved,
 * so the send hands the adapter exactly the URLs that answered.
 */
export const SOCIAL_PUBLISH_CLAIMS_VERSION = "social-publish-claims/1" as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const ClaimedFrameSchema = z.strictObject({
  path: z.string().min(1).max(300),
  url: z.url().max(2_000),
  sha256: Sha256Schema,
  contentType: z.enum(["image/png", "image/jpeg"]),
  commit: z.string().regex(/^[a-f0-9]{7,64}$/u).nullable(),
  altText: z.string().max(1_000).nullable()
});

export const SocialPublishClaimSchema = z.strictObject({
  /** The file's name inside `state/social/queue/`. */
  queueFile: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u).max(200),
  itemId: z.string().trim().min(1).max(160),
  idempotencyKey: Sha256Schema,
  claimedAt: z.string().datetime(),
  contentHash: Sha256Schema,
  /** The queue file's exact text before the claim. */
  before: z.string().min(2).max(500_000),
  frames: z.array(ClaimedFrameSchema).max(20)
});
export type SocialPublishClaim = z.infer<typeof SocialPublishClaimSchema>;

const SocialPublishClaimsSchema = z.strictObject({
  schemaVersion: z.literal(SOCIAL_PUBLISH_CLAIMS_VERSION),
  claims: z.array(SocialPublishClaimSchema).min(1).max(100)
});

/** The claims a claim phase wrote; none when the file does not exist. */
export async function readSocialPublishClaims(file: string): Promise<SocialPublishClaim[]> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return SocialPublishClaimsSchema.parse(JSON.parse(text) as unknown).claims;
}

/**
 * Written only when something was claimed, so "the file exists and is not empty" is the workflow's
 * whole test for whether to push claims and run the send phase.
 */
export async function writeSocialPublishClaims(file: string, claims: readonly SocialPublishClaim[]): Promise<void> {
  if (claims.length === 0) {
    await rm(file, { force: true });
    return;
  }
  const record = SocialPublishClaimsSchema.parse({ schemaVersion: SOCIAL_PUBLISH_CLAIMS_VERSION, claims });
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

/** The item as the claim phase writes it: `publishing`, with the attempt the send will complete. */
export function claimedQueueItem(item: CapabilityAwareQueueItem, idempotencyKey: string, now: Date): CapabilityAwareQueueItem {
  return CapabilityAwareQueueItemSchema.parse({
    ...item,
    status: "publishing",
    attempt: {
      idempotencyKey,
      claimedAt: now.toISOString(),
      attemptCount: (item.attempt?.attemptCount ?? 0) + 1,
      lastError: null
    }
  });
}

/** Whether the item on the branch still carries exactly this run's claim. */
export function claimStands(item: CapabilityAwareQueueItem, claim: SocialPublishClaim): boolean {
  return item.id === claim.itemId
    && item.status === "publishing"
    && item.content.contentHash === claim.contentHash
    && item.attempt?.idempotencyKey === claim.idempotencyKey
    && item.attempt.claimedAt === claim.claimedAt;
}

export function claimedFrames(claim: SocialPublishClaim): VerifiedSocialAsset[] {
  return claim.frames.map((frame) => ({ ...frame }));
}
