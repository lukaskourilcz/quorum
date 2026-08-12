import { z } from "zod";
import { DateSchema, DateTimeSchema, MeetingRefSchema } from "./common.js";

const BookIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const BriefLineSchema = z.string().trim().min(8).max(500);

export const BhResearchBriefEntrySchema = z.strictObject({
  bookId: BookIdSchema,
  bookRef: MeetingRefSchema,
  shortlistRank: z.number().int().min(1).max(10),
  selectionReason: z.string().trim().min(8).max(500),
  objective: z.string().trim().min(20).max(800),
  investigateSpecifically: z.array(BriefLineSchema).min(2).max(8),
  lookFor: z.array(BriefLineSchema).min(2).max(8),
  avoid: z.array(BriefLineSchema).min(2).max(8),
  angleHistoryRefs: z.array(MeetingRefSchema).max(20),
  briefHash: z.string().regex(/^[a-f0-9]{64}$/)
});

export const BhResearchBriefBundleSchema = z.strictObject({
  schemaVersion: z.literal("bh-research-brief/1"),
  date: DateSchema,
  cycleId: z.string().min(1).max(120),
  shortlistRef: MeetingRefSchema,
  requestingMeetingRef: MeetingRefSchema,
  monthlyResearchHeadroomUsd: z.number().min(0).max(5),
  thirdCandidateReserveUsd: z.number().positive().max(0.5),
  maximumCandidates: z.union([z.literal(2), z.literal(3)]),
  briefs: z.array(BhResearchBriefEntrySchema).min(2).max(3),
  generatedAt: DateTimeSchema
}).superRefine((bundle, context) => {
  if (bundle.briefs.length > bundle.maximumCandidates) {
    context.addIssue({ code: "custom", message: "Brief count exceeds the recorded candidate maximum", path: ["briefs"] });
  }
  const hasThirdHeadroom = bundle.monthlyResearchHeadroomUsd >= bundle.thirdCandidateReserveUsd;
  if ((bundle.maximumCandidates === 3) !== hasThirdHeadroom) {
    context.addIssue({
      code: "custom",
      message: "A third candidate is available exactly when its monthly reserve is recorded",
      path: ["maximumCandidates"]
    });
  }
  for (const field of ["bookId", "bookRef", "briefHash"] as const) {
    const values = bundle.briefs.map((brief) => brief[field]);
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: `Research brief ${field} values must be unique`, path: ["briefs"] });
    }
  }
});

export type BhResearchBriefEntry = z.infer<typeof BhResearchBriefEntrySchema>;
export type BhResearchBriefBundle = z.infer<typeof BhResearchBriefBundleSchema>;
