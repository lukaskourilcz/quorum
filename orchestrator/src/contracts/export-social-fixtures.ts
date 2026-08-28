import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "../paths.js";
import {
  SocialContinuationProposalSchema,
  SocialLearningCheckpointSchema,
  SocialLearningEvaluationSchema,
  SocialStrategyAdjustmentSchema,
  SOCIAL_LEARNING_FROZEN_GATES,
  socialContinuationProposalHash,
  socialLearningCheckpointHash,
  socialLearningEvaluationHash,
  socialStrategyAdjustmentHash
} from "./social-learning.js";
import { SocialDistributionExperimentRegisterSchema } from "./social-results.js";
import { SocialPreparedCandidateSchema, SocialProfileOperationSchema, SocialRoutineScopeSchema, socialPreparedCandidateHash } from "./social-operations.js";

type JsonRecord = Record<string, unknown>;

async function json(relative: string): Promise<JsonRecord> {
  return JSON.parse(await readFile(path.join(repoRoot, relative), "utf8")) as JsonRecord;
}

function learningFixtures() {
  const evaluationBase = {
    schemaVersion: "social-learning-evaluation/1" as const,
    profileId: "social-profile-caught-up",
    targetRole: "primary" as const,
    strategyId: "social-profile-strategy-caught-up",
    strategyVersion: "1.0.0",
    evaluatedWeek: "2026-08-31",
    evaluatedAt: "2026-08-31T21:00:00.000Z",
    observationRefs: [], operationRefs: [], experimentRefs: [],
    sample: { distinctPosts: 0, measured28dPosts: 0, qualifiedOutcomePosts: 0, unavailablePosts: 0, operationDays: 0, queued: 0, noPost: 0, heldOrFailed: 0, originalPosts: 0, supportPosts: 0, actualCostUsd: null, ownerAttentionCount: 0 },
    robustMetrics: { publishReliability: null, qualifiedActionsMedian: null, referralVisitsMedian: null, reachMedian: null, originalRatio: null, supportRatio: null },
    outlierObservationRefs: [], minimumSample: 8, conclusion: "INSUFFICIENT_DATA" as const,
    signals: ["A minimum measured sample is not available."], proposedAdjustmentRef: null,
    hardGatesFrozen: [...SOCIAL_LEARNING_FROZEN_GATES], authorityGranted: false as const, publishingAuthorized: false as const
  };
  const evaluationHash = socialLearningEvaluationHash(evaluationBase);
  const evaluation = SocialLearningEvaluationSchema.parse({ ...evaluationBase, id: `social-learning-evaluation-${evaluationHash.slice(0, 20)}`, evaluationHash });
  const adjustmentBase = {
    schemaVersion: "social-strategy-adjustment/1" as const, profileId: evaluation.profileId, strategyId: evaluation.strategyId,
    baseVersion: "1.0.0", nextVersion: "1.0.1", status: "proposed" as const,
    change: { kind: "format-priority" as const, targetRef: "evidence-commentary", beforeRank: 1, afterRank: 0, delta: -1 },
    evidenceEvaluationRef: `state/social/learning/evaluations/${evaluation.profileId}/${evaluation.id}.json`,
    evidenceObservationRefs: ["state/social/results/observations/one.json", "state/social/results/observations/two.json", "state/social/results/observations/three.json"],
    explanation: "One bounded rank change for explicit owner review.", hardGatesFrozen: [...SOCIAL_LEARNING_FROZEN_GATES],
    createsSourceOrTarget: false as const, createsCapabilityOrScope: false as const, ownerDecisionRef: null, appliedStrategyRef: null,
    createdAt: evaluation.evaluatedAt, updatedAt: evaluation.evaluatedAt, authorityGranted: false as const, publishingAuthorized: false as const
  };
  const adjustmentHash = socialStrategyAdjustmentHash(adjustmentBase);
  const adjustment = SocialStrategyAdjustmentSchema.parse({ ...adjustmentBase, id: `social-strategy-adjustment-${adjustmentHash.slice(0, 20)}`, adjustmentHash });
  const continuationBase = {
    schemaVersion: "social-continuation-proposal/1" as const, profileId: evaluation.profileId, targetRole: "primary" as const,
    reviewDate: "2026-08-31", validationDays: 28, evaluatedAt: evaluation.evaluatedAt, verdict: "INSUFFICIENT_DATA" as const,
    evidence: { learningEvaluationRef: adjustmentBase.evidenceEvaluationRef, independentAudienceReason: "not-applicable" as const, originalConsistency: "unavailable" as const, ratioPolicy: "unavailable" as const, publishReliability: null, qualifiedOutcomeSample: 0, supportBaselineComparable: false, policyIncidents: 0, actualCostUsd: null, ownerAttentionCount: 0, separateProfileJustified: "unavailable" as const },
    reasons: ["The complete validation window and useful sample are not available."], queueAction: "none" as const,
    ownerDecisionRequired: true as const, externalAccountAction: "none" as const, accountDeleted: false as const,
    accountRetiredAutomatically: false as const, publishingAuthorized: false as const
  };
  const proposalHash = socialContinuationProposalHash(continuationBase);
  const continuation = SocialContinuationProposalSchema.parse({ ...continuationBase, id: `social-continuation-proposal-${proposalHash.slice(0, 20)}`, proposalHash });
  const checkpointBase = {
    schemaVersion: "social-learning-checkpoint/1" as const, profileId: evaluation.profileId, evaluatedWeek: evaluation.evaluatedWeek,
    currentEvaluationRef: adjustmentBase.evidenceEvaluationRef, evaluationRefs: [adjustmentBase.evidenceEvaluationRef],
    adjustmentEventRefs: [`state/social/learning/adjustments/${evaluation.profileId}/${adjustment.id}.json`],
    continuationRefs: [`state/social/learning/continuations/${evaluation.profileId}/${continuation.id}.json`],
    strategyVersionRefs: ["config/social-profile-strategies.json#social-profile-strategy-caught-up"], correctionCount: 0,
    generatedAt: evaluation.evaluatedAt, authorityGranted: false as const, publishingAuthorized: false as const
  };
  const checkpoint = SocialLearningCheckpointSchema.parse({ ...checkpointBase, checkpointHash: socialLearningCheckpointHash(checkpointBase) });
  return { evaluation, adjustment, continuation, checkpoint };
}

