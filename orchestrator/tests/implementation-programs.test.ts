import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ImplementationManifestRegistrySchema,
  type ImplementationGitHubEvidence,
  type ImplementationManifestRegistry,
  type ImplementationProbeResult
} from "../src/contracts/implementation-program.js";
import { deriveImplementationProgress } from "../src/programs/derive.js";
import {
  synchronizeGitHubEvidence,
  type GitHubEvidenceCache,
  type GitHubReadClient,
  type GitHubReadResponse
} from "../src/programs/github.js";
import { readImplementationManifestRegistry } from "../src/programs/manifests.js";
import { runImplementationProbes } from "../src/programs/probes.js";
import { implementationRefreshPending, persistImplementationProgress, readImplementationGitHubCache, readImplementationProgress } from "../src/programs/store.js";
import { programSyncConfigured } from "../src/programs/service.js";
import { repoRoot } from "../src/paths.js";

const now = new Date("2026-08-26T12:00:00.000Z");

function evidence(number: number, input: { state?: "open" | "closed"; pull?: "open" | "merged" | null; stale?: boolean } = {}): ImplementationGitHubEvidence {
  const pull = input.pull === null || input.pull === undefined ? [] : [{
    number: number + 1_000,
    url: `https://github.com/lukaskourilcz/quorum/pull/${number + 1_000}`,
    state: input.pull === "open" ? "open" as const : "closed" as const,
    merged: input.pull === "merged",
    headSha: "a".repeat(40),
    mergeCommitSha: input.pull === "merged" ? "b".repeat(40) : null,
    checksPassed: true,
    updatedAt: now.toISOString()
  }];
  return {
    issue: {
      number,
      url: `https://github.com/lukaskourilcz/quorum/issues/${number}`,
      state: input.state ?? "open",
      title: `Issue ${number}`,
      updatedAt: now.toISOString(),
      checklist: { completed: 0, total: 0 }
    },
    pullRequests: pull,
    baseBranchContainsMerge: input.pull === "merged",
    fetchedAt: now.toISOString(),
    stale: input.stale ?? false,
    errors: []
  };
}

function registry(): ImplementationManifestRegistry {
  const item = (number: number, options: { dependencies?: string[]; posture?: "mandatory" | "held-optional"; final?: boolean; probe?: boolean } = {}) => ({
    schemaVersion: "implementation-work-item/1" as const,
    id: `item-${number}`,
    primaryProgramId: "fixture-program",
    programRefs: ["fixture-program"],
    phaseId: options.final ? "release" : "core",
    issue: { number, url: `https://github.com/lukaskourilcz/quorum/issues/${number}`, title: `Issue ${number}`, summary: `Fixture issue ${number}.` },
    dependencyIds: options.dependencies ?? [],
    posture: options.posture ?? "mandatory",
    safeParallelGroup: null,
    protectedFileGroups: ["fixture-state"],
    expectedDeliverables: options.final ? ["release" as const] : ["runtime" as const],
    probes: options.probe ? [{ id: `probe-${number}`, kind: "test-path-exists" as const, path: `tests/${number}.test.ts`, expectedSchemaVersion: null, ownerTaskKey: null, description: "Fixture verification." }] : [],
    ownerOnlySetupClasses: [],
    completionPolicy: { requiresIssueClosed: true, requiresMergedPullRequest: true, requiredProbeIds: options.probe ? [`probe-${number}`] : [] },
    weight: 1,
    finalGate: options.final ?? false,
    sharedWorkItemRef: null,
    supersededBy: null
  });
  return ImplementationManifestRegistrySchema.parse({
    schemaVersion: "implementation-manifest-registry/1",
    manifestVersion: "1.0.0",
    effectiveDate: "2026-08-26",
    programs: [{
      schemaVersion: "implementation-program/1",
      id: "fixture-program",
      name: "Fixture program",
      description: "A fixture implementation program.",
      parentIssue: { number: 900, url: "https://github.com/lukaskourilcz/quorum/issues/900" },
      owner: "BoardlessAI",
      visibility: "internal",
      repository: { owner: "lukaskourilcz", name: "quorum", baseBranch: "main" },
      phases: [
        { id: "core", name: "Core", workItemIds: ["item-1", "item-2"] },
        { id: "release", name: "Release", workItemIds: ["item-3"] }
      ],
      prerequisiteIssueNumbers: [],
      safeParallelGroups: [],
      protectedFileCollisionGroups: [{ id: "fixture-state", paths: ["state/programs/fixture"] }],
      acceptanceProbeIds: ["probe-1", "probe-3"],
      ownerActionProbeIds: [],
      finalReleaseItemId: "item-3",
      archived: false,
      supersededBy: null,
      manifestVersion: "1.0.0",
      effectiveDate: "2026-08-26"
    }],
    workItems: [
      item(1, { probe: true }),
      item(2, { dependencies: ["item-1"], posture: "held-optional" }),
      item(3, { dependencies: ["item-1"], final: true, probe: true })
    ]
  });
}

