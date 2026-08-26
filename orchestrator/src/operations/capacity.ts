import {
  OperationsCapacityPlanSchema,
  OperationsCapacitySnapshotSchema,
  OperationsEfficiencyObservationSchema,
  SharedResourceLeaseSchema,
  type OperationsCapacityPlan,
  type OperationsCapacitySnapshot,
  type OperationsEfficiencyObservation,
  type SharedResourceLease
} from "../contracts/operations-coordination.js";
import type { VentureOperationHealth } from "../contracts/venture-operations.js";
import { canonicalJson, sha256 } from "../hashing.js";

export interface DueOperation {
  jobId: string;
  nodeId: string;
  phase: string;
  classification: "mandatory" | "optional" | "held";
  dueAt: string;
  nextEligibleAt?: string | null;
  fixedOrder: number;
  expectedCostUsd: number;
  nodeBudgetHeadroomUsd: number;
  providerIds: string[];
  writerPaths: string[];
  inputHash: string;
  configHash: string;
  modelVersion: string | null;
  dependencyHealthRefs: string[];
  acceptedArtifactRef?: string | null;
  domainDecision: "work" | "no-work" | "held";
  externalAction: "none" | "deployment";
}

export interface CapacityPlannerInput {
  period: string;
  generatedAt: string;
  jobs: readonly DueOperation[];
  healthByNode: ReadonlyMap<string, VentureOperationHealth>;
  budget: { maximumUsd: number; spentUsd: number };
  providerHeadroom: Readonly<Record<string, number>>;
  activeLeases: readonly SharedResourceLease[];
  deployment: { guardActive: boolean; releaseReady: boolean; evidenceRef: string };
}

const HOLDING_HEALTH = new Set<VentureOperationHealth["state"]>([
  "held",
  "stale",
  "failing",
  "paused",
  "setup-needed",
  "unavailable"
]);

function artifactKey(job: DueOperation): string {
  return `${job.nodeId}:${job.phase}:${job.inputHash}:${job.configHash}:${job.modelVersion ?? "deterministic"}`;
}

