export type AdminOperationHealth =
  | "healthy"
  | "quiet"
  | "held"
  | "degraded"
  | "stale"
  | "failing"
  | "paused"
  | "setup-needed"
  | "unavailable";

export type AdminOperationLifecycle = "operating" | "exploration" | "planned" | "paused" | "setup-needed";

export interface AdminOperationCapabilityEdge {
  source: string;
  target: string;
  capability: string;
  dataSchemaVersion: string;
  decision: "allowed" | "held" | "denied";
  reason: string;
  governingReference: string;
  runtimeEnforcementPoint: string;
  testProbeReference: string;
}

export interface AdminOperationNode {
  id: string;
  displayName: string;
  classification: string;
  lifecycleStage: AdminOperationLifecycle;
  cadence: { kind: string; windows: string[]; timezone: "Europe/Prague" };
  health: AdminOperationHealth;
  reason: string;
  sloState: "satisfied" | "missed" | "unavailable";
  freshnessState: "fresh" | "stale" | "unavailable";
  dueWindow: string | null;
  rollingOutcomes: { considered: number; satisfying: number; failed: number; quiet: number; held: number; consecutiveFailures: number } | null;
  unavailableReasons: string[];
  slo: {
    policyVersion: string;
    maximumLatenessMinutes: number | null;
    maximumStalenessMinutes: number | null;
    rollingValidRunTarget: number | null;
    recoveryTargetMinutes: number | null;
  };
  lastValidAt: string | null;
  nextExpectedAt: string | null;
  queue: { state: string; pending: number | null };
  autonomyEligible: boolean | null;
  dependencyNodeIds: string[];
  dependencyHealthRefs: string[];
  holds: { budget: number; provider: number; source: number; credential: number; owner: number } | null;
  recovery: { maximumAttempts: number | null; cooldownMinutes: number | null; permittedActions: string[]; automaticResume: boolean | null };
  ownerAttentionRefs: string[];
  evidenceRefs: string[];
  capability: {
    authorityRequirement: string;
    privacyClassification: string;
    dataActionClasses: string[];
    inboundAllowed: number | null;
    inboundHeld: number | null;
    outboundAllowed: number | null;
    outboundHeld: number | null;
  };
  implementation: { programId: string; currentItemId: string | null; state: string } | null;
  recordState: "present" | "missing" | "malformed";
}

export interface AdminOperationCapacityJob {
  id: string;
  nodeId: string;
  phase: string;
  classification: "mandatory" | "optional" | "held";
  dueAt: string;
  decision: "run" | "reuse" | "skipped" | "deferred" | "held" | "not-due";
  reason: string;
  expectedCostUsd: number;
  nodeBudgetHeadroomUsd: number;
  providerIds: string[];
  acceptedArtifactRef: string | null;
  nextEligibleAt: string | null;
}

export interface AdminOperationIncident {
  id: string;
  nodeId: string;
  affectedScope: string;
  unaffectedScope: string;
  impact: string;
  exactOwnerAction: string;
  retryCondition: string;
  sourcePolicyRef: string;
  firstSeenAt: string;
  lastSeenAt: string;
  status: "active" | "corrected" | "resolved";
  correctionCount: number;
  evidenceRefs: string[];
}

export interface AdminOperationsSnapshot {
  state: "present" | "partial" | "unavailable";
  generatedAt: string | null;
  snapshotHash: string;
  sourceStates: Record<
    "registry" | "capabilities" | "slos" | "recovery" | "health" | "capacity" | "incidents" | "ownerAttention" | "implementationProgress" | "deployment",
    "present" | "missing" | "malformed"
  >;
  unreadableRecords: number;
  nodes: AdminOperationNode[];
  healthCounts: Record<AdminOperationHealth, number>;
  capacity: {
    state: "present" | "missing" | "malformed";
    generatedAt: string | null;
    period: string | null;
    budget: { maximumUsd: number; spentUsd: number; reservedUsd: number; headroomUsd: number } | null;
    counts: { due: number; running: number; reused: number; skipped: number; held: number; deferred: number } | null;
    collisionCount: number | null;
    activeLeaseRefs: string[];
    providerHeadroom: Array<{ providerId: string; remaining: number }>;
    jobs: AdminOperationCapacityJob[];
  };
  incidents: {
    state: "present" | "missing" | "malformed";
    generatedAt: string | null;
    activeCount: number | null;
    nextRetryAt: string | null;
    recentAttemptRefs: string[];
    pausedScopes: string[];
    exactOwnerActions: string[];
    affectedNodeIds: string[];
    unaffectedNodeIds: string[];
    policyVersions: string[];
    killSwitchActive: boolean | null;
    statistics: {
      consideredAttempts: number;
      recovered: number;
      failed: number;
      ambiguous: number;
      ownerRequired: number;
      meanRecoveryMinutes: number | null;
      costUsd: number;
    } | null;
    records: AdminOperationIncident[];
  };
  capabilities: {
    mapVersion: string | null;
    defaultPosture: "deny";
    allowed: number | null;
    held: number | null;
    denied: number | null;
    edges: AdminOperationCapabilityEdge[];
    isolationRules: Array<{ id: string; reason: string; governingReference: string }>;
  };
  implementation: {
    state: "present" | "missing" | "malformed";
    generatedAt: string | null;
    sourceFreshness: string;
    programs: number | null;
    mandatoryCompleted: number | null;
    mandatoryTotal: number | null;
    ownerActions: number | null;
    evidenceRisks: number | null;
    unreadableItems: number | null;
    currentProgramId: string | null;
    currentItemId: string | null;
    currentItemState: string | null;
    finalGateReady: boolean | null;
    nextUnblockedItemIds: string[];
    ownerWaitingItemIds: string[];
  };
  deployment: {
    state: "present" | "missing" | "malformed";
    gitDeploymentEnabled: false | null;
    scheduledByOperations: false;
    posture: string;
    evidenceRef: string;
  };
  monetizationPosture: "information-only";
}