function deriveFixture() {
  const manifests = registry();
  const githubEvidence = new Map<string, ImplementationGitHubEvidence>([
    ["item-1", evidence(1, { state: "closed", pull: "merged" })],
    ["item-2", evidence(2)],
    ["item-3", evidence(3, { state: "closed", pull: "merged" })]
  ]);
  const probeResults = new Map<string, ImplementationProbeResult[]>([
    ["item-1", [{ probeId: "probe-1", status: "pass", evidenceRef: "tests/1.test.ts", detail: "Passed." }]],
    ["item-2", []],
    ["item-3", [{ probeId: "probe-3", status: "fail", evidenceRef: "tests/3.test.ts", detail: "Missing." }]]
  ]);
  return deriveImplementationProgress({
    registry: manifests,
    githubEvidence,
    probeResults,
    generatedAt: now,
    github: { cacheStatus: "fresh", rateRemaining: 4_900, rateResetAt: null, failedItems: 0 },
    boundedErrors: [],
    lastSuccessfulSyncAt: now.toISOString()
  });
}

class FixtureGitHub implements GitHubReadClient {
  constructor(private readonly failIssue: number | null = null) {}
  async request(requestPath: string, etag?: string | null): Promise<GitHubReadResponse> {
    if (this.failIssue && requestPath.endsWith(`/issues/${this.failIssue}`)) throw new Error("fixture rate limit");
    if (etag) return { status: 304, etag, rateRemaining: 4_999, rateResetAt: null, body: null };
    const timeline = /\/issues\/(\d+)\/timeline/u.exec(requestPath);
    if (timeline) {
      const issue = Number(timeline[1]);
      return { status: 200, etag: `timeline-${issue}`, rateRemaining: 4_999, rateResetAt: null, body: [{ event: "cross-referenced", source: { issue: { number: issue + 1_000, body: `Closes #${issue}`, pull_request: {} } } }] };
    }
    const issue = /\/issues\/(\d+)$/u.exec(requestPath);
    if (issue) {
      const number = Number(issue[1]);
      return { status: 200, etag: `issue-${number}`, rateRemaining: 4_999, rateResetAt: null, body: { number, html_url: `https://github.com/lukaskourilcz/quorum/issues/${number}`, state: "closed", title: `Issue ${number}`, updated_at: now.toISOString(), body: "- [x] fixture" } };
    }
    const pull = /\/pulls\/(\d+)$/u.exec(requestPath);
    if (pull) {
      const number = Number(pull[1]);
      return { status: 200, etag: `pull-${number}`, rateRemaining: 4_999, rateResetAt: null, body: { number, html_url: `https://github.com/lukaskourilcz/quorum/pull/${number}`, state: "closed", merged_at: now.toISOString(), merge_commit_sha: "b".repeat(40), updated_at: now.toISOString(), head: { sha: "a".repeat(40) }, base: { ref: "main" } } };
    }
    if (/\/commits\/[a-f0-9]{40}\/status$/u.test(requestPath)) {
      return { status: 200, etag: "status", rateRemaining: 4_999, rateResetAt: null, body: { state: "success" } };
    }
    throw new Error(`unexpected GitHub request ${requestPath}`);
  }
}

describe("implementation program manifests", () => {
  it("registers every current program and keeps shared work canonical", async () => {
    const manifests = await readImplementationManifestRegistry(repoRoot);
    expect(manifests.programs.map((program) => program.id)).toEqual([
      "personal-growth", "social-distribution", "contest-radar", "autonomous-operations", "deployment-cost", "webdev-signal"
    ]);
    expect(manifests.workItems).toHaveLength(66);
    for (const number of [420, 421, 430]) {
      const matches = manifests.workItems.filter((item) => item.issue.number === number);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.programRefs).toEqual(expect.arrayContaining(["contest-radar", "social-distribution"]));
    }
    expect(manifests.workItems.find((item) => item.issue.number === 447)?.posture).toBe("held-optional");
    expect(manifests.programs.find((program) => program.id === "webdev-signal")?.finalReleaseItemId).toBe("issue-446");
  });

  it("runs only bounded declared probes and reports missing evidence honestly", async () => {
    const manifests = registry();
    const results = await runImplementationProbes({ registry: manifests, repoRoot });
    expect(results.get("item-1")?.[0]).toMatchObject({ status: "fail", evidenceRef: "tests/1.test.ts" });
    expect(results.get("item-2")).toEqual([]);
  });
});

