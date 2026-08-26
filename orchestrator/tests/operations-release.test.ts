import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { VentureRunReceipt } from "../src/contracts/venture-operations.js";
import { planOperationsCapacity } from "../src/operations/capacity.js";
import { buildOperationsSnapshot } from "../src/operations/health.js";
import { readOperationRunReceipts } from "../src/operations/health-store.js";
import { migrateOperationsEvidence } from "../src/operations/migration.js";
import { loadOperationsNodeRegistry } from "../src/operations/nodes.js";
import { auditOperationsRelease } from "../src/operations/release-audit.js";
import { materializeOperationsState, operationsRefreshPending } from "../src/operations/service.js";
import { loadVentureSloRegistry } from "../src/operations/slo.js";
import { configRoot, repoRoot } from "../src/paths.js";
import { loadVentureCapabilityMap, resolveVentureCapabilityInMap } from "../src/ventures/capabilities.js";

const created: string[] = [];
const HASH = "a".repeat(64);

function receipt(overrides: Partial<VentureRunReceipt> = {}): VentureRunReceipt {
  return {
    schemaVersion: "venture-run-receipt/1", receiptId: "caught-up.release.2026-08-26", nodeId: "caught-up", phase: "edition", jobId: "caught-up-edition",
    trigger: "schedule", idempotencyKey: "caught-up:edition:2026-08-26", startedAt: "2026-08-26T08:00:00.000Z", endedAt: "2026-08-26T08:01:00.000Z",
    durationMs: 60_000, mode: "live", outcome: "success", domainReceiptRefs: ["state/release-proofs/caught-up/example.json"], inputHash: HASH, outputHash: HASH,
    providerCallRefs: [], costRefs: [], cacheReuse: { cacheHits: 0, cacheMisses: 0, artifactsReused: 0, duplicateRunsPrevented: 0 },
    changes: { changed: 1, unchanged: 0, malformed: 0 }, errors: [], ownerAttentionRefs: [], recoveryEligibility: "eligible", nextSafeAction: null,
    recordedAt: "2026-08-26T08:01:00.000Z", supersedesReceiptRef: null, ...overrides
  };
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Autonomous Operations final release gate", () => {
  it("passes every deterministic registry, authority, UI, migration and deployment check", async () => {
    const audit = await auditOperationsRelease(repoRoot);
    expect(audit.status, audit.checks.filter((candidate) => !candidate.passed).map((candidate) => `${candidate.id}: ${candidate.detail}`).join("\n")).toBe("pass");
    expect(audit.checks.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "registry-coverage", "domain-receipts-remain-canonical", "prague-dispatcher-sole-scheduler", "capacity-authority-boundary",
      "bounded-delegated-recovery", "venture-isolation", "implementation-progress-single-owner", "deployment-guard",
      "operations-admin-protected-private", "monetization-information-only", "optional-nodes-honestly-held",
      "single-checkpoint-materialization", "protected-bounded-refresh", "idempotent-migration-and-rollback"
    ]));
    expect(audit.auditHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("migrates exact evidence once, reports every outcome and preserves rollback input", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "operations-migration-"));
    created.push(stateRoot);
    await mkdir(path.join(stateRoot, "operations/migration-input"), { recursive: true });
    const source = path.join(stateRoot, "operations/migration-input/caught-up.json");
    await writeFile(source, JSON.stringify(receipt()), "utf8");
    const candidates = [receipt(), receipt({ receiptId: "fixture-one", mode: "fixture", recoveryEligibility: "not-eligible" }), { malformed: true }];
    const nodes = [
      { id: "caught-up", lifecycleStage: "operating" as const },
      { id: "contest-radar", lifecycleStage: "planned" as const },
      { id: "health-service", lifecycleStage: "operating" as const }
    ];
    const first = await migrateOperationsEvidence({ stateRoot, candidates, nodes, generatedAt: "2026-08-26T10:00:00.000Z" });
    expect(first.counts).toMatchObject({ migrated: 1, dropped: 1, malformed: 1, held: 1, unavailable: 1, unchanged: 0 });
    const second = await migrateOperationsEvidence({ stateRoot, candidates, nodes, generatedAt: "2026-08-26T10:01:00.000Z" });
    expect(second.counts).toMatchObject({ migrated: 0, unchanged: 1, dropped: 1, malformed: 1, held: 1, unavailable: 1 });
    expect(await readOperationRunReceipts(stateRoot, "caught-up")).toHaveLength(1);
    expect(JSON.parse(await readFile(source, "utf8"))).toMatchObject({ receiptId: "caught-up.release.2026-08-26" });
    expect(second.rollback).toEqual({ sourcePreserved: true, automaticDeletion: false, instructionsRef: "docs/AUTONOMOUS-OPERATIONS.md#migration-and-rollback" });
  });

  it("materializes every node through the existing checkpoint and consumes refresh requests idempotently", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "operations-materialize-"));
    created.push(stateRoot);
    const firstAt = new Date("2026-08-26T10:00:00.000Z");
    await writeFile(path.join(stateRoot, "owner-attention.json"), JSON.stringify({
      schemaVersion: "owner-attention/1",
      generatedAt: firstAt.toISOString(),
      approvals: [],
      manualTasks: [],
      operationalIncidents: []
    }), "utf8");
    await mkdir(path.join(stateRoot, "operations/recovery/caught-up"), { recursive: true });
    await writeFile(path.join(stateRoot, "operations/recovery/caught-up/2026-08.jsonl"), "x".repeat(256 * 1_024 + 1), "utf8");
    const first = await materializeOperationsState({ repoRoot, stateRoot, now: firstAt });
    const firstCurrent = await readFile(path.join(stateRoot, first.path), "utf8");
    const snapshot = JSON.parse(firstCurrent) as { nodes: Array<{ nodeId: string; health: string }> };
    expect(snapshot.nodes).toHaveLength(25);
    expect(snapshot.nodes.find(({ nodeId }) => nodeId === "contest-radar")?.health).toBe("held");
    expect(snapshot.nodes.find(({ nodeId }) => nodeId === "webdev-signal")?.health).toBe("held");
    expect(first.healthPaths).toHaveLength(25);
    expect(first.incidentPath).toBe("operations/incidents/current.json");
    expect(JSON.parse(await readFile(path.join(stateRoot, first.incidentPath!), "utf8"))).toMatchObject({
      activeIncidentRefs: [],
      statistics: { consideredAttempts: 0, costUsd: 0 },
      killSwitchActive: false
    });

    await materializeOperationsState({ repoRoot, stateRoot, now: firstAt });
    expect(await readFile(path.join(stateRoot, first.path), "utf8")).toBe(firstCurrent);

    const requestedAt = "2026-08-26T10:01:00.000Z";
    await writeFile(path.join(stateRoot, "operations/refresh-request.json"), JSON.stringify({
      schemaVersion: "operations-refresh-request/1",
      requestedAt,
      requestedBy: "owner",
      nextRequestAllowedAt: "2026-08-26T10:16:00.000Z"
    }), "utf8");
    await expect(operationsRefreshPending(stateRoot, new Date(requestedAt))).resolves.toBe(true);
    await materializeOperationsState({ repoRoot, stateRoot, now: new Date("2026-08-26T10:02:00.000Z") });
    await expect(operationsRefreshPending(stateRoot, new Date("2026-08-26T10:02:00.000Z"))).resolves.toBe(false);
  });

  it("keeps BOH/Tehdejší, Personal Growth, Kvórum, FightAIQ, GoVIRAL and Door Money isolated", async () => {
    const map = await loadVentureCapabilityMap(configRoot);
    const denied = (source: string, target: string, capability = "intelligence-read") => resolveVentureCapabilityInMap(map, { source, target, capability, schemaVersion: capability === "intelligence-read" ? "goviral-intelligence-packet/1" : "approved-publish-package/1" }).decision;
    expect(denied("booksofhistory", "tehdejsi-svet")).toBe("denied");
    expect(denied("tehdejsi-svet", "booksofhistory")).toBe("denied");
    expect(denied("kvorum", "personal-growth")).toBe("denied");
    expect(denied("kvorum", "caught-up")).toBe("denied");
    expect(denied("door-money", "fightaiq")).toBe("denied");
    expect(denied("personal-growth", "door-money")).toBe("denied");
    expect(resolveVentureCapabilityInMap(map, { source: "fightaiq", target: "mma-files", capability: "monetization", schemaVersion: "monetization/1" }).decision).toBe("denied");
    expect(resolveVentureCapabilityInMap(map, { source: "goviral", target: "booksofhistory", capability: "intelligence-read", schemaVersion: "goviral-intelligence-packet/1" }).decision).toBe("allowed");
    expect(resolveVentureCapabilityInMap(map, { source: "goviral", target: "booksofhistory", capability: "approved-publish-package", schemaVersion: "approved-publish-package/1" }).decision).toBe("denied");
  });

  it("isolates one adapter failure and cannot turn capacity into work or deployment", async () => {
    const [nodes, slos, capabilities] = await Promise.all([
      loadOperationsNodeRegistry(configRoot), loadVentureSloRegistry(configRoot), loadVentureCapabilityMap(configRoot)
    ]);
    const selected = nodes.nodes.filter((node) => ["booksofhistory", "tehdejsi-svet"].includes(node.id));
    const operations = await buildOperationsSnapshot({
      nodes: selected, slos: slos.policies, capabilityMap: capabilities, generatedAt: "2026-08-26T10:00:00.000Z",
      adapters: [
        { nodeId: "booksofhistory", observe: async () => { throw new Error("malformed private adapter"); } },
        { nodeId: "tehdejsi-svet", observe: async () => ({ receipts: [receipt({ nodeId: "tehdejsi-svet", receiptId: "tehdejsi.release.2026-08-26" })] }) }
      ]
    });
    expect(operations.snapshot.nodes.find((node) => node.nodeId === "booksofhistory")?.health).toBe("unavailable");
    expect(operations.snapshot.nodes.find((node) => node.nodeId === "tehdejsi-svet")?.health).toBe("healthy");
    expect(operations.snapshot.malformedAdapterCount).toBe(1);

    const capacity = planOperationsCapacity({
      period: "2026-08-26", generatedAt: "2026-08-26T10:00:00.000Z", jobs: [], healthByNode: new Map(),
      budget: { maximumUsd: 1, spentUsd: 0 }, providerHeadroom: {}, activeLeases: [],
      deployment: { guardActive: true, releaseReady: true, evidenceRef: "site/vercel.json" }
    });
    expect(capacity.jobs).toEqual([]);
    expect(capacity.selectedExecutionOrder).toEqual([]);
    expect(capacity.budget).toMatchObject({ maximumUsd: 1, reservedUsd: 0, headroomUsd: 1 });
    expect(capacity.deployment.scheduled).toBe(false);
  });

  it("keeps Contest Radar and unfinished WebDev Signal as inactive metadata only", async () => {
    const [nodes, slos] = await Promise.all([loadOperationsNodeRegistry(configRoot), loadVentureSloRegistry(configRoot)]);
    for (const nodeId of ["contest-radar", "webdev-signal"]) {
      expect(nodes.nodes.filter((node) => node.id === nodeId)).toHaveLength(1);
      expect(slos.policies.find((policy) => policy.nodeId === nodeId)).toMatchObject({ lifecycleStage: "planned", cadence: { kind: "held" } });
    }
    await expect(readFile(path.join(repoRoot, "site/src/app/admin/ventures/contest-radar/page.tsx"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("materializes one bounded snapshot and consumes only a newer valid refresh request", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "operations-service-"));
    created.push(stateRoot);
    const first = await materializeOperationsState({ repoRoot, stateRoot, now: new Date("2026-08-26T09:00:00.000Z") });
    expect(first.path).toBe("operations/current.json");
    expect(first.healthPaths).toHaveLength(25);
    const snapshot = JSON.parse(await readFile(path.join(stateRoot, first.path), "utf8")) as { nodes: Array<{ nodeId: string; health: string }>; snapshotHash: string };
    expect(snapshot.nodes.find((node) => node.nodeId === "contest-radar")?.health).toBe("held");
    expect(snapshot.nodes.find((node) => node.nodeId === "caught-up")?.health).toBe("unavailable");
    expect(JSON.stringify(snapshot)).not.toContain("articleBody");
    await writeFile(path.join(stateRoot, "operations/refresh-request.json"), JSON.stringify({
      schemaVersion: "operations-refresh-request/1", requestedAt: "2026-08-26T09:05:00.000Z", requestedBy: "owner", nextRequestAllowedAt: "2026-08-26T09:20:00.000Z"
    }), "utf8");
    expect(await operationsRefreshPending(stateRoot, new Date("2026-08-26T09:06:00.000Z"))).toBe(true);
    await materializeOperationsState({ repoRoot, stateRoot, now: new Date("2026-08-26T09:06:00.000Z") });
    expect(await operationsRefreshPending(stateRoot, new Date("2026-08-26T09:07:00.000Z"))).toBe(false);
  });
});
