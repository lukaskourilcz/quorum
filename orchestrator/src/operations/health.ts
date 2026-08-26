import {
  OperationsSnapshotSchema,
  VentureOperationHealthSchema,
  VentureRunReceiptSchema,
  type OperationsSnapshot,
  type VentureOperationHealth,
  type VentureRunReceipt,
  type VentureSlo
} from "../contracts/venture-operations.js";
import type { VentureCapabilityMap } from "../contracts/venture-capability.js";
import { canonicalJson, sha256 } from "../hashing.js";
import { resolveVentureCapabilityInMap } from "../ventures/capabilities.js";
import type { OperationsNode } from "./nodes.js";

export interface OperationHoldReasons {
  budget: string[];
  provider: string[];
  source: string[];
  credential: string[];
  owner: string[];
}

export interface DependencyHealthObservation {
  nodeId: string;
  evidenceRef: string;
  state: VentureOperationHealth["state"];
}

export interface HealthAdapterObservation {
  receipts: readonly unknown[];
  dependencies?: readonly DependencyHealthObservation[];
  holds?: Partial<OperationHoldReasons>;
  queue?: { state: "clear" | "pending" | "backlogged" | "reconciling" | "unavailable" | "not-applicable"; pending: number | null };
  ownerAttentionRefs?: readonly string[];
  lastKnownGoodRef?: string | null;
  nextExpectedAt?: string | null;
  dueWindow?: string | null;
  recoveryRefs?: readonly string[];
  costUsd?: number | null;
}

export interface HealthAdapter {
  nodeId: string;
  observe: () => Promise<HealthAdapterObservation>;
}

export interface HealthResolution {
  health: VentureOperationHealth;
  malformedReceiptCount: number;
  staleRecordCount: number;
  recoveryRefs: string[];
  costUsd: number | null;
}

const EMPTY_HOLDS: OperationHoldReasons = {
  budget: [],
  provider: [],
  source: [],
  credential: [],
  owner: []
};

function latestAt(receipts: readonly VentureRunReceipt[], predicate: (receipt: VentureRunReceipt) => boolean): string | null {
  return receipts.filter(predicate).at(-1)?.endedAt ?? null;
}

function consecutiveFailures(receipts: readonly VentureRunReceipt[]): number {
  let count = 0;
  for (const receipt of [...receipts].reverse()) {
    if (receipt.outcome !== "failed") break;
    count += 1;
  }
  return count;
}

function stateFor(
  slo: VentureSlo,
  latest: VentureRunReceipt | undefined,
  stale: boolean,
  holds: OperationHoldReasons
): { state: VentureOperationHealth["state"]; reason: string } {
  if (slo.lifecycleStage === "paused") return { state: "paused", reason: "The node is explicitly paused." };
  if (holds.credential.length > 0 || slo.lifecycleStage === "setup-needed") {
    return { state: "setup-needed", reason: holds.credential[0] ?? "Owner setup is required before live operational evidence can exist." };
  }
  const hold = [...holds.owner, ...holds.budget, ...holds.provider, ...holds.source][0];
  if (hold) return { state: "held", reason: hold };
  if (!latest) {
    if (slo.lifecycleStage === "planned" || slo.cadence.kind === "held") return { state: "held", reason: "The node is not yet scheduled for live operation." };
    return { state: "unavailable", reason: "No valid live or recovery receipt is available." };
  }
  if (stale) return { state: "stale", reason: "The latest valid receipt is older than this node's SLO permits." };
  if (latest.outcome === "success") return { state: "healthy", reason: "The latest run completed with valid evidence." };
  if (["quiet", "no-work", "replayed"].includes(latest.outcome)) {
    return { state: "quiet", reason: "The latest valid run correctly produced no new work." };
  }
  if (latest.outcome === "held") {
    return { state: "held", reason: "The latest run stopped at an explicit authority or resource hold." };
  }
  if (latest.outcome === "partial") return { state: "degraded", reason: "The latest run preserved valid partial output." };
  if (latest.outcome === "cancelled") return { state: "paused", reason: "The latest run was cancelled without being reclassified as a failure." };
  return consecutiveFailures([latest]) >= slo.consecutiveFailureThreshold
    ? { state: "failing", reason: "The consecutive failure threshold has been reached." }
    : { state: "degraded", reason: "The latest run failed, but the consecutive failure threshold has not been reached." };
}

