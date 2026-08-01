import { z } from "zod";
import { DateSchema, DateTimeSchema, HttpsUrlSchema, Sha256Schema, openObject } from "./common.js";
import { EdgeReportSchema, EventCardSchema, FighterRecordSchema, ModelRunSchema, OddsSnapshotSchema, SlipOfTenSchema, TrackRecordSchema } from "./mma.js";
import { ArticleImageSchema } from "./autonomy.js";

export const ArticleFormatSchema = z.enum([
  "fight-week-preview", "post-event-recap", "fighter-profile",
  "data-story", "weigh-in-report", "desk-notes"
]);

const LocalizationSchema = openObject({
  title: z.string().trim().min(1).max(160),
  dek: z.string().trim().min(1).max(320),
  bodyMDX: z.string().trim().min(1).max(40_000)
});

const ArticleSourceSchema = z.discriminatedUnion("kind", [
  openObject({ kind: z.literal("internal"), ref: z.string().trim().min(1).max(240) }),
  openObject({ kind: z.literal("external"), url: HttpsUrlSchema, retrievedAt: DateTimeSchema })
]);

const FrameSpecSchema = openObject({
  template: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  bindings: z.record(z.string().min(1).max(80), z.union([z.string().max(1_000), z.number().finite(), z.boolean()]))
});

