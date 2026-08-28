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

export const WebDevGateReasonSchema = z.enum([
  "eligible",
  "needs-official-confirmation",
  "conflicted",
  "stale",
  "duplicate-recent-edition",
  "minor-no-material-impact",
  "rumor-unsupported",
  "promotional",
  "out-of-scope",
  "high-risk-factual-review",
  "malformed"
]);

export const WebDevScoreComponentNameSchema = z.enum([
  "authority-evidence",
  "developer-impact",
  "breadth",
  "actionability",
  "urgency",
  "magnitude-novelty",
  "corroboration",
  "freshness",
  "audience-relevance",
  "concentration-penalty",
  "uncertainty-penalty",
  "goviral-momentum"
]);

export const WebDevScoreComponentSchema = z.strictObject({
  name: WebDevScoreComponentNameSchema,
  rawValue: z.number().min(-1).max(1),
  weight: z.number().min(0).max(1),
  contribution: z.number().min(-100).max(100),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(EvidenceRefSchema).max(20)
});

const WebDevSelectionCandidateSchema = z.strictObject({
  recordId: z.string().regex(/^wds_[a-f0-9]{24}$/),
  gate: WebDevGateReasonSchema,
  gateReasons: z.array(BoundedString).min(1).max(20),
  components: z.array(WebDevScoreComponentSchema).max(12),
  baseScore: z.number().min(-100).max(100).nullable(),
  finalScore: z.number().min(-100).max(100).nullable(),
  confidence: z.number().min(0).max(1).nullable()
}).superRefine((candidate, context) => {
  if (candidate.gate === "eligible" && (candidate.baseScore === null || candidate.finalScore === null)) {
    context.addIssue({ code: "custom", path: ["finalScore"], message: "eligible records require scores" });
  }
  if (candidate.gate !== "eligible" && (candidate.components.length > 0 || candidate.finalScore !== null)) {
    context.addIssue({ code: "custom", path: ["components"], message: "hard-gated records cannot be scored" });
  }
});

const WebDevGoViralOverlaySchema = z.strictObject({
  status: z.enum(["unavailable", "available-unused", "used", "stale", "denied", "malformed"]),
  packetRef: EvidenceRefSchema.nullable(),
  packetHash: Sha256Schema.nullable(),
  observedAt: DateTimeSchema.nullable(),
  expiresAt: DateTimeSchema.nullable(),
  contribution: z.number().min(0).max(5),
  actorRerun: z.literal(false),
  duplicateChargeUsd: z.literal(0)
}).superRefine((overlay, context) => {
  if (overlay.status !== "used" && overlay.contribution !== 0) {
    context.addIssue({ code: "custom", path: ["contribution"], message: "unavailable GoVIRAL cannot contribute" });
  }
});

export const WebDevSelectionSchema = z.strictObject({
  schemaVersion: z.literal("webdev-selection/1"),
  pragueDate: DateSchema,
  inputSnapshotHash: Sha256Schema,
  scoringVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  candidates: z.array(WebDevSelectionCandidateSchema).max(500),
  outcome: z.enum(["selected", "NO_EDITION"]),
  selectedRecordId: z.string().regex(/^wds_[a-f0-9]{24}$/).nullable(),
  noEditionReason: BoundedString.nullable(),
  urgencyOverride: z.strictObject({
    used: z.boolean(),
    evidenceRefs: z.array(EvidenceRefSchema).max(20),
    exactAffectedScope: BoundedString.nullable(),
    exactFixedScope: BoundedString.nullable()
  }),
  goviral: WebDevGoViralOverlaySchema,
  threshold: z.strictObject({
    minimumBaseScore: z.number().min(0).max(100),
    minimumConfidence: z.number().min(0).max(1),
    minimumWinnerMargin: z.number().min(0).max(100),
    tieBreaker: z.literal("final-score-desc,published-at-desc,record-id-asc")
  }),
  idempotencyHash: Sha256Schema,
  ownerCorrectionRef: EvidenceRefSchema.nullable(),
  supersedesRef: EvidenceRefSchema.nullable()
}).superRefine((selection, context) => {
  const selected = selection.candidates.filter((candidate) => candidate.recordId === selection.selectedRecordId);
  if (selection.outcome === "selected" && (selection.selectedRecordId === null || selected.length !== 1 || selected[0]!.gate !== "eligible")) {
    context.addIssue({ code: "custom", path: ["selectedRecordId"], message: "selected outcome requires exactly one eligible record" });
  }
  if (selection.outcome === "selected" && selection.noEditionReason !== null) {
    context.addIssue({ code: "custom", path: ["noEditionReason"], message: "selected outcome cannot carry a NO_EDITION reason" });
  }
  if (selection.outcome === "NO_EDITION" && (selection.selectedRecordId !== null || selection.noEditionReason === null)) {
    context.addIssue({ code: "custom", path: ["outcome"], message: "NO_EDITION requires a reason and no selected record" });
  }
  if (selection.urgencyOverride.used
    && (selection.urgencyOverride.evidenceRefs.length === 0
      || selection.urgencyOverride.exactAffectedScope === null
      || selection.urgencyOverride.exactFixedScope === null)) {
    context.addIssue({ code: "custom", path: ["urgencyOverride"], message: "urgency override requires exact authoritative affected and fixed scope" });
  }
});