export function planOperationsCapacity(input: CapacityPlannerInput): OperationsCapacityPlan {
  const now = Date.parse(input.generatedAt);
  const providerHeadroom = { ...input.providerHeadroom };
  const activeResources = new Set(input.activeLeases
    .filter((lease) => lease.state === "active" && Date.parse(lease.expiresAt) > now)
    .map((lease) => lease.resourceKey));
  const selectedResources = new Set<string>();
  const selectedExecutionOrder: string[] = [];
  let reservedUsd = 0;
  const acceptedArtifacts = new Map<string, string>();
  for (const job of input.jobs) {
    if (job.acceptedArtifactRef) acceptedArtifacts.set(artifactKey(job), job.acceptedArtifactRef);
  }

  const ordered = [...input.jobs].sort((left, right) =>
    (left.classification === "mandatory" ? 0 : left.classification === "optional" ? 1 : 2)
      - (right.classification === "mandatory" ? 0 : right.classification === "optional" ? 1 : 2)
    || left.fixedOrder - right.fixedOrder
    || left.dueAt.localeCompare(right.dueAt)
    || left.jobId.localeCompare(right.jobId));
  const seenIds = new Set<string>();
  for (const job of ordered) {
    if (seenIds.has(job.jobId)) throw new Error(`Duplicate due operation id: ${job.jobId}`);
    seenIds.add(job.jobId);
  }

  const jobs = ordered.map((job) => {
    const base = {
      jobId: job.jobId,
      nodeId: job.nodeId,
      phase: job.phase,
      classification: job.classification,
      dueAt: job.dueAt,
      expectedCostUsd: job.expectedCostUsd,
      nodeBudgetHeadroomUsd: job.nodeBudgetHeadroomUsd,
      providerIds: [...job.providerIds].sort(),
      writerPaths: [...job.writerPaths].sort(),
      inputHash: job.inputHash,
      configHash: job.configHash,
      modelVersion: job.modelVersion,
      dependencyHealthRefs: [...new Set(job.dependencyHealthRefs)].sort(),
      acceptedArtifactRef: null as string | null,
      nextEligibleAt: job.nextEligibleAt ?? null
    };
    if (Date.parse(job.dueAt) > now) {
      return { ...base, decision: "not-due" as const, reason: "The canonical scheduler has not declared this job due." };
    }
    if (job.externalAction === "deployment") {
      return { ...base, decision: "held" as const, reason: "Deployment is explicit under the release guard and is never scheduled by operations planning." };
    }
    if (job.domainDecision === "no-work") {
      return { ...base, decision: "skipped" as const, reason: "The owning domain returned an explicit NO_WORK decision." };
    }
    if (job.domainDecision === "held") {
      return { ...base, decision: "held" as const, reason: "The owning domain held this work before capacity planning." };
    }
    if (job.classification === "held") {
      return { ...base, decision: "held" as const, reason: "The owning domain registered this work as held." };
    }
    const health = input.healthByNode.get(job.nodeId);
    if (!health || HOLDING_HEALTH.has(health.state)) {
      return { ...base, decision: "held" as const, reason: `Current node health is ${health?.state ?? "unavailable"}; unsafe execution is held.` };
    }
    const reusable = acceptedArtifacts.get(artifactKey(job));
    if (reusable) {
      return { ...base, decision: "reuse" as const, reason: "An accepted artifact already matches the exact input, config and model version.", acceptedArtifactRef: reusable };
    }
    const leased = [...job.writerPaths, ...job.providerIds].find((resource) => activeResources.has(resource));
    const collision = leased ?? job.writerPaths.find((resource) => selectedResources.has(resource));
    if (collision) {
      return { ...base, decision: "deferred" as const, reason: `Shared resource ${collision} is already leased or selected.` };
    }
    const exhaustedProvider = job.providerIds.find((provider) => (providerHeadroom[provider] ?? 0) <= 0);
    if (exhaustedProvider) {
      return { ...base, decision: job.classification === "optional" ? "deferred" as const : "held" as const, reason: `Provider capacity ${exhaustedProvider} has no remaining headroom.` };
    }
    const availableBudget = Math.max(0, input.budget.maximumUsd - input.budget.spentUsd - reservedUsd);
    if (job.expectedCostUsd > job.nodeBudgetHeadroomUsd || job.expectedCostUsd > availableBudget) {
      return {
        ...base,
        decision: job.classification === "optional" ? "deferred" as const : "held" as const,
        reason: "The existing budget envelope has insufficient headroom; no allocation is borrowed or raised."
      };
    }
    reservedUsd += job.expectedCostUsd;
    for (const provider of job.providerIds) providerHeadroom[provider] = Math.max(0, (providerHeadroom[provider] ?? 0) - 1);
    for (const resource of job.writerPaths) selectedResources.add(resource);
    selectedExecutionOrder.push(job.jobId);
    return { ...base, decision: "run" as const, reason: "The owning runner may execute inside its existing authority and gates." };
  });

  const collisions = new Map<string, string[]>();
  for (const job of ordered.filter((candidate) => Date.parse(candidate.dueAt) <= now)) {
    for (const resource of [...job.writerPaths, ...job.providerIds]) {
      collisions.set(resource, [...(collisions.get(resource) ?? []), job.jobId]);
    }
  }
  const collisionGroups = [...collisions.entries()]
    .filter(([, ids]) => ids.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([resourceKey, jobIds]) => ({ resourceKey, jobIds: [...new Set(jobIds)].sort() }));
  const counts = {
    due: jobs.filter((job) => job.decision !== "not-due").length,
    running: jobs.filter((job) => job.decision === "run").length,
    reused: jobs.filter((job) => job.decision === "reuse").length,
    skipped: jobs.filter((job) => job.decision === "skipped").length,
    held: jobs.filter((job) => job.decision === "held").length,
    deferred: jobs.filter((job) => job.decision === "deferred").length
  };
  const withoutHash = {
    schemaVersion: "operations-capacity-plan/1" as const,
    period: input.period,
    timezone: "Europe/Prague" as const,
    generatedAt: input.generatedAt,
    budget: {
      maximumUsd: input.budget.maximumUsd,
      spentUsd: input.budget.spentUsd,
      reservedUsd,
      headroomUsd: Math.max(0, input.budget.maximumUsd - input.budget.spentUsd - reservedUsd)
    },
    deployment: { ...input.deployment, scheduled: false as const },
    jobs,
    selectedExecutionOrder,
    activeLeaseRefs: input.activeLeases
      .filter((lease) => lease.state === "active" && Date.parse(lease.expiresAt) > now)
      .map((lease) => `state/operations/leases/${lease.leaseId}.json`)
      .sort(),
    collisionGroups,
    providerHeadroom,
    counts
  };
  return OperationsCapacityPlanSchema.parse({ ...withoutHash, planHash: sha256(canonicalJson(withoutHash)) });
}