function allowedDependencyRefs(
  nodeId: string,
  declaredNodeIds: readonly string[],
  dependencies: readonly DependencyHealthObservation[],
  capabilityMap: VentureCapabilityMap
): { refs: string[]; unavailable: string[] } {
  const refs: string[] = [];
  const unavailable = declaredNodeIds
    .filter((nodeId) => !dependencies.some((dependency) => dependency.nodeId === nodeId));
  for (const dependency of dependencies) {
    if (!declaredNodeIds.includes(dependency.nodeId)) {
      unavailable.push(dependency.nodeId);
      continue;
    }
    const resolution = resolveVentureCapabilityInMap(capabilityMap, {
      source: dependency.nodeId,
      target: nodeId,
      capability: "health-read",
      schemaVersion: "venture-operation-health/1"
    });
    if (resolution.decision !== "allowed") {
      unavailable.push(dependency.nodeId);
      continue;
    }
    refs.push(dependency.evidenceRef);
    if (["degraded", "stale", "failing", "setup-needed", "unavailable"].includes(dependency.state)) {
      unavailable.push(dependency.nodeId);
    }
  }
  return { refs: [...new Set(refs)].sort(), unavailable: [...new Set(unavailable)].sort() };
}

export function resolveOperationHealth(input: {
  node: OperationsNode;
  slo: VentureSlo;
  capabilityMap: VentureCapabilityMap;
  observation: HealthAdapterObservation;
  generatedAt: string;
}): HealthResolution {
  const parsedReceipts = input.observation.receipts.map((value) => VentureRunReceiptSchema.safeParse(value));
  const malformedReceiptCount = parsedReceipts.filter((result) => !result.success || result.data.nodeId !== input.node.id).length;
  const receipts = parsedReceipts.flatMap((result) => result.success ? [result.data] : [])
    .filter((receipt) => receipt.nodeId === input.node.id && receipt.mode !== "dry" && receipt.mode !== "fixture")
    .sort((left, right) => left.endedAt.localeCompare(right.endedAt))
    .slice(-input.slo.rollingWindowRuns);
  const latest = receipts.at(-1);
  const ageMinutes = latest
    ? Math.max(0, Math.floor((Date.parse(input.generatedAt) - Date.parse(latest.endedAt)) / 60_000))
    : null;
  const stale = ageMinutes !== null
    && input.slo.maximumStalenessMinutes !== null
    && ageMinutes > input.slo.maximumStalenessMinutes;
  const holds: OperationHoldReasons = {
    budget: [...(input.observation.holds?.budget ?? EMPTY_HOLDS.budget)],
    provider: [...(input.observation.holds?.provider ?? EMPTY_HOLDS.provider)],
    source: [...(input.observation.holds?.source ?? EMPTY_HOLDS.source)],
    credential: [...(input.observation.holds?.credential ?? EMPTY_HOLDS.credential)],
    owner: [...(input.observation.holds?.owner ?? EMPTY_HOLDS.owner)]
  };
  const dependencyResolution = allowedDependencyRefs(
    input.node.id,
    input.slo.dependencyNodeIds,
    input.observation.dependencies ?? [],
    input.capabilityMap
  );
  const current = stateFor(input.slo, latest, stale, holds);
  const satisfying = receipts.filter((receipt) => input.slo.satisfyingOutcomes.includes(receipt.outcome)).length;
  const consecutive = consecutiveFailures(receipts);
  if (latest?.outcome === "failed" && consecutive >= input.slo.consecutiveFailureThreshold && !stale) {
    current.state = "failing";
    current.reason = "The consecutive failure threshold has been reached.";
  }
  if (dependencyResolution.unavailable.length > 0 && (current.state === "healthy" || current.state === "quiet")) {
    current.state = "degraded";
    current.reason = `Declared dependency health is unavailable or unhealthy: ${dependencyResolution.unavailable.join(", ")}.`;
  }
  const healthWithoutHash = {
    schemaVersion: "venture-operation-health/1" as const,
    nodeId: input.node.id,
    displayName: input.node.displayName,
    policyVersion: input.slo.policyVersion,
    generatedAt: input.generatedAt,
    observedAt: latest?.endedAt ?? input.generatedAt,
    lifecycleStage: input.slo.lifecycleStage,
    state: current.state,
    reason: current.reason,
    lastAttemptedAt: latestAt(receipts, () => true),
    lastValidAt: latest?.endedAt ?? null,
    lastSuccessfulAt: latestAt(receipts, (receipt) => receipt.outcome === "success"),
    lastNonEmptyAt: latestAt(receipts, (receipt) => receipt.outcome === "success" || receipt.outcome === "partial"),
    lastExternallyVerifiedAt: null,
    nextExpectedAt: input.observation.nextExpectedAt ?? null,
    dueWindow: input.observation.dueWindow ?? null,
    latenessMinutes: null,
    rollingOutcomes: {
      considered: receipts.length,
      satisfying,
      failed: receipts.filter((receipt) => receipt.outcome === "failed").length,
      quiet: receipts.filter((receipt) => receipt.outcome === "quiet" || receipt.outcome === "no-work").length,
      held: receipts.filter((receipt) => receipt.outcome === "held").length,
      consecutiveFailures: consecutive
    },
    dependencyHealthRefs: dependencyResolution.refs,
    queue: input.observation.queue ?? { state: "not-applicable" as const, pending: null },
    autonomyEligible: current.state === "healthy" || current.state === "quiet",
    holds,
    freshness: {
      state: latest ? (stale ? "stale" as const : "fresh" as const) : "unavailable" as const,
      ageMinutes,
      lastKnownGoodRef: input.observation.lastKnownGoodRef ?? null
    },
    unavailableReasons: [
      ...(!latest && current.state === "unavailable" ? ["No common live receipt references canonical domain evidence."] : []),
      ...dependencyResolution.unavailable.map((nodeId) => `Dependency health unavailable or denied for ${nodeId}.`)
    ],
    ownerAttentionRefs: [...new Set(input.observation.ownerAttentionRefs ?? [])].sort(),
    latestRunReceiptRefs: receipts.slice(-8).map((receipt) => `state/operations/run-receipts/${receipt.nodeId}/${receipt.receiptId}.json`)
  };
  const health = VentureOperationHealthSchema.parse({
    ...healthWithoutHash,
    snapshotHash: sha256(canonicalJson(healthWithoutHash))
  });
  return {
    health,
    malformedReceiptCount,
    staleRecordCount: stale ? 1 : 0,
    recoveryRefs: [...new Set(input.observation.recoveryRefs ?? [])].sort(),
    costUsd: input.observation.costUsd ?? null
  };
}

