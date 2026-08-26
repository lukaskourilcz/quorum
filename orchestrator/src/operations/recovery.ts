import type { OwnerAttention } from "../contracts/owner-attention.js";
import {
  OperationsIncidentSnapshotSchema,
  RecoveryActionSchema,
  VentureRecoveryAttemptSchema,
  type OperationsIncidentSnapshot,
  type RecoveryAction,
  type VentureRecoveryAttempt,
  type VentureRecoveryPolicy
} from "../contracts/venture-recovery.js";
import type { VentureOperationHealth } from "../contracts/venture-operations.js";
import { canonicalJson, sha256 } from "../hashing.js";

export type OperationalIncident = NonNullable<OwnerAttention["operationalIncidents"]>[number];

export interface RecoveryRequest {
  attemptId: string;
  idempotencyKey: string;
  nodeId: string;
  phase: string;
  jobId: string;
  itemRef: string | null;
  affectedScope: string;
  unaffectedScope: string;
  conditionKey: string;
  action: string;
  mode: VentureRecoveryAttempt["mode"];
  health: VentureOperationHealth;
  triggerHealthRef: string;
  triggerSloRef: string;
  evidenceRefs: string[];
  beforeStateHash: string;
  expectedSafeOutcome: string;
  now: string;
  previousAttempts: readonly unknown[];
  ambiguousExistingWork: boolean;
  leaseGranted: boolean;
  transientConditionCleared: boolean;
  currentAuthorityPresent: boolean;
  activeKillSwitches: ReadonlySet<string>;
  incrementalCostUsd: number;
  exactOwnerAction: string;
  impact: string;
  retryCondition: string;
}

export interface DomainRecoveryResult {
  result: "recovered" | "unchanged" | "held" | "failed" | "ambiguous" | "paused" | "owner-required";
  endedAt: string;
  afterStateRef: string | null;
  receiptRefs: string[];
  error: string | null;
  nextEligibleAt: string | null;
}

export interface RecoveryControllerResult {
  decision: "executed" | "held" | "rejected";
  reason: string;
  attempt: VentureRecoveryAttempt | null;
  ownerIncident: OperationalIncident | null;
}

function operationalIncident(input: RecoveryRequest, policy: VentureRecoveryPolicy): OperationalIncident {
  return {
    incidentId: `incident-${sha256(input.conditionKey).slice(0, 24)}`,
    conditionKey: input.conditionKey,
    nodeId: input.nodeId,
    affectedScope: input.affectedScope,
    firstSeenAt: input.now,
    lastSeenAt: input.now,
    evidenceRefs: [...new Set(input.evidenceRefs)].sort().slice(0, 24),
    exactOwnerAction: input.exactOwnerAction,
    impact: input.impact,
    unaffectedScope: input.unaffectedScope,
    retryCondition: input.retryCondition,
    sourcePolicyRef: `config/operations-recovery.json#${policy.nodeId}:${policy.phase}`,
    status: "active",
    correctionHistory: []
  };
}

export function upsertOperationalIncident(
  attention: OwnerAttention,
  incident: OperationalIncident
): OwnerAttention {
  const incidents = [...(attention.operationalIncidents ?? [])];
  const index = incidents.findIndex((candidate) => candidate.conditionKey === incident.conditionKey && candidate.status === "active");
  if (index >= 0) {
    const existing = incidents[index]!;
    incidents[index] = {
      ...incident,
      incidentId: existing.incidentId,
      firstSeenAt: existing.firstSeenAt,
      evidenceRefs: [...new Set([...existing.evidenceRefs, ...incident.evidenceRefs])].sort().slice(0, 24),
      correctionHistory: existing.correctionHistory
    };
  } else {
    incidents.push(incident);
  }
  return {
    ...attention,
    operationalIncidents: incidents
      .sort((left, right) => left.conditionKey.localeCompare(right.conditionKey))
      .slice(-100)
  };
}

function priorAttempts(request: RecoveryRequest): VentureRecoveryAttempt[] {
  return request.previousAttempts.flatMap((value) => {
    const parsed = VentureRecoveryAttemptSchema.safeParse(value);
    return parsed.success
      && parsed.data.nodeId === request.nodeId
      && parsed.data.conditionKey === request.conditionKey
      && parsed.data.mode === "live"
      ? [parsed.data]
      : [];
  }).sort((left, right) => left.endedAt.localeCompare(right.endedAt));
}

