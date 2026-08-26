import { readFile } from "node:fs/promises";
import path from "node:path";
import { VentureSloRegistrySchema, type VentureSlo, type VentureSloRegistry } from "../contracts/venture-operations.js";
import { configRoot as defaultConfigRoot } from "../paths.js";

export async function loadVentureSloRegistry(
  configRoot = defaultConfigRoot
): Promise<VentureSloRegistry> {
  const raw = await readFile(path.join(configRoot, "venture-slos.json"), "utf8");
  return VentureSloRegistrySchema.parse(JSON.parse(raw) as unknown);
}

export function sloPolicyByNode(registry: VentureSloRegistry): ReadonlyMap<string, VentureSlo> {
  return new Map(registry.policies.map((policy) => [policy.nodeId, policy]));
}

export function assertSloCoverage(
  registeredNodeIds: readonly string[],
  registry: VentureSloRegistry
): void {
  const policies = sloPolicyByNode(registry);
  const missing = registeredNodeIds.filter((nodeId) => !policies.has(nodeId));
  const unknown = registry.policies.map(({ nodeId }) => nodeId).filter((nodeId) => !registeredNodeIds.includes(nodeId));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(`SLO registry drift: missing [${missing.join(", ")}], unknown [${unknown.join(", ")}]`);
  }
}
