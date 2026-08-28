import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { rawRecord } from "./model";
import {
  parseProviderBinding,
  parseProviderDeliveryReceipt,
  parseProviderHealth,
  parseSocialProvider,
  type ProviderBindingRecord,
  type ProviderDeliveryReceiptRecord,
  type ProviderHealthRecord,
  type SocialProviderRecord
} from "./provider-model";

export interface AdminProviderView {
  provider: SocialProviderRecord;
  posture: "direct-core" | "optional-held" | "deferred" | "rejected";
  bindingCount: number;
  activeBindings: number;
}

export interface AdminProviderBindingView {
  binding: ProviderBindingRecord;
  provider: SocialProviderRecord;
  latestHealth: ProviderHealthRecord | null;
  setupReason: string;
}

export interface AdminSocialProviderSnapshot {
  providers: AdminProviderView[];
  bindings: AdminProviderBindingView[];
  receipts: ProviderDeliveryReceiptRecord[];
  migrations: ProviderBindingRecord[];
  summary: { directCoreAvailable: boolean; activeBindings: number; heldBindings: number; ambiguousReceipts: number };
  dropped: { providers: number; bindings: number; receipts: number; health: number; orphanBindings: number };
  unavailable: string[];
  authorityGranted: false;
  purchaseAuthorized: false;
  automaticFailover: false;
}

async function jsonFile(file: string): Promise<{ value: unknown | null; state: "present" | "missing" | "malformed" }> {
  try {
    try { return { value: JSON.parse(await readFile(file, "utf8")) as unknown, state: "present" }; }
    catch { return { value: null, state: "malformed" }; }
  } catch (error) {
    return { value: null, state: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "malformed" };
  }
}

async function records<T>(directory: string, parse: (value: unknown) => T | null, limit: number): Promise<{ accepted: T[]; dropped: number; unavailable: boolean }> {
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : null);
  if (files === null) return { accepted: [], dropped: 1, unavailable: true };
  const accepted: T[] = []; let dropped = 0;
  for (const file of files.filter((name) => name.endsWith(".json")).sort().slice(0, limit)) {
    try {
      const parsed = parse(JSON.parse(await readFile(path.join(directory, file), "utf8")) as unknown);
      if (parsed) accepted.push(parsed); else dropped += 1;
    } catch { dropped += 1; }
  }
  return { accepted, dropped, unavailable: false };
}

function posture(provider: SocialProviderRecord): AdminProviderView["posture"] {
  if (provider.id === "direct-meta") return "direct-core";
  if (provider.verdict === "rejected") return "rejected";
  if (provider.verdict === "disabled") return "deferred";
  return "optional-held";
}

export async function readAdminSocialProviders(root: string): Promise<AdminSocialProviderSnapshot> {
  const [registryFile, receiptState, healthState] = await Promise.all([
    jsonFile(path.join(root, "config/social-providers.json")),
    records(path.join(root, "state/social/provider-receipts"), parseProviderDeliveryReceipt, 2_000),
    records(path.join(root, "state/social/provider-health"), parseProviderHealth, 500)
  ]);
  const unavailable: string[] = [];
  if (registryFile.state !== "present") unavailable.push(`provider registry: ${registryFile.state}`);
  if (receiptState.unavailable) unavailable.push("provider receipts: unavailable");
  if (healthState.unavailable) unavailable.push("provider health: unavailable");
  const registry = rawRecord(registryFile.value);
  const rawProviders = registry?.schemaVersion === "social-provider-registry/1" && Array.isArray(registry.providers) ? registry.providers.slice(0, 20) : [];
  const rawBindings = registry?.schemaVersion === "social-provider-registry/1" && Array.isArray(registry.bindings) ? registry.bindings.slice(0, 400) : [];
  const parsedProviders = rawProviders.map(parseSocialProvider); const acceptedProviders = parsedProviders.filter((provider): provider is SocialProviderRecord => provider !== null);
  const parsedBindings = rawBindings.map(parseProviderBinding); const acceptedBindings = parsedBindings.filter((binding): binding is ProviderBindingRecord => binding !== null);
  const providerById = new Map(acceptedProviders.map((provider) => [provider.id, provider]));
  const orphanBindings = acceptedBindings.filter((binding) => !providerById.has(binding.providerId));
  const bindings = acceptedBindings.filter((binding) => providerById.has(binding.providerId));
  const latestHealth = new Map<string, ProviderHealthRecord>();
  for (const health of healthState.accepted.sort((left, right) => left.generatedAt.localeCompare(right.generatedAt))) {
    if (health.bindingId) latestHealth.set(health.bindingId, health);
  }
  const providerViews = acceptedProviders.map((provider): AdminProviderView => ({
    provider,
    posture: posture(provider),
    bindingCount: bindings.filter(({ providerId }) => providerId === provider.id).length,
    activeBindings: bindings.filter(({ providerId, mode }) => providerId === provider.id && mode === "active").length
  }));
  const bindingViews = bindings.map((binding): AdminProviderBindingView => ({
    binding,
    provider: providerById.get(binding.providerId)!,
    latestHealth: latestHealth.get(binding.id) ?? null,
    setupReason: binding.mode === "active" ? "Explicit binding is active; runtime gates still apply." : binding.health.unavailableReason
  }));
  const receipts = receiptState.accepted.sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  return {
    providers: providerViews,
    bindings: bindingViews,
    receipts,
    migrations: bindings.filter((binding) => binding.migration.state !== "none" || binding.previousBindingRef !== null || binding.supersedingBindingRef !== null),
    summary: {
      directCoreAvailable: providerViews.some(({ provider, posture: value }) => provider.id === "direct-meta" && provider.verdict === "enabled" && value === "direct-core"),
      activeBindings: bindings.filter(({ mode }) => mode === "active").length,
      heldBindings: bindings.filter(({ mode }) => ["draft", "held", "paused", "migrating"].includes(mode)).length,
      ambiguousReceipts: receipts.filter(({ state }) => state === "ambiguous").length
    },
    dropped: {
      providers: parsedProviders.length - acceptedProviders.length,
      bindings: parsedBindings.length - acceptedBindings.length,
      receipts: receiptState.dropped,
      health: healthState.dropped,
      orphanBindings: orphanBindings.length
    },
    unavailable,
    authorityGranted: false,
    purchaseAuthorized: false,
    automaticFailover: false
  };
}