const WebDevBriefClaimSchema = z.strictObject({
  id: StableId,
  text: BoundedString,
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(20),
  requiredInBothLocales: z.boolean()
});

export const WebDevEvidenceBriefSchema = z.strictObject({
  schemaVersion: z.literal("webdev-evidence-brief/1"),
  id: StableId,
  selectedRecordId: z.string().regex(/^wds_[a-f0-9]{24}$/),
  selectionRef: EvidenceRefSchema,
  selectionHash: Sha256Schema.optional(),
  inputSnapshotHash: Sha256Schema.optional(),
  recordHash: Sha256Schema.optional(),
  canonicalDevelopment: z.string().trim().min(1).max(280),
  claims: z.array(WebDevBriefClaimSchema).min(1).max(40),
  whatChangedClaimIds: z.array(StableId).min(1).max(20),
  whyItMattersClaimIds: z.array(StableId).min(1).max(20),
  affectedAudienceIds: z.array(StableId).min(1).max(20),
  safeActions: z.array(z.strictObject({
    id: StableId,
    text: BoundedString,
    claimIds: z.array(StableId).min(1).max(20)
  })).max(20),
  affectedVersions: z.array(z.string().trim().min(1).max(120)).max(20),
  fixedVersions: z.array(z.string().trim().min(1).max(120)).max(20),
  releaseStability: z.enum(["stable", "beta", "preview", "deprecated", "withdrawn", "unknown"]),
  uncertainty: z.array(BoundedString).max(20),
  conflicts: z.array(BoundedString).max(20),
  sources: z.array(z.strictObject({
    url: HttpsUrlSchema,
    label: z.string().trim().min(1).max(160),
    authority: z.enum(["official-primary", "official-advisory"])
  })).min(1).max(20),
  prohibitedClaims: z.array(BoundedString).max(40),
  prohibitedPhrases: z.array(z.string().trim().min(1).max(120)).max(40),
  expiresAt: DateTimeSchema,
  updateConditions: z.array(BoundedString).min(1).max(20),
  promptVersion: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  extractionVersion: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  contentHash: Sha256Schema
}).superRefine((brief, context) => {
  const claimIds = new Set(brief.claims.map((claim) => claim.id));
  for (const [field, ids] of [
    ["whatChangedClaimIds", brief.whatChangedClaimIds],
    ["whyItMattersClaimIds", brief.whyItMattersClaimIds]
  ] as const) {
    ids.forEach((id, index) => {
      if (!claimIds.has(id)) context.addIssue({ code: "custom", path: [field, index], message: "brief section references an unknown claim" });
    });
  }
  brief.safeActions.forEach((action, actionIndex) => action.claimIds.forEach((id, claimIndex) => {
    if (!claimIds.has(id)) context.addIssue({ code: "custom", path: ["safeActions", actionIndex, "claimIds", claimIndex], message: "action references an unknown claim" });
  }));
  if (brief.conflicts.length > 0) {
    context.addIssue({ code: "custom", path: ["conflicts"], message: "unresolved material conflicts cannot enter an accepted brief" });
  }
});