function buildAttempt(input: {
  request: RecoveryRequest;
  policy: VentureRecoveryPolicy;
  action: RecoveryAction;
  result: DomainRecoveryResult;
  ownerIncident: OperationalIncident | null;
}): VentureRecoveryAttempt {
  return VentureRecoveryAttemptSchema.parse({
    schemaVersion: "venture-recovery-attempt/1",
    attemptId: input.request.attemptId,
    idempotencyKey: input.request.idempotencyKey,
    nodeId: input.request.nodeId,
    phase: input.request.phase,
    jobId: input.request.jobId,
    itemRef: input.request.itemRef,
    conditionKey: input.request.conditionKey,
    triggerHealthRef: input.request.triggerHealthRef,
    triggerSloRef: input.request.triggerSloRef,
    evidenceRefs: [...new Set(input.request.evidenceRefs)].sort(),
    policyRef: `config/operations-recovery.json#${input.policy.nodeId}:${input.policy.phase}`,
    policyVersion: input.policy.policyVersion,
    action: input.action,
    mode: input.request.mode,
    beforeStateHash: input.request.beforeStateHash,
    expectedSafeOutcome: input.request.expectedSafeOutcome,
    startedAt: input.request.now,
    endedAt: input.result.endedAt,
    durationMs: Math.max(0, Date.parse(input.result.endedAt) - Date.parse(input.request.now)),
    costReservationUsd: 0,
    actualCostUsd: 0,
    result: input.result.result,
    afterStateRef: input.result.afterStateRef,
    receiptRefs: [...new Set(input.result.receiptRefs)].sort(),
    error: input.result.error,
    nextEligibleAt: input.result.nextEligibleAt,
    ownerAttentionRef: input.ownerIncident
      ? `state/owner-attention.json#${input.ownerIncident.incidentId}`
      : null,
    supersedesAttemptRef: null
  });
}

export async function evaluateRecovery(input: {
  request: RecoveryRequest;
  policy: VentureRecoveryPolicy;
  execute: (action: RecoveryAction) => Promise<DomainRecoveryResult>;
}): Promise<RecoveryControllerResult> {
  const { request, policy } = input;
  const action = RecoveryActionSchema.safeParse(request.action);
  if (!action.success) {
    return { decision: "rejected", reason: "Unknown or permanently prohibited recovery action.", attempt: null, ownerIncident: null };
  }
  if (policy.nodeId !== request.nodeId || policy.phase !== request.phase) {
    return { decision: "rejected", reason: "No exact recovery policy matches this node and phase.", attempt: null, ownerIncident: null };
  }
  if (!policy.triggerStates.includes(request.health.state)) {
    const ownerBlocked = request.health.state === "setup-needed"
      || (request.health.state === "held"
        && (request.health.holds.credential.length > 0 || request.health.holds.owner.length > 0));
    return {
      decision: "held",
      reason: "Current health does not permit automatic recovery.",
      attempt: null,
      ownerIncident: ownerBlocked ? operationalIncident(request, policy) : null
    };
  }
  if (!policy.permittedActions.includes(action.data)) {
    const incident = operationalIncident(request, policy);
    return { decision: "rejected", reason: "The exact recovery action is not pre-authorised by policy.", attempt: null, ownerIncident: incident };
  }
  if (policy.killSwitchKeys.some((key) => request.activeKillSwitches.has(key))) {
    return { decision: "held", reason: "A global or node recovery kill switch is active.", attempt: null, ownerIncident: null };
  }
  if (request.incrementalCostUsd !== 0 || request.incrementalCostUsd > policy.maximumIncrementalCostUsd) {
    const incident = operationalIncident(request, policy);
    return { decision: "rejected", reason: "Recovery cannot spend or raise an envelope under this $0 policy.", attempt: null, ownerIncident: incident };
  }
  const previous = priorAttempts(request);
  if (previous.some((attempt) => attempt.idempotencyKey === request.idempotencyKey)) {
    return { decision: "held", reason: "This idempotent recovery attempt is already recorded.", attempt: null, ownerIncident: null };
  }
  if (previous.length >= policy.maximumAttempts) {
    const incident = operationalIncident(request, policy);
    return { decision: "held", reason: "The exact condition reached its maximum automatic attempts.", attempt: null, ownerIncident: incident };
  }
  const latest = previous.at(-1);
  const nextEligibleAt = latest
    ? latest.nextEligibleAt ?? new Date(Date.parse(latest.endedAt) + policy.cooldownMinutes * 60_000).toISOString()
    : null;
  if (nextEligibleAt && Date.parse(nextEligibleAt) > Date.parse(request.now)) {
    return { decision: "held", reason: "The policy cooldown has not elapsed.", attempt: null, ownerIncident: null };
  }
  if (request.ambiguousExistingWork && action.data !== "reconcile-ambiguous") {
    return { decision: "held", reason: "Ambiguous existing work must reconcile before any replay or retry.", attempt: null, ownerIncident: null };
  }
  if (!request.leaseGranted) {
    return { decision: "held", reason: "The owning scope does not hold the required bounded lease.", attempt: null, ownerIncident: null };
  }
  if (action.data === "resume-transient") {
    if (!policy.automaticResume.allowed || !request.transientConditionCleared || !request.currentAuthorityPresent) {
      const incident = operationalIncident(request, policy);
      return { decision: "held", reason: "Automatic resume requires an explicitly cleared transient condition and current authority.", attempt: null, ownerIncident: incident };
    }
  }
  if (request.mode === "dry" || request.mode === "fixture" || request.mode === "validation") {
    const dryResult: DomainRecoveryResult = {
      result: "unchanged",
      endedAt: request.now,
      afterStateRef: null,
      receiptRefs: [],
      error: null,
      nextEligibleAt: null
    };
    return {
      decision: "held",
      reason: "Non-live evaluation recorded no recovery mutation.",
      attempt: buildAttempt({ request, policy, action: action.data, result: dryResult, ownerIncident: null }),
      ownerIncident: null
    };
  }

  const result = await input.execute(action.data);
  const shouldEscalate = result.result === "owner-required"
    || result.result === "ambiguous"
    || (result.result === "failed" && previous.length + 1 >= policy.ownerAttentionThreshold);
  const incident = shouldEscalate ? operationalIncident(request, policy) : null;
  const attempt = buildAttempt({ request, policy, action: action.data, result, ownerIncident: incident });
  return {
    decision: "executed",
    reason: result.result === "recovered" ? "The owning domain primitive recovered the exact scope." : `The owning primitive returned ${result.result}.`,
    attempt,
    ownerIncident: incident
  };
}

