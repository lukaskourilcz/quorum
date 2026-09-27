import { z } from "zod";
export const ReferenceAccountSchema = z.enum(["evolving.ai", "activeprogrammer"]);
export const SocialReferenceMonitorSchema = z.strictObject({
  schemaVersion: z.literal("social-reference-monitor/1"),
  sampledAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  posts: z.array(z.strictObject({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/u),
    account: ReferenceAccountSchema,
    url: z.string().regex(/^https:\/\/www\.instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]+\/$/u),
    postedAt: z.string().datetime(),
    slideCount: z.number().int().min(1).max(20),
    captionWords: z.number().int().min(0).max(2000),
    questionHook: z.boolean()
  })).max(80),
  newPostIds: z.array(z.string().max(120)).max(8),
  publishingAuthorized: z.literal(false)
});
export const SocialReferenceQuotaSchema = z.strictObject({
  schemaVersion: z.literal("social-reference-quota/1"),
  month: z.string().regex(/^\d{4}-\d{2}$/u),
  reservedUsd: z.number().min(0).max(5.03),
  attemptedAt: z.string().datetime(),
  pending: z.boolean(),
  status: z.enum(["reserved", "complete", "failed"])
});
