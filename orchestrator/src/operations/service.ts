import path from "node:path";
import { OwnerAttentionSchema } from "../contracts/owner-attention.js";
import {
  OperationsSnapshotSchema,
  VentureOperationHealthSchema,
  type VentureOperationHealth
} from "../contracts/venture-operations.js";
import { repoRoot as defaultRepoRoot, stateRoot as defaultStateRoot } from "../paths.js";
import { atomicWriteJson, readJson } from "../state.js";
import { loadVentureCapabilityMap } from "../ventures/capabilities.js";
import { buildOperationsSnapshot, type DependencyHealthObservation, type HealthAdapter } from "./health.js";
import { readOperationRunReceipts, writeCurrentOperationHealth } from "./health-store.js";
import { assertOperationsNodeCoverage, loadOperationsNodeRegistry } from "./nodes.js";
import { buildIncidentSnapshot } from "./recovery.js";
import { readRecoveryAttempts, writeIncidentSnapshot } from "./recovery-store.js";
import { loadVentureSloRegistry } from "./slo.js";
import { readSocialDistributionHealthObservation } from "../social/health.js";

const CURRENT_PATH = "operations/current.json";

async function readCurrentHealth(stateRoot: string, nodeId: string): Promise<VentureOperationHealth | null> {
  try {
    const value = await readJson<unknown>(stateRoot, `operations/health/${nodeId}/current.json`, null);
    const parsed = VentureOperationHealthSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function readOwnerAttention(stateRoot: string) {
  try {
    const parsed = OwnerAttentionSchema.safeParse(await readJson<unknown>(stateRoot, "owner-attention.json", null));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function operationsRefreshPending(stateRoot: string, now = new Date()): Promise<boolean> {
  let requestValue: unknown;
  try {
    requestValue = await readJson<unknown>(stateRoot, "operations/refresh-request.json", null);
  } catch {
    return false;
  }
  if (!requestValue || typeof requestValue !== "object" || Array.isArray(requestValue)) return false;
  const request = requestValue as Record<string, unknown>;
  if (request.schemaVersion !== "operations-refresh-request/1" || typeof request.requestedAt !== "string" ||
    typeof request.nextRequestAllowedAt !== "string" || typeof request.requestedBy !== "string" ||
    !request.requestedBy.trim() || request.requestedBy.length > 120) return false;
  const requestedAt = Date.parse(request.requestedAt);
  const nextAllowed = Date.parse(request.nextRequestAllowedAt);
  if (!Number.isFinite(requestedAt) || !Number.isFinite(nextAllowed) || nextAllowed < requestedAt ||
    requestedAt > now.getTime() + 60_000) return false;
  try {
    const parsed = OperationsSnapshotSchema.safeParse(await readJson<unknown>(stateRoot, CURRENT_PATH, null));
    return !parsed.success || requestedAt > Date.parse(parsed.data.generatedAt);
  } catch {
    return true;
  }
}

export async function materializeOperationsState(input: {
  repoRoot?: string;
  stateRoot?: string;
  now?: Date;
} = {}): Promise<{ path: string; healthPaths: string[]; incidentPath: string | null }> {
  const repoRoot = input.repoRoot ?? defaultRepoRoot;
  const stateRoot = input.stateRoot ?? defaultStateRoot;
  const generatedAt = (input.now ?? new Date()).toISOString();
  const configRoot = path.join(repoRoot, "config");
  const [registry, slos, capabilityMap, ownerAttention] = await Promise.all([
    loadOperationsNodeRegistry(configRoot),
    loadVentureSloRegistry(configRoot),
    loadVentureCapabilityMap(configRoot),
    readOwnerAttention(stateRoot)
  ]);
  assertOperationsNodeCoverage({ registry, capabilityMap, sloRegistry: slos });
  const sloByNode = new Map(slos.policies.map((slo) => [slo.nodeId, slo]));
  const dependencyHealth = new Map<string, VentureOperationHealth>();
  const receiptsByNode = new Map<string, unknown[]>();
  const recoveryAttempts: unknown[] = [];
  for (const node of registry.nodes) {
    const [health, receipts, attempts] = await Promise.all([
      readCurrentHealth(stateRoot, node.id),
      readOperationRunReceipts(stateRoot, node.id),
      readRecoveryAttempts(stateRoot, node.id)
    ]);
    if (health) dependencyHealth.set(node.id, health);
    receiptsByNode.set(node.id, receipts);
    recoveryAttempts.push(...attempts);
  }
  const activeIncidents = ownerAttention?.operationalIncidents?.filter((incident) => incident.status === "active") ?? [];
  const socialObservation = readSocialDistributionHealthObservation(stateRoot, input.now ?? new Date());
  const adapters = (healthByNode: ReadonlyMap<string, VentureOperationHealth>): HealthAdapter[] => registry.nodes.map((node) => ({
    nodeId: node.id,
    observe: async () => {
      const slo = sloByNode.get(node.id);
      if (!slo) throw new Error(`Missing SLO for ${node.id}`);
      const incidents = activeIncidents.filter((incident) => incident.nodeId === node.id);
      const dueWindow = slo.cadence.windows.join("; ");
      const dependencies: DependencyHealthObservation[] = slo.dependencyNodeIds.flatMap((dependencyNodeId) => {
        const health = healthByNode.get(dependencyNodeId);
        return health ? [{
          nodeId: dependencyNodeId,
          evidenceRef: `state/operations/health/${dependencyNodeId}/current.json`,
          state: health.state
        }] : [];
      });
      const domain = node.id === "social-distribution" ? await socialObservation : { receipts: [] };
      return {
        ...domain,
        receipts: [...(receiptsByNode.get(node.id) ?? []), ...domain.receipts],
        dependencies,
        holds: { ...domain.holds, owner: [...(domain.holds?.owner ?? []), ...incidents.slice(0, 8).map((incident) => incident.exactOwnerAction.slice(0, 240))].slice(0, 8) },
        queue: domain.queue ?? { state: "not-applicable" as const, pending: null },
        ownerAttentionRefs: [...new Set([...(domain.ownerAttentionRefs ?? []), ...incidents.map((incident) => `state/owner-attention.json#${incident.incidentId}`)])].sort(),
        dueWindow: domain.dueWindow ?? (dueWindow ? dueWindow.slice(0, 120) : null)
      };
    }
  }));
  let previousHash: string | null = null;
  let built = await buildOperationsSnapshot({ nodes: registry.nodes, slos: slos.policies, adapters: adapters(dependencyHealth), capabilityMap, generatedAt });
  for (let pass = 0; pass <= registry.nodes.length && built.snapshot.snapshotHash !== previousHash; pass += 1) {
    previousHash = built.snapshot.snapshotHash;
    dependencyHealth.clear();
    for (const health of built.health) dependencyHealth.set(health.nodeId, health);
    const next = await buildOperationsSnapshot({ nodes: registry.nodes, slos: slos.policies, adapters: adapters(dependencyHealth), capabilityMap, generatedAt });
    if (next.snapshot.snapshotHash === previousHash) break;
    built = next;
  }
  for (const health of built.health) await writeCurrentOperationHealth(stateRoot, health);
  await atomicWriteJson(stateRoot, CURRENT_PATH, built.snapshot);
  let incidentPath: string | null = null;
  if (ownerAttention) {
    const switchEnabled = (key: string) => ["1", "true", "on"].includes(process.env[key]?.trim().toLowerCase() ?? "");
    const incidentSnapshot = buildIncidentSnapshot({
      generatedAt,
      attempts: recoveryAttempts,
      incidents: ownerAttention.operationalIncidents ?? [],
      allNodeIds: registry.nodes.map((node) => node.id),
      killSwitchActive: registry.nodes.some((node) => switchEnabled(`${node.id.replace(/-/gu, "_").toUpperCase()}_RECOVERY_KILL`))
        || switchEnabled("BOARDLESSAI_RECOVERY_KILL")
    });
    await writeIncidentSnapshot(stateRoot, incidentSnapshot);
    incidentPath = "operations/incidents/current.json";
  }
  return {
    path: CURRENT_PATH,
    healthPaths: built.health.map((health) => `operations/health/${health.nodeId}/current.json`),
    incidentPath
  };
}
