import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { SocialProfileInventorySchema } from "../contracts/social-inventory.js";
import { SocialProfileOperationSchema, type SocialProfileOperation } from "../contracts/social-operations.js";
import { ProviderDeliveryReceiptSchema, ProviderHealthSchema, type ProviderDeliveryReceipt, type ProviderHealth } from "../contracts/social-provider.js";
import { VentureRunReceiptSchema, type VentureRunReceipt } from "../contracts/venture-operations.js";
import { canonicalJson, sha256 } from "../hashing.js";
import { pragueClockParts } from "../meetings/clock.js";
import type { HealthAdapterObservation, OperationHoldReasons } from "../operations/health.js";
import type { OperationalIncident } from "../operations/recovery.js";

const operationRef = (operation: SocialProfileOperation): string => `state/social/profile-operations/${operation.id}.json`;
const providerHealthRef = (health: ProviderHealth): string => `state/social/provider-health/${health.id}.json`;
const deliveryRef = (receipt: ProviderDeliveryReceipt): string => `state/social/provider-receipts/${receipt.id}.json`;

function operationOutcome(operation: SocialProfileOperation): VentureRunReceipt["outcome"] {
  if (operation.providerConnectionState === "failed") return "failed";
  if (operation.providerConnectionState === "ambiguous") return "partial";
  return { queued: "success", NO_POST: "quiet", held: "held", review: "held", paused: "cancelled" }[operation.outcome] as VentureRunReceipt["outcome"];
}

function operationReceipt(operation: SocialProfileOperation, deliveries: readonly ProviderDeliveryReceipt[]): VentureRunReceipt {
  const ref = operationRef(operation);
  const providerReceipts = deliveries.filter((receipt) => receipt.itemRef === operation.queue?.itemRef).map(deliveryRef);
  const outcome = operationOutcome(operation);
  return VentureRunReceiptSchema.parse({
    schemaVersion: "venture-run-receipt/1",
    receiptId: `social-${operation.id}`,
    nodeId: "social-distribution",
    phase: "daily-profile-operation",
    jobId: `social-daily:${operation.profileId}:${operation.targetDate}`,
    trigger: "schedule",
    idempotencyKey: operation.idempotencyKey,
    startedAt: operation.createdAt,
    endedAt: operation.createdAt,
    durationMs: 0,
    mode: "live",
    outcome,
    domainReceiptRefs: [ref],
    inputHash: operation.inputHash,
    outputHash: sha256(canonicalJson(operation)),
    providerCallRefs: providerReceipts.slice(-32),
    costRefs: operation.actualCostUsd > 0 ? [ref] : [],
    cacheReuse: { cacheHits: operation.reuseRefs.length, cacheMisses: 0, artifactsReused: operation.reuseRefs.length, duplicateRunsPrevented: operation.replayed ? 1 : 0 },
    changes: { changed: operation.outcome === "queued" ? 1 : 0, unchanged: operation.outcome === "NO_POST" ? 1 : 0, malformed: operation.reasons.includes("malformed-strategy-inventory") ? 1 : 0 },
    errors: outcome === "failed" ? operation.reasons.slice(0, 12) : [],
    ownerAttentionRefs: operation.ownerAttentionRefs.slice(-32),
    recoveryEligibility: operation.providerConnectionState === "ambiguous" || operation.providerConnectionState === "failed" ? "eligible" : operation.outcome === "held" || operation.outcome === "review" ? "owner-only" : "not-eligible",
    nextSafeAction: operation.providerConnectionState === "ambiguous" ? "Delegate reconciliation of this exact connection and idempotency key to Operations Recovery; do not resend." : operation.outcome === "held" || operation.outcome === "review" ? "Preserve the exact scope and wait for the recorded owner or policy condition." : null,
    recordedAt: operation.createdAt,
    supersedesReceiptRef: null
  });
}

function providerOutcome(health: ProviderHealth): VentureRunReceipt["outcome"] {
  return { healthy: "quiet", held: "held", degraded: "partial", stale: "partial", failing: "failed", paused: "cancelled", "setup-needed": "held", unavailable: "failed" }[health.state] as VentureRunReceipt["outcome"];
}