const WebDevFactualSentenceSchema = z.strictObject({
  text: z.string().trim().min(1).max(500),
  claimIds: z.array(StableId).min(1).max(10)
});

export const WebDevEditionPackageSchema = z.strictObject({
  schemaVersion: z.literal("webdev-edition-package/1"),
  id: StableId,
  locale: z.enum(["cs", "en"]),
  evidenceBriefRef: EvidenceRefSchema,
  editionProfileRef: EvidenceRefSchema,
  headline: z.string().trim().min(1).max(160),
  deck: z.string().trim().min(1).max(280),
  explanation: z.string().trim().min(1).max(1_500),
  threads: z.strictObject({
    primary: z.string().trim().min(1).max(500),
    continuation: z.array(z.string().trim().min(1).max(500)).max(3)
  }),
  instagramCaption: z.string().trim().min(1).max(2_200).optional(),
  instagramPanels: z.array(z.strictObject({
    role: z.enum(["cover", "change", "change-impact", "impact", "action", "source"]),
    heading: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(500)
  })).min(3).max(8),
  cta: z.enum(["read-official-source", "check-affected-version", "review-migration-guidance"]),
  altTextInput: z.string().trim().min(1).max(800),
  sourceAttribution: z.array(z.strictObject({ url: HttpsUrlSchema, label: z.string().trim().min(1).max(160) })).min(1).max(20),
  factualSentences: z.array(WebDevFactualSentenceSchema).min(1).max(40),
  claimIdsUsed: z.array(StableId).min(1).max(40),
  affectedVersionRefsUsed: z.array(z.string().trim().min(1).max(120)).max(20),
  affectedAudienceIdsUsed: z.array(StableId).max(20),
  safeActionIdsUsed: z.array(StableId).max(20),
  languageChecks: z.strictObject({
    expectedLocale: z.enum(["cs", "en"]),
    nativeRegister: z.boolean(),
    prohibitedPhraseHits: z.array(z.string().trim().min(1).max(120)).max(20)
  }),
  parityChecks: z.strictObject({
    briefHash: Sha256Schema,
    coreClaimsPresent: z.boolean(),
    uncertaintyPreserved: z.boolean(),
    unsupportedFacts: z.array(BoundedString).max(20)
  }),
  originalityChecks: z.strictObject({
    sourceCopyOverlapRatio: z.number().min(0).max(1),
    literalTranslationRisk: z.boolean(),
    comparedLocalePackageHash: Sha256Schema.nullable()
  }),
  characterCounts: z.strictObject({
    headline: z.number().int().nonnegative(),
    deck: z.number().int().nonnegative(),
    threadsPrimary: z.number().int().nonnegative(),
    instagramCaption: z.number().int().nonnegative()
  }).optional(),
  editorialProvenance: z.strictObject({
    modelRole: z.literal("WEBDEV_SIGNAL_EDITOR"),
    promptVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    localePolicyVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    provider: z.enum(["openai", "anthropic"]).nullable(),
    model: z.string().trim().min(1).max(120).nullable(),
    deterministic: z.boolean()
  }).optional(),
  status: z.enum(["draft", "held", "approved"]),
  heldReason: BoundedString.nullable(),
  contentVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  contentHash: Sha256Schema,
  capabilityRefs: z.array(z.enum([
    "webdev-signal-to-design-lab:bounded-render-summary:bounded-render-summary/1",
    "webdev-signal-to-social-distribution:approved-publish-package:approved-publish-package/1"
  ])).max(2)
}).superRefine((edition, context) => {
  if (edition.locale !== edition.languageChecks.expectedLocale) {
    context.addIssue({ code: "custom", path: ["languageChecks", "expectedLocale"], message: "language check locale must match package locale" });
  }
  if (edition.status === "approved" && (edition.heldReason !== null
    || !edition.languageChecks.nativeRegister
    || edition.languageChecks.prohibitedPhraseHits.length > 0
    || !edition.parityChecks.coreClaimsPresent
    || !edition.parityChecks.uncertaintyPreserved
    || edition.parityChecks.unsupportedFacts.length > 0
    || edition.originalityChecks.sourceCopyOverlapRatio > 0.18
    || edition.originalityChecks.literalTranslationRisk)) {
    context.addIssue({ code: "custom", path: ["status"], message: "approved editions must pass language, parity and originality gates" });
  }
  if (edition.status === "held" && edition.heldReason === null) {
    context.addIssue({ code: "custom", path: ["heldReason"], message: "held editions require a reason" });
  }
  const declaredClaims = new Set(edition.claimIdsUsed);
  edition.factualSentences.forEach((sentence, sentenceIndex) => sentence.claimIds.forEach((id, claimIndex) => {
    if (!declaredClaims.has(id)) context.addIssue({ code: "custom", path: ["factualSentences", sentenceIndex, "claimIds", claimIndex], message: "factual sentence references an undeclared claim" });
  }));
});

