import { z } from "zod";
import {
  DateSchema,
  DateTimeSchema,
  EvidenceRefSchema,
  HttpsUrlSchema,
  Sha256Schema
} from "./common.js";

export const WebDevTopicSchema = z.enum([
  "browsers-web-platform",
  "html-css",
  "javascript",
  "typescript",
  "frontend-framework",
  "meta-framework",
  "runtime",
  "package-manager",
  "build-tooling",
  "deployment-platform",
  "security",
  "performance",
  "accessibility",
  "interoperability-standards",
  "ecosystem-governance-licensing",
  "other-unknown"
]);

export const WebDevChangeKindSchema = z.enum([
  "stable-release",
  "beta-preview",
  "deprecation",
  "breaking-change",
  "security-advisory",
  "standards-platform-availability",
  "tooling-workflow-change",
  "policy-licensing-governance",
  "incident-fix",
  "lead-only",
  "other-unknown"
]);

export const WebDevImpactScopeSchema = z.enum([
  "broad-web-platform",
  "framework-ecosystem-wide",
  "specific-version-configuration",
  "niche-advanced",
  "unknown"
]);

export const WebDevSourceAuthoritySchema = z.enum([
  "official-primary",
  "official-advisory",
  "secondary-discovery"
]);

export const WebDevSourceKindSchema = z.enum([
  "rss",
  "atom",
  "json",
  "github-releases",
  "github-advisories",
  "official-html",
  "manual-fixture"
]);

export const WebDevSourceStateSchema = z.enum(["enabled", "optional", "held", "rejected"]);

const BoundedString = z.string().trim().min(1).max(500);
const StableId = z.string().regex(/^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/).max(160);
const LocaleHintSchema = z.enum(["en", "cs", "multi", "unknown"]);

export const WebDevSourceSchema = z.strictObject({
  schemaVersion: z.literal("webdev-source/1"),
  id: StableId,
  name: z.string().trim().min(1).max(120),
  project: z.string().trim().min(1).max(120),
  owner: z.string().trim().min(1).max(120),
  canonicalHost: z.hostname(),
  sourceKind: WebDevSourceKindSchema,
  authority: WebDevSourceAuthoritySchema,
  endpoint: HttpsUrlSchema,
  repositoryRef: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/).nullable(),
  locale: LocaleHintSchema,
  topics: z.array(WebDevTopicSchema).min(1).max(16),
  changeKinds: z.array(WebDevChangeKindSchema).min(1).max(11),
  verifiedAt: DateSchema,
  verificationDueAt: DateSchema,
  access: z.strictObject({
    publicLoggedOut: z.boolean(),
    authEnvironmentName: z.string().regex(/^[A-Z][A-Z0-9_]+$/).nullable(),
    termsRef: HttpsUrlSchema,
    robotsRef: HttpsUrlSchema.nullable(),
    license: z.string().trim().min(1).max(180),
    attribution: BoundedString
  }),
  limits: z.strictObject({
    cadenceMinutes: z.number().int().positive().max(43_200),
    requestCapPerRun: z.number().int().positive().max(10),
    pageCapPerRun: z.number().int().positive().max(10),
    itemCapPerRun: z.number().int().positive().max(200),
    bodyBytes: z.number().int().positive().max(2_000_000),
    timeoutMs: z.number().int().min(500).max(30_000),
    redirects: z.number().int().min(0).max(3),
    concurrency: z.number().int().min(1).max(4),
    spacingMs: z.number().int().min(0).max(60_000)
  }),
  conditional: z.strictObject({
    etag: z.enum(["observed", "supported-unverified", "not-observed"]),
    lastModified: z.enum(["observed", "supported-unverified", "not-observed"]),
    contentHashFallback: z.literal(true)
  }),
  parser: z.strictObject({
    id: StableId,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    fixtureVersion: z.string().regex(/^\d+\.\d+\.\d+$/)
  }),
  healthPolicy: z.strictObject({
    failureThreshold: z.number().int().min(1).max(10),
    layoutChangeHoldsSource: z.literal(true),
    emptyIsHealthy: z.literal(true),
    unchangedIsHealthy: z.literal(true)
  }),
  priority: z.number().int().min(0).max(100),
  duplicateOverlap: z.array(StableId).max(20),
  state: WebDevSourceStateSchema,
  stateReason: BoundedString,
  sourceRefs: z.array(EvidenceRefSchema).min(1).max(20),
  capabilityRefs: z.array(z.enum([
    "official-source-to-webdev-signal:webdev-candidate/1",
    "goviral-to-webdev-signal:intelligence-read:goviral-intelligence-packet/1"
  ])).max(2)
}).superRefine((source, context) => {
  if (new URL(source.endpoint).hostname !== source.canonicalHost) {
    context.addIssue({ code: "custom", path: ["endpoint"], message: "endpoint host must equal canonicalHost" });
  }
  if (source.authority === "secondary-discovery" && !source.changeKinds.includes("lead-only")) {
    context.addIssue({ code: "custom", path: ["changeKinds"], message: "secondary discovery sources must be lead-only" });
  }
  if (source.authority !== "secondary-discovery" && source.changeKinds.includes("lead-only")) {
    context.addIssue({ code: "custom", path: ["changeKinds"], message: "official sources cannot be lead-only" });
  }
  if (source.access.authEnvironmentName !== null && source.access.publicLoggedOut) {
    context.addIssue({ code: "custom", path: ["access", "authEnvironmentName"], message: "public sources cannot require an auth environment" });
  }
});

