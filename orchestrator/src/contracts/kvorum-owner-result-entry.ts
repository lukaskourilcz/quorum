import { z } from "zod";
import { DateTimeSchema, HttpsUrlSchema, VentureIdSchema } from "./common.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const RecommendationRefSchema = z.string()
  .regex(/^state\/ventures\/[a-z0-9]+(?:-[a-z0-9]+)*\/recommendations\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/)
  .max(240);
const MetricSchema = z.number().int().nonnegative().nullable();

export const KvorumOwnerResultMetricsSchema = z.strictObject({
  impressions: MetricSchema,
  reach: MetricSchema,
  saves: MetricSchema,
  shares: MetricSchema,
  comments: MetricSchema,
  follows: MetricSchema
}).superRefine((metrics, context) => {
  if (Object.values(metrics).every((value) => value === null)) {
    context.addIssue({ code: "custom", message: "An owner result requires at least one entered number" });
  }
});

export const KvorumOwnerResultEntrySchema = z.strictObject({
  schemaVersion: z.literal("owner-result-entry/1"),
  id: SlugSchema,
  ventureId: VentureIdSchema,
  recommendationId: SlugSchema,
  recommendationRef: RecommendationRefSchema,
  platform: SlugSchema,
  postUrl: HttpsUrlSchema,
  postedAt: DateTimeSchema,
  capturedAt: DateTimeSchema,
  enteredAt: DateTimeSchema,
  enteredBy: z.literal("owner"),
  metrics: KvorumOwnerResultMetricsSchema,
  note: z.string().trim().min(1).max(800).nullable()
}).superRefine((entry, context) => {
  if (!entry.recommendationRef.startsWith(`state/ventures/${entry.ventureId}/recommendations/`)) {
    context.addIssue({
      code: "custom",
      message: "Recommendation ref must belong to the result venture",
      path: ["recommendationRef"]
    });
  }
  if (Date.parse(entry.capturedAt) < Date.parse(entry.postedAt)) {
    context.addIssue({ code: "custom", message: "A result cannot predate the manual post", path: ["capturedAt"] });
  }
  if (Date.parse(entry.enteredAt) < Date.parse(entry.capturedAt)) {
    context.addIssue({ code: "custom", message: "Entry time cannot precede capture time", path: ["enteredAt"] });
  }
});

export type KvorumOwnerResultEntry = z.infer<typeof KvorumOwnerResultEntrySchema>;
export type KvorumOwnerResultMetrics = z.infer<typeof KvorumOwnerResultMetricsSchema>;

