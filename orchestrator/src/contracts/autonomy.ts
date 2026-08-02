import { z } from "zod";
import {
  ContractAgentIdSchema,
  DateTimeSchema,
  HttpsUrlSchema,
  Sha256Schema,
  VentureIdSchema,
  openObject
} from "./common.js";

export const PriorityStatusSchema = z.enum([
  "open",
  "selected",
  "why-not",
  "archived"
]);

export const PriorityItemSchema = openObject({
  schemaVersion: z.literal("priority-item/1"),
  id: z.string().regex(/^priority-[a-f0-9]{16}$/),
  venture: VentureIdSchema,
  question: z.string().trim().min(1).max(280),
  decision_at_stake: z.string().trim().min(1).max(280),
  evidence_needed: z.array(z.string().trim().min(1).max(160)).max(12),
  requested_by: ContractAgentIdSchema,
  created: DateTimeSchema,
  expires: DateTimeSchema,
  status: PriorityStatusSchema,
  why_not_reason: z.string().trim().min(1).max(280).nullable(),
  consumed_by: z.string().trim().min(1).max(160).nullable()
}).superRefine((item, context) => {
  if (Date.parse(item.expires) <= Date.parse(item.created)) {
    context.addIssue({ code: "custom", message: "Priority expiry must follow creation", path: ["expires"] });
  }
  if (item.status === "why-not" && !item.why_not_reason) {
    context.addIssue({ code: "custom", message: "A why-not item needs a reason", path: ["why_not_reason"] });
  }
  if (item.status !== "why-not" && item.why_not_reason) {
    context.addIssue({ code: "custom", message: "Only why-not items may carry a reason", path: ["why_not_reason"] });
  }
  if (item.status === "selected" && !item.consumed_by) {
    context.addIssue({ code: "custom", message: "A selected item needs its consuming meeting", path: ["consumed_by"] });
  }
  if (item.status !== "selected" && item.consumed_by) {
    context.addIssue({ code: "custom", message: "Only selected items may carry a consumer", path: ["consumed_by"] });
  }
});

export const PriorityQueueSchema = openObject({
  schemaVersion: z.literal("priority-queue/1"),
  items: z.array(PriorityItemSchema).max(200),
  updatedAt: DateTimeSchema
});

export const VentureTemplateSchema = openObject({
  schemaVersion: z.literal("venture-template/1"),
  templateId: z.literal("content-venture-default"),
  dailyEnvelopeCapUsd: z.number().finite().positive().max(0.15),
  allowedDeliveryTargets: z.array(z.enum(["boardless-site", "caught-up", "mma-files"])).min(1),
  existingRosterOnly: z.literal(true),
  newCredentialsAllowed: z.literal(false),
  newAccountsAllowed: z.literal(false),
  commerceAllowed: z.literal(false),
  paymentsAllowed: z.literal(false),
  adsAllowed: z.literal(false),
  personalDataAllowed: z.literal(false),
  newLegalSurfaceAllowed: z.literal(false),
  newSocialAccountsAllowed: z.literal(false),
  minimumSlotGapMinutes: z.number().int().min(60).max(240),
  requiredFiles: z.array(z.enum(["STYLEBOOK.md", "README.md"])).min(1)
});

export const VentureTemplateCandidateSchema = openObject({
  schemaVersion: z.literal("venture-template-candidate/1"),
  proposalRef: z.string().trim().min(1).max(240),
  slug: VentureIdSchema,
  name: z.string().trim().min(1).max(100),
  deliveryTarget: z.enum(["boardless-site", "caught-up", "mma-files"]),
  dailyEnvelopeUsd: z.number().finite().positive().max(0.15),
  cadenceHourPrague: z.number().int().min(5).max(23),
  cast: z.array(ContractAgentIdSchema).min(2).max(8),
  styleBrief: z.string().trim().min(1).max(2_000),
  requiresNewCredentials: z.boolean(),
  requiresNewAccounts: z.boolean(),
  includesCommerce: z.boolean(),
  includesPayments: z.boolean(),
  includesAds: z.boolean(),
  includesPersonalData: z.boolean(),
  createsLegalSurface: z.boolean(),
  createsSocialAccount: z.boolean()
});

export const ImageLicenseSchema = openObject({
  name: z.enum([
    "CC0",
    "CC BY",
    "CC BY-SA",
    "Pexels License",
    "Pixabay Content License",
    "BoardlessAI deterministic"
  ]),
  author: z.string().trim().min(1).max(200),
  source_url: HttpsUrlSchema,
  attribution_html: z.string().trim().min(1).max(2_000)
});

const AssetPathSchema = z.string().regex(
  /^public\/images\/[a-z0-9][a-z0-9/_-]*\.(?:webp|png|svg)$/
);