export const WebDevCandidateSchema = z.strictObject({
  schemaVersion: z.literal("webdev-candidate/1"),
  sourceId: StableId,
  sourceItemId: z.string().trim().min(1).max(240),
  listingUrl: HttpsUrlSchema,
  targetUrl: HttpsUrlSchema,
  canonicalProjectUrl: HttpsUrlSchema,
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().min(1).max(800),
  author: z.string().trim().min(1).max(120).nullable(),
  project: z.string().trim().min(1).max(120),
  publishedAt: DateTimeSchema,
  updatedAt: DateTimeSchema.nullable(),
  versionText: z.string().trim().min(1).max(160).nullable(),
  securityText: z.string().trim().min(1).max(500).nullable(),
  topicHints: z.array(WebDevTopicSchema).max(8),
  changeKindHints: z.array(WebDevChangeKindSchema).max(8),
  language: LocaleHintSchema,
  contentHash: Sha256Schema,
  provenance: z.strictObject({
    authority: WebDevSourceAuthoritySchema,
    parserId: StableId,
    parserVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    fetchedAt: DateTimeSchema,
    evidenceRefs: z.array(EvidenceRefSchema).min(1).max(20),
    fixture: z.boolean()
  })
}).superRefine((candidate, context) => {
  if (candidate.provenance.authority === "secondary-discovery" && !candidate.changeKindHints.includes("lead-only")) {
    context.addIssue({ code: "custom", path: ["changeKindHints"], message: "secondary candidates must remain lead-only" });
  }
});

export const WebDevSourceAgreementSchema = z.strictObject({
  status: z.enum(["single-official", "corroborated", "conflicted"]),
  agreeingSourceIds: z.array(StableId).min(1).max(20),
  conflictRefs: z.array(EvidenceRefSchema).max(20)
});

export const WebDevRecordSchema = z.strictObject({
  schemaVersion: z.literal("webdev-record/1"),
  id: z.string().regex(/^wds_[a-f0-9]{24}$/),
  canonicalUrl: HttpsUrlSchema,
  sourceIds: z.array(StableId).min(1).max(20),
  candidateIds: z.array(StableId).min(1).max(100),
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(40),
  project: z.string().trim().min(1).max(120),
  topic: WebDevTopicSchema,
  changeKind: WebDevChangeKindSchema,
  impactScope: WebDevImpactScopeSchema,
  authority: WebDevSourceAuthoritySchema,
  title: z.string().trim().min(1).max(240),
  sourceSummary: z.string().trim().min(1).max(800),
  publishedAt: DateTimeSchema,
  updatedAt: DateTimeSchema.nullable(),
  versionRefs: z.array(z.string().trim().min(1).max(120)).max(20),
  affectedVersions: z.array(z.string().trim().min(1).max(120)).max(20),
  fixedVersions: z.array(z.string().trim().min(1).max(120)).max(20),
  affectedConfigurations: z.array(z.string().trim().min(1).max(240)).max(20),
  developerImpact: z.strictObject({
    summary: BoundedString,
    audienceIds: z.array(StableId).min(1).max(20),
    confidence: z.number().min(0).max(1),
    evidenceRefs: z.array(EvidenceRefSchema).min(1).max(20)
  }),
  safeActions: z.array(z.strictObject({
    id: StableId,
    action: BoundedString,
    urgency: z.enum(["none", "check", "plan", "act-now"]),
    evidenceRefs: z.array(EvidenceRefSchema).min(1).max(10)
  })).max(20),
  security: z.strictObject({
    severity: z.enum(["none", "low", "moderate", "high", "critical", "unknown"]),
    advisoryIds: z.array(z.string().trim().min(1).max(120)).max(20)
  }),
  releaseStability: z.enum(["stable", "beta", "preview", "deprecated", "withdrawn", "unknown"]),
  agreement: WebDevSourceAgreementSchema,
  firstSeenAt: DateTimeSchema,
  lastSeenAt: DateTimeSchema,
  extractionVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  scoringVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  recentEditionSimilarity: z.number().min(0).max(1),
  historyRefs: z.array(EvidenceRefSchema).max(40),
  lifecycle: z.enum(["new", "updated", "selected", "held", "superseded", "withdrawn"])
}).superRefine((record, context) => {
  if (record.authority === "secondary-discovery") {
    context.addIssue({ code: "custom", path: ["authority"], message: "canonical factual records require official authority" });
  }
  if (["security-advisory", "breaking-change", "deprecation"].includes(record.changeKind)
    && record.affectedVersions.length === 0
    && record.affectedConfigurations.length === 0) {
    context.addIssue({ code: "custom", path: ["affectedVersions"], message: "high-risk changes require explicit affected scope" });
  }
  if (record.changeKind === "security-advisory" && record.fixedVersions.length === 0) {
    context.addIssue({ code: "custom", path: ["fixedVersions"], message: "security records require source-backed fixed versions" });
  }
});

export type WebDevTopic = z.infer<typeof WebDevTopicSchema>;
export type WebDevChangeKind = z.infer<typeof WebDevChangeKindSchema>;
export type WebDevImpactScope = z.infer<typeof WebDevImpactScopeSchema>;
export type WebDevSource = z.infer<typeof WebDevSourceSchema>;
export type WebDevCandidate = z.infer<typeof WebDevCandidateSchema>;
export type WebDevRecord = z.infer<typeof WebDevRecordSchema>;
