import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DateSchema, VentureIdSchema } from "../contracts/common.js";
import {
  RecoveryActionSchema,
  VentureRecoveryPolicyRegistrySchema,
  type VentureRecoveryPolicyRegistry
} from "../contracts/venture-recovery.js";
import { OperationHealthStateSchema } from "../contracts/venture-operations.js";
import type { VentureCapabilityMap } from "../contracts/venture-capability.js";
import { configRoot as defaultConfigRoot } from "../paths.js";

const DefaultsSchema = z.strictObject({
  phase: z.string().trim().min(1).max(100),
  triggerStates: z.array(OperationHealthStateSchema).min(1),
  permittedActions: z.array(RecoveryActionSchema),
  maximumAttempts: z.number().int().nonnegative().max(20),
  cooldownMinutes: z.number().int().nonnegative().max(43_200),
  reconciliationRequired: z.boolean(),
  maximumIncrementalCostUsd: z.literal(0),
  ownerAttentionThreshold: z.number().int().positive().max(20),
  pauseScope: z.enum(["item", "connection", "phase", "venture"]),
  automaticResume: z.boolean()
});

const NodeSchema = z.strictObject({
  nodeId: VentureIdSchema,
  phase: z.string().trim().min(1).max(100).optional(),
  triggerStates: z.array(OperationHealthStateSchema).min(1).optional(),
  permittedActions: z.array(RecoveryActionSchema).optional(),
  maximumAttempts: z.number().int().nonnegative().max(20).optional(),
  cooldownMinutes: z.number().int().nonnegative().max(43_200).optional(),
  reconciliationRequired: z.boolean().optional(),
  ownerAttentionThreshold: z.number().int().positive().max(20).optional(),
  pauseScope: z.enum(["item", "connection", "phase", "venture"]).optional(),
  automaticResume: z.boolean().optional()
});

export const OperationsRecoveryRegistrySchema = z.strictObject({
  schemaVersion: z.literal("operations-recovery-registry/1"),
  registryVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  effectiveDate: DateSchema,
  reviewDate: DateSchema,
  defaults: DefaultsSchema,
  nodes: z.array(NodeSchema).min(1)
});

export type OperationsRecoveryRegistry = z.infer<typeof OperationsRecoveryRegistrySchema>;

const PROHIBITED = [
  "account",
  "oauth-or-secret",
  "scope-expansion",
  "budget-increase",
  "content-approval",
  "capability-change",
  "outreach",
  "contest-entry",
  "monetization",
  "deployment"
] as const;

export async function loadOperationsRecoveryRegistry(
  configRoot = defaultConfigRoot
): Promise<OperationsRecoveryRegistry> {
  const raw = await readFile(path.join(configRoot, "operations-recovery.json"), "utf8");
  return OperationsRecoveryRegistrySchema.parse(JSON.parse(raw) as unknown);
}

export function buildVentureRecoveryPolicyRegistry(
  registry: OperationsRecoveryRegistry,
  capabilityMap: VentureCapabilityMap
): VentureRecoveryPolicyRegistry {
  const configured = registry.nodes.map((node) => node.nodeId).sort();
  const capabilities = capabilityMap.nodes.map((node) => node.id).sort();
  if (JSON.stringify(configured) !== JSON.stringify(capabilities)) {
    throw new Error("Recovery registry must cover every capability node exactly once");
  }
  return VentureRecoveryPolicyRegistrySchema.parse({
    schemaVersion: "venture-recovery-policy-registry/1",
    registryVersion: registry.registryVersion,
    effectiveDate: registry.effectiveDate,
    policies: registry.nodes.map((node) => {
      const automaticResume = node.automaticResume ?? registry.defaults.automaticResume;
      return {
        schemaVersion: "venture-recovery-policy/1",
        nodeId: node.nodeId,
        phase: node.phase ?? registry.defaults.phase,
        policyVersion: registry.registryVersion,
        effectiveDate: registry.effectiveDate,
        reviewDate: registry.reviewDate,
        triggerStates: node.triggerStates ?? registry.defaults.triggerStates,
        permittedActions: node.permittedActions ?? registry.defaults.permittedActions,
        maximumAttempts: node.maximumAttempts ?? registry.defaults.maximumAttempts,
        cooldownMinutes: node.cooldownMinutes ?? registry.defaults.cooldownMinutes,
        reconciliationRequired: node.reconciliationRequired ?? registry.defaults.reconciliationRequired,
        requiredEvidenceRefs: [
          "config/operations-recovery.json",
          "config/operations-nodes.json",
          "config/venture-capabilities.json"
        ],
        dependencyHealthRefs: [],
        maximumIncrementalCostUsd: 0,
        ownerAttentionThreshold: node.ownerAttentionThreshold ?? registry.defaults.ownerAttentionThreshold,
        pauseScope: node.pauseScope ?? registry.defaults.pauseScope,
        automaticResume: {
          allowed: automaticResume,
          requiresTransientConditionCleared: true,
          requiresCurrentAuthority: true
        },
        killSwitchKeys: ["BOARDLESSAI_RECOVERY_KILL", `${node.nodeId.replace(/-/gu, "_").toUpperCase()}_RECOVERY_KILL`],
        prohibitedActions: PROHIBITED,
        escalationPolicyRef: "state/owner-attention.json"
      };
    })
  });
}
