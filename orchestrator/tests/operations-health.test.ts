import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { VentureRunReceipt } from "../src/contracts/venture-operations.js";
import { configRoot } from "../src/paths.js";
import { loadVentureCapabilityMap } from "../src/ventures/capabilities.js";
import { appendOperationRunReceipt, readOperationRunReceipts, writeCurrentOperationHealth } from "../src/operations/health-store.js";
import { buildOperationsSnapshot, resolveOperationHealth } from "../src/operations/health.js";
import { assertOperationsNodeCoverage, loadOperationsNodeRegistry } from "../src/operations/nodes.js";
import { loadVentureSloRegistry } from "../src/operations/slo.js";

const HASH = "a".repeat(64);

function receipt(overrides: Partial<VentureRunReceipt> = {}): VentureRunReceipt {
  return {
    schemaVersion: "venture-run-receipt/1",
    receiptId: "caught-up.daily.2026-08-26",
    nodeId: "caught-up",
    phase: "edition",
    jobId: "daily-edition",
    trigger: "schedule",
    idempotencyKey: "caught-up:2026-08-26",
    startedAt: "2026-08-26T08:00:00.000Z",
    endedAt: "2026-08-26T08:01:00.000Z",
    durationMs: 60_000,
    mode: "live",
    outcome: "success",
    domainReceiptRefs: ["state/release-proofs/caught-up/example.json"],
    inputHash: HASH,
    outputHash: HASH,
    providerCallRefs: [],
    costRefs: [],
    cacheReuse: { cacheHits: 0, cacheMisses: 0, artifactsReused: 0, duplicateRunsPrevented: 0 },
    changes: { changed: 1, unchanged: 0, malformed: 0 },
    errors: [],
    ownerAttentionRefs: [],
    recoveryEligibility: "eligible",
    nextSafeAction: null,
    recordedAt: "2026-08-26T08:01:00.000Z",
    supersedesReceiptRef: null,
    ...overrides
  };
}

