import "server-only";
import path from "node:path";
import type {
  AdminOperationCapacityJob,
  AdminOperationCapabilityEdge,
  AdminOperationIncident,
  AdminOperationNode,
  AdminOperationsSnapshot
} from "./admin-operations-types";

export const HEALTH_STATES = ["healthy", "quiet", "held", "degraded", "stale", "failing", "paused", "setup-needed", "unavailable"] as const;
export const LIFECYCLE_STAGES = ["operating", "exploration", "planned", "paused", "setup-needed"] as const;
export const CADENCE_KINDS = ["continuous", "daily", "weekly", "manual", "held"] as const;
export const CAPABILITY_DECISIONS = ["allowed", "denied", "held"] as const;
const CAPACITY_DECISIONS = ["run", "reuse", "skipped", "deferred", "held", "not-due"] as const;
const QUEUE_STATES = ["clear", "pending", "backlogged", "reconciling", "unavailable", "not-applicable"] as const;

export function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function safeText(value: unknown, maximum = 500): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > maximum || /[\r\n\0]/u.test(candidate)) return null;
  return candidate
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu, "[redacted credential]")
    .replace(/\b(?:token|secret|password|api[_-]?key)\s*[=:]\s*\S+/giu, "[redacted credential]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, "[redacted credential]");
}

export function id(value: unknown): string | null {
  const candidate = safeText(value, 160);
  return candidate && /^[a-z0-9]+(?:[.:_-][a-z0-9]+)*$/u.test(candidate) ? candidate : null;
}

export function iso(value: unknown): string | null {
  const candidate = safeText(value, 80);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? new Date(candidate).toISOString() : null;
}

export function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function integer(value: unknown): number | null {
  const candidate = number(value);
  return candidate !== null && Number.isInteger(candidate) ? candidate : null;
}

export function strings(value: unknown, maximum = 32, textMaximum = 500): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const parsed = value.map((entry) => safeText(entry, textMaximum));
  return parsed.every((entry): entry is string => Boolean(entry)) ? parsed : null;
}

function evidenceRefs(value: unknown, maximum = 32): string[] | null {
  const values = strings(value, maximum);
  if (!values) return null;
  const safe = values.filter((entry) => !path.isAbsolute(entry) && !entry.split(/[\\/]/u).includes(".."));
  return safe.length === values.length ? safe : null;
}

export function oneOf<const T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  return values.includes(value as T[number]) ? value as T[number] : null;
}

function countHolds(value: unknown): AdminOperationNode["holds"] {
  const holds = object(value);
  if (!holds) return null;
  const parsed = ["budget", "provider", "source", "credential", "owner"].map((key) => strings(holds[key], 8, 240));
  return parsed.every((entries): entries is string[] => Boolean(entries))
    ? { budget: parsed[0]!.length, provider: parsed[1]!.length, source: parsed[2]!.length, credential: parsed[3]!.length, owner: parsed[4]!.length }
    : null;
}

export function exactCoverage(expected: readonly string[], rawValues: readonly unknown[], key: string): boolean {
  const values = rawValues.map((value) => id(object(value)?.[key]));
  return values.every((value): value is string => Boolean(value))
    && new Set(values).size === values.length
    && JSON.stringify([...values].sort()) === JSON.stringify([...expected].sort());
}

export function parseCapabilityEdge(value: unknown, knownNodeIds: ReadonlySet<string>): AdminOperationCapabilityEdge | null {
  const edge = object(value);
  const source = id(edge?.source);
  const target = id(edge?.target);
  const capability = safeText(edge?.capability, 100);
  const dataSchemaVersion = safeText(edge?.dataSchemaVersion, 100);
  const decision = oneOf(edge?.decision, CAPABILITY_DECISIONS);
  const reason = safeText(edge?.reason);
  const governingReference = safeText(edge?.governingReference, 300);
  const runtimeEnforcementPoint = safeText(edge?.runtimeEnforcementPoint, 300);
  const testProbeReference = safeText(edge?.testProbeReference, 300);
  return edge?.schemaVersion === "venture-capability-edge/1" && source && target && knownNodeIds.has(source) && knownNodeIds.has(target)
    && capability && dataSchemaVersion && decision && reason && governingReference && runtimeEnforcementPoint && testProbeReference
    ? { source, target, capability, dataSchemaVersion, decision, reason, governingReference, runtimeEnforcementPoint, testProbeReference }
    : null;
}

