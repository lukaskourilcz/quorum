import { z } from "zod";
import { DateTimeSchema, VentureIdSchema, openObject } from "./common.js";

export const RatingValueSchema = z.enum(["perfect", "good", "bad"]);
/**
 * `niche-proposal` left with the Magazine Incubator: its only producer was
 * `applyNicheProposalRating`, deleted with the venture, and no committed rating ever carried the
 * kind. `template` stays — Carousel Studio rates its deck templates through it.
 */
export const RatingObjectKindSchema = z.enum([
  "idea",
  "plan",
  "visual",
  "slate",
  "article",
  "social-variant",
  "template"
]);

export const RatingRecordSchema = openObject({
  schemaVersion: z.literal("rating/1"),
  id: z.string().regex(/^r-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}$/),
  ventureId: VentureIdSchema,
  objectKind: RatingObjectKindSchema,
  objectRef: openObject({
    id: z.string().trim().min(1).max(160),
    contentHash: z.string().regex(/^sha256:[a-f0-9]{12}$/)
  }),
  rating: RatingValueSchema,
  note: z.string().trim().max(500).optional(),
  ratedAt: DateTimeSchema
});

export type RatingRecord = z.infer<typeof RatingRecordSchema>;