export const WebDevDesignStatusSchema = z.enum(["stable", "preview", "security", "breaking", "deprecated"]);
export const WebDevPanelSemanticSchema = z.enum(["lead", "change", "impact", "action", "source", "detail"]);

export const WebDevDesignPayloadSchema = z.strictObject({
  schemaVersion: z.literal("webdev-design-payload/1"),
  venture: z.literal("webdev-signal"),
  edition: z.enum(["CZ", "EN"]),
  locale: z.enum(["cs", "en"]),
  packageRef: EvidenceRefSchema,
  packageHash: Sha256Schema,
  project: z.string().trim().min(1).max(120),
  topic: WebDevTopicSchema,
  changeKind: WebDevChangeKindSchema,
  status: WebDevDesignStatusSchema,
  identifiers: z.array(z.strictObject({
    value: z.string().trim().min(1).max(160),
    classification: z.enum(["release", "affected", "fixed", "package", "advisory", "other"])
  })).max(20),
  panels: z.array(z.strictObject({
    id: z.string().regex(/^panel-[0-9]{2}$/),
    semantics: z.array(WebDevPanelSemanticSchema).min(1).max(3),
    heading: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(500),
    claimIds: z.array(StableId).max(20),
    sourceRefs: z.array(HttpsUrlSchema).max(20)
  })).min(4).max(6),
  sources: z.array(z.strictObject({
    url: HttpsUrlSchema,
    label: z.string().trim().min(1).max(160),
    authority: z.enum(["official-primary", "official-advisory"])
  })).min(1).max(20),
  altTextSemantic: z.string().trim().min(1).max(800),
  brand: z.strictObject({ id: z.literal("webdev-signal"), version: z.literal("1.0.0") }),
  template: z.strictObject({ id: z.string().regex(/^webdev-signal-change-[4-6]$/), version: z.literal("1.0.0") }),
  correction: z.strictObject({ sequence: z.number().int().nonnegative(), supersedesPayloadHash: Sha256Schema.nullable() }),
  expiresAt: DateTimeSchema,
  capabilityRef: z.literal("webdev-signal-to-design-lab:bounded-render-summary:bounded-render-summary/1"),
  contentHash: Sha256Schema
}).superRefine((payload, context) => {
  if ((payload.edition === "CZ") !== (payload.locale === "cs")) {
    context.addIssue({ code: "custom", path: ["edition"], message: "edition marker must match locale" });
  }
  if (payload.template.id !== `webdev-signal-change-${payload.panels.length}`) {
    context.addIssue({ code: "custom", path: ["template", "id"], message: "template length must match panel count" });
  }
  payload.panels.forEach((panel, index) => {
    if (panel.id !== `panel-${String(index + 1).padStart(2, "0")}`) {
      context.addIssue({ code: "custom", path: ["panels", index, "id"], message: "panels must be ordered and contiguous" });
    }
  });
  const semantics = new Set(payload.panels.flatMap((panel) => panel.semantics));
  for (const required of ["lead", "change", "impact", "action", "source"] as const) {
    if (!semantics.has(required)) context.addIssue({ code: "custom", path: ["panels"], message: `missing ${required} semantic` });
  }
  if (!payload.panels[0]?.semantics.includes("lead") || !payload.panels.at(-1)?.semantics.includes("source")) {
    context.addIssue({ code: "custom", path: ["panels"], message: "lead must be first and source proof last" });
  }
  const sourceUrls = new Set(payload.sources.map((source) => source.url));
  payload.panels.forEach((panel, index) => panel.sourceRefs.forEach((ref, refIndex) => {
    if (!sourceUrls.has(ref)) context.addIssue({ code: "custom", path: ["panels", index, "sourceRefs", refIndex], message: "panel source must match an immutable payload source" });
  }));
  if (!payload.panels.at(-1)?.sourceRefs.length) {
    context.addIssue({ code: "custom", path: ["panels", payload.panels.length - 1, "sourceRefs"], message: "source proof panel requires a source" });
  }
});

