import { describe, expect, it } from "vitest";
import {
  SocialPreparedCandidateSchema,
  SocialProfileOperationSchema,
  SocialRoutineScopeSchema,
  socialPreparedCandidateHash,
  type SocialPreparedCandidate,
  type SocialRoutineScope
} from "../src/contracts/social-operations.js";

export function routineScope(overrides: Partial<SocialRoutineScope> = {}): SocialRoutineScope {
  return SocialRoutineScopeSchema.parse({
    schemaVersion: "social-routine-scope/1",
    id: "social-routine-scope-caught-up-threads-original",
    version: "1.0.0",
    status: "active",
    profileId: "social-profile-caught-up",
    connectionId: "social-connection-caught-up-threads",
    platform: "threads",
    locales: ["en"],
    allowedContentClasses: ["original"],
    allowedFormats: ["evidence-commentary"],
    allowedSourceKinds: ["strategy-owned"],
    evidenceRequirements: { minimumEvidenceRefs: 2, approvedPackageRequired: true, campaignApprovalRequired: false, claimsRequired: true, accessibilityRequired: true },
    bounds: { maximumPostsPerDay: 1, minimumHoursBetweenPosts: 20, maximumItemCostUsd: 0 },
    effectiveOn: "2026-08-28",
    expiresOn: "2026-09-28",
    prohibitedRiskClasses: ["political", "sensitive", "novel", "paid", "policy-changing"],
    prohibitedActions: ["account-create", "oauth", "credential-change", "provider-change", "engagement", "dm", "ad", "contest", "silent-failover"],
    approvalRef: "owner:scope-approval-001",
    countersignatureRef: "owner:scope-countersignature-001",
    revocationRef: null,
    killBehavior: "pause-and-preserve-evidence",
    history: [{ revision: 1, at: "2026-08-28T00:00:00.000Z", action: "countersigned", actor: "owner", evidenceRef: "owner:scope-countersignature-001", reason: "Exact low-risk Threads evidence commentary only." }],
    authorityGranted: false,
    publishingAuthorized: false,
    ...overrides
  });
}

export function preparedCandidate(overrides: Partial<SocialPreparedCandidate> = {}): SocialPreparedCandidate {
  const base = {
    schemaVersion: "social-prepared-candidate/1" as const,
    candidateId: "social-inventory-candidate-aaaaaaaaaaaaaaaaaaaa",
    sourceVentureId: "caught-up",
    releaseId: "caught-up-original-2026-08-28",
    campaignId: "caught-up-original-2026-08-28",
    target: { profileId: "social-profile-caught-up", profileRole: "venture-primary" as const, role: "primary" as const, connectionId: "social-connection-caught-up-threads", capabilityRef: null, amplifierEligibilityRef: null, campaignApprovalRef: null },
    sourcePackage: { schemaVersion: "approved-publish-package/1" as const, artifactRef: "state/ventures/caught-up/packages/2026-08-28.json", packageHash: "a".repeat(64) },
    objective: "trust" as const,
    audience: "People evaluating evidence-backed AI products.",
    destination: "https://example.com/caught-up",
    utm: { source: "threads" as const, medium: "organic_social" as const, campaign: "caught-up-original-2026-08-28", content: "evidence-commentary" },
    content: { text: "A bounded evidence-backed update.", altText: null, assetPaths: [], factualClaimRefs: ["evidence:caught-up-update"], rendererVersion: "carousel-studio-1" as const },
    publishWindow: { notBefore: "2026-08-28T08:00:00.000Z", notAfter: "2026-08-28T20:00:00.000Z" },
    formatId: "evidence-commentary",
    sourceKind: "strategy-owned" as const,
    contentClass: "original" as const,
    riskClass: "low" as const,
    evidenceRefs: ["config/social-profile-strategies.json", "owner:prepared-content-001"],
    checks: { schema: "pass" as const, brand: "pass" as const, claims: "pass" as const, quill: "pass" as const, keeper: "pass" as const, duplicate: "pass" as const, accessibility: "pass" as const, budget: "pass" as const, capability: "pass" as const, policy: "pass" as const },
    approvalRef: "owner:prepared-content-001",
    estimatedCostUsd: 0,
    queueAuthorized: false as const,
    publishingAuthorized: false as const,
    ...overrides
  };
  return SocialPreparedCandidateSchema.parse({ ...base, preparedHash: socialPreparedCandidateHash(base as Omit<SocialPreparedCandidate, "preparedHash">) });
}