function providerReceipt(health: ProviderHealth): VentureRunReceipt {
  const ref = providerHealthRef(health);
  const outcome = providerOutcome(health);
  return VentureRunReceiptSchema.parse({
    schemaVersion: "venture-run-receipt/1",
    receiptId: `social-provider-${sha256(`${health.id}:${health.snapshotHash}`).slice(0, 24)}`,
    nodeId: "social-distribution",
    phase: "provider-health",
    jobId: `social-provider-health:${health.id}`,
    trigger: "schedule",
    idempotencyKey: health.snapshotHash,
    startedAt: health.generatedAt,
    endedAt: health.generatedAt,
    durationMs: 0,
    mode: "live",
    outcome,
    domainReceiptRefs: [ref],
    inputHash: health.snapshotHash,
    outputHash: health.snapshotHash,
    providerCallRefs: [],
    costRefs: [],
    cacheReuse: { cacheHits: 0, cacheMisses: 0, artifactsReused: 0, duplicateRunsPrevented: 0 },
    changes: { changed: 0, unchanged: 1, malformed: 0 },
    errors: outcome === "failed" ? [health.nextSafeAction] : [],
    ownerAttentionRefs: health.ownerAttentionRefs.slice(-32),
    recoveryEligibility: health.state === "degraded" || health.state === "failing" || health.state === "stale" ? "eligible" : "owner-only",
    nextSafeAction: health.nextSafeAction,
    recordedAt: health.generatedAt,
    supersedesReceiptRef: null
  });
}

