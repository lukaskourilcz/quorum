import { createHash } from "node:crypto";
import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema, HttpsUrlSchema, Sha256Schema, VentureIdSchema } from "./common.js";
import { SocialCapabilityRefSchema, SocialPlatformSchema } from "./social-distribution.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120);
const ProfileIdSchema = z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140);
const ConnectionIdSchema = z.string().regex(/^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(160);

export const SocialRoutineScopeSchema = z.strictObject({
  schemaVersion: z.literal("social-routine-scope/1"),
  id: z.string().regex(/^social-routine-scope-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(180),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  status: z.enum(["draft", "active", "revoked", "expired"]),
  profileId: ProfileIdSchema,
  connectionId: ConnectionIdSchema,
  platform: SocialPlatformSchema,
  locales: z.array(z.enum(["cs", "en"])).min(1).max(2),
  allowedContentClasses: z.array(z.enum(["original", "campaign-primary", "campaign-umbrella", "campaign-amplifier"])).min(1).max(4),
  allowedFormats: z.array(SlugSchema).min(1).max(20),
  allowedSourceKinds: z.array(z.enum(["strategy-owned", "accepted-campaign", "approved-package"])).min(1).max(3),
  evidenceRequirements: z.strictObject({
    minimumEvidenceRefs: z.number().int().min(1).max(20),
    approvedPackageRequired: z.boolean(),
    campaignApprovalRequired: z.boolean(),
    claimsRequired: z.literal(true),
    accessibilityRequired: z.literal(true)
  }),
  bounds: z.strictObject({
    maximumPostsPerDay: z.number().int().min(1).max(10),
    minimumHoursBetweenPosts: z.number().int().min(0).max(168),
    maximumItemCostUsd: z.number().finite().min(0).max(100)
  }),
  effectiveOn: DateSchema,
  expiresOn: DateSchema,
  prohibitedRiskClasses: z.array(z.enum(["political", "sensitive", "novel", "paid", "policy-changing"])).length(5),
  prohibitedActions: z.array(z.enum(["account-create", "oauth", "credential-change", "provider-change", "engagement", "dm", "ad", "contest", "silent-failover"])).length(9),
  approvalRef: EvidenceRefSchema.nullable(),
  countersignatureRef: EvidenceRefSchema.nullable(),
  revocationRef: EvidenceRefSchema.nullable(),
  killBehavior: z.literal("pause-and-preserve-evidence"),
  history: z.array(z.strictObject({
    revision: z.number().int().positive(),
    at: DateTimeSchema,
    action: z.enum(["drafted", "countersigned", "tightened", "revoked", "expired", "corrected"]),
    actor: z.enum(["owner", "system"]),
    evidenceRef: EvidenceRefSchema,
    reason: z.string().trim().min(1).max(500)
  })).min(1).max(100),
  authorityGranted: z.literal(false),
  publishingAuthorized: z.literal(false)
}).superRefine((scope, context) => {
  if (scope.allowedFormats.some((format) => format.includes("*") || format === "all") || scope.allowedSourceKinds.some((source) => String(source).includes("*"))) {
    context.addIssue({ code: "custom", message: "Routine authority cannot contain wildcard content or source permissions" });
  }
  if (Date.parse(`${scope.expiresOn}T00:00:00.000Z`) <= Date.parse(`${scope.effectiveOn}T00:00:00.000Z`)) {
    context.addIssue({ code: "custom", message: "Routine scope expiry must follow its effective date", path: ["expiresOn"] });
  }
  const active = scope.status === "active";
  if (active !== (scope.approvalRef !== null && scope.countersignatureRef !== null)) {
    context.addIssue({ code: "custom", message: "Only a countersigned exact scope may be active", path: ["status"] });
  }
  if ((scope.status === "revoked") !== (scope.revocationRef !== null)) {
    context.addIssue({ code: "custom", message: "A revoked scope records its revocation evidence", path: ["revocationRef"] });
  }
  const revisions = scope.history.map(({ revision }) => revision);
  if (new Set(revisions).size !== revisions.length || revisions.some((revision, index) => index > 0 && revision <= revisions[index - 1]!)) {
    context.addIssue({ code: "custom", message: "Routine scope history is append-only and ascending", path: ["history"] });
  }
});

export const SocialPreparedCandidateSchema = z.strictObject({
  schemaVersion: z.literal("social-prepared-candidate/1"),
  candidateId: z.string().regex(/^social-inventory-candidate-[a-f0-9]{20}$/u),
  sourceVentureId: VentureIdSchema,
  releaseId: SlugSchema,
  campaignId: SlugSchema,
  target: z.strictObject({
    profileId: ProfileIdSchema,
    profileRole: z.enum(["venture-primary", "company-umbrella", "owned-amplifier"]),
    role: z.enum(["primary", "umbrella", "amplifier"]),
    connectionId: ConnectionIdSchema,
    capabilityRef: SocialCapabilityRefSchema.nullable(),
    amplifierEligibilityRef: EvidenceRefSchema.nullable(),
    campaignApprovalRef: EvidenceRefSchema.nullable()
  }),
  sourcePackage: z.strictObject({ schemaVersion: z.literal("approved-publish-package/1"), artifactRef: EvidenceRefSchema, packageHash: Sha256Schema }),
  objective: z.enum(["qualified_visit", "value_action", "opt_in", "monetization_intent", "trust"]),
  audience: z.string().trim().min(1).max(500),
  destination: HttpsUrlSchema,
  utm: z.strictObject({ source: SocialPlatformSchema, medium: z.literal("organic_social"), campaign: SlugSchema, content: SlugSchema }),
  content: z.strictObject({
    text: z.string().trim().min(1).max(2_200),
    altText: z.string().trim().min(1).max(1_000).nullable(),
    assetPaths: z.array(z.string().regex(/^\/social\/[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/u)).max(10),
    factualClaimRefs: z.array(EvidenceRefSchema).min(1).max(30),
    rendererVersion: z.literal("carousel-studio-1")
  }),
  publishWindow: z.strictObject({ notBefore: DateTimeSchema, notAfter: DateTimeSchema }),
  formatId: SlugSchema,
  sourceKind: z.enum(["strategy-owned", "accepted-campaign", "approved-package"]),
  contentClass: z.enum(["original", "campaign-primary", "campaign-umbrella", "campaign-amplifier"]),
  riskClass: z.enum(["low", "political", "sensitive", "novel", "paid", "policy-changing"]),
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(30),
  checks: z.strictObject({ schema: z.literal("pass"), brand: z.literal("pass"), claims: z.literal("pass"), quill: z.literal("pass"), keeper: z.literal("pass"), duplicate: z.literal("pass"), accessibility: z.literal("pass"), budget: z.literal("pass"), capability: z.literal("pass"), policy: z.literal("pass") }),
  approvalRef: EvidenceRefSchema,
  estimatedCostUsd: z.number().finite().min(0).max(100),
  preparedHash: Sha256Schema,
  queueAuthorized: z.literal(false),
  publishingAuthorized: z.literal(false)
}).superRefine((prepared, context) => {
  if (Date.parse(prepared.publishWindow.notAfter) <= Date.parse(prepared.publishWindow.notBefore)) context.addIssue({ code: "custom", message: "Prepared publish window must increase", path: ["publishWindow"] });
  const expectedProfileRole = { primary: "venture-primary", umbrella: "company-umbrella", amplifier: "owned-amplifier" } as const;
  const expectedClass = { primary: "campaign-primary", umbrella: "campaign-umbrella", amplifier: "campaign-amplifier" } as const;
  if (prepared.target.profileRole !== expectedProfileRole[prepared.target.role]) context.addIssue({ code: "custom", message: "Prepared target and profile roles must match", path: ["target", "profileRole"] });
  if (prepared.contentClass !== "original" && prepared.contentClass !== expectedClass[prepared.target.role]) context.addIssue({ code: "custom", message: "Prepared campaign class must match its exact target role", path: ["contentClass"] });
  if (prepared.target.role !== "primary" && prepared.target.capabilityRef === null) context.addIssue({ code: "custom", message: "Cross-target preparation needs its exact capability", path: ["target", "capabilityRef"] });
  if (prepared.target.role === "amplifier" && (!prepared.target.amplifierEligibilityRef || !prepared.target.campaignApprovalRef)) context.addIssue({ code: "custom", message: "Amplifier preparation needs #415 and campaign approval evidence", path: ["target"] });
  if (prepared.content.assetPaths.length > 0 && !prepared.content.altText) context.addIssue({ code: "custom", message: "Prepared media needs alt text", path: ["content", "altText"] });
  if (prepared.target.profileId === "social-profile-personal-growth" || prepared.target.profileId === "social-profile-kvorum") context.addIssue({ code: "custom", message: "Isolated profiles cannot be prepared" });
  if (prepared.preparedHash !== socialPreparedCandidateHash(prepared)) context.addIssue({ code: "custom", message: "Prepared candidate hash does not match immutable handoff", path: ["preparedHash"] });
});

const SocialOperationReasonSchema = z.enum([
  "selected", "no-due-useful-candidate", "rest-cadence-window", "original-support-ratio", "cooldown", "incomplete-runway",
  "provider-held", "connection-held", "missing-authority", "routine-scope-mismatch", "duplicate-similarity", "asset-failure",
  "alt-text-failure", "claim-failure", "evidence-failure", "expired-campaign", "budget-exhausted", "malformed-strategy-inventory",
  "stale-inventory", "denied-capability", "kill-switch", "profile-paused", "connection-paused", "draft-only", "sensitive-review",
  "prepared-item-missing", "ambiguous-delivery-reconciliation"
]);

export const SocialProfileOperationSchema = z.strictObject({
  schemaVersion: z.literal("social-profile-operation/1"),
  id: z.string().regex(/^social-profile-operation-[a-f0-9]{20}$/u),
  idempotencyKey: Sha256Schema,
  inputHash: Sha256Schema,
  supersedesOperationRef: EvidenceRefSchema.nullable(),
  profileId: ProfileIdSchema,
  connectionId: ConnectionIdSchema,
  strategyRef: EvidenceRefSchema,
  inventoryRef: EvidenceRefSchema,
  campaignRefs: z.array(EvidenceRefSchema).max(100),
  targetDate: DateSchema,
  timezone: z.literal("Europe/Prague"),
  selectionWindow: z.strictObject({ notBefore: DateTimeSchema, notAfter: DateTimeSchema }),
  candidateRefs: z.array(EvidenceRefSchema).max(100),
  candidateSetHash: Sha256Schema,
  selectedCandidateRef: EvidenceRefSchema.nullable(),
  immutableHashes: z.strictObject({ targetHash: Sha256Schema, contentHash: Sha256Schema, assetHash: Sha256Schema, windowHash: Sha256Schema }).nullable(),
  gates: z.array(z.strictObject({ gate: z.enum(["real-profile", "connection", "inventory", "freshness", "expiry", "duplicate", "capability", "ratio", "runway", "cooldown", "campaign-capacity", "content", "claims", "accessibility", "budget", "provider", "authority", "routine-scope", "kill-switch"]), status: z.enum(["pass", "hold", "fail"]), reason: z.string().trim().min(1).max(500), evidenceRef: EvidenceRefSchema.nullable() })).min(1).max(30),
  routineScopeRef: EvidenceRefSchema.nullable(),
  routineScopeState: z.enum(["draft-only", "matched", "missing", "mismatch", "revoked", "expired"]),
  queue: z.strictObject({ itemId: z.string().trim().min(1).max(160), itemRef: EvidenceRefSchema, payloadHash: Sha256Schema, status: z.literal("queued") }).nullable(),
  outcome: z.enum(["queued", "review", "held", "paused", "NO_POST"]),
  reasons: z.array(SocialOperationReasonSchema).min(1).max(30),
  providerConnectionState: z.enum(["ready", "held", "failed", "ambiguous", "unavailable"]),
  actualCostUsd: z.number().finite().min(0).max(100),
  reuseRefs: z.array(EvidenceRefSchema).max(100),
  incidentRefs: z.array(EvidenceRefSchema).max(100),
  ownerAttentionRefs: z.array(EvidenceRefSchema).max(100),
  replayed: z.boolean(),
  createdAt: DateTimeSchema,
  authorityGranted: z.literal(false),
  publishingAuthorized: z.literal(false)
}).superRefine((operation, context) => {
  if (operation.id !== `social-profile-operation-${operation.idempotencyKey.slice(0, 20)}`) context.addIssue({ code: "custom", message: "Operation id derives from its idempotency key", path: ["id"] });
  const gates = operation.gates.map(({ gate }) => gate);
  if (new Set(gates).size !== gates.length) context.addIssue({ code: "custom", message: "Operation gates must be unique", path: ["gates"] });
  if ((operation.outcome === "queued") !== (operation.queue !== null && operation.selectedCandidateRef !== null && operation.immutableHashes !== null && operation.routineScopeState === "matched")) context.addIssue({ code: "custom", message: "Only a scoped exact selection may create a queue handoff", path: ["outcome"] });
  if (operation.outcome === "NO_POST" && (operation.queue !== null || operation.selectedCandidateRef !== null)) context.addIssue({ code: "custom", message: "NO_POST cannot hide a selected or queued item", path: ["outcome"] });
});

export type SocialRoutineScope = z.infer<typeof SocialRoutineScopeSchema>;
export type SocialPreparedCandidate = z.infer<typeof SocialPreparedCandidateSchema>;
export type SocialProfileOperation = z.infer<typeof SocialProfileOperationSchema>;

function canonical(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !["preparedHash"].includes(key)).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonical(entry)])); return value; }
export function socialPreparedCandidateHash(value: Omit<SocialPreparedCandidate, "preparedHash"> | SocialPreparedCandidate): string { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