export function parseIsolationRule(value: unknown) {
  const rule = object(value);
  const ruleId = id(rule?.id);
  const reason = safeText(rule?.reason);
  const governingReference = safeText(rule?.governingReference, 300);
  return ruleId && reason && governingReference ? { id: ruleId, reason, governingReference } : null;
}

export function parseHealth(value: unknown, nodeId: string) {
  const health = object(value);
  const state = oneOf(health?.state, HEALTH_STATES);
  const lifecycleStage = oneOf(health?.lifecycleStage, LIFECYCLE_STAGES);
  const reason = safeText(health?.reason);
  const freshness = object(health?.freshness);
  const freshnessState = oneOf(freshness?.state, ["fresh", "stale", "unavailable"] as const);
  const rolling = object(health?.rollingOutcomes);
  const queue = object(health?.queue);
  const queueState = oneOf(queue?.state, QUEUE_STATES);
  const lastValidAt = health?.lastValidAt === null ? null : iso(health?.lastValidAt);
  const nextExpectedAt = health?.nextExpectedAt === null ? null : iso(health?.nextExpectedAt);
  const queuePending = queue?.pending === null ? null : integer(queue?.pending);
  const holds = countHolds(health?.holds);
  const dueWindow = health?.dueWindow === null ? null : safeText(health?.dueWindow, 120);
  const unavailableReasons = strings(health?.unavailableReasons, 12, 300);
  const rollingOutcomes = rolling ? {
    considered: integer(rolling.considered), satisfying: integer(rolling.satisfying), failed: integer(rolling.failed),
    quiet: integer(rolling.quiet), held: integer(rolling.held), consecutiveFailures: integer(rolling.consecutiveFailures)
  } : null;
  const dependencyHealthRefs = evidenceRefs(health?.dependencyHealthRefs);
  const ownerAttentionRefs = evidenceRefs(health?.ownerAttentionRefs);
  const latestRunReceiptRefs = evidenceRefs(health?.latestRunReceiptRefs);
  if (health?.schemaVersion !== "venture-operation-health/1" || health?.nodeId !== nodeId || !state || !lifecycleStage || !reason ||
    !iso(health?.generatedAt) || !queueState || !dependencyHealthRefs || !ownerAttentionRefs || !latestRunReceiptRefs || !rolling ||
    typeof health?.autonomyEligible !== "boolean" || !rollingOutcomes || Object.values(rollingOutcomes).some((entry) => entry === null) || !holds || !unavailableReasons ||
    (health?.lastValidAt !== null && !lastValidAt) || (health?.nextExpectedAt !== null && !nextExpectedAt) ||
    (health?.dueWindow !== null && !dueWindow) || (queue?.pending !== null && queuePending === null) || !freshnessState) return null;
  return {
    state, lifecycleStage, reason,
    sloState: health?.lastValidAt === null ? "unavailable" as const : freshness?.state === "fresh" && rollingOutcomes.satisfying! > 0 ? "satisfied" as const : "missed" as const,
    freshnessState,
    dueWindow,
    rollingOutcomes: rollingOutcomes as NonNullable<AdminOperationNode["rollingOutcomes"]>,
    unavailableReasons,
    lastValidAt, nextExpectedAt,
    queue: { state: queueState, pending: queuePending },
    autonomyEligible: health.autonomyEligible,
    dependencyHealthRefs, holds, ownerAttentionRefs, evidenceRefs: latestRunReceiptRefs,
    generatedAt: iso(health?.generatedAt)!
  };
}