export function buildSocialDistributionHealthObservation(input: {
  operations: readonly unknown[];
  inventories: readonly unknown[];
  providerHealth: readonly unknown[];
  deliveryReceipts: readonly unknown[];
  now: Date;
}): HealthAdapterObservation {
  const operations = input.operations.flatMap((value) => { const parsed = SocialProfileOperationSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
  const inventories = input.inventories.flatMap((value) => { const parsed = SocialProfileInventorySchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
  const providers = input.providerHealth.flatMap((value) => { const parsed = ProviderHealthSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
  const deliveries = input.deliveryReceipts.flatMap((value) => { const parsed = ProviderDeliveryReceiptSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
  const latestProviderByConnection = new Map<string, ProviderHealth>();
  for (const health of providers.sort((left, right) => left.generatedAt.localeCompare(right.generatedAt))) {
    latestProviderByConnection.set(health.connectionId ?? health.id, health);
  }
  const providerSnapshots = [...latestProviderByConnection.values()];
  const malformedCount = [
    ...input.operations.filter((value) => !SocialProfileOperationSchema.safeParse(value).success),
    ...input.inventories.filter((value) => !SocialProfileInventorySchema.safeParse(value).success),
    ...input.providerHealth.filter((value) => !ProviderHealthSchema.safeParse(value).success),
    ...input.deliveryReceipts.filter((value) => !ProviderDeliveryReceiptSchema.safeParse(value).success)
  ].length;
  const receipts: unknown[] = [
    ...operations.map((operation) => operationReceipt(operation, deliveries)),
    ...providerSnapshots.map(providerReceipt),
    ...Array.from({ length: malformedCount }, () => ({ schemaVersion: "malformed-social-domain-record/1" }))
  ];
  const holds: Partial<OperationHoldReasons> = { budget: [], provider: [], source: [], credential: [], owner: [] };
  const today = pragueClockParts(input.now).date;
  for (const inventory of inventories) {
    const horizonEnd = new Date(`${inventory.horizonStart}T00:00:00.000Z`); horizonEnd.setUTCDate(horizonEnd.getUTCDate() + inventory.horizonDays);
    if (today >= horizonEnd.toISOString().slice(0, 10)) holds.source!.push(`${inventory.profileId}: inventory is stale beyond its recorded horizon.`);
    else if (inventory.state === "held") holds.source!.push(`${inventory.profileId}: inventory is held.`);
    else if (inventory.state === "low-runway" || inventory.state === "no-candidate") holds.source!.push(`${inventory.profileId}: inventory runway is ${inventory.state}.`);
  }
  for (const health of providerSnapshots) {
    if (health.state === "setup-needed") holds.credential!.push(`${health.connectionId ?? health.providerId}: owner setup or credential verification is required.`);
    else if (health.state === "held") holds.provider!.push(`${health.connectionId ?? health.providerId}: provider binding is held.`);
    else if (health.state === "paused") holds.owner!.push(`${health.connectionId ?? health.providerId}: exact provider scope is paused.`);
  }
  for (const operation of operations) {
    if (operation.reasons.includes("budget-exhausted")) holds.budget!.push(`${operation.profileId}: approved budget is exhausted.`);
    if (operation.reasons.includes("denied-capability") || operation.reasons.includes("missing-authority")) holds.owner!.push(`${operation.profileId}: capability or authority is not current.`);
  }
  for (const key of Object.keys(holds) as Array<keyof OperationHoldReasons>) holds[key] = [...new Set(holds[key])].sort().slice(0, 8);
  const completed = new Set(deliveries.filter(({ state }) => ["published", "reconciled"].includes(state)).map(({ itemRef }) => itemRef));
  const ambiguous = deliveries.filter(({ state }) => state === "ambiguous");
  const pending = operations.filter(({ queue }) => queue && !completed.has(queue.itemRef)).length;
  const lastGood = [...operations].filter(({ outcome, providerConnectionState }) => ["queued", "NO_POST"].includes(outcome) && !["failed", "ambiguous"].includes(providerConnectionState)).sort((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1);
  const tomorrow = new Date(input.now.getTime() + 86_400_000);
  const ownerAttentionRefs = [...new Set([...operations.flatMap(({ ownerAttentionRefs: refs }) => refs), ...providerSnapshots.flatMap(({ ownerAttentionRefs: refs }) => refs)])].sort().slice(-32);
  return {
    receipts,
    holds,
    queue: ambiguous.length ? { state: "reconciling", pending } : pending > 8 ? { state: "backlogged", pending } : pending ? { state: "pending", pending } : { state: "clear", pending: 0 },
    ownerAttentionRefs,
    lastKnownGoodRef: lastGood ? operationRef(lastGood) : null,
    nextExpectedAt: tomorrow.toISOString(),
    dueWindow: "daily deterministic profile operation; weekly learning in the existing checkpoint",
    recoveryRefs: ambiguous.map((receipt) => `${deliveryRef(receipt)}#reconcile-through-operations-recovery`).slice(-32),
    costUsd: operations.reduce((total, operation) => total + operation.actualCostUsd, 0)
  };
}

async function jsonFiles(directory: string): Promise<unknown[]> {
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
  return Promise.all(names.filter((name) => name.endsWith(".json")).sort().map(async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown));
}

async function currentInventories(stateRoot: string): Promise<unknown[]> {
  const root = path.join(stateRoot, "social", "inventory");
  const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
  return Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try { return JSON.parse(await readFile(path.join(root, entry.name, "current.json"), "utf8")) as unknown; } catch { return null; }
  }));
}

export async function readSocialDistributionHealthObservation(stateRoot: string, now = new Date()): Promise<HealthAdapterObservation> {
  const [operations, inventories, providerHealth, deliveryReceipts] = await Promise.all([
    jsonFiles(path.join(stateRoot, "social", "profile-operations")),
    currentInventories(stateRoot),
    jsonFiles(path.join(stateRoot, "social", "provider-health")),
    jsonFiles(path.join(stateRoot, "social", "provider-receipts"))
  ]);
  return buildSocialDistributionHealthObservation({ operations, inventories, providerHealth, deliveryReceipts, now });
}

export function socialDistributionOwnerIncident(input: { condition: string; affectedScope: string; unaffectedScope: string; evidenceRefs: string[]; exactOwnerAction: string; impact: string; retryCondition: string; now: Date }): OperationalIncident {
  const conditionKey = `social-distribution:${input.affectedScope.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "").toLowerCase()}:${input.condition.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "").toLowerCase()}`.slice(0, 200);
  return {
    incidentId: `incident-${sha256(conditionKey).slice(0, 24)}`,
    conditionKey,
    nodeId: "social-distribution",
    affectedScope: input.affectedScope,
    firstSeenAt: input.now.toISOString(),
    lastSeenAt: input.now.toISOString(),
    evidenceRefs: [...new Set(input.evidenceRefs)].sort().slice(0, 24),
    exactOwnerAction: input.exactOwnerAction,
    impact: input.impact,
    unaffectedScope: input.unaffectedScope,
    retryCondition: input.retryCondition,
    sourcePolicyRef: "config/operations-recovery.json#social-distribution:routine",
    status: "active",
    correctionHistory: []
  };
}