export const WebDevRenderReceiptSchema = z.strictObject({
  schemaVersion: z.literal("webdev-render-receipt/1"),
  payloadRef: EvidenceRefSchema,
  payloadHash: Sha256Schema,
  packageRef: EvidenceRefSchema,
  packageHash: Sha256Schema,
  locale: z.enum(["cs", "en"]),
  renderer: z.strictObject({
    package: z.literal("@boardlessai/carousel-studio"),
    version: z.literal("1.0.0"),
    templateId: z.string().regex(/^webdev-signal-change-[4-6]$/),
    templateVersion: z.literal("1.0.0"),
    brandId: z.literal("webdev-signal"),
    brandVersion: z.literal("1.0.0"),
    fontSetVersion: z.literal("committed-metrics/1")
  }),
  format: z.literal("instagram-portrait"),
  dimensions: z.strictObject({ width: z.literal(1080), height: z.literal(1350) }),
  outputs: z.array(z.strictObject({
    panelId: z.string().regex(/^panel-[0-9]{2}$/),
    assetRef: EvidenceRefSchema,
    svgHash: Sha256Schema,
    pngHash: Sha256Schema
  })).min(4).max(6),
  panelCount: z.number().int().min(4).max(6),
  checks: z.strictObject({
    schema: z.literal("pass"),
    capability: z.literal("pass"),
    textFit: z.enum(["pass", "fail"]),
    contrast: z.enum(["pass", "fail"]),
    statusNonColor: z.enum(["pass", "fail"]),
    sourcePlacement: z.enum(["pass", "fail"]),
    altTextSemantic: z.enum(["pass", "fail"]),
    exactIdentifiers: z.enum(["pass", "fail"])
  }),
  cache: z.strictObject({ key: Sha256Schema, status: z.enum(["new", "reused"]), reusedReceiptRef: EvidenceRefSchema.nullable() }),
  export: z.strictObject({ startedAt: DateTimeSchema, completedAt: DateTimeSchema, durationMs: z.number().int().nonnegative() }),
  outcome: z.enum(["success", "held", "failed"]),
  reason: BoundedString.nullable(),
  correctionSequence: z.number().int().nonnegative(),
  supersededReceiptRef: EvidenceRefSchema.nullable(),
  providerCostUsd: z.literal(0)
}).superRefine((receipt, context) => {
  if (receipt.outputs.length !== receipt.panelCount) {
    context.addIssue({ code: "custom", path: ["outputs"], message: "output count must match panel count" });
  }
  const failures = Object.values(receipt.checks).filter((status) => status === "fail");
  if (receipt.outcome === "success" && (failures.length > 0 || receipt.reason !== null)) {
    context.addIssue({ code: "custom", path: ["outcome"], message: "successful renders require every gate and no reason" });
  }
  if (receipt.outcome !== "success" && receipt.reason === null) {
    context.addIssue({ code: "custom", path: ["reason"], message: "held or failed renders require an exact reason" });
  }
  if (receipt.cache.status === "reused" && receipt.cache.reusedReceiptRef === null) {
    context.addIssue({ code: "custom", path: ["cache", "reusedReceiptRef"], message: "reused renders require the winning receipt ref" });
  }
});