export function parseCapacity(value: unknown): AdminOperationsSnapshot["capacity"] | null {
  const plan = object(value);
  const budget = object(plan?.budget);
  const counts = object(plan?.counts);
  const deployment = object(plan?.deployment);
  const generatedAt = iso(plan?.generatedAt);
  const period = safeText(plan?.period, 10);
  const activeLeaseRefs = evidenceRefs(plan?.activeLeaseRefs);
  const rawJobs = Array.isArray(plan?.jobs) && plan.jobs.length <= 500 ? plan.jobs : null;
  const providerHeadroomRecord = object(plan?.providerHeadroom);
  if (plan?.schemaVersion !== "operations-capacity-plan/1" || !generatedAt || !period || !budget || !counts || !activeLeaseRefs ||
    !rawJobs || !providerHeadroomRecord || deployment?.scheduled !== false) return null;
  const parsedBudget = { maximumUsd: number(budget.maximumUsd), spentUsd: number(budget.spentUsd), reservedUsd: number(budget.reservedUsd), headroomUsd: number(budget.headroomUsd) };
  const parsedCounts = { due: integer(counts.due), running: integer(counts.running), reused: integer(counts.reused), skipped: integer(counts.skipped), held: integer(counts.held), deferred: integer(counts.deferred) };
  if (Object.values(parsedBudget).some((entry) => entry === null) || Object.values(parsedCounts).some((entry) => entry === null)) return null;
  const jobs = rawJobs.map((raw): AdminOperationCapacityJob | null => {
    const job = object(raw);
    const jobId = id(job?.jobId); const nodeId = id(job?.nodeId); const phase = safeText(job?.phase, 100);
    const classification = oneOf(job?.classification, ["mandatory", "optional", "held"] as const);
    const dueAt = iso(job?.dueAt); const decision = oneOf(job?.decision, CAPACITY_DECISIONS); const reason = safeText(job?.reason);
    const expectedCostUsd = number(job?.expectedCostUsd); const nodeBudgetHeadroomUsd = number(job?.nodeBudgetHeadroomUsd);
    const providerIds = strings(job?.providerIds, 12);
    const acceptedArtifactRef = job?.acceptedArtifactRef === null ? null : safeText(job?.acceptedArtifactRef, 300);
    const nextEligibleAt = job?.nextEligibleAt === null ? null : iso(job?.nextEligibleAt);
    return jobId && nodeId && phase && classification && dueAt && decision && reason && expectedCostUsd !== null && nodeBudgetHeadroomUsd !== null && providerIds &&
      (job?.acceptedArtifactRef === null || acceptedArtifactRef) && (job?.nextEligibleAt === null || nextEligibleAt)
      ? { id: jobId, nodeId, phase, classification, dueAt, decision, reason, expectedCostUsd, nodeBudgetHeadroomUsd, providerIds, acceptedArtifactRef, nextEligibleAt }
      : null;
  });
  const providerHeadroom = Object.entries(providerHeadroomRecord).flatMap(([providerId, remaining]) => {
    const provider = id(providerId); const count = integer(remaining);
    return provider && count !== null ? [{ providerId: provider, remaining: count }] : [];
  }).slice(0, 100);
  if (jobs.some((entry) => !entry) || providerHeadroom.length !== Object.keys(providerHeadroomRecord).length) return null;
  const collisionGroups = Array.isArray(plan?.collisionGroups) && plan.collisionGroups.length <= 100 ? plan.collisionGroups.length : null;
  if (collisionGroups === null) return null;
  return { state: "present", generatedAt, period, budget: parsedBudget as AdminOperationsSnapshot["capacity"]["budget"], counts: parsedCounts as AdminOperationsSnapshot["capacity"]["counts"], collisionCount: collisionGroups, activeLeaseRefs, providerHeadroom, jobs: jobs as AdminOperationCapacityJob[] };
}