describe("Social daily-operation contracts", () => {
  it("accepts one exact countersigned scope and rejects wildcard/generic authority", () => {
    expect(routineScope()).toMatchObject({ status: "active", authorityGranted: false, publishingAuthorized: false });
    expect(SocialRoutineScopeSchema.safeParse({ ...routineScope(), allowedFormats: ["*"] }).success).toBe(false);
    expect(SocialRoutineScopeSchema.safeParse({ ...routineScope(), allowedFormats: ["all"] }).success).toBe(false);
    expect(SocialRoutineScopeSchema.safeParse({ ...routineScope(), countersignatureRef: null }).success).toBe(false);
    expect(SocialRoutineScopeSchema.safeParse({ ...routineScope(), prohibitedActions: ["engagement"] }).success).toBe(false);
  });

  it("binds one immutable prepared item and preserves sensitive items for later review", () => {
    expect(preparedCandidate()).toMatchObject({ contentClass: "original", riskClass: "low", queueAuthorized: false, publishingAuthorized: false });
    expect(SocialPreparedCandidateSchema.safeParse({ ...preparedCandidate(), content: { ...preparedCandidate().content, assetPaths: ["/social/example.png"], altText: null } }).success).toBe(false);
    expect(preparedCandidate({ riskClass: "sensitive" })).toMatchObject({ riskClass: "sensitive", queueAuthorized: false });
    expect(SocialPreparedCandidateSchema.safeParse({ ...preparedCandidate(), accountAction: "oauth" }).success).toBe(false);
  });

  it("requires queued operations to name scope, selection and immutable queue hashes", () => {
    const operation = {
      schemaVersion: "social-profile-operation/1",
      id: "social-profile-operation-aaaaaaaaaaaaaaaaaaaa",
      idempotencyKey: "a".repeat(64),
      inputHash: "b".repeat(64),
      supersedesOperationRef: null,
      profileId: "social-profile-caught-up",
      connectionId: "social-connection-caught-up-threads",
      strategyRef: "config/social-profile-strategies.json#social-profile-strategy-caught-up",
      inventoryRef: "state/social/inventory/social-profile-caught-up/current.json",
      campaignRefs: [],
      targetDate: "2026-08-28",
      timezone: "Europe/Prague",
      selectionWindow: { notBefore: "2026-08-28T08:00:00.000Z", notAfter: "2026-08-28T20:00:00.000Z" },
      candidateRefs: ["state/social/inventory-candidates/social-inventory-candidate-aaaaaaaaaaaaaaaaaaaa.json"],
      candidateSetHash: "c".repeat(64),
      selectedCandidateRef: "state/social/inventory-candidates/social-inventory-candidate-aaaaaaaaaaaaaaaaaaaa.json",
      immutableHashes: { targetHash: "d".repeat(64), contentHash: "e".repeat(64), assetHash: "f".repeat(64), windowHash: "1".repeat(64) },
      gates: [{ gate: "routine-scope", status: "pass", reason: "Exact countersigned scope match.", evidenceRef: "owner:scope-countersignature-001" }],
      routineScopeRef: "config/social-routine-scopes.json#social-routine-scope-caught-up-threads-original",
      routineScopeState: "matched",
      queue: { itemId: "social-daily-caught-up-2026-08-28", itemRef: "state/social/queue/social-daily-caught-up-2026-08-28.json", payloadHash: "e".repeat(64), status: "queued" },
      outcome: "queued",
      reasons: ["selected"],
      providerConnectionState: "ready",
      actualCostUsd: 0,
      reuseRefs: [],
      incidentRefs: [],
      ownerAttentionRefs: [],
      replayed: false,
      createdAt: "2026-08-28T08:00:00.000Z",
      authorityGranted: false,
      publishingAuthorized: false
    } as const;
    expect(SocialProfileOperationSchema.safeParse(operation).success).toBe(true);
    expect(SocialProfileOperationSchema.safeParse({ ...operation, routineScopeRef: null, routineScopeState: "missing" }).success).toBe(false);
    expect(SocialProfileOperationSchema.safeParse({ ...operation, outcome: "NO_POST", queue: null }).success).toBe(false);
  });
});