export async function buildOperationsSnapshot(input: {
  nodes: readonly OperationsNode[];
  slos: readonly VentureSlo[];
  adapters: readonly HealthAdapter[];
  capabilityMap: VentureCapabilityMap;
  generatedAt: string;
}): Promise<{ snapshot: OperationsSnapshot; health: VentureOperationHealth[] }> {
  const sloById = new Map(input.slos.map((slo) => [slo.nodeId, slo]));
  const adapterById = new Map(input.adapters.map((adapter) => [adapter.nodeId, adapter]));
  let malformedAdapterCount = 0;
  let unavailableAdapterCount = 0;
  const resolutions: HealthResolution[] = [];

  for (const node of [...input.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    const slo = sloById.get(node.id);
    if (!slo) throw new Error(`Missing SLO for ${node.id}`);
    const adapter = adapterById.get(node.id);
    let observation: HealthAdapterObservation;
    try {
      observation = adapter ? await adapter.observe() : { receipts: [] };
      if (!adapter) unavailableAdapterCount += 1;
    } catch {
      malformedAdapterCount += 1;
      observation = { receipts: [] };
    }
    const resolution = resolveOperationHealth({
      node,
      slo,
      capabilityMap: input.capabilityMap,
      observation,
      generatedAt: input.generatedAt
    });
    malformedAdapterCount += resolution.malformedReceiptCount;
    resolutions.push(resolution);
  }

  const nodes = resolutions.map((resolution) => ({
    nodeId: resolution.health.nodeId,
    displayName: resolution.health.displayName,
    lifecycleStage: resolution.health.lifecycleStage,
    health: resolution.health.state,
    reason: resolution.health.reason,
    lastValidAt: resolution.health.lastValidAt,
    nextExpectedAt: resolution.health.nextExpectedAt,
    sloSatisfied: resolution.health.lastValidAt === null
      ? null
      : resolution.health.freshness.state === "fresh"
        && resolution.health.rollingOutcomes.satisfying > 0,
    failureCount: resolution.health.rollingOutcomes.consecutiveFailures,
    recoveryRefs: resolution.recoveryRefs,
    ownerAttentionRefs: resolution.health.ownerAttentionRefs,
    costUsd: resolution.costUsd,
    artifactsReused: 0,
    staleRecords: resolution.staleRecordCount,
    malformedRecords: resolution.malformedReceiptCount,
    evidenceRefs: [...resolution.health.latestRunReceiptRefs, ...resolution.health.dependencyHealthRefs].slice(0, 32)
  }));
  const snapshotWithoutHash = {
    schemaVersion: "operations-snapshot/1" as const,
    generatedAt: input.generatedAt,
    nodes,
    malformedAdapterCount,
    unavailableAdapterCount
  };
  return {
    snapshot: OperationsSnapshotSchema.parse({
      ...snapshotWithoutHash,
      snapshotHash: sha256(canonicalJson(snapshotWithoutHash))
    }),
    health: resolutions.map((resolution) => resolution.health)
  };
}
