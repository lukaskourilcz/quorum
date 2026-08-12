import { z } from "zod";
import { BhLanguageFeatureSchema } from "./bh-feature.js";
import { DateTimeSchema, HttpsUrlSchema, MeetingRefSchema, VentureIdSchema } from "./common.js";

const ClaimRefSchema = z.string().regex(/^claim-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);

export const DossierStoryEvidenceSchema = z.strictObject({
  kind: z.literal("dossier-story"),
  dossierRef: MeetingRefSchema,
  storyRef: MeetingRefSchema,
  claimRefs: z.array(ClaimRefSchema).min(1).max(30)
});

export const VentureRecommendationEvidenceSchema = z.discriminatedUnion("kind", [
  DossierStoryEvidenceSchema
]);

const GateResultSchema = z.strictObject({
  passed: z.boolean(),
  violations: z.array(z.strictObject({
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(500)
  })).max(100)
}).superRefine((gate, context) => {
  if (gate.passed === (gate.violations.length > 0)) {
    context.addIssue({ code: "custom", message: "A passed gate has no violations; a failed gate has at least one" });
  }
});

export const VentureRecommendationSchema = z.strictObject({
  schemaVersion: z.literal("venture-recommendation/1"),
  recommendationId: z.string().regex(/^rec-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),
  ventureId: VentureIdSchema,
  cycleId: z.string().min(1).max(120),
  status: z.enum(["draft", "approved", "posted", "archived", "rejected"]),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  evidence: VentureRecommendationEvidenceSchema,
  payloads: z.strictObject({
    cs: BhLanguageFeatureSchema.refine(({ locale }) => locale === "cs", "Czech payload requires locale cs"),
    en: BhLanguageFeatureSchema.refine(({ locale }) => locale === "en", "English payload requires locale en")
  }),
  gateResults: z.strictObject({ cs: GateResultSchema, en: GateResultSchema }),
  designLab: z.strictObject({
    status: z.enum(["pending", "ready", "rendered"]),
    summaryRefs: z.strictObject({ cs: MeetingRefSchema, en: MeetingRefSchema }).nullable()
  }),
  owner: z.strictObject({
    postedUrls: z.strictObject({ cs: HttpsUrlSchema.nullable(), en: HttpsUrlSchema.nullable() }),
    resultRefs: z.strictObject({
      cs: z.array(MeetingRefSchema).max(100),
      en: z.array(MeetingRefSchema).max(100)
    }),
    editHistory: z.array(z.strictObject({
      at: DateTimeSchema,
      action: z.enum(["edit", "approve", "reject", "post", "result", "archive"]),
      locale: z.enum(["cs", "en"]).nullable(),
      reason: z.string().trim().min(1).max(500).nullable()
    })).max(500)
  })
}).superRefine((record, context) => {
  const posted = Object.values(record.owner.postedUrls);
  if (record.status === "posted" && posted.some((url) => url === null)) {
    context.addIssue({ code: "custom", message: "Posted recommendations require both owner-posted lane URLs", path: ["owner", "postedUrls"] });
  }
  if ((record.status === "draft" || record.status === "rejected") && posted.some((url) => url !== null)) {
    context.addIssue({ code: "custom", message: "Unapproved recommendations cannot carry posted URLs", path: ["owner", "postedUrls"] });
  }
  if (record.status === "draft" && (!record.gateResults.cs.passed || !record.gateResults.en.passed)) {
    context.addIssue({ code: "custom", message: "A draft recommendation requires both language gates", path: ["gateResults"] });
  }
  if ((record.status === "approved" || record.status === "posted") && record.designLab.status === "pending") {
    context.addIssue({ code: "custom", message: "Approved recommendations require both Design Lab summary refs", path: ["designLab"] });
  }
});

export type VentureRecommendation = z.infer<typeof VentureRecommendationSchema>;