export const ArticleImageSchema = openObject({
  hero_path: AssetPathSchema,
  thumb_path: AssetPathSchema,
  width: z.number().int().min(640).max(4_000),
  height: z.number().int().min(360).max(3_000),
  alt_en: z.string().trim().min(1).max(300),
  alt_cs: z.string().trim().min(1).max(300),
  license: ImageLicenseSchema,
  origin: z.enum(["photo", "svg"]),
  hero_bytes_base64: z.base64().refine((value) => Buffer.byteLength(value, "base64") <= 800_000),
  thumb_bytes_base64: z.base64().refine((value) => Buffer.byteLength(value, "base64") <= 300_000)
}).superRefine((image, context) => {
  const deterministic = image.license.name === "BoardlessAI deterministic";
  if ((image.origin === "svg") !== deterministic) {
    context.addIssue({
      code: "custom",
      message: "SVG fallback must use the deterministic license and photos must use an allowed photo license",
      path: ["license", "name"]
    });
  }
});

const ReleaseCheckSchema = openObject({
  name: z.enum([
    "target-commit",
    "target-ci",
    "english-route",
    "czech-route",
    "title-slug",
    "content-hash",
    "hero-image",
    "image-dimensions",
    "attribution"
  ]),
  status: z.enum(["pass", "fail"]),
  detail: z.string().trim().min(1).max(500),
  checkedAt: DateTimeSchema
});

export const ReleaseProofSchema = openObject({
  schemaVersion: z.literal("release-proof/1"),
  id: z.string().regex(/^proof-[a-f0-9]{16}$/),
  venture: z.enum(["caught-up", "mma-files"]),
  packageHash: Sha256Schema,
  targetRepository: z.enum(["lukaskourilcz/aifirst", "lukaskourilcz/mma-files"]),
  targetCommit: z.string().regex(/^[a-f0-9]{40}$/),
  deploymentUrl: HttpsUrlSchema,
  checks: z.array(ReleaseCheckSchema).min(8),
  retryCount: z.number().int().min(0).max(1),
  status: z.enum(["passed", "failed", "reverted"]),
  startedAt: DateTimeSchema,
  completedAt: DateTimeSchema,
  revertCommit: z.string().regex(/^[a-f0-9]{40}$/).optional()
});

export const SocialPostReceiptSchema = openObject({
  schemaVersion: z.literal("social-post-receipt/1"),
  id: z.string().regex(/^social-receipt-[a-f0-9]{16}$/),
  venture: z.enum(["caught-up", "mma-files", "titty-tuesdays"]),
  queueItemId: z.string().trim().min(1).max(160),
  channel: z.enum(["threads", "instagram"]),
  variant: z.enum(["A", "B"]),
  idempotencyKey: Sha256Schema,
  contentHash: Sha256Schema,
  rendererVersion: z.literal("carousel-studio-1"),
  outcome: z.enum(["published", "failed", "paused"]),
  remoteId: z.string().trim().min(1).max(240).nullable(),
  remoteUrl: HttpsUrlSchema.nullable(),
  verifiedLive: z.boolean(),
  attemptCount: z.number().int().min(1).max(2),
  attemptedAt: DateTimeSchema,
  verifiedAt: DateTimeSchema.nullable(),
  error: z.string().trim().min(1).max(500).nullable()
});

export const SocialActivationVentureSchema = openObject({
  status: z.enum(["locked", "enabled", "paused"]),
  counter: z.number().int().nonnegative(),
  required: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  updatedAt: DateTimeSchema,
  unlockedAt: DateTimeSchema.nullable(),
  decisionReference: z.literal("D2-autonomy-build-2026-08-01")
});

export const SocialActivationSchema = openObject({
  schemaVersion: z.literal("social-activation/1"),
  ventures: openObject({
    "caught-up": SocialActivationVentureSchema,
    "mma-files": SocialActivationVentureSchema,
    "titty-tuesdays": SocialActivationVentureSchema
  }),
  updatedAt: DateTimeSchema
});

export const MetricsPlaceholderSchema = openObject({
  schemaVersion: z.literal("metrics-placeholder/1"),
  enabled: z.literal(false),
  phase: z.literal(3),
  fields: z.tuple([])
});

export type PriorityItem = z.infer<typeof PriorityItemSchema>;
export type PriorityQueue = z.infer<typeof PriorityQueueSchema>;
export type VentureTemplate = z.infer<typeof VentureTemplateSchema>;
export type VentureTemplateCandidate = z.infer<typeof VentureTemplateCandidateSchema>;
export type ArticleImage = z.infer<typeof ArticleImageSchema>;
export type ReleaseProof = z.infer<typeof ReleaseProofSchema>;
export type SocialPostReceipt = z.infer<typeof SocialPostReceiptSchema>;
export type SocialActivation = z.infer<typeof SocialActivationSchema>;
