import { z } from "zod";
import {
  ContractAgentIdSchema,
  DateSchema,
  VentureIdSchema,
  openObject
} from "./common.js";

function wordCount(value: unknown): number {
  return JSON.stringify(value).trim().split(/\s+/u).filter(Boolean).length;
}

export const CampaignBriefSchema = openObject({
  schemaVersion: z.literal("campaign-brief/1"),
  ventureId: VentureIdSchema,
  briefId: z.string().regex(/^brief-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  author: z.literal("ANGLE"),
  positioningLine: z.string().trim().min(1).max(300),
  doThis: z.array(z.string().trim().min(1).max(240)).min(1),
  notThis: z.array(openObject({
    instruction: z.string().trim().min(1).max(240),
    ratingRefs: z.array(z.string().regex(/^r-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}$/))
  })),
  deliverables: z.array(openObject({
    agent: ContractAgentIdSchema,
    artifact: z.string().trim().min(1).max(160)
  })).min(1),
  activeFrom: DateSchema,
  activeUntil: DateSchema
}).superRefine((brief, context) => {
  if (brief.activeFrom > brief.activeUntil) {
    context.addIssue({
      code: "custom",
      message: "activeFrom must be on or before activeUntil",
      path: ["activeUntil"]
    });
  }
  if (wordCount(brief) > 400) {
    context.addIssue({
      code: "custom",
      message: "CampaignBrief must stay within 400 words",
      path: []
    });
  }
});

export type CampaignBrief = z.infer<typeof CampaignBriefSchema>;
