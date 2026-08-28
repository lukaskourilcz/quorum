import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { OwnerAttention } from "../src/contracts/owner-attention.js";
import { ProviderHealthSchema, providerHealthHash } from "../src/contracts/social-provider.js";
import { OperationsSnapshotSchema, VentureOperationHealthSchema } from "../src/contracts/venture-operations.js";
import { upsertOperationalIncident } from "../src/operations/recovery.js";
import { materializeOperationsState } from "../src/operations/service.js";
import { buildSocialDistributionHealthObservation, socialDistributionOwnerIncident } from "../src/social/health.js";
import { repoRoot } from "../src/paths.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function operation(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "social-profile-operation/1", id: `social-profile-operation-${"a".repeat(20)}`, idempotencyKey: "a".repeat(64), inputHash: "b".repeat(64), supersedesOperationRef: null,
    profileId: "social-profile-caught-up", connectionId: "social-connection-caught-up-threads", strategyRef: "config/social-profile-strategies.json#social-profile-strategy-caught-up", inventoryRef: "state/social/inventory/social-profile-caught-up/current.json", campaignRefs: [], targetDate: "2026-08-28", timezone: "Europe/Prague",
    selectionWindow: { notBefore: "2026-08-28T00:00:00.000Z", notAfter: "2026-08-29T00:00:00.000Z" }, candidateRefs: [], candidateSetHash: "c".repeat(64), selectedCandidateRef: null, immutableHashes: null,
    gates: [{ gate: "expiry", status: "hold", reason: "No useful candidate is due.", evidenceRef: null }], routineScopeRef: null, routineScopeState: "missing", queue: null, outcome: "NO_POST", reasons: ["no-due-useful-candidate"], providerConnectionState: "unavailable", actualCostUsd: 0, reuseRefs: [], incidentRefs: [], ownerAttentionRefs: [], replayed: false, createdAt: "2026-08-28T10:00:00.000Z", authorityGranted: false, publishingAuthorized: false,
    ...overrides
  };
}

async function fixtures() {
  const [providerRaw, inventoryRaw] = await Promise.all([
    readFile(path.join(repoRoot, "contracts/fixtures/social-provider-contracts.valid.json"), "utf8"),
    readFile(path.join(repoRoot, "contracts/fixtures/social-inventory-contracts.valid.json"), "utf8")
  ]);
  return { provider: JSON.parse(providerRaw) as { health: Record<string, unknown>; receipt: Record<string, unknown> }, inventory: (JSON.parse(inventoryRaw) as { inventory: Record<string, unknown> }).inventory };
}