function operationFixtures() {
  const scope = SocialRoutineScopeSchema.parse({
    schemaVersion: "social-routine-scope/1", id: "social-routine-scope-caught-up-threads-original", version: "1.0.0", status: "active",
    profileId: "social-profile-caught-up", connectionId: "social-connection-caught-up-threads", platform: "threads", locales: ["en"],
    allowedContentClasses: ["original"], allowedFormats: ["evidence-commentary"], allowedSourceKinds: ["strategy-owned"],
    evidenceRequirements: { minimumEvidenceRefs: 2, approvedPackageRequired: true, campaignApprovalRequired: false, claimsRequired: true, accessibilityRequired: true },
    bounds: { maximumPostsPerDay: 1, minimumHoursBetweenPosts: 20, maximumItemCostUsd: 0 }, effectiveOn: "2026-08-28", expiresOn: "2026-09-28",
    prohibitedRiskClasses: ["political", "sensitive", "novel", "paid", "policy-changing"], prohibitedActions: ["account-create", "oauth", "credential-change", "provider-change", "engagement", "dm", "ad", "contest", "silent-failover"],
    approvalRef: "owner:scope-approval-001", countersignatureRef: "owner:scope-countersignature-001", revocationRef: null,
    killBehavior: "pause-and-preserve-evidence", history: [{ revision: 1, at: "2026-08-28T00:00:00.000Z", action: "countersigned", actor: "owner", evidenceRef: "owner:scope-countersignature-001", reason: "Exact low-risk Threads evidence commentary only." }],
    authorityGranted: false, publishingAuthorized: false
  });
  const candidateBase = {
    schemaVersion: "social-prepared-candidate/1" as const, candidateId: "social-inventory-candidate-aaaaaaaaaaaaaaaaaaaa", sourceVentureId: "caught-up", releaseId: "caught-up-original-2026-08-28", campaignId: "caught-up-original-2026-08-28",
    target: { profileId: "social-profile-caught-up", profileRole: "venture-primary" as const, role: "primary" as const, connectionId: "social-connection-caught-up-threads", capabilityRef: null, amplifierEligibilityRef: null, campaignApprovalRef: null },
    sourcePackage: { schemaVersion: "approved-publish-package/1" as const, artifactRef: "state/ventures/caught-up/packages/2026-08-28.json", packageHash: "a".repeat(64) }, objective: "trust" as const,
    audience: "People evaluating evidence-backed AI products.", destination: "https://example.com/caught-up", utm: { source: "threads" as const, medium: "organic_social" as const, campaign: "caught-up-original-2026-08-28", content: "evidence-commentary" },
    content: { text: "A bounded evidence-backed update.", altText: null, assetPaths: [], factualClaimRefs: ["evidence:caught-up-update"], rendererVersion: "carousel-studio-1" as const },
    publishWindow: { notBefore: "2026-08-28T08:00:00.000Z", notAfter: "2026-08-28T20:00:00.000Z" }, formatId: "evidence-commentary", sourceKind: "strategy-owned" as const, contentClass: "original" as const, riskClass: "low" as const,
    evidenceRefs: ["config/social-profile-strategies.json", "owner:prepared-content-001"], checks: { schema: "pass" as const, brand: "pass" as const, claims: "pass" as const, quill: "pass" as const, keeper: "pass" as const, duplicate: "pass" as const, accessibility: "pass" as const, budget: "pass" as const, capability: "pass" as const, policy: "pass" as const },
    approvalRef: "owner:prepared-content-001", estimatedCostUsd: 0, queueAuthorized: false as const, publishingAuthorized: false as const
  };
  const candidate = SocialPreparedCandidateSchema.parse({ ...candidateBase, preparedHash: socialPreparedCandidateHash(candidateBase) });
  const operation = SocialProfileOperationSchema.parse({
    schemaVersion: "social-profile-operation/1", id: "social-profile-operation-aaaaaaaaaaaaaaaaaaaa", idempotencyKey: "a".repeat(64), inputHash: "b".repeat(64), supersedesOperationRef: null,
    profileId: "social-profile-caught-up", connectionId: "social-connection-caught-up-threads", strategyRef: "config/social-profile-strategies.json#social-profile-strategy-caught-up", inventoryRef: "state/social/inventory/social-profile-caught-up/current.json", campaignRefs: [],
    targetDate: "2026-08-28", timezone: "Europe/Prague", selectionWindow: { notBefore: "2026-08-28T08:00:00.000Z", notAfter: "2026-08-28T20:00:00.000Z" }, candidateRefs: ["state/social/inventory-candidates/social-inventory-candidate-aaaaaaaaaaaaaaaaaaaa.json"], candidateSetHash: "c".repeat(64),
    selectedCandidateRef: "state/social/inventory-candidates/social-inventory-candidate-aaaaaaaaaaaaaaaaaaaa.json", immutableHashes: { targetHash: "d".repeat(64), contentHash: "e".repeat(64), assetHash: "f".repeat(64), windowHash: "1".repeat(64) },
    gates: [{ gate: "routine-scope", status: "pass", reason: "Exact countersigned scope match.", evidenceRef: "owner:scope-countersignature-001" }], routineScopeRef: "config/social-routine-scopes.json#social-routine-scope-caught-up-threads-original", routineScopeState: "matched",
    queue: { itemId: "social-daily-caught-up-2026-08-28", itemRef: "state/social/queue/social-daily-caught-up-2026-08-28.json", payloadHash: "e".repeat(64), status: "queued" }, outcome: "queued", reasons: ["selected"], providerConnectionState: "ready",
    actualCostUsd: 0, reuseRefs: [], incidentRefs: [], ownerAttentionRefs: [], replayed: false, createdAt: "2026-08-28T08:00:00.000Z", authorityGranted: false, publishingAuthorized: false
  });
  return { scope, candidate, operation };
}