export const WebDevRunSchema = z.strictObject({
  schemaVersion: z.literal("webdev-run/1"),
  phase: z.literal("webdev-signal-daily"),
  pragueDate: DateSchema,
  mode: z.enum(["fixture", "live"]),
  idempotencyKey: Sha256Schema,
  sourceOutcomes: z.array(z.strictObject({
    sourceId: StableId,
    outcome: z.enum(["success", "empty", "unchanged", "malformed", "layout-changed", "held", "failed"]),
    fetched: z.number().int().nonnegative(),
    kept: z.number().int().nonnegative(),
    dropped: z.number().int().nonnegative()
  })).max(100),
  counts: z.strictObject({
    candidates: z.number().int().nonnegative(),
    new: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    duplicate: z.number().int().nonnegative(),
    malformed: z.number().int().nonnegative()
  }),
  selectionOutcome: z.enum(["selected", "NO_EDITION", "held"]),
  selectionRef: EvidenceRefSchema.nullable(),
  briefRef: EvidenceRefSchema.nullable(),
  packageRefs: z.array(EvidenceRefSchema).max(2),
  renderRefs: z.array(EvidenceRefSchema).max(2),
  queueRefs: z.array(EvidenceRefSchema).max(2),
  model: z.strictObject({
    reservations: z.number().int().min(0).max(2),
    calls: z.number().int().min(0).max(2),
    provider: z.string().trim().min(1).max(80).nullable(),
    model: z.string().trim().min(1).max(120).nullable(),
    reservedUsd: z.number().min(0).max(0.03),
    actualUsd: z.number().min(0).max(0.03)
  }),
  cache: z.strictObject({
    unchangedSources: z.number().int().nonnegative(),
    reusedArtifacts: z.number().int().nonnegative(),
    providerCallsAvoided: z.number().int().nonnegative()
  }),
  errors: z.array(z.strictObject({ code: StableId, sourceId: StableId.nullable(), message: BoundedString })).max(50),
  nextSafeAction: BoundedString
}).superRefine((run, context) => {
  if (run.selectionOutcome === "selected" && run.selectionRef === null) {
    context.addIssue({ code: "custom", path: ["selectionRef"], message: "selected run requires selection evidence" });
  }
  if (run.mode === "fixture" && (run.model.calls !== 0 || run.model.actualUsd !== 0 || run.queueRefs.length > 0)) {
    context.addIssue({ code: "custom", path: ["mode"], message: "fixture runs cannot call models, spend or queue" });
  }
});

function normalizedWords(value: string): string[] {
  return value.toLocaleLowerCase("en").normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/u).filter(Boolean);
}

function lexicalOverlap(left: string, right: string): number {
  const leftWords = new Set(normalizedWords(left));
  const rightWords = new Set(normalizedWords(right));
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length;
  return shared / Math.min(leftWords.size, rightWords.size);
}

export function validateWebDevEditionAgainstBrief(input: {
  brief: z.infer<typeof WebDevEvidenceBriefSchema>;
  edition: z.infer<typeof WebDevEditionPackageSchema>;
}): string[] {
  const reasons: string[] = [];
  const briefClaims = new Set(input.brief.claims.map((claim) => claim.id));
  const requiredClaims = input.brief.claims.filter((claim) => claim.requiredInBothLocales).map((claim) => claim.id);
  const packageClaims = new Set(input.edition.claimIdsUsed);
  if (input.edition.parityChecks.briefHash !== input.brief.contentHash) reasons.push("brief-hash-mismatch");
  if (input.edition.claimIdsUsed.some((id) => !briefClaims.has(id))) reasons.push("unsupported-claim");
  if (requiredClaims.some((id) => !packageClaims.has(id))) reasons.push("missing-core-claim");
  if (input.edition.affectedVersionRefsUsed.some((version) => !input.brief.affectedVersions.includes(version) && !input.brief.fixedVersions.includes(version))) reasons.push("unsupported-version");
  if (input.edition.affectedAudienceIdsUsed.some((id) => !input.brief.affectedAudienceIds.includes(id))) reasons.push("unsupported-audience");
  const actionIds = new Set(input.brief.safeActions.map((action) => action.id));
  if (input.edition.safeActionIdsUsed.some((id) => !actionIds.has(id))) reasons.push("unsupported-action");
  for (const prohibited of input.brief.prohibitedPhrases) {
    if ([input.edition.headline, input.edition.deck, input.edition.explanation, input.edition.threads.primary].some((value) => value.toLocaleLowerCase().includes(prohibited.toLocaleLowerCase()))) {
      reasons.push("prohibited-phrase");
      break;
    }
  }
  return [...new Set(reasons)];
}

