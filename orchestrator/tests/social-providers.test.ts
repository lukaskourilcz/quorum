import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ProviderConnectionBindingSchema,
  providerBindingHash,
  type ProviderConnectionBinding
} from "../src/contracts/social-provider.js";
import { configRoot, repoRoot } from "../src/paths.js";
import {
  SocialProviderRegistrySchema,
  createProviderDeliveryReceipt,
  createProviderHealthSnapshot,
  loadSocialProviderRegistry,
  planProviderMigration,
  providerReceiptResendDecision,
  resolveProviderBinding
} from "../src/social/providers.js";
import { loadSocialPublisherRegistry, migrateLegacyQueueItem } from "../src/social/publisher-targets.js";
import type { SocialProviderRegistry } from "../src/social/providers.js";

function rehashBinding(binding: ProviderConnectionBinding): ProviderConnectionBinding {
  return { ...binding, bindingHash: providerBindingHash(binding) };
}

function activateBinding(registry: SocialProviderRegistry, connectionId: string): SocialProviderRegistry {
  const copy = structuredClone(registry);
  const index = copy.bindings.findIndex((binding) => binding.connectionId === connectionId && binding.providerId === "direct-meta");
  const binding = copy.bindings[index]!;
  copy.bindings[index] = ProviderConnectionBindingSchema.parse(rehashBinding({
    ...binding,
    mode: "active" as const,
    ownerActivationRef: "owner:provider-activation-001",
    authorityRef: "owner:routine-authority-001",
    effectiveAt: "2026-08-27T09:00:00.000Z",
    health: { state: "healthy" as const, unavailableReason: "none" as const, lastVerifiedAt: "2026-08-27T09:00:00.000Z" }
  }));
  return SocialProviderRegistrySchema.parse(copy);
}

describe("Social Distribution provider control plane", () => {
  it("loads Direct Meta core with every optional verdict explicit and every connection held", async () => {
    const registry = await loadSocialProviderRegistry(configRoot);
    expect(registry.providers.map(({ id, verdict }) => [id, verdict])).toEqual([
      ["direct-meta", "enabled"],
      ["buffer", "held"],
      ["metricool", "held"],
      ["n8n", "held"],
      ["make", "disabled"],
      ["ayrshare", "rejected"]
    ]);
    expect(registry.bindings).toHaveLength(6);
    expect(registry.bindings.every(({ mode, authorityGranted, publishingAuthorized }) => mode === "held" && !authorityGranted && !publishingAuthorized)).toBe(true);
    expect(registry.providers.find(({ id }) => id === "n8n")?.capabilities).toEqual(["webhook-normalize", "notify-incident"]);
    expect(registry.providers.find(({ id }) => id === "n8n")?.capabilities).not.toContain("publish-original");
  });

  it("holds the committed binding and resolves only one explicitly activated Direct Meta binding", async () => {
    const [providers, publisher] = await Promise.all([loadSocialProviderRegistry(), loadSocialPublisherRegistry()]);
    const connectionId = "social-connection-caught-up-threads";
    const environment = { META_GRAPH_API_VERSION: "v26.0", CAUGHT_UP_THREADS_ACCESS_TOKEN: "fixture", CAUGHT_UP_THREADS_USER_ID: "fixture" };
    expect(resolveProviderBinding({ registry: providers, publisherRegistry: publisher, connectionId, environment })).toMatchObject({
      decision: "held",
      automaticFailover: false,
      authorityGranted: false,
      reasons: expect.arrayContaining(["binding-held", "provider-owner-authority-missing"])
    });
    expect(resolveProviderBinding({ registry: activateBinding(providers, connectionId), publisherRegistry: publisher, connectionId, environment })).toMatchObject({
      decision: "eligible",
      target: { provider: { id: "direct-meta" }, binding: { connectionId, mode: "active" } },
      publishingAuthorized: false,
      automaticFailover: false
    });
  });

  it("rejects multiple active providers for a connection", async () => {
    const registry = activateBinding(await loadSocialProviderRegistry(), "social-connection-caught-up-threads");
    const first = registry.bindings.find(({ connectionId }) => connectionId === "social-connection-caught-up-threads")!;
    const duplicate = rehashBinding({ ...structuredClone(first), id: "social-provider-binding-caught-up-threads-direct-meta-alternate" });
    expect(SocialProviderRegistrySchema.safeParse({ ...registry, bindings: [...registry.bindings, duplicate] }).success).toBe(false);
  });

  it("holds migrations until old sends stop, ambiguity clears and append-only handoff refs exist", async () => {
    const registry = await loadSocialProviderRegistry();
    const fromBase = registry.bindings[0]!;
    const toId = "social-provider-binding-caught-up-threads-direct-meta-next";
    const from = rehashBinding({ ...structuredClone(fromBase), mode: "paused" as const, supersedingBindingRef: toId, health: { state: "paused" as const, unavailableReason: "reverification-required" as const, lastVerifiedAt: null } });
    const to = rehashBinding({ ...structuredClone(fromBase), id: toId, mode: "draft" as const, previousBindingRef: from.id });
    const migrationRegistry = SocialProviderRegistrySchema.parse({ ...registry, bindings: [from, to, ...registry.bindings.slice(1)] });
    const input = { registry: migrationRegistry, connectionId: from.connectionId, fromBindingId: from.id, toBindingId: to.id };
    expect(planProviderMigration({ ...input, ambiguousItemRefs: ["queue:item-ambiguous"] })).toMatchObject({ decision: "held", resendAuthorized: false, automaticFailover: false });
    expect(planProviderMigration({ ...input, ambiguousItemRefs: [] })).toMatchObject({ decision: "ready", reasons: ["history-preserved-owner-activation-still-required"], resendAuthorized: false });
  });

  it("normalizes delivery and health evidence without raw payloads or resend authority", async () => {
    const [providers, publisher, legacy] = await Promise.all([
      loadSocialProviderRegistry(),
      loadSocialPublisherRegistry(),
      readFile(path.join(repoRoot, "state/social/queue/2026-08-05-cs-threads.json"), "utf8").then(JSON.parse)
    ]);
    const item = migrateLegacyQueueItem(legacy, publisher);
    const provider = providers.providers.find(({ id }) => id === "direct-meta")!;
    const binding = providers.bindings.find(({ connectionId }) => connectionId === item.target.connectionBindingRef)!;
    const receipt = createProviderDeliveryReceipt({
      item,
      provider,
      binding,
      canonicalReceiptId: "social-receipt-aaaaaaaaaaaaaaaa",
      idempotencyHash: "a".repeat(64),
      state: "ambiguous",
      remoteId: null,
      publicUrl: null,
      requestedAt: new Date("2026-08-27T10:00:00.000Z"),
      respondedAt: null,
      status: "Provider response was not conclusive.",
      error: "Timeout after request transmission"
    });
    expect(receipt).toMatchObject({ state: "ambiguous", rawPayloadExcluded: true, authorityGranted: false });
    expect(receipt).not.toHaveProperty("rawPayload");
    expect(providerReceiptResendDecision(receipt)).toEqual({ decision: "reconcile", resendAuthorized: false, automaticFailover: false });
    expect(createProviderHealthSnapshot({ provider, binding, generatedAt: new Date("2026-08-27T10:00:00.000Z") })).toMatchObject({ state: "held", authorityGranted: false });
  });
});