export async function exportSocialContractFixtures(): Promise<void> {
  const [provider, inventory, results, strategies] = await Promise.all([
    json("contracts/fixtures/social-provider-contracts.valid.json"), json("contracts/fixtures/social-inventory-contracts.valid.json"),
    json("contracts/fixtures/social-results-contracts.valid.json"), json("config/social-profile-strategies.json")
  ]);
  const experimentRegister = SocialDistributionExperimentRegisterSchema.parse({ schemaVersion: "social-distribution-experiment-register/1", experiments: [results.experiment], updatedAt: "2026-08-28T08:00:00.000Z", authorityGranted: false });
  const operations = operationFixtures(); const learning = learningFixtures();
  const fixtures: Record<string, unknown> = {
    "social-provider": provider.provider, "provider-connection-binding": provider.binding, "provider-delivery-receipt": provider.receipt, "provider-health": provider.health,
    "social-profile-strategy": (strategies.strategies as unknown[])[0], "social-inventory-candidate": inventory.candidate, "social-profile-inventory": inventory.inventory, "social-inventory-build-receipt": inventory.receipt,
    "social-metric-observation": results.observation, "social-attribution-event": results.attribution, "social-distribution-baseline": results.baseline, "social-distribution-experiment": results.experiment,
    "social-distribution-experiment-register": experimentRegister, "social-boost-proposal": results.boostProposal,
    "social-routine-scope": operations.scope, "social-prepared-candidate": operations.candidate, "social-profile-operation": operations.operation,
    "social-learning-evaluation": learning.evaluation, "social-strategy-adjustment": learning.adjustment, "social-continuation-proposal": learning.continuation, "social-learning-checkpoint": learning.checkpoint
  };
  const outputRoot = path.join(repoRoot, "contracts/fixtures"); await mkdir(outputRoot, { recursive: true });
  await Promise.all(Object.entries(fixtures).flatMap(([name, value]) => [
    writeFile(path.join(outputRoot, `${name}.valid.json`), `${JSON.stringify(value, null, 2)}\n`),
    writeFile(path.join(outputRoot, `${name}.poison.json`), "{}\n")
  ]));
}
