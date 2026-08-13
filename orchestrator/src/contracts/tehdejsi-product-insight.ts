import { z } from "zod";
import { DateTimeSchema } from "./common.js";

export const TehdejsiProductInsightStatusSchema = z.enum(["proposed", "accepted", "rejected", "done"]);

export const TehdejsiProductInsightEvidenceSchema = z.strictObject({
  filePath: z.string().regex(/^src\/[a-zA-Z0-9._/-]+$/).max(240)
    .refine((value) => !value.includes(".."), "Product evidence path cannot traverse"),
  detail: z.string().trim().min(1).max(500)
});

/** A recommendation for the owner. This record grants no product-repository write capability. */
export const TehdejsiProductInsightSchema = z.strictObject({
  schemaVersion: z.literal("ts-product-insight/1"),
  id: z.string().regex(/^ts-insight-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  ventureId: z.literal("tehdejsi-svet"),
  title: z.string().trim().min(1).max(160),
  finding: z.string().trim().min(1).max(1_000),
  evidence: z.array(TehdejsiProductInsightEvidenceSchema).min(1).max(8),
  proposedAction: z.string().trim().min(1).max(1_000),
  status: TehdejsiProductInsightStatusSchema,
  ownerNote: z.string().trim().min(1).max(500).nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema
}).superRefine((insight, context) => {
  if (Date.parse(insight.updatedAt) < Date.parse(insight.createdAt)) {
    context.addIssue({ code: "custom", message: "Insight update precedes creation", path: ["updatedAt"] });
  }
  if (new Set(insight.evidence.map(({ filePath }) => filePath)).size !== insight.evidence.length) {
    context.addIssue({ code: "custom", message: "Duplicate product evidence path", path: ["evidence"] });
  }
});

export type TehdejsiProductInsight = z.infer<typeof TehdejsiProductInsightSchema>;
export type TehdejsiProductInsightStatus = z.infer<typeof TehdejsiProductInsightStatusSchema>;
