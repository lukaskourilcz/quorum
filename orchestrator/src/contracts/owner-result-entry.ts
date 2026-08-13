import { z } from "zod";
import { DateTimeSchema, HttpsUrlSchema } from "./common.js";
import { RecommendationPlatformSchema } from "./venture-recommendation.js";
import { KvorumOwnerResultEntrySchema } from "./kvorum-owner-result-entry.js";

const CountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();

export const BooksofHistoryOwnerResultMetricsSchema = z.strictObject({
  views: CountSchema,
  likes: CountSchema,
  comments: CountSchema,
  shares: CountSchema,
  saves: CountSchema,
  follows: CountSchema,
  linkTaps: CountSchema
}).refine((metrics) => Object.values(metrics).some((value) => value !== null), {
  message: "An owner result requires at least one entered platform metric"
});

/** Shared, manual-only per-post measurement for venture recommendation lanes. */
export const BooksofHistoryOwnerResultEntrySchema = z.strictObject({
  schemaVersion: z.literal("owner-result-entry/1"),
  resultId: z.string().regex(/^result-[a-f0-9]{20}$/),
  ventureId: z.literal("booksofhistory"),
  recommendationId: z.string().regex(/^rec-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),
  locale: z.enum(["cs", "en"]),
  platform: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  postUrl: HttpsUrlSchema,
  capturedAt: DateTimeSchema,
  recordedAt: DateTimeSchema,
  enteredBy: z.literal("owner"),
  metrics: BooksofHistoryOwnerResultMetricsSchema,
  note: z.string().trim().min(1).max(500).nullable()
}).superRefine((entry, context) => {
  if (Date.parse(entry.capturedAt) > Date.parse(entry.recordedAt)) {
    context.addIssue({ code: "custom", message: "A result cannot be recorded before its metrics were captured", path: ["capturedAt"] });
  }
});

export type BooksofHistoryOwnerResultMetrics = z.infer<typeof BooksofHistoryOwnerResultMetricsSchema>;
export type BooksofHistoryOwnerResultEntry = z.infer<typeof BooksofHistoryOwnerResultEntrySchema>;

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const MetricSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const OwnerResultMetricsSchema = z.strictObject({
  views: MetricSchema.optional(),
  likes: MetricSchema.optional(),
  comments: MetricSchema.optional(),
  shares: MetricSchema.optional(),
  saves: MetricSchema.optional(),
  follows: MetricSchema.optional(),
  linkTaps: MetricSchema.optional()
}).refine((metrics) => Object.keys(metrics).length > 0, "At least one owner-entered metric is required");

/** Manual operational evidence only. No analytics client may produce this record. */
export const OwnerResultEntrySchema = z.strictObject({
  schemaVersion: z.literal("owner-result-entry/1"),
  id: SlugSchema,
  ventureId: z.literal("door-money"),
  recommendationId: SlugSchema,
  platform: RecommendationPlatformSchema,
  postUrl: HttpsUrlSchema.max(2_000),
  metrics: OwnerResultMetricsSchema,
  outcome: z.string().trim().min(1).max(1_000),
  source: z.literal("owner-entry"),
  capturedAt: DateTimeSchema
});

export type OwnerResultEntry = z.infer<typeof OwnerResultEntrySchema>;
export type OwnerResultMetrics = z.infer<typeof OwnerResultMetricsSchema>;

export const TehdejsiOwnerResultMetricsSchema = z.strictObject({
  sends: CountSchema,
  saves: CountSchema,
  views: CountSchema,
  likes: CountSchema,
  comments: CountSchema,
  shares: CountSchema,
  follows: CountSchema,
  linkTaps: CountSchema
}).refine((metrics) => Object.values(metrics).some((value) => value !== null), {
  message: "A Tehdejsi svet result requires at least one owner-entered metric"
});

/** Manual per-platform result for the bilingual Tehdejsi svet lane. */
export const TehdejsiOwnerResultEntrySchema = z.strictObject({
  schemaVersion: z.literal("owner-result-entry/1"),
  resultId: z.string().regex(/^result-[a-f0-9]{20}$/),
  ventureId: z.literal("tehdejsi-svet"),
  recommendationId: SlugSchema,
  locale: z.enum(["cs", "ua"]),
  platform: z.enum(["instagram", "facebook", "threads"]),
  postUrl: HttpsUrlSchema.max(2_000),
  capturedAt: DateTimeSchema,
  recordedAt: DateTimeSchema,
  enteredBy: z.literal("owner"),
  metrics: TehdejsiOwnerResultMetricsSchema,
  note: z.string().trim().min(1).max(500).nullable()
}).superRefine((entry, context) => {
  if (Date.parse(entry.capturedAt) > Date.parse(entry.recordedAt)) {
    context.addIssue({ code: "custom", message: "A result cannot be recorded before capture", path: ["capturedAt"] });
  }
});

export type TehdejsiOwnerResultEntry = z.infer<typeof TehdejsiOwnerResultEntrySchema>;
export type TehdejsiOwnerResultMetrics = z.infer<typeof TehdejsiOwnerResultMetricsSchema>;

/** Published shared boundary; venture code imports its narrower schema above. */
export const AnyOwnerResultEntrySchema = z.union([
  BooksofHistoryOwnerResultEntrySchema,
  OwnerResultEntrySchema,
  TehdejsiOwnerResultEntrySchema,
  KvorumOwnerResultEntrySchema
]);
export type AnyOwnerResultEntry = z.infer<typeof AnyOwnerResultEntrySchema>;
