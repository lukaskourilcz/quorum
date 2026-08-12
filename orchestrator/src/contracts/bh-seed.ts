import { z } from "zod";
import { DateSchema, HttpsUrlSchema } from "./common.js";

const SeedSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);

/** Subjective routing signals are estimates, never verified facts. */
export const BhSeedPriorSchema = z.strictObject({
  kind: z.literal("prior"),
  score: z.number().int().min(0).max(100)
});

export const BhSeedAuthorDatesSchema = z.strictObject({
  born: DateSchema.optional(),
  died: DateSchema.optional()
}).superRefine((dates, context) => {
  if (dates.born === undefined && dates.died === undefined) {
    context.addIssue({ code: "custom", message: "At least one known author date is required" });
  }
  if (dates.born !== undefined && dates.died !== undefined && dates.died < dates.born) {
    context.addIssue({ code: "custom", message: "An author's death cannot predate their birth", path: ["died"] });
  }
});

export const BhSeedCoverRefSchema = z.strictObject({
  url: HttpsUrlSchema,
  visibility: z.literal("admin-only")
});

export const BhSeedScoringMetadataSchema = z.strictObject({
  version: z.literal("bh-seed-score/1"),
  scale: z.literal("0-100"),
  scoredOn: DateSchema,
  period: z.enum(["pre-17th", "17th", "18th", "19th", "20th", "21st"]),
  geographies: z.array(SeedSlugSchema).min(1).max(8),
  angleTypes: z.array(SeedSlugSchema).min(1).max(12)
});

export const BhSeedRecordSchema = z.strictObject({
  bookId: SeedSlugSchema,
  title: z.string().trim().min(1).max(240),
  originalTitle: z.string().trim().min(1).max(240).optional(),
  author: z.string().trim().min(1).max(160),
  authorDates: BhSeedAuthorDatesSchema.optional(),
  year: z.number().int().min(1).max(2100),
  originalLanguage: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/).max(16),
  genres: z.array(SeedSlugSchema).min(1).max(12),
  czechRelevance: BhSeedPriorSchema,
  internationalRelevance: BhSeedPriorSchema,
  recognition: BhSeedPriorSchema,
  significance: BhSeedPriorSchema,
  storytellingPotential: BhSeedPriorSchema,
  audienceFamiliarity: z.strictObject({
    cs: BhSeedPriorSchema,
    en: BhSeedPriorSchema
  }),
  contentCategories: z.array(SeedSlugSchema).min(1).max(16),
  coverRef: BhSeedCoverRefSchema.optional(),
  provenance: z.string().regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:\d{4}-\d{2}-\d{2}$/).max(120),
  scoringMetadata: BhSeedScoringMetadataSchema
}).superRefine((record, context) => {
  for (const [path, values] of [
    ["genres", record.genres],
    ["contentCategories", record.contentCategories],
    ["scoringMetadata.geographies", record.scoringMetadata.geographies],
    ["scoringMetadata.angleTypes", record.scoringMetadata.angleTypes]
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: `${path} must contain unique values`, path: path.split(".") });
    }
  }
});

export const BhSeedLibrarySchema = z.strictObject({
  schemaVersion: z.literal("bh-seed/1"),
  books: z.array(BhSeedRecordSchema).min(1).max(1_000)
}).superRefine((library, context) => {
  const ids = library.books.map(({ bookId }) => bookId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Seed book ids must be unique", path: ["books"] });
  }
});

export type BhSeedRecord = z.infer<typeof BhSeedRecordSchema>;
export type BhSeedLibrary = z.infer<typeof BhSeedLibrarySchema>;
