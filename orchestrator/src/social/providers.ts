import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ProviderConnectionBindingSchema,
  ProviderDeliveryReceiptSchema,
  ProviderHealthSchema,
  SocialProviderSchema,
  providerHealthHash,
  type ProviderCapability,
  type ProviderConnectionBinding,
  type ProviderDeliveryReceipt,
  type ProviderHealth,
  type SocialProvider
} from "../contracts/social-provider.js";
import { DateTimeSchema, EvidenceRefSchema } from "../contracts/common.js";
import { configRoot as defaultConfigRoot } from "../paths.js";
import {
  SocialPublisherRegistrySchema,
  type SocialPublisherRegistry
} from "./publisher-targets.js";
import type { CapabilityAwareQueueItem } from "./queue.js";

export const SocialProviderRegistrySchema = z.strictObject({
  schemaVersion: z.literal("social-provider-registry/1"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  updatedAt: DateTimeSchema,
  ownerDecisionRef: EvidenceRefSchema,
  providers: z.array(SocialProviderSchema).min(1).max(20),
  bindings: z.array(ProviderConnectionBindingSchema).max(400)
}).superRefine((registry, context) => {
  const providerIds = registry.providers.map(({ id }) => id);
  const bindingIds = registry.bindings.map(({ id }) => id);
  if (new Set(providerIds).size !== providerIds.length) {
    context.addIssue({ code: "custom", message: "Provider ids must be unique", path: ["providers"] });
  }
  if (new Set(bindingIds).size !== bindingIds.length) {
    context.addIssue({ code: "custom", message: "Provider binding ids must be unique", path: ["bindings"] });
  }
  if (registry.providers.filter(({ id }) => id === "direct-meta").length !== 1) {
    context.addIssue({ code: "custom", message: "The registry needs exactly one Direct Meta core provider", path: ["providers"] });
  }
  for (const [index, binding] of registry.bindings.entries()) {
    const provider = registry.providers.find(({ id }) => id === binding.providerId);
    if (!provider) {
      context.addIssue({ code: "custom", message: "Binding references an unknown provider", path: ["bindings", index, "providerId"] });
      continue;
    }
    if (binding.providerImplementationVersion !== provider.implementationVersion || binding.providerApiVersion !== provider.apiVersion) {
      context.addIssue({ code: "custom", message: "Binding provider version is stale or mismatched", path: ["bindings", index] });
    }
    if (binding.capabilities.some((capability) => !provider.capabilities.includes(capability))) {
      context.addIssue({ code: "custom", message: "Binding exceeds provider capabilities", path: ["bindings", index, "capabilities"] });
    }
    if (provider.role === "notification-webhook" && binding.capabilities.includes("publish-original")) {
      context.addIssue({ code: "custom", message: "Notification-only providers cannot own a publish binding", path: ["bindings", index] });
    }
  }
  const connections = new Set(registry.bindings.map(({ connectionId }) => connectionId));
  for (const connectionId of connections) {
    if (registry.bindings.filter((binding) => binding.connectionId === connectionId && binding.mode === "active").length > 1) {
      context.addIssue({ code: "custom", message: "A social connection can have at most one active provider", path: ["bindings"] });
    }
  }
});

export type SocialProviderRegistry = z.infer<typeof SocialProviderRegistrySchema>;

export interface ResolvedProviderBinding {
  provider: SocialProvider;
  binding: ProviderConnectionBinding;
}

export interface ProviderBindingResolution {
  decision: "eligible" | "held" | "denied";
  reasons: string[];
  target: ResolvedProviderBinding | null;
  authorityGranted: false;
  publishingAuthorized: false;
  automaticFailover: false;
}

function bindingResolution(
  decision: ProviderBindingResolution["decision"],
  reasons: string[],
  target: ResolvedProviderBinding | null = null
): ProviderBindingResolution {
  return {
    decision,
    reasons: [...new Set(reasons)],
    target,
    authorityGranted: false,
    publishingAuthorized: false,
    automaticFailover: false
  };
}

export function validateProviderRegistryConnections(
  providerInput: unknown,
  publisherInput: unknown
): { providerRegistry: SocialProviderRegistry; publisherRegistry: SocialPublisherRegistry } {
  const providerRegistry = SocialProviderRegistrySchema.parse(providerInput);
  const publisherRegistry = SocialPublisherRegistrySchema.parse(publisherInput);
  const connections = new Set(publisherRegistry.connections.map(({ id }) => id));
  for (const binding of providerRegistry.bindings) {
    if (!connections.has(binding.connectionId)) throw new Error(`Provider binding ${binding.id} references an unknown social connection`);
  }
  for (const connection of publisherRegistry.connections) {
    const direct = providerRegistry.bindings.filter((binding) => binding.connectionId === connection.id && binding.providerId === "direct-meta" && binding.mode !== "retired");
    if (direct.length !== 1) throw new Error(`Social connection ${connection.id} needs exactly one retained Direct Meta binding`);
  }
  return { providerRegistry, publisherRegistry };
}

export function resolveProviderBinding(input: {
  registry: unknown;
  publisherRegistry: unknown;
  connectionId: string;
  environment: NodeJS.ProcessEnv;
  requiredCapability?: ProviderCapability;
}): ProviderBindingResolution {
  let registries: ReturnType<typeof validateProviderRegistryConnections>;
  try {
    registries = validateProviderRegistryConnections(input.registry, input.publisherRegistry);
  } catch {
    return bindingResolution("denied", ["malformed-provider-or-publisher-registry"]);
  }
  const { providerRegistry, publisherRegistry } = registries;
  const connection = publisherRegistry.connections.find(({ id }) => id === input.connectionId);
  if (!connection) return bindingResolution("denied", ["unknown-social-connection"]);
  const candidates = providerRegistry.bindings.filter((binding) => binding.connectionId === connection.id && binding.mode !== "retired");
  const active = candidates.filter(({ mode }) => mode === "active");
  if (active.length > 1) return bindingResolution("denied", ["multiple-active-provider-bindings"]);
  const binding = active[0] ?? candidates.find(({ providerId }) => providerId === connection.connector.providerId) ?? null;
  if (!binding) return bindingResolution("denied", ["provider-binding-missing"]);
  const provider = providerRegistry.providers.find(({ id }) => id === binding.providerId);
  if (!provider) return bindingResolution("denied", ["provider-missing"]);
  const target = { provider, binding };
  const capability = input.requiredCapability ?? "publish-original";
  if (provider.role === "notification-webhook") return bindingResolution("denied", ["notification-provider-cannot-publish"], target);
  if (!provider.supportedPlatforms.includes(connection.platform) || !provider.capabilities.includes(capability) || !binding.capabilities.includes(capability)) {
    return bindingResolution("denied", ["provider-binding-capability-mismatch"], target);
  }
  if (binding.providerId !== connection.connector.providerId || binding.providerApiVersion !== connection.connector.apiVersion) {
    return bindingResolution("denied", ["connection-provider-version-mismatch"], target);
  }
  const holds: string[] = [];
  if (provider.verdict !== "enabled") holds.push(`provider-${provider.verdict}`);
  if (binding.mode !== "active") holds.push(`binding-${binding.mode}`);
  if (!binding.ownerActivationRef || !binding.authorityRef || !binding.effectiveAt) holds.push("provider-owner-authority-missing");
  if (binding.health.state !== "healthy" || binding.health.unavailableReason !== "none") holds.push(`provider-${binding.health.unavailableReason}`);
  if (binding.migration.state !== "none" && binding.migration.state !== "completed") holds.push("provider-migration-incomplete");
  for (const reference of binding.credentialRefs) {
    if (!input.environment[reference]?.trim()) holds.push(`provider-credential-unavailable:${reference}`);
  }
  for (const requirement of provider.credentialRequirements) {
    if (!input.environment[requirement.environmentRef]?.trim()) holds.push(`provider-setting-unavailable:${requirement.environmentRef}`);
  }
  if (holds.length > 0) return bindingResolution("held", holds, target);
  return bindingResolution("eligible", ["exact-active-provider-binding"], target);
}

export interface ProviderMigrationDecision {
  decision: "ready" | "held" | "denied";
  reasons: string[];
  fromBindingRef: string;
  toBindingRef: string;
  resendAuthorized: false;
  automaticFailover: false;
}

export function planProviderMigration(input: {
  registry: unknown;
  connectionId: string;
  fromBindingId: string;
  toBindingId: string;
  ambiguousItemRefs: readonly string[];
}): ProviderMigrationDecision {
  const registry = SocialProviderRegistrySchema.safeParse(input.registry);
  const base = { fromBindingRef: input.fromBindingId, toBindingRef: input.toBindingId, resendAuthorized: false as const, automaticFailover: false as const };
  if (!registry.success) return { ...base, decision: "denied", reasons: ["malformed-provider-registry"] };
  const from = registry.data.bindings.find(({ id }) => id === input.fromBindingId);
  const to = registry.data.bindings.find(({ id }) => id === input.toBindingId);
  if (!from || !to || from.connectionId !== input.connectionId || to.connectionId !== input.connectionId || from.id === to.id) {
    return { ...base, decision: "denied", reasons: ["invalid-provider-migration-pair"] };
  }
  if (from.mode === "active") return { ...base, decision: "held", reasons: ["old-provider-must-stop-new-sends"] };
  if (input.ambiguousItemRefs.length > 0 || from.migration.inFlightItemRefs.length > 0) {
    return { ...base, decision: "held", reasons: ["in-flight-or-ambiguous-items-require-reconciliation"] };
  }
  if (!from.supersedingBindingRef || from.supersedingBindingRef !== to.id || to.previousBindingRef !== from.id) {
    return { ...base, decision: "held", reasons: ["append-only-binding-handoff-not-recorded"] };
  }
  if (!["paused", "retired", "migrating"].includes(from.mode) || !["draft", "held", "migrating"].includes(to.mode)) {
    return { ...base, decision: "held", reasons: ["provider-migration-state-not-ready"] };
  }
  return { ...base, decision: "ready", reasons: ["history-preserved-owner-activation-still-required"] };
}

export function providerReceiptResendDecision(receiptInput: unknown): { decision: "complete" | "reconcile" | "owner-review"; resendAuthorized: false; automaticFailover: false } {
  const receipt = ProviderDeliveryReceiptSchema.safeParse(receiptInput);
  if (!receipt.success || receipt.data.state === "ambiguous") return { decision: "reconcile", resendAuthorized: false, automaticFailover: false };
  if (["published", "reconciled"].includes(receipt.data.state)) return { decision: "complete", resendAuthorized: false, automaticFailover: false };
  return { decision: "owner-review", resendAuthorized: false, automaticFailover: false };
}

export function providerWindowHash(item: Pick<CapabilityAwareQueueItem, "publishWindow">): string {
  return createHash("sha256").update(JSON.stringify(item.publishWindow)).digest("hex");
}

export function createProviderDeliveryReceipt(input: {
  item: CapabilityAwareQueueItem;
  provider: SocialProvider;
  binding: ProviderConnectionBinding;
  canonicalReceiptId: string;
  idempotencyHash: string;
  state: "published" | "failed" | "ambiguous" | "reconciled";
  remoteId: string | null;
  publicUrl: string | null;
  requestedAt: Date;
  respondedAt: Date | null;
  status: string;
  error: string | null;
  reconciliationRef?: string | null;
}): ProviderDeliveryReceipt {
  const fingerprint = createHash("sha256").update(`${input.binding.id}:${input.item.id}:${input.idempotencyHash}`).digest("hex").slice(0, 16);
  const successful = input.state === "published" || input.state === "reconciled";
  return ProviderDeliveryReceiptSchema.parse({
    schemaVersion: "provider-delivery-receipt/1",
    id: `provider-delivery-receipt-${fingerprint}`,
    providerId: input.provider.id,
    bindingId: input.binding.id,
    connectionId: input.binding.connectionId,
    profileId: input.item.target.profileId,
    itemRef: `state/social/queue/${input.item.id}.json`,
    canonicalReceiptRef: `state/social/posts/${input.canonicalReceiptId}.json`,
    idempotencyHash: input.idempotencyHash,
    contentHash: input.item.content.contentHash,
    windowHash: providerWindowHash(input.item),
    state: input.state,
    remoteId: input.remoteId,
    publicUrl: input.publicUrl,
    requestedAt: input.requestedAt.toISOString(),
    respondedAt: input.respondedAt?.toISOString() ?? null,
    acceptedAt: input.remoteId ? (input.respondedAt ?? input.requestedAt).toISOString() : null,
    publishedAt: successful ? (input.respondedAt ?? input.requestedAt).toISOString() : null,
    status: input.status.slice(0, 500),
    error: input.error?.slice(0, 500) ?? null,
    providerImplementationVersion: input.provider.implementationVersion,
    providerApiVersion: input.provider.apiVersion,
    actualCostUsd: input.provider.id === "direct-meta" ? 0 : null,
    usageRef: null,
    retryOfReceiptRef: null,
    reconciliationRef: input.reconciliationRef ?? null,
    correctedReceiptRef: null,
    supersedingReceiptRef: null,
    rawPayloadExcluded: true,
    authorityGranted: false
  });
}

export function createProviderHealthSnapshot(input: {
  provider: SocialProvider;
  binding: ProviderConnectionBinding;
  generatedAt: Date;
  lastSuccessfulOperationAt?: string | null;
  lastAttemptedOperationAt?: string | null;
  lastReconciledOperationAt?: string | null;
  incidentRefs?: string[];
}): ProviderHealth {
  const base = {
    schemaVersion: "provider-health/1" as const,
    id: `provider-health-${input.binding.id.replace(/^social-provider-binding-/u, "")}`,
    providerId: input.provider.id,
    bindingId: input.binding.id,
    connectionId: input.binding.connectionId,
    state: input.binding.health.state,
    lastSuccessfulOperationAt: input.lastSuccessfulOperationAt ?? null,
    lastAttemptedOperationAt: input.lastAttemptedOperationAt ?? null,
    lastReconciledOperationAt: input.lastReconciledOperationAt ?? null,
    tokenStatus: input.binding.health.unavailableReason === "token-expired" ? "expired" as const : input.binding.health.lastVerifiedAt ? "healthy" as const : "unknown" as const,
    appReviewStatus: input.binding.health.unavailableReason === "app-review-expired" ? "expired" as const : input.binding.health.lastVerifiedAt ? "healthy" as const : "unknown" as const,
    planLimitStatus: input.binding.health.unavailableReason === "plan-limit" ? "limited" as const : "healthy" as const,
    rateLimitStatus: input.binding.health.unavailableReason === "rate-limited" ? "limited" as const : "healthy" as const,
    webhookFreshness: input.provider.evidenceCapabilities.webhooks ? "unknown" as const : "not-applicable" as const,
    incidentRefs: input.incidentRefs ?? [],
    ownerAttentionRefs: input.binding.mode === "active" ? [] : ["docs/NEEDED.md#social-distribution-connection-001"],
    nextSafeAction: input.binding.mode === "active" ? "Reverify provider health before the next approved item." : "Owner verifies account, scopes, renewal and exact routine authority before activation.",
    reverifyBy: input.provider.healthPolicy.reverifyBy,
    generatedAt: input.generatedAt.toISOString(),
    authorityGranted: false as const
  };
  return ProviderHealthSchema.parse({ ...base, snapshotHash: providerHealthHash(base as Omit<ProviderHealth, "snapshotHash">) });
}

export async function loadSocialProviderRegistry(root: string = defaultConfigRoot): Promise<SocialProviderRegistry> {
  const source = await readFile(path.join(root, "social-providers.json"), "utf8");
  return SocialProviderRegistrySchema.parse(JSON.parse(source) as unknown);
}