export function parseIncident(value: unknown): Omit<AdminOperationsSnapshot["incidents"], "records"> | null {
  const snapshot = object(value); const stats = object(snapshot?.statistics); const generatedAt = iso(snapshot?.generatedAt);
  const refs = evidenceRefs(snapshot?.activeIncidentRefs); const recentAttemptRefs = evidenceRefs(snapshot?.recentAttemptRefs);
  const pausedScopes = strings(snapshot?.pausedScopes, 100); const exactOwnerActions = strings(snapshot?.exactOwnerActions, 100);
  const affectedNodeIds = strings(snapshot?.affectedNodeIds, 100); const unaffectedNodeIds = strings(snapshot?.unaffectedNodeIds, 100);
  const policyVersions = strings(snapshot?.policyVersions, 32, 120);
  const nextRetryAt = snapshot?.nextRetryAt === null ? null : iso(snapshot?.nextRetryAt);
  if (snapshot?.schemaVersion !== "operations-incident-snapshot/1" || !generatedAt || !refs || !recentAttemptRefs || !pausedScopes || !exactOwnerActions ||
    !affectedNodeIds || !unaffectedNodeIds || !policyVersions || ![...affectedNodeIds, ...unaffectedNodeIds].every((nodeId) => id(nodeId)) ||
    (snapshot?.nextRetryAt !== null && !nextRetryAt) || typeof snapshot?.killSwitchActive !== "boolean" || !stats) return null;
  const statistics = { consideredAttempts: integer(stats.consideredAttempts), recovered: integer(stats.recovered), failed: integer(stats.failed), ambiguous: integer(stats.ambiguous), ownerRequired: integer(stats.ownerRequired), meanRecoveryMinutes: stats.meanRecoveryMinutes === null ? null : number(stats.meanRecoveryMinutes), costUsd: number(stats.costUsd) };
  if (statistics.consideredAttempts === null || statistics.recovered === null || statistics.failed === null || statistics.ambiguous === null || statistics.ownerRequired === null || statistics.costUsd === null || (stats.meanRecoveryMinutes !== null && statistics.meanRecoveryMinutes === null)) return null;
  return { state: "present", generatedAt, activeCount: refs.length, nextRetryAt, recentAttemptRefs, pausedScopes, exactOwnerActions, affectedNodeIds, unaffectedNodeIds, policyVersions, killSwitchActive: snapshot.killSwitchActive, statistics: statistics as NonNullable<AdminOperationsSnapshot["incidents"]["statistics"]> };
}

export function parseOwnerIncidents(value: unknown): AdminOperationIncident[] | null {
  const attention = object(value);
  if (attention?.schemaVersion !== "owner-attention/1") return null;
  const values = attention.operationalIncidents === undefined ? [] : Array.isArray(attention.operationalIncidents) && attention.operationalIncidents.length <= 100 ? attention.operationalIncidents : null;
  if (!values) return null;
  const records = values.map((raw): AdminOperationIncident | null => {
    const incident = object(raw);
    const incidentId = id(incident?.incidentId); const nodeId = id(incident?.nodeId);
    const affectedScope = safeText(incident?.affectedScope, 240); const unaffectedScope = safeText(incident?.unaffectedScope, 400);
    const impact = safeText(incident?.impact, 400); const exactOwnerAction = safeText(incident?.exactOwnerAction, 400); const retryCondition = safeText(incident?.retryCondition, 400);
    const sourcePolicyRef = safeText(incident?.sourcePolicyRef, 160);
    const firstSeenAt = iso(incident?.firstSeenAt); const lastSeenAt = iso(incident?.lastSeenAt); const status = oneOf(incident?.status, ["active", "corrected", "resolved"] as const);
    const correctionCount = Array.isArray(incident?.correctionHistory) && incident.correctionHistory.length <= 20 ? incident.correctionHistory.length : null;
    const refs = evidenceRefs(incident?.evidenceRefs, 24);
    return incidentId && nodeId && affectedScope && unaffectedScope && impact && exactOwnerAction && retryCondition && sourcePolicyRef && firstSeenAt && lastSeenAt && status && correctionCount !== null && refs
      ? { id: incidentId, nodeId, affectedScope, unaffectedScope, impact, exactOwnerAction, retryCondition, sourcePolicyRef, firstSeenAt, lastSeenAt, status, correctionCount, evidenceRefs: refs }
      : null;
  });
  return records.every((entry): entry is AdminOperationIncident => Boolean(entry)) ? records : null;
}

export function emptyCapacity(state: "missing" | "malformed"): AdminOperationsSnapshot["capacity"] {
  return { state, generatedAt: null, period: null, budget: null, counts: null, collisionCount: null, activeLeaseRefs: [], providerHeadroom: [], jobs: [] };
}

export function emptyIncidents(state: "missing" | "malformed"): AdminOperationsSnapshot["incidents"] {
  return { state, generatedAt: null, activeCount: null, nextRetryAt: null, recentAttemptRefs: [], pausedScopes: [], exactOwnerActions: [], affectedNodeIds: [], unaffectedNodeIds: [], policyVersions: [], killSwitchActive: null, statistics: null, records: [] };
}