describe("read-only GitHub synchronization", () => {
  it("uses conservative closing references, conditional requests and sanitized evidence", async () => {
    const manifests = registry();
    const first = await synchronizeGitHubEvidence({ registry: manifests, client: new FixtureGitHub(), now, concurrency: 2 });
    expect(first.failedItems).toBe(0);
    expect(first.evidence.get("item-1")).toMatchObject({
      issue: { state: "closed", checklist: { completed: 1, total: 1 } },
      pullRequests: [{ merged: true, checksPassed: true }],
      baseBranchContainsMerge: true,
      stale: false
    });
    const second = await synchronizeGitHubEvidence({ registry: manifests, client: new FixtureGitHub(), cache: first.cache, now, concurrency: 2 });
    expect(second.cacheStatus).toBe("revalidated");
    expect(second.evidence.get("item-1")?.pullRequests[0]?.number).toBe(1_001);
  });

  it("isolates one failed issue and preserves its last valid evidence as stale", async () => {
    const manifests = registry();
    const first = await synchronizeGitHubEvidence({ registry: manifests, client: new FixtureGitHub(), now });
    const second = await synchronizeGitHubEvidence({ registry: manifests, client: new FixtureGitHub(2), cache: first.cache, now: new Date("2026-08-26T12:30:00.000Z") });
    expect(second.failedItems).toBe(1);
    expect(second.evidence.get("item-2")).toMatchObject({ issue: { number: 2 }, stale: true });
    expect(second.evidence.get("item-1")?.stale).toBe(false);
  });
});

describe("progress derivation and persistence", () => {
  it("keeps complete, optional-held and closed-with-missing-evidence distinct", () => {
    const snapshot = deriveFixture();
    expect(snapshot.items.map((item) => [item.itemId, item.state])).toEqual([
      ["item-1", "complete"],
      ["item-2", "held-optional"],
      ["item-3", "inconsistent"]
    ]);
    expect(snapshot.programs[0]).toMatchObject({ mandatoryCompleted: 1, mandatoryTotal: 2, weightedProgressPercent: 50, finalGateComplete: false });
    expect(snapshot.sharedItemIds).toEqual([]);
  });

  it("writes only meaningful transition events and retains a last-known-good snapshot", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-programs-"));
    const snapshot = deriveFixture();
    const cache: GitHubEvidenceCache = { schemaVersion: "implementation-github-cache/1", updatedAt: now.toISOString(), entries: {} };
    const first = await persistImplementationProgress({ stateRoot: root, snapshot, githubCache: cache });
    const second = await persistImplementationProgress({ stateRoot: root, snapshot, githubCache: cache });
    expect(first.eventCount).toBe(3);
    expect(second.eventCount).toBe(0);
    expect((await readFile(path.join(root, "programs/events/2026-08.jsonl"), "utf8")).trim().split("\n")).toHaveLength(3);
    expect((await readImplementationProgress(root))?.snapshotHash).toBe(snapshot.snapshotHash);
    await writeFile(path.join(root, "programs/current.json"), "{", "utf8");
    expect(await readImplementationProgress(root)).toMatchObject({ snapshotHash: snapshot.snapshotHash, sourceFreshness: "stale" });
    await writeFile(path.join(root, "programs/github-cache.json"), "{", "utf8");
    expect(await readImplementationGitHubCache(root)).toBeNull();
  });

  it("never enables live GitHub sync in CI", () => {
    expect(programSyncConfigured({ CI: "true", GITHUB_TOKEN: "secret", PROGRAMS_PUBLIC_GITHUB_SYNC: "1" })).toBe(false);
    expect(programSyncConfigured({ PROGRAMS_PUBLIC_GITHUB_SYNC: "1" })).toBe(true);
    expect(programSyncConfigured({})).toBe(false);
  });

  it("consumes only a valid Admin refresh newer than the canonical snapshot", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-program-refresh-"));
    const snapshot = deriveFixture();
    const cache: GitHubEvidenceCache = { schemaVersion: "implementation-github-cache/1", updatedAt: now.toISOString(), entries: {} };
    await persistImplementationProgress({ stateRoot: root, snapshot, githubCache: cache });
    const writeRequest = async (requestedAt: Date) => writeFile(path.join(root, "programs/refresh-request.json"), `${JSON.stringify({
      schemaVersion: "implementation-refresh-request/1",
      requestedAt: requestedAt.toISOString(),
      requestedBy: "owner",
      nextRequestAllowedAt: new Date(requestedAt.getTime() + 15 * 60 * 1_000).toISOString()
    })}\n`, "utf8");
    await writeRequest(new Date(now.getTime() + 1_000));
    expect(await implementationRefreshPending(root, new Date(now.getTime() + 1_000))).toBe(true);
    await writeRequest(now);
    expect(await implementationRefreshPending(root, new Date(now.getTime() + 1_000))).toBe(false);
    await writeFile(path.join(root, "programs/refresh-request.json"), "{", "utf8");
    expect(await implementationRefreshPending(root, now)).toBe(false);
  });
});