export function validateWebDevBilingualParity(input: {
  brief: z.infer<typeof WebDevEvidenceBriefSchema>;
  cs: z.infer<typeof WebDevEditionPackageSchema>;
  en: z.infer<typeof WebDevEditionPackageSchema>;
}): string[] {
  const reasons = [
    ...validateWebDevEditionAgainstBrief({ brief: input.brief, edition: input.cs }).map((reason) => `cs:${reason}`),
    ...validateWebDevEditionAgainstBrief({ brief: input.brief, edition: input.en }).map((reason) => `en:${reason}`)
  ];
  if (input.cs.locale !== "cs" || input.en.locale !== "en") reasons.push("locale-pair-invalid");
  const csClaims = [...new Set(input.cs.claimIdsUsed)].sort();
  const enClaims = [...new Set(input.en.claimIdsUsed)].sort();
  if (JSON.stringify(csClaims) !== JSON.stringify(enClaims)) reasons.push("claim-drift");
  const csText = [input.cs.headline, input.cs.deck, input.cs.explanation, input.cs.threads.primary].join(" ");
  const enText = [input.en.headline, input.en.deck, input.en.explanation, input.en.threads.primary].join(" ");
  if (csText === enText || lexicalOverlap(csText, enText) > 0.72) reasons.push("literal-translation-or-clone");
  if (input.cs.status === "held" && input.en.claimIdsUsed.some((id) => !input.cs.claimIdsUsed.includes(id))) reasons.push("held-cs-en-broader");
  if (input.en.status === "held" && input.cs.claimIdsUsed.some((id) => !input.en.claimIdsUsed.includes(id))) reasons.push("held-en-cs-broader");
  return [...new Set(reasons)];
}

export function parseWebDevCandidates(values: readonly unknown[]): {
  candidates: WebDevCandidate[];
  dropped: number;
} {
  const candidates: WebDevCandidate[] = [];
  let dropped = 0;
  for (const value of values) {
    const parsed = WebDevCandidateSchema.safeParse(value);
    if (parsed.success) candidates.push(parsed.data);
    else dropped += 1;
  }
  return { candidates, dropped };
}

export type WebDevTopic = z.infer<typeof WebDevTopicSchema>;
export type WebDevChangeKind = z.infer<typeof WebDevChangeKindSchema>;
export type WebDevImpactScope = z.infer<typeof WebDevImpactScopeSchema>;
export type WebDevSource = z.infer<typeof WebDevSourceSchema>;
export type WebDevCandidate = z.infer<typeof WebDevCandidateSchema>;
export type WebDevRecord = z.infer<typeof WebDevRecordSchema>;
export type WebDevSelection = z.infer<typeof WebDevSelectionSchema>;
export type WebDevEvidenceBrief = z.infer<typeof WebDevEvidenceBriefSchema>;
export type WebDevEditionPackage = z.infer<typeof WebDevEditionPackageSchema>;
export type WebDevDesignPayload = z.infer<typeof WebDevDesignPayloadSchema>;
export type WebDevRenderReceipt = z.infer<typeof WebDevRenderReceiptSchema>;
export type WebDevRun = z.infer<typeof WebDevRunSchema>;