describe("canonical operations health", () => {
  it("registers exactly every capability node with an honest per-node SLO", async () => {
    const [registry, capabilities, slos] = await Promise.all([
      loadOperationsNodeRegistry(configRoot),
      loadVentureCapabilityMap(configRoot),
      loadVentureSloRegistry(configRoot)
    ]);
    assertOperationsNodeCoverage({ registry, capabilityMap: capabilities, sloRegistry: slos });
    expect(slos.policies).toHaveLength(capabilities.nodes.length);
    expect(slos.policies.map((policy) => policy.nodeId).sort())
      .toEqual(capabilities.nodes.map((node) => node.id).sort());
    expect(slos.policies.find((policy) => policy.nodeId === "goviral")?.satisfyingOutcomes)
      .toContain("no-work");
    expect(slos.policies.find((policy) => policy.nodeId === "kvorum")?.satisfyingOutcomes)
      .toContain("held");
    expect(slos.policies.find((policy) => policy.nodeId === "design-lab")?.cadence.kind)
      .toBe("manual");
    expect(slos.policies.find((policy) => policy.nodeId === "webdev-signal")?.lifecycleStage)
      .toBe("planned");
    expect(slos.policies.every((policy) => policy.exclusions.includes("fixture"))).toBe(true);
  });

  it("keeps quiet, held, stale, degraded, failing and unavailable distinct", async () => {
    const [registry, capabilities, slos] = await Promise.all([
      loadOperationsNodeRegistry(configRoot),
      loadVentureCapabilityMap(configRoot),
      loadVentureSloRegistry(configRoot)
    ]);
    const node = registry.nodes.find((candidate) => candidate.id === "caught-up")!;
    const slo = slos.policies.find((candidate) => candidate.nodeId === node.id)!;
    const health = (receipts: VentureRunReceipt[], generatedAt = "2026-08-26T09:00:00.000Z") =>
      resolveOperationHealth({ node, slo, capabilityMap: capabilities, observation: { receipts }, generatedAt }).health;

    expect(health([receipt({ outcome: "quiet" })]).state).toBe("quiet");
    expect(health([receipt({ outcome: "held" })]).state).toBe("held");
    expect(health([receipt({ outcome: "partial" })]).state).toBe("degraded");
    expect(health([], "2026-08-26T09:00:00.000Z").state).toBe("unavailable");
    expect(health([receipt()], "2026-08-29T09:00:00.000Z").state).toBe("stale");
    expect(health([
      receipt({ receiptId: "failure.1", startedAt: "2026-08-26T07:00:00.000Z", endedAt: "2026-08-26T07:01:00.000Z", outcome: "failed" }),
      receipt({ receiptId: "failure.2", startedAt: "2026-08-26T08:00:00.000Z", endedAt: "2026-08-26T08:01:00.000Z", outcome: "failed" }),
      receipt({ receiptId: "failure.3", startedAt: "2026-08-26T09:00:00.000Z", endedAt: "2026-08-26T09:01:00.000Z", outcome: "failed" })
    ], "2026-08-26T09:05:00.000Z").state).toBe("failing");
  });

  it("excludes fixtures, isolates malformed receipts and refuses undeclared dependency health", async () => {
    const [registry, capabilities, slos] = await Promise.all([
      loadOperationsNodeRegistry(configRoot),
      loadVentureCapabilityMap(configRoot),
      loadVentureSloRegistry(configRoot)
    ]);
    const node = registry.nodes.find((candidate) => candidate.id === "personal-growth")!;
    const slo = slos.policies.find((candidate) => candidate.nodeId === node.id)!;
    const result = resolveOperationHealth({
      node,
      slo,
      capabilityMap: capabilities,
      generatedAt: "2026-08-26T09:00:00.000Z",
      observation: {
        receipts: [receipt({ nodeId: "personal-growth", mode: "fixture", recoveryEligibility: "not-eligible" }), { unsafe: "record" }],
        dependencies: [{ nodeId: "kvorum", evidenceRef: "state/operations/health/kvorum/current.json", state: "healthy" }]
      }
    });
    expect(result.health.state).toBe("unavailable");
    expect(result.health.rollingOutcomes.considered).toBe(0);
    expect(result.malformedReceiptCount).toBe(1);
    expect(result.health.dependencyHealthRefs).toEqual([]);
    expect(result.health.unavailableReasons).toContain("Dependency health unavailable or denied for kvorum.");
  });

  it("degrades only a declared consumer when an allowed dependency is unhealthy", async () => {
    const [registry, capabilities, slos] = await Promise.all([
      loadOperationsNodeRegistry(configRoot),
      loadVentureCapabilityMap(configRoot),
      loadVentureSloRegistry(configRoot)
    ]);
    const node = registry.nodes.find((candidate) => candidate.id === "mma-files")!;
    const slo = slos.policies.find((candidate) => candidate.nodeId === node.id)!;
    const result = resolveOperationHealth({
      node,
      slo,
      capabilityMap: capabilities,
      generatedAt: "2026-08-26T09:00:00.000Z",
      observation: {
        receipts: [receipt({ nodeId: "mma-files" })],
        dependencies: [{
          nodeId: "fightaiq",
          evidenceRef: "state/operations/health/fightaiq/current.json",
          state: "failing"
        }]
      }
    });
    expect(result.health.state).toBe("degraded");
    expect(result.health.dependencyHealthRefs).toEqual(["state/operations/health/fightaiq/current.json"]);
  });

  it("isolates a broken adapter and produces a bounded deterministic snapshot", async () => {
    const [registry, capabilities, slos] = await Promise.all([
      loadOperationsNodeRegistry(configRoot),
      loadVentureCapabilityMap(configRoot),
      loadVentureSloRegistry(configRoot)
    ]);
    const nodes = registry.nodes.filter((node) => ["caught-up", "goviral"].includes(node.id));
    const first = await buildOperationsSnapshot({
      nodes,
      slos: slos.policies,
      capabilityMap: capabilities,
      generatedAt: "2026-08-26T09:00:00.000Z",
      adapters: [
        { nodeId: "caught-up", observe: async () => ({ receipts: [receipt()] }) },
        { nodeId: "goviral", observe: async () => { throw new Error("malformed domain record"); } }
      ]
    });
    const second = await buildOperationsSnapshot({
      nodes: [...nodes].reverse(),
      slos: slos.policies,
      capabilityMap: capabilities,
      generatedAt: "2026-08-26T09:00:00.000Z",
      adapters: [
        { nodeId: "goviral", observe: async () => { throw new Error("malformed domain record"); } },
        { nodeId: "caught-up", observe: async () => ({ receipts: [receipt()] }) }
      ]
    });
    expect(first.snapshot.snapshotHash).toBe(second.snapshot.snapshotHash);
    expect(first.snapshot.malformedAdapterCount).toBe(1);
    expect(first.snapshot.nodes.find((node) => node.nodeId === "caught-up")?.health).toBe("healthy");
    expect(first.snapshot.nodes.find((node) => node.nodeId === "goviral")?.health).toBe("unavailable");
  });

  it("persists append-only common receipts and bounded current health", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "boardless-operations-health-"));
    const stored = await appendOperationRunReceipt(temp, receipt());
    expect(await readOperationRunReceipts(temp, "caught-up")).toEqual([stored]);

    const [registry, capabilities, slos] = await Promise.all([
      loadOperationsNodeRegistry(configRoot),
      loadVentureCapabilityMap(configRoot),
      loadVentureSloRegistry(configRoot)
    ]);
    const slo = slos.policies
      .find((policy) => policy.nodeId === "caught-up")!;
    const node = registry.nodes.find((candidate) => candidate.id === "caught-up")!;
    const health = resolveOperationHealth({
      node,
      slo,
      capabilityMap: capabilities,
      observation: { receipts: [stored] },
      generatedAt: "2026-08-26T09:00:00.000Z"
    }).health;
    await writeCurrentOperationHealth(temp, health);
    const current = JSON.parse(await readFile(path.join(temp, "operations/health/caught-up/current.json"), "utf8")) as unknown;
    expect(current).toEqual(health);
  });
});