describe("Social Distribution domain health adapter", () => {
  it("normalizes a deterministic NO_POST day as quiet canonical evidence", () => {
    const observation = buildSocialDistributionHealthObservation({ operations: [operation()], inventories: [], providerHealth: [], deliveryReceipts: [], now: new Date("2026-08-28T12:00:00.000Z") });
    expect(observation.receipts).toMatchObject([{ nodeId: "social-distribution", outcome: "quiet", recoveryEligibility: "not-eligible", domainReceiptRefs: [expect.stringContaining("social-profile-operation-")] }]);
    expect(observation.queue).toEqual({ state: "clear", pending: 0 });
  });

  it("reports low runway and stale inventory for only the exact profile", async () => {
    const { inventory } = await fixtures();
    const observation = buildSocialDistributionHealthObservation({ operations: [], inventories: [{ ...inventory, state: "low-runway", horizonStart: "2026-08-01" }], providerHealth: [], deliveryReceipts: [], now: new Date("2026-08-28T12:00:00.000Z") });
    expect(observation.holds?.source).toEqual(["social-profile-caught-up: inventory is stale beyond its recorded horizon."]);
    expect(JSON.stringify(observation)).not.toContain("social-profile-door-money");
  });

  it("isolates a provider outage and delegates its receipt to recovery", async () => {
    const { provider } = await fixtures();
    const current = ProviderHealthSchema.parse(provider.health);
    const failingBase = { ...current, state: "failing" as const, nextSafeAction: "Reconcile this exact connection through Operations Recovery.", snapshotHash: "0".repeat(64) };
    const snapshotHash = providerHealthHash(failingBase);
    const failing = ProviderHealthSchema.parse({ ...failingBase, snapshotHash });
    const observation = buildSocialDistributionHealthObservation({ operations: [], inventories: [], providerHealth: [failing], deliveryReceipts: [], now: new Date("2026-08-28T12:00:00.000Z") });
    expect(observation.receipts).toMatchObject([{ outcome: "failed", recoveryEligibility: "eligible", nextSafeAction: expect.stringContaining("Operations Recovery") }]);
    expect(observation.holds?.provider).toEqual([]);
  });

  it("keeps an ambiguous publish in reconciliation instead of authorizing a resend", async () => {
    const { provider } = await fixtures();
    const delivery = { ...provider.receipt, state: "ambiguous", remoteId: null, publicUrl: null, publishedAt: null, reconciliationRef: null, status: "Provider response was ambiguous." };
    const queued = operation({ providerConnectionState: "ambiguous", outcome: "held", reasons: ["ambiguous-delivery-reconciliation"], ownerAttentionRefs: ["state/social/provider-receipts"], createdAt: "2026-08-28T11:00:00.000Z" });
    const observation = buildSocialDistributionHealthObservation({ operations: [queued], inventories: [], providerHealth: [], deliveryReceipts: [delivery], now: new Date("2026-08-28T12:00:00.000Z") });
    expect(observation.queue).toEqual({ state: "reconciling", pending: 0 });
    expect(observation.recoveryRefs).toEqual([expect.stringContaining("#reconcile-through-operations-recovery")]);
    expect(JSON.stringify(observation)).toContain("do not resend");
  });

  it("deduplicates recurring owner attention by scope and condition", () => {
    const base: OwnerAttention = { schemaVersion: "owner-attention/1", generatedAt: "2026-08-28T10:00:00.000Z", approvals: [], manualTasks: [] };
    const incident = socialDistributionOwnerIncident({ condition: "credential expired", affectedScope: "social-connection-caught-up-threads", unaffectedScope: "All other Social Distribution connections remain unchanged.", evidenceRefs: ["state/social/provider-health/fixture.json"], exactOwnerAction: "Renew only the recorded connection credential.", impact: "Publishing is paused for this connection only.", retryCondition: "Retry after current credential evidence exists.", now: new Date("2026-08-28T10:00:00.000Z") });
    const first = upsertOperationalIncident(base, incident);
    const second = upsertOperationalIncident(first, { ...incident, lastSeenAt: "2026-08-28T11:00:00.000Z" });
    expect(second.operationalIncidents).toHaveLength(1);
    expect(second.operationalIncidents?.[0]).toMatchObject({ firstSeenAt: "2026-08-28T10:00:00.000Z", lastSeenAt: "2026-08-28T11:00:00.000Z", affectedScope: "social-connection-caught-up-threads" });
  });

  it("materializes the canonical node health from social state", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "social-health-")); roots.push(stateRoot);
    const directory = path.join(stateRoot, "social", "profile-operations"); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${operation().id}.json`), `${JSON.stringify(operation())}\n`, "utf8");
    await writeFile(path.join(directory, "malformed.json"), `${JSON.stringify({ schemaVersion: "social-profile-operation/1", accessToken: "excluded" })}\n`, "utf8");
    await materializeOperationsState({ repoRoot, stateRoot, now: new Date("2026-08-28T12:00:00.000Z") });
    const health = VentureOperationHealthSchema.parse(JSON.parse(await readFile(path.join(stateRoot, "operations", "health", "social-distribution", "current.json"), "utf8")) as unknown);
    const snapshot = OperationsSnapshotSchema.parse(JSON.parse(await readFile(path.join(stateRoot, "operations", "current.json"), "utf8")) as unknown);
    expect(health).toMatchObject({ nodeId: "social-distribution", lifecycleStage: "operating", state: "quiet", queue: { state: "clear", pending: 0 } });
    expect(health.freshness.lastKnownGoodRef).toContain("social-profile-operation-");
    expect(snapshot.nodes.find(({ nodeId }) => nodeId === "social-distribution")?.malformedRecords).toBe(1);
  });
});
