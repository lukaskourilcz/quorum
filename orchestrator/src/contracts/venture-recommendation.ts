import { z } from "zod";
import { BhLanguageFeatureSchema } from "./bh-feature.js";
import {
  BookChunkIdSchema,
  BookPassageScoresSchema
} from "./book-kb-index.js";
import {
  DateSchema,
  DateTimeSchema,
  HttpsUrlSchema,
  MeetingRefSchema
} from "./common.js";
import { TehdejsiRecommendationSchema } from "./tehdejsi-recommendation.js";
import { KvorumRecommendationSchema } from "./kvorum-recommendation.js";

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

const BhGateResultSchema = z.strictObject({
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

export const BooksofHistoryRecommendationSchema = z.strictObject({
  schemaVersion: z.literal("venture-recommendation/1"),
  recommendationId: z.string().regex(/^rec-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),
  ventureId: z.literal("booksofhistory"),
  cycleId: z.string().min(1).max(120),
  status: z.enum(["draft", "approved", "posted", "archived", "rejected"]),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  evidence: VentureRecommendationEvidenceSchema,
  payloads: z.strictObject({
    cs: BhLanguageFeatureSchema.refine(({ locale }) => locale === "cs", "Czech payload requires locale cs"),
    en: BhLanguageFeatureSchema.refine(({ locale }) => locale === "en", "English payload requires locale en")
  }),
  gateResults: z.strictObject({ cs: BhGateResultSchema, en: BhGateResultSchema }),
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

export type BooksofHistoryRecommendation = z.infer<typeof BooksofHistoryRecommendationSchema>;

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const FingerprintSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const StatePathSchema = z.string()
  .trim()
  .min(1)
  .max(400)
  .regex(/^state\/[a-zA-Z0-9._/-]+$/)
  .refine((value) => !value.includes(".."), "State paths cannot traverse directories");

export const RecommendationFormatSchema = z.enum([
  "carousel",
  "single-image",
  "thread",
  "caption",
  "short-video-script"
]);

export const RecommendationPlatformSchema = z.enum([
  "instagram",
  "tiktok",
  "x",
  "threads",
  "youtube"
]);

const ScoreAtSelectionSchema = z.strictObject({
  chunkId: BookChunkIdSchema,
  scores: BookPassageScoresSchema
});

export const BookPassageEvidenceSchema = z.strictObject({
  kind: z.literal("book-passage"),
  manuscriptHash: FingerprintSchema,
  chunkIds: z.array(BookChunkIdSchema).min(1).max(3),
  scoresAtSelection: z.array(ScoreAtSelectionSchema).min(1).max(3),
  excerptChunkId: BookChunkIdSchema,
  /** Exact owner-review context. The full passage remains private. */
  excerpt: z.string().trim().min(1).max(600),
  /** Credential-free pointer resolved by the private-store client, never a public source URL. */
  privateStoreLink: z.string().regex(
    /^private-book:\/\/sha256\/[a-f0-9]{64}\/chunks\/ch\d{2,}-s\d{2,}-c\d{3,}\.json$/
  )
}).superRefine((evidence, context) => {
  if (new Set(evidence.chunkIds).size !== evidence.chunkIds.length) {
    context.addIssue({ code: "custom", path: ["chunkIds"], message: "Evidence chunk ids must be unique" });
  }
  const scoredIds = evidence.scoresAtSelection.map(({ chunkId }) => chunkId);
  if (new Set(scoredIds).size !== scoredIds.length ||
      [...scoredIds].sort().join("\n") !== [...evidence.chunkIds].sort().join("\n")) {
    context.addIssue({
      code: "custom",
      path: ["scoresAtSelection"],
      message: "Selection scores must cover every evidence chunk exactly once"
    });
  }
  if (!evidence.chunkIds.includes(evidence.excerptChunkId)) {
    context.addIssue({
      code: "custom",
      path: ["excerptChunkId"],
      message: "The excerpt source must be one of the evidence chunks"
    });
  }
  const expectedLink = `private-book://sha256/${evidence.manuscriptHash.slice("sha256:".length)}/chunks/${evidence.excerptChunkId}.json`;
  if (evidence.privateStoreLink !== expectedLink) {
    context.addIssue({
      code: "custom",
      path: ["privateStoreLink"],
      message: "Private-store link must match the manuscript hash and excerpt chunk"
    });
  }
});

/** This discriminant is the shared extension point for sibling venture evidence kinds. */
export const RecommendationEvidenceSchema = z.discriminatedUnion("kind", [
  BookPassageEvidenceSchema
]);

const CopyBlockSchema = z.strictObject({
  kind: z.enum(["cover", "body", "outro", "thread-post", "caption", "script", "shot-list"]),
  ordinal: z.number().int().positive(),
  text: z.string().trim().min(1).max(4_000)
});

const RecommendationCtaSchema = z.strictObject({
  mode: z.enum(["soft-curiosity", "explicit-buy-book"]),
  text: z.string().trim().min(1).max(500).nullable()
}).superRefine((cta, context) => {
  if ((cta.mode === "explicit-buy-book") !== (cta.text !== null)) {
    context.addIssue({
      code: "custom",
      path: ["text"],
      message: "Only an explicit buy-the-book CTA carries separate CTA text"
    });
  }
});

const GateResultSchema = z.strictObject({
  gate: z.enum(["voice", "claims", "quotes", "excerpt-cap", "duplicate", "cta-frequency", "living-person"]),
  passed: z.boolean(),
  detail: z.string().trim().min(1).max(500)
});

const StatusSchema = z.enum(["draft", "approved", "posted", "archived", "rejected"]);
const StatusHistorySchema = z.strictObject({
  from: StatusSchema.nullable(),
  to: StatusSchema,
  at: DateTimeSchema,
  actor: z.enum(["system", "owner"]),
  reason: z.string().trim().min(1).max(500).nullable()
});

const OwnerFieldsSchema = z.strictObject({
  editedCopyBlocks: z.array(CopyBlockSchema).min(1).max(40).nullable(),
  approvalNote: z.string().trim().min(1).max(1_000).nullable(),
  rejectionReason: z.string().trim().min(1).max(1_000).nullable(),
  approvedAt: DateTimeSchema.nullable(),
  rejectedAt: DateTimeSchema.nullable(),
  postedAt: DateTimeSchema.nullable(),
  archivedAt: DateTimeSchema.nullable(),
  postedUrl: HttpsUrlSchema.nullable(),
  resultIds: z.array(SlugSchema).max(100),
  ratingRef: StatePathSchema.nullable()
});

const DesignLabSchema = z.strictObject({
  eligible: z.boolean(),
  summaryPath: StatePathSchema.nullable(),
  readyAt: DateTimeSchema.nullable()
});

const allowedTransitions = new Set([
  "null>draft",
  "draft>approved",
  "draft>rejected",
  "approved>posted",
  "posted>archived"
]);

export const VentureRecommendationSchema = z.strictObject({
  schemaVersion: z.literal("venture-recommendation/1"),
  id: SlugSchema,
  ventureId: z.literal("door-money"),
  date: DateSchema,
  status: StatusSchema,
  hook: z.string().trim().min(1).max(500),
  formats: z.array(RecommendationFormatSchema).min(1).max(3),
  platforms: z.array(RecommendationPlatformSchema).min(1).max(5),
  copyBlocks: z.array(CopyBlockSchema).min(1).max(40),
  rationale: z.string().trim().min(1).max(2_000),
  curiosityBridge: z.string().trim().min(1).max(1_000),
  cta: RecommendationCtaSchema,
  evidence: RecommendationEvidenceSchema,
  gateResults: z.array(GateResultSchema).min(1).max(20),
  designLab: DesignLabSchema,
  owner: OwnerFieldsSchema,
  statusHistory: z.array(StatusHistorySchema).min(1).max(20),
  generatedAt: DateTimeSchema,
  updatedAt: DateTimeSchema
}).superRefine((recommendation, context) => {
  for (const [field, values] of [
    ["formats", recommendation.formats],
    ["platforms", recommendation.platforms],
    ["gateResults", recommendation.gateResults.map(({ gate }) => gate)],
    ["owner.resultIds", recommendation.owner.resultIds]
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", path: field.split("."), message: `${field} values must be unique` });
    }
  }
  if (recommendation.gateResults.some(({ passed }) => !passed)) {
    context.addIssue({
      code: "custom",
      path: ["gateResults"],
      message: "Failed packages are dropped and cannot become recommendation records"
    });
  }
  const expectedDesignLabEligibility = recommendation.formats.some((format) =>
    format === "carousel" || format === "single-image");
  if (recommendation.designLab.eligible !== expectedDesignLabEligibility) {
    context.addIssue({
      code: "custom",
      path: ["designLab", "eligible"],
      message: "Only carousel and single-image recommendations enter Design Lab"
    });
  }

  const history = recommendation.statusHistory;
  history.forEach((entry, index) => {
    if (!allowedTransitions.has(`${entry.from ?? "null"}>${entry.to}`)) {
      context.addIssue({ code: "custom", path: ["statusHistory", index], message: "Unsupported status transition" });
    }
    if (index === 0 && (entry.from !== null || entry.to !== "draft" || entry.actor !== "system")) {
      context.addIssue({ code: "custom", path: ["statusHistory", index], message: "History must begin with system-created draft" });
    }
    if (index > 0 && entry.from !== history[index - 1]!.to) {
      context.addIssue({ code: "custom", path: ["statusHistory", index, "from"], message: "Status history must be contiguous" });
    }
  });
  if (history.at(-1)?.to !== recommendation.status) {
    context.addIssue({ code: "custom", path: ["status"], message: "Current status must match the final history entry" });
  }

  const owner = recommendation.owner;
  const hasDesignLabReceipt = recommendation.designLab.summaryPath !== null && recommendation.designLab.readyAt !== null;
  if (recommendation.status === "draft" &&
      [owner.approvedAt, owner.rejectedAt, owner.postedAt, owner.archivedAt, owner.postedUrl].some(Boolean)) {
    context.addIssue({ code: "custom", path: ["owner"], message: "A draft cannot carry a later owner decision" });
  }
  if (recommendation.status === "rejected" && (!owner.rejectedAt || !owner.rejectionReason || owner.approvedAt)) {
    context.addIssue({ code: "custom", path: ["owner"], message: "A rejection requires its time and reason, without approval" });
  }
  if (["approved", "posted", "archived"].includes(recommendation.status) && !owner.approvedAt) {
    context.addIssue({ code: "custom", path: ["owner", "approvedAt"], message: "Approved status lineage requires approvedAt" });
  }
  if (["posted", "archived"].includes(recommendation.status) &&
      (!owner.postedAt || !owner.postedUrl)) {
    context.addIssue({ code: "custom", path: ["owner", "postedAt"], message: "Posted status lineage requires a time and HTTPS URL" });
  }
  if (recommendation.status === "archived" && !owner.archivedAt) {
    context.addIssue({ code: "custom", path: ["owner", "archivedAt"], message: "Archived status requires archivedAt" });
  }
  if (recommendation.designLab.eligible && ["approved", "posted", "archived"].includes(recommendation.status) &&
      !hasDesignLabReceipt) {
    context.addIssue({ code: "custom", path: ["designLab"], message: "Approved visual work requires its Design Lab receipt" });
  }
  if (Date.parse(recommendation.updatedAt) < Date.parse(recommendation.generatedAt)) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt cannot precede generatedAt" });
  }
});

export type VentureRecommendation = z.infer<typeof VentureRecommendationSchema>;
export type BookPassageEvidence = z.infer<typeof BookPassageEvidenceSchema>;

/** Published shared boundary; venture code imports its narrower schema above. */
export const AnyVentureRecommendationSchema = z.union([
  BooksofHistoryRecommendationSchema,
  VentureRecommendationSchema,
  TehdejsiRecommendationSchema,
  KvorumRecommendationSchema
]);
export type AnyVentureRecommendation = z.infer<typeof AnyVentureRecommendationSchema>;
