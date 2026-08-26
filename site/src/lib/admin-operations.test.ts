import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAdminOperations } from "./admin-operations";

const roots: string[] = [];
const HASH = "a".repeat(64);

async function root(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "boardless-operations-admin-"));
  roots.push(directory);
  return directory;
}

async function copyConfiguration(directory: string): Promise<void> {
  await mkdir(path.join(directory, "config"), { recursive: true });
  await Promise.all([
    "operations-nodes.json", "venture-capabilities.json", "venture-slos.json", "operations-recovery.json"
  ].map((name) => cp(path.resolve(process.cwd(), `../config/${name}`), path.join(directory, `config/${name}`))));
  await mkdir(path.join(directory, "site"), { recursive: true });
  await writeFile(path.join(directory, "site/vercel.json"), JSON.stringify({ git: { deploymentEnabled: false } }), "utf8");
}

async function writeJson(directory: string, relative: string, value: unknown): Promise<void> {
  const absolute = path.join(directory, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function health(reason = "Current bounded evidence is valid.") {
  return {
    schemaVersion: "venture-operation-health/1", nodeId: "caught-up", displayName: "Caught Up", policyVersion: "1.0.0",
    generatedAt: "2026-08-26T09:00:00.000Z", observedAt: "2026-08-26T09:00:00.000Z", lifecycleStage: "operating", state: "healthy", reason,
    lastAttemptedAt: "2026-08-26T09:00:00.000Z", lastValidAt: "2026-08-26T09:00:00.000Z", lastSuccessfulAt: "2026-08-26T09:00:00.000Z",
    lastNonEmptyAt: "2026-08-26T09:00:00.000Z", lastExternallyVerifiedAt: null, nextExpectedAt: "2026-08-27T09:00:00.000Z", dueWindow: "daily", latenessMinutes: 0,
    rollingOutcomes: { considered: 1, satisfying: 1, failed: 0, quiet: 0, held: 0, consecutiveFailures: 0 }, dependencyHealthRefs: [],
    queue: { state: "clear", pending: 0 }, autonomyEligible: true,
    holds: { budget: [], provider: [], source: [], credential: [], owner: [] }, freshness: { state: "fresh", ageMinutes: 0, lastKnownGoodRef: null },
    unavailableReasons: [], ownerAttentionRefs: [], latestRunReceiptRefs: ["state/operations/run-receipts/caught-up/example.json"], snapshotHash: HASH,
    privatePayload: "This field must never cross the boundary."
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("the Admin Operations boundary", () => {
  it("keeps missing canonical configuration explicitly unavailable", async () => {
    const snapshot = await readAdminOperations(await root());
    expect(snapshot).toMatchObject({ state: "unavailable", nodes: [], deployment: { scheduledByOperations: false } });
  });

  it("registers every configured node and keeps planned optional ventures held without fabricating health", async () => {
    const directory = await root();
    await copyConfiguration(directory);
    const snapshot = await readAdminOperations(directory);
    expect(snapshot.nodes).toHaveLength(25);
    expect(snapshot.nodes.find((node) => node.id === "webdev-signal")).toMatchObject({ lifecycleStage: "planned", health: "held", recordState: "missing" });
    expect(snapshot.nodes.find((node) => node.id === "contest-radar")).toMatchObject({ lifecycleStage: "planned", health: "held", recovery: { maximumAttempts: 0 } });
    expect(snapshot.capabilities.edges.length).toBeGreaterThan(0);
    expect(snapshot.deployment).toMatchObject({ gitDeploymentEnabled: false, scheduledByOperations: false });
  });

  it("projects only bounded fields and redacts credential-shaped text", async () => {
    const directory = await root();
    await copyConfiguration(directory);
    await writeJson(directory, "state/operations/health/caught-up/current.json", health("Provider token=super-secret-value is invalid."));
    const snapshot = await readAdminOperations(directory);
    const serialized = JSON.stringify(snapshot);
    expect(snapshot.nodes.find((node) => node.id === "caught-up")).toMatchObject({ health: "healthy", reason: "Provider [redacted credential] is invalid." });
    expect(serialized).not.toContain("super-secret-value");
    expect(serialized).not.toContain("privatePayload");
    expect(serialized).not.toContain("This field must never cross");
  });

  it("isolates a malformed node health record while preserving unaffected nodes", async () => {
    const directory = await root();
    await copyConfiguration(directory);
    await writeJson(directory, "state/operations/health/caught-up/current.json", { schemaVersion: "wrong", manuscript: "PRIVATE_RECORD_SENTINEL" });
    const snapshot = await readAdminOperations(directory);
    expect(snapshot).toMatchObject({ state: "partial", unreadableRecords: 1 });
    expect(snapshot.nodes.find((node) => node.id === "caught-up")).toMatchObject({ health: "unavailable", recordState: "malformed" });
    expect(snapshot.nodes.find((node) => node.id === "webdev-signal")?.health).toBe("held");
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_RECORD_SENTINEL");
  });

  it("drops a health record whose nested queue or hold evidence is malformed", async () => {
    const directory = await root();
    await copyConfiguration(directory);
    await writeJson(directory, "state/operations/health/caught-up/current.json", {
      ...health(),
      queue: { state: "clear", pending: "zero" },
      holds: { budget: [], provider: [], source: [], credential: [], owner: "none" }
    });
    const snapshot = await readAdminOperations(directory);
    expect(snapshot.nodes.find((node) => node.id === "caught-up")).toMatchObject({ health: "unavailable", recordState: "malformed", holds: null });
    expect(snapshot.unreadableRecords).toBe(1);
  });
});