export function buildIncidentSnapshot(input: {
  generatedAt: string;
  attempts: readonly unknown[];
  incidents: readonly OperationalIncident[];
  allNodeIds: readonly string[];
  killSwitchActive: boolean;
}): OperationsIncidentSnapshot {
  const attempts = input.attempts.flatMap((value) => {
    const parsed = VentureRecoveryAttemptSchema.safeParse(value);
    return parsed.success && parsed.data.mode === "live" ? [parsed.data] : [];
  });
  const active = input.incidents.filter((incident) => incident.status === "active");
  const affected = [...new Set(active.map((incident) => incident.nodeId))].sort();
  const recoveredDurations = attempts
    .filter((attempt) => attempt.result === "recovered")
    .map((attempt) => attempt.durationMs / 60_000);
  const nextRetryAt = attempts.flatMap((attempt) => attempt.nextEligibleAt ? [attempt.nextEligibleAt] : []).sort()[0] ?? null;
  const withoutHash = {
    schemaVersion: "operations-incident-snapshot/1" as const,
    generatedAt: input.generatedAt,
    activeIncidentRefs: active.map((incident) => `state/owner-attention.json#${incident.incidentId}`).sort(),
    recentAttemptRefs: attempts.slice(-32).map((attempt) => `state/operations/recovery/${attempt.attemptId}.json`),
    pausedScopes: attempts.filter((attempt) => attempt.result === "paused").flatMap((attempt) => attempt.itemRef ? [attempt.itemRef] : [attempt.phase]),
    nextRetryAt,
    exactOwnerActions: [...new Set(active.map((incident) => incident.exactOwnerAction))].sort(),
    affectedNodeIds: affected,
    unaffectedNodeIds: [...new Set(input.allNodeIds.filter((nodeId) => !affected.includes(nodeId)))].sort(),
    policyVersions: [...new Set(attempts.map((attempt) => attempt.policyVersion))].sort(),
    killSwitchActive: input.killSwitchActive,
    statistics: {
      consideredAttempts: attempts.length,
      recovered: attempts.filter((attempt) => attempt.result === "recovered").length,
      failed: attempts.filter((attempt) => attempt.result === "failed").length,
      ambiguous: attempts.filter((attempt) => attempt.result === "ambiguous").length,
      ownerRequired: attempts.filter((attempt) => attempt.result === "owner-required").length,
      meanRecoveryMinutes: recoveredDurations.length > 0
        ? recoveredDurations.reduce((total, duration) => total + duration, 0) / recoveredDurations.length
        : null,
      costUsd: attempts.reduce((total, attempt) => total + attempt.actualCostUsd, 0)
    }
  };
  return OperationsIncidentSnapshotSchema.parse({
    ...withoutHash,
    snapshotHash: sha256(canonicalJson(withoutHash))
  });
}
