import { z } from "zod";
import { DateTimeSchema, HttpsUrlSchema, VentureIdSchema } from "./common.js";

const CountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();

export const OwnerResultMetricsSchema = z.strictObject({
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
export const OwnerResultEntrySchema = z.strictObject({
  schemaVersion: z.literal("owner-result-entry/1"),
  resultId: z.string().regex(/^result-[a-f0-9]{20}$/),
  ventureId: VentureIdSchema,
  recommendationId: z.string().regex(/^rec-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),
  locale: z.enum(["cs", "en"]),
  platform: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  postUrl: HttpsUrlSchema,
  capturedAt: DateTimeSchema,
  recordedAt: DateTimeSchema,
  enteredBy: z.literal("owner"),
  metrics: OwnerResultMetricsSchema,
  note: z.string().trim().min(1).max(500).nullable()
}).superRefine((entry, context) => {
  if (Date.parse(entry.capturedAt) > Date.parse(entry.recordedAt)) {
    context.addIssue({ code: "custom", message: "A result cannot be recorded before its metrics were captured", path: ["capturedAt"] });
  }
});

export type OwnerResultMetrics = z.infer<typeof OwnerResultMetricsSchema>;
export type OwnerResultEntry = z.infer<typeof OwnerResultEntrySchema>;