export const ArticlePackageSchema = openObject({
  schemaVersion: z.literal("article/1"),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  localizations: openObject({ en: LocalizationSchema, cs: LocalizationSchema }),
  format: ArticleFormatSchema,
  sources: z.array(ArticleSourceSchema).min(1),
  image: ArticleImageSchema,
  heroSpec: FrameSpecSchema,
  fighterRefs: z.array(z.string().regex(/^(ufc|oktagon):[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  eventRef: z.string().regex(/^(ufc|oktagon):event:[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  modelVersion: z.string().regex(/^mma-\d+\.\d+\.\d+\+[a-f0-9]{8}$/).optional(),
  publishAt: DateTimeSchema,
  slot: z.enum(["am", "pm"]),
  status: z.enum(["draft", "blocked", "published", "killed"]),
  packageHash: Sha256Schema
});

const SocialVariantSchema = openObject({
  id: z.enum(["A", "B"]),
  carouselSpec: FrameSpecSchema,
  captions: openObject({ en: z.string().trim().min(1).max(2_200), cs: z.string().trim().min(1).max(2_200) }),
  designAxes: openObject({
    templateFamily: z.string().trim().min(1).max(80),
    colorScheme: z.string().trim().min(1).max(80),
    headlineFraming: z.string().trim().min(1).max(120),
    captionTone: z.string().trim().min(1).max(120)
  })
});

export const SocialVariantPackSchema = openObject({
  schemaVersion: z.literal("social-variant/1"),
  articleRef: z.string().trim().min(1).max(240),
  variants: z.tuple([SocialVariantSchema, SocialVariantSchema]),
  assignmentProtocolRef: z.string().trim().min(1).max(240),
  status: z.enum(["draft", "queued", "archived"])
}).superRefine((pack, context) => {
  if (pack.variants[0].id !== "A" || pack.variants[1].id !== "B") context.addIssue({ code: "custom", message: "Social variants must be ordered A then B", path: ["variants"] });
});

export const MetricsCaptureSchema = openObject({
  schemaVersion: z.literal("metrics-capture/1"),
  postRef: z.string().trim().min(1).max(240),
  window: z.enum(["48h", "7d"]),
  metrics: openObject({
    views: z.number().int().nonnegative(), likes: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(), shares: z.number().int().nonnegative(),
    saves: z.number().int().nonnegative().optional(), clicks: z.number().int().nonnegative().optional(),
    follows: z.number().int().nonnegative().optional()
  }),
  source: z.literal("owner-entry"),
  capturedAt: DateTimeSchema
});

export const DesignFindingSchema = openObject({
  schemaVersion: z.literal("design-finding/1"),
  axis: z.enum(["template-family", "color-scheme", "headline-framing", "caption-tone"]),
  direction: z.string().trim().min(1).max(240),
  evidencePostRefs: z.array(z.string().trim().min(1).max(240)).min(1),
  sampleSize: z.number().int().nonnegative(),
  status: z.enum(["directional", "confirmed"]),
  proposedWeightChange: z.number().finite().min(-0.1).max(0.1).optional(),
  tasteConflict: openObject({ flag: z.literal(true), palateRef: z.string().trim().min(1).max(240) }).optional()
}).superRefine((finding, context) => {
  if (finding.status === "confirmed" && finding.sampleSize < 8) context.addIssue({ code: "custom", message: "Confirmed findings need at least eight posts per variant family", path: ["sampleSize"] });
  if (finding.sampleSize > finding.evidencePostRefs.length) context.addIssue({ code: "custom", message: "Sample size cannot exceed named evidence posts", path: ["sampleSize"] });
});

const SlateSlotSchema = openObject({
  slot: z.enum(["am", "pm"]),
  format: ArticleFormatSchema,
  subjectRefs: z.array(z.string().trim().min(1).max(240)).min(1),
  rationale: z.string().trim().min(1).max(240).refine((value) => value.split(/\s+/u).length <= 30, "Rationale must be 30 words or fewer"),
  assignedWriter: z.enum(["JAB", "QUILL"]),
  status: z.enum(["assigned", "killed"]),
  killedReason: z.string().trim().min(1).max(240).optional()
}).superRefine((slot, context) => {
  if (slot.status === "killed" && !slot.killedReason) context.addIssue({ code: "custom", message: "Killed slots need a reason", path: ["killedReason"] });
  if (slot.status === "assigned" && slot.killedReason) context.addIssue({ code: "custom", message: "Assigned slots cannot carry a killed reason", path: ["killedReason"] });
});

export const EditorialSlateSchema = openObject({
  schemaVersion: z.literal("editorial-slate/1"),
  date: DateSchema,
  slots: z.tuple([SlateSlotSchema, SlateSlotSchema]),
  vaultVerdicts: z.array(openObject({
    subjectRef: z.string().trim().min(1).max(240),
    verdict: z.enum(["fresh", "repeat"]),
    evidenceRef: z.string().trim().min(1).max(240)
  })).min(2)
}).superRefine((slate, context) => {
  if (slate.slots[0].slot !== "am" || slate.slots[1].slot !== "pm") context.addIssue({ code: "custom", message: "Editorial slots must be ordered am then pm", path: ["slots"] });
  const verdicts = new Map(slate.vaultVerdicts.map((verdict) => [verdict.subjectRef, verdict.verdict]));
  for (const [index, slot] of slate.slots.entries()) for (const subject of slot.subjectRefs) {
    if (!verdicts.has(subject)) context.addIssue({ code: "custom", message: "Every subject needs a VAULT verdict", path: ["slots", index, "subjectRefs"] });
    if (slot.status === "assigned" && verdicts.get(subject) === "repeat") context.addIssue({ code: "custom", message: "A repeated subject cannot be assigned", path: ["slots", index, "subjectRefs"] });
  }
});

export const FightAiQDeliverySchema = openObject({
  schemaVersion: z.literal("fightaiq-delivery/1"),
  generatedAt: DateTimeSchema,
  fighters: z.array(FighterRecordSchema),
  events: z.array(EventCardSchema),
  odds: z.array(OddsSnapshotSchema),
  modelRuns: z.array(ModelRunSchema),
  edgeReports: z.array(EdgeReportSchema),
  slips: z.array(SlipOfTenSchema),
  trackRecord: TrackRecordSchema.nullable(),
  packageHash: Sha256Schema
});

export type ArticlePackage = z.infer<typeof ArticlePackageSchema>;
export type SocialVariantPack = z.infer<typeof SocialVariantPackSchema>;
export type MetricsCapture = z.infer<typeof MetricsCaptureSchema>;
export type DesignFinding = z.infer<typeof DesignFindingSchema>;
export type EditorialSlate = z.infer<typeof EditorialSlateSchema>;
export type FightAiQDelivery = z.infer<typeof FightAiQDeliverySchema>;
