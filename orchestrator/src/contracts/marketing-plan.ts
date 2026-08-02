import { z } from "zod";
import { MeetingRefSchema, VentureIdSchema, openObject } from "./common.js";
import { LiveTemplateReferenceSchema } from "./carousel-template.js";

export const MarketingTacticSchema = openObject({
  type: z.enum(["guerrilla", "social", "content", "paid", "partnership"]),
  description: z.string().trim().min(1).max(800),
  assetsNeeded: z.array(z.string().trim().min(1).max(160)),
  estCostUsd: z.number().finite().nonnegative().optional(),
  estimate: z.literal(true).optional(),
  platformPolicyNote: z.string().trim().min(1).max(500),
  legalityNote: z.string().trim().min(1).max(500).optional()
}).superRefine((tactic, context) => {
  if (tactic.estCostUsd !== undefined && tactic.estimate !== true) {
    context.addIssue({
      code: "custom",
      message: "estCostUsd requires estimate: true",
      path: ["estimate"]
    });
  }
});

export const PostableCampaignAssetSchema = openObject({
  id: z.string().regex(/^asset-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  captions: openObject({
    instagram: openObject({ A: z.string().trim().min(1).max(2_200), B: z.string().trim().min(1).max(2_200) }),
    threads: openObject({ A: z.string().trim().min(1).max(500), B: z.string().trim().min(1).max(500) })
  }),
  visual: LiveTemplateReferenceSchema
});

export const MarketingPlanSchema = openObject({
  schemaVersion: z.literal("marketing-plan/1"),
  id: z.string().regex(/^plan-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  ventureId: VentureIdSchema,
  seasonId: z.string().regex(/^season-\d{3}$/).optional(),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(280),
  objective: z.string().trim().min(1).max(500),
  tactics: z.array(MarketingTacticSchema).min(1),
  calendar: z.array(openObject({
    week: z.number().int().positive(),
    focus: z.string().trim().min(1).max(240)
  })).min(1),
  audienceRefs: z.array(z.string().trim().min(1).max(160)),
  kpis: z.array(z.string().trim().min(1).max(240)).min(1),
  postable_assets: z.array(PostableCampaignAssetSchema).min(1).max(8),
  status: z.enum(["draft", "owner_rated", "approved", "archived"]),
  originMeetingRef: MeetingRefSchema
});

export type MarketingPlan = z.infer<typeof MarketingPlanSchema>;
