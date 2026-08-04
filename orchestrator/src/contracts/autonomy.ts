import { z } from "zod";
import {
  ContractAgentIdSchema,
  DateTimeSchema,
  HttpsUrlSchema,
  MeetingRefSchema,
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

/**
 * Where a question came from, which is not the same fact as who asked for it.
 *
 * requested_by has always been a seat name, but every item wearing one was written by the
 * morning seed loop out of a venture's declared growth objective in config/ventures.json —
 * "VIZE" there means "the seed attributes this to the strategy seat", not "VIZE thought of it".
 * A reader could not tell a question the board invented from one the config handed it, and once
 * the board can invent questions that difference is the whole point: seeded work traces to a
 * human-authored objective, proposed work traces to a model. They are not equally trustworthy
 * and the record must not flatten them.
 */
export const PriorityOriginSchema = z.enum(["seeded", "proposed"]);

/**
 * The provenance a proposed item carries and a seeded one must not: which seat put the question
 * on the table, at which meeting, and when.
 */
export const PriorityProposalSchema = openObject({
  proposed_by: ContractAgentIdSchema,
  meeting_ref: MeetingRefSchema,
  proposed_at: DateTimeSchema
});

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
  consumed_by: z.string().trim().min(1).max(160).nullable(),
  // Defaulted, not required, because the ten items already on disk predate this field and the
  // morning cycle parses every one of them before it can do anything else. A required field here
  // would turn the first run after deploy into a zod error with no queue at all. "seeded" is also
  // the true answer for all ten: the seed loop wrote every one of them.
  origin: PriorityOriginSchema.default("seeded"),
  proposal: PriorityProposalSchema.nullable().default(null)
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
  // The two fields have to agree or the provenance is decorative: an item could claim to be
  // proposed and name nobody, or claim to be seeded while carrying a seat's name and a meeting.
  if (item.origin === "proposed" && !item.proposal) {
    context.addIssue({ code: "custom", message: "A proposed item must name the seat and meeting that proposed it", path: ["proposal"] });
  }
  if (item.origin === "seeded" && item.proposal) {
    context.addIssue({ code: "custom", message: "Only a proposed item may carry proposal provenance", path: ["proposal"] });
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
  // Czech alt text is required; English is optional and on its way out. Filling alt_en with
  // Czech to satisfy a schema was the alternative and it is not on the table — a screen reader
  // set to English would read Czech and announce it as English.
  alt_en: z.string().trim().min(1).max(300).optional(),
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
    // A published English page and a package that never had an English half are different
    // facts, and a proof that reported them under one name let a KPI counting bilingual
    // deliveries read 1 while none were bilingual.
    "english-absent",
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
export type PriorityOrigin = z.infer<typeof PriorityOriginSchema>;
export type PriorityProposalProvenance = z.infer<typeof PriorityProposalSchema>;
export type VentureTemplate = z.infer<typeof VentureTemplateSchema>;
export type VentureTemplateCandidate = z.infer<typeof VentureTemplateCandidateSchema>;
export type ArticleImage = z.infer<typeof ArticleImageSchema>;
export type ReleaseProof = z.infer<typeof ReleaseProofSchema>;
export type SocialPostReceipt = z.infer<typeof SocialPostReceiptSchema>;
export type SocialActivation = z.infer<typeof SocialActivationSchema>;
