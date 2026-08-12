import { z } from "zod";
import { DateTimeSchema, HttpsUrlSchema, VentureIdSchema } from "./common.js";
import { RecommendationPlatformSchema } from "./venture-recommendation.js";

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
  ventureId: VentureIdSchema,
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
