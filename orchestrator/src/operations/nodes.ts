import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DateSchema, VentureIdSchema } from "../contracts/common.js";
import type { VentureCapabilityMap } from "../contracts/venture-capability.js";
import type { VentureSloRegistry } from "../contracts/venture-operations.js";
import { configRoot as defaultConfigRoot } from "../paths.js";

const OperationsNodeSchema = z.strictObject({
  id: VentureIdSchema,
  displayName: z.string().trim().min(1).max(120)
});

export const OperationsNodeRegistrySchema = z.strictObject({
  schemaVersion: z.literal("operations-node-registry/1"),
  registryVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  effectiveDate: DateSchema,
  reviewDate: DateSchema,
  nodes: z.array(OperationsNodeSchema).min(1)
}).superRefine((registry, context) => {
  const ids = registry.nodes.map((node) => node.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["nodes"], message: "Operational node ids must be unique" });
  }
});

export type OperationsNodeRegistry = z.infer<typeof OperationsNodeRegistrySchema>;
export type OperationsNode = OperationsNodeRegistry["nodes"][number];

export async function loadOperationsNodeRegistry(configRoot = defaultConfigRoot): Promise<OperationsNodeRegistry> {
  const raw = await readFile(path.join(configRoot, "operations-nodes.json"), "utf8");
  return OperationsNodeRegistrySchema.parse(JSON.parse(raw) as unknown);
}

export function assertOperationsNodeCoverage(input: {
  registry: OperationsNodeRegistry;
  capabilityMap: VentureCapabilityMap;
  sloRegistry: VentureSloRegistry;
}): void {
  const expected = input.capabilityMap.nodes.map(({ id }) => id).sort();
  const registered = input.registry.nodes.map(({ id }) => id).sort();
  const policies = input.sloRegistry.policies.map(({ nodeId }) => nodeId).sort();
  if (JSON.stringify(registered) !== JSON.stringify(expected) || JSON.stringify(policies) !== JSON.stringify(expected)) {
    throw new Error("Operations node, capability and SLO registries must cover the same ids exactly once");
  }
}