export function acquireSharedResourceLease(input: {
  existing: readonly unknown[];
  resourceType: SharedResourceLease["resourceType"];
  resourceKey: string;
  holderNodeId: string;
  holderJobId: string;
  idempotencyKey: string;
  acquiredAt: string;
  ttlSeconds: number;
}): { decision: "acquired" | "replayed" | "held"; lease: SharedResourceLease | null; reason: string } {
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 60 || input.ttlSeconds > 86_400) {
    return { decision: "held", lease: null, reason: "Lease TTL must be between one minute and one day." };
  }
  if (input.resourceType === "deployment-gate") {
    return { decision: "held", lease: null, reason: "The operations controller cannot acquire the explicit deployment gate." };
  }
  const acquired = Date.parse(input.acquiredAt);
  const existing = input.existing.flatMap((value) => {
    const parsed = SharedResourceLeaseSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  const active = existing.find((lease) =>
    lease.resourceType === input.resourceType
    && lease.resourceKey === input.resourceKey
    && lease.state === "active"
    && Date.parse(lease.expiresAt) > acquired);
  if (active?.idempotencyKey === input.idempotencyKey && active.holderJobId === input.holderJobId) {
    return { decision: "replayed", lease: active, reason: "The same idempotent lease is already active." };
  }
  if (active) return { decision: "held", lease: null, reason: "The shared resource already has an active lease." };
  const identity = `${input.resourceType}:${input.resourceKey}:${input.holderJobId}:${input.idempotencyKey}`;
  const lease = SharedResourceLeaseSchema.parse({
    schemaVersion: "shared-resource-lease/1",
    leaseId: `lease-${sha256(identity).slice(0, 24)}`,
    resourceType: input.resourceType,
    resourceKey: input.resourceKey,
    holderNodeId: input.holderNodeId,
    holderJobId: input.holderJobId,
    idempotencyKey: input.idempotencyKey,
    acquiredAt: input.acquiredAt,
    expiresAt: new Date(acquired + input.ttlSeconds * 1_000).toISOString(),
    state: "active",
    authorityGranted: false,
    contentAccessGranted: false,
    spendAuthorized: false,
    supersedesLeaseRef: null
  });
  return { decision: "acquired", lease, reason: "A bounded expiring lease was acquired." };
}

export function createEfficiencyObservation(
  value: OperationsEfficiencyObservation
): OperationsEfficiencyObservation {
  return OperationsEfficiencyObservationSchema.parse(value);
}

export function buildCapacitySnapshot(input: {
  plan: OperationsCapacityPlan;
  observations: readonly OperationsEfficiencyObservation[];
  generatedAt: string;
  freshness: OperationsCapacitySnapshot["freshness"];
}): OperationsCapacitySnapshot {
  const observations = input.observations.filter((observation) =>
    input.plan.jobs.some((job) => job.jobId === observation.jobId));
  const withoutHash = {
    schemaVersion: "operations-capacity-snapshot/1" as const,
    generatedAt: input.generatedAt,
    planRef: `state/operations/capacity/${input.plan.period}.json`,
    due: input.plan.counts.due,
    running: input.plan.counts.running,
    held: input.plan.counts.held,
    deferred: input.plan.counts.deferred,
    skipped: input.plan.counts.skipped,
    estimatedCostUsd: input.plan.budget.reservedUsd,
    actualCostUsd: observations.length > 0
      ? observations.reduce((total, observation) => total + observation.actualCostUsd, 0)
      : null,
    artifactsReused: input.plan.counts.reused
      + observations.reduce((total, observation) => total + observation.artifactsReused, 0),
    duplicateRunsPrevented: observations.filter((observation) => observation.duplicateRunPrevented).length,
    providerCallsAvoided: observations.reduce((total, observation) => total + observation.providerCallsAvoided, 0),
    collisionCount: input.plan.collisionGroups.length,
    activeLeaseRefs: input.plan.activeLeaseRefs,
    nextUnblockedJobId: input.plan.selectedExecutionOrder[0] ?? null,
    freshness: input.freshness
  };
  return OperationsCapacitySnapshotSchema.parse({
    ...withoutHash,
    snapshotHash: sha256(canonicalJson(withoutHash))
  });
}
