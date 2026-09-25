import { z } from "zod";
import { DateSchema, DateTimeSchema, Sha256Schema, VentureIdSchema } from "./common.js";

/**
 * Where a queue item's images are fetched from at publish time.
 *
 * `jsdelivr` is the default: a commit-pinned URL on jsDelivr's GitHub CDN serves a committed frame
 * without a site deploy, at no cost, and never changes afterwards. `site` is the earlier behaviour,
 * `PUBLIC_SITE_URL` plus the asset path, which only works once somebody has deployed the site.
 * `blob` names the Vercel Blob fallback that is documented and not built; choosing it holds every
 * item that carries an image rather than guessing a URL.
 */
export const SOCIAL_ASSET_BASES = ["jsdelivr", "site", "blob"] as const;
export const SocialAssetBaseSchema = z.enum(SOCIAL_ASSET_BASES);
export type SocialAssetBase = z.infer<typeof SocialAssetBaseSchema>;

/**
 * A public asset path exactly as a queue item may carry it: `/social/...` with one extension and no
 * dot segments. The extension is not narrowed here, so a hold can name a WebP frame it refused.
 */
export const SocialAssetPathSchema = z.string().max(400).regex(/^\/social\/[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/u);

/**
 * Why one asset could not be handed to a platform.
 *
 * `ready` is the only outcome that lets an item through. Every other outcome is a hold, and none of
 * them falls back to another URL: the platform fetches exactly the URL that was checked or nothing.
 */
export const SOCIAL_ASSET_OUTCOMES = [
  "ready",
  "base-invalid",
  "base-unbuilt",
  "hash-unrecorded",
  "uncommitted",
  "not-at-commit",
  "hash-mismatch",
  "host-not-allowlisted",
  "unreachable",
  "wrong-type"
] as const;
export type SocialAssetOutcome = (typeof SOCIAL_ASSET_OUTCOMES)[number];

/**
 * The reason a whole item is held.
 *
 * `asset-hash-mismatch` wins over the others because it is the one that says the bytes are not the
 * bytes that were approved; `asset-hash-unrecorded` means nothing recorded what they should be.
 * Everything else, from an uncommitted frame to a 404, is `asset-unreachable`.
 */
export const SOCIAL_ASSET_HOLD_REASONS = ["asset-hash-mismatch", "asset-hash-unrecorded", "asset-unreachable"] as const;
export type SocialAssetHoldReason = (typeof SOCIAL_ASSET_HOLD_REASONS)[number];

const CommitSchema = z.string().regex(/^[a-f0-9]{40}$/u);

export const SocialAssetCheckSchema = z.strictObject({
  path: SocialAssetPathSchema,
  /** The URL that was (or would have been) checked; null when no URL could be built at all. */
  url: z.string().max(800).regex(/^https:\/\//u).nullable(),
  /** The commit a jsDelivr URL is pinned to; null for the site base and for an uncommitted frame. */
  commit: CommitSchema.nullable(),
  recordedSha256: Sha256Schema.nullable(),
  outcome: z.enum(SOCIAL_ASSET_OUTCOMES),
  detail: z.string().trim().min(1).max(300).nullable()
});
export type SocialAssetCheck = z.infer<typeof SocialAssetCheckSchema>;

/**
 * `social-asset-hold/1`: the publisher's record that an item's images were not safe to hand over.
 *
 * Written by the social runner alone, one file per queue item, replaced by the next check and
 * removed once the item's images pass. The queue item itself is left exactly as it was, so a hold
 * never counts as a send, a failure or an ambiguous delivery.
 */
export const SocialAssetHoldSchema = z.strictObject({
  schemaVersion: z.literal("social-asset-hold/1"),
  queueItemId: z.string().trim().min(1).max(160),
  sourceVentureId: VentureIdSchema,
  channel: z.enum(["instagram", "threads", "linkedin"]),
  /** Null when `SOCIAL_ASSET_BASE` named something that is not a base. */
  base: SocialAssetBaseSchema.nullable(),
  reason: z.enum(SOCIAL_ASSET_HOLD_REASONS),
  assets: z.array(SocialAssetCheckSchema).min(1).max(10),
  checkedAt: DateTimeSchema,
  publishingAuthorized: z.literal(false)
}).superRefine((hold, context) => {
  if (hold.assets.every((asset) => asset.outcome === "ready")) {
    context.addIssue({ code: "custom", message: "A hold names at least one asset that is not ready", path: ["assets"] });
  }
});
export type SocialAssetHold = z.infer<typeof SocialAssetHoldSchema>;

/** A committed frame the retention step removed, with the hash that proves which bytes they were. */
const RetainedFileSchema = z.strictObject({
  path: z.string().max(300).regex(/^site\/public\/social\/[a-zA-Z0-9/._-]+$/u),
  dated: DateSchema,
  sha256: Sha256Schema,
  bytes: z.number().int().nonnegative()
});

/**
 * `social-asset-retention/1`: what the daily retention step removed from `site/public/social/`.
 *
 * A file is dated by the first `YYYY-MM-DD` segment of its path and removed once that date falls
 * before `keepFrom`, which is `retentionDays` before `date`. The packages and asset records keep the
 * hash of every frame an item named; this record keeps the hashes of what was
 * pruned, so a removal is evidence rather than a silent disappearance. A file the step does not
 * manage (no date segment, a name outside the safe set, or a link) is never removed; it is named.
 */
export const SocialAssetRetentionSchema = z.strictObject({
  schemaVersion: z.literal("social-asset-retention/1"),
  date: DateSchema,
  retentionDays: z.number().int().positive().max(3_650),
  /** The oldest date kept: a file dated before it is removed. */
  keepFrom: DateSchema,
  removed: z.array(RetainedFileSchema).max(20_000),
  keptCount: z.number().int().nonnegative(),
  unmanagedPaths: z.array(z.string().max(300)).max(200),
  unmanagedCount: z.number().int().nonnegative()
}).superRefine((record, context) => {
  if (record.keepFrom >= record.date) {
    context.addIssue({ code: "custom", message: "keepFrom lies before the day the step ran", path: ["keepFrom"] });
  }
  if (record.removed.some((file) => file.dated >= record.keepFrom)) {
    context.addIssue({ code: "custom", message: "A removed file must be dated before keepFrom", path: ["removed"] });
  }
  if (record.unmanagedPaths.length > record.unmanagedCount) {
    context.addIssue({ code: "custom", message: "unmanagedCount counts every unmanaged path", path: ["unmanagedCount"] });
  }
});
export type SocialAssetRetention = z.infer<typeof SocialAssetRetentionSchema>;
