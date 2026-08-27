import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAdminPersonalGrowth } from "./admin-personal-growth";

async function writeJson(root: string, relative: string, value: unknown): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "admin-personal-growth-"));
  const repositoryRoot = path.resolve(process.cwd(), "..");
  for (const file of ["personal-growth.json", "personal-growth-planner.json", "personal-growth-content.json"]) {
    await writeJson(root, `config/${file}`, JSON.parse(await readFile(path.join(repositoryRoot, "config", file), "utf8")) as unknown);
  }
  await writeJson(root, "state/ventures/personal-growth/history.json", {
    schemaVersion: "personal-growth-history/1",
    events: [{
      schemaVersion: "personal-growth-history-event/1",
      eventId: "pg-event-aaaaaaaaaaaaaaaa",
      lane: "bbarak",
      occurrenceDate: "2026-08-27",
      action: "rescheduled",
      recordedAt: "2026-08-26T20:00:00.000Z",
      rescheduledTo: "2026-08-28",
      finalUrl: null,
      articleUrl: null,
      collaborationUrl: null
    }]
  });
  await writeJson(root, "state/ventures/personal-growth/briefs/2026-08-27.json", {
    schemaVersion: "personal-growth-daily-brief/1",
    targetPragueDate: "2026-08-27",
    room: { kind: "pg-desk", result: "planned" },
    authority: { ownerWritesAllContent: true, publishingAuthorized: false },
    warnings: ["collision"]
  });
  const suggestion = {
    suggestionId: "pg-thread-1111111111111111",
    text: "Dnes jen jedna skutečná poznámka z rozepsaného dne.",
    language: "cs",
    characterCount: 51,
    topicTag: null,
    sourceLane: "current-life-note",
    personalPillar: "life-lifestyle",
    provenanceRefs: ["state/ventures/personal-growth/briefs/2026-08-27.json"],
    selectionReason: "The owner supplied a current-life note.",
    conversationPurpose: "Share one grounded observation.",
    goviralSignalId: null,
    recentSimilarity: 0.1,
    similarityVerdict: "pass",
    activeExperimentId: null,
    leakAudit: { status: "pass", safeToPersistPublicly: true }
  };
  await writeJson(root, "state/ventures/personal-growth/recommendations/threads/2026-08-27.json", {
    schemaVersion: "personal-growth-threads-recommendation/1",
    recommendationDate: "2026-08-27",
    decision: "RECOMMEND",
    noPostReason: null,
    primary: suggestion,
    alternatives: [],
    conversationStatus: "unavailable",
    conversationOpportunities: [],
    publishingAuthorized: false,
    repliesAuthorized: false
  });
  await writeJson(root, "state/ventures/personal-growth/recommendations/instagram/2026-08-27.json", {
    schemaVersion: "personal-growth-instagram-recommendation/1",
    recommendationDate: "2026-08-27",
    actionType: "personal-photo",
    format: "feed-photo",
    pillar: "life-lifestyle",
    goal: "Share one owner-confirmed ordinary moment.",
    dueWindow: "2026-08-27",
    ownerSourceRefs: ["state/ventures/personal-growth/briefs/2026-08-27.json"],
    collaborator: null,
    assetChecklist: ["Owner-selected photograph"],
    distributionChecklist: ["Owner reviews before manual posting"],
    storiesSupport: [],
    projectedPersonalRatio: 0.9,
    goviralSignalId: null,
    activeExperimentId: null,
    reason: "The timeline has room for a personal post.",
    noPostReason: null,
    reel: null,
    manualVentureReferenceId: null,
    ownerWritesArtifact: true,
    publishingAuthorized: false
  });
  await writeJson(root, "state/ventures/personal-growth/intelligence/current.json", {
    schemaVersion: "personal-growth-goviral-packet/1",
    packetId: "pg-goviral-2026-08-24",
    generatedAt: "2026-08-24T20:00:00.000Z",
    expiresAt: "2026-08-31T20:00:00.000Z",
    sourceRegistryRef: "config/goviral-sources.json",
    profileRef: "state/ventures/goviral/profile.md",
    sourceHealth: "healthy",
    quota: "available",
    reusedWeeklyBrief: true,
    providerRerun: false,
    opportunities: [{
      opportunityId: "pg-gv-2222222222222222",
      disposition: "use",
      expiresAt: "2026-08-30T20:00:00.000Z",
      evidenceRefs: ["state/ventures/goviral/briefs/2026-08-24.json"],
      sourceRefs: ["config/goviral-sources.json"],
      relevance: 0.8,
      pillar: "personal",
      format: "reel",
      fit: "strong",
      risk: "low",
      overload: "clear",
      status: "accepted",
      outcome: "unused"
    }]
  });
  await writeJson(root, "state/ventures/personal-growth/manual-references/rejected.json", {
    schemaVersion: "owner-manual-reference/1",
    referenceId: "pg-manual-ref-3333333333333333",
    sourceProject: "kvorum",
    publicItemId: "forbidden",
    publicUrl: "https://example.test/forbidden",
    ownerAuthored: true,
    personalConnection: null,
    ownerCommentaryNote: "Invented fixture note.",
    publicationVerifiedByOwner: true,
    ownerManuallySupplied: true,
    personalItemsInRollingWindow: 9,
    ventureItemsInRollingWindow: 1,
    requestedAction: "WATCH",
    recordedAt: "2026-08-26T20:00:00.000Z",
    expiresAt: "2026-08-30T20:00:00.000Z",
    ownerProvenanceRef: "owner-fixture"
  });
  return root;
}

describe("Personal Growth Admin snapshot", () => {
  it("projects the six core views through one private boundary and counts forbidden input", async () => {
    const snapshot = await readAdminPersonalGrowth(await fixtureRoot(), new Date("2026-08-27T08:00:00.000Z"));
    expect(snapshot.today.nextAction).toMatchObject({ provenance: "owner" });
    expect(snapshot.timeline.anchors).toHaveLength(2);
    expect(snapshot.timeline.occurrences.find(({ lane }) => lane === "bbarak")).toMatchObject({
      originalDate: "2026-08-27",
      scheduledDate: "2026-08-28",
      status: "rescheduled"
    });
    expect(snapshot.timeline.rhythmOpportunities.some(({ kind }) => kind === "reel")).toBe(true);
    expect(snapshot.threads.primary?.text).toContain("skutečná poznámka");
    expect(snapshot.instagram.projectedPersonalRatio).toBe(0.9);
    expect(snapshot.trends.opportunities).toHaveLength(1);
    expect(snapshot.manualReferences).toEqual([]);
    expect(snapshot.unreadable.manualReferences).toBe(1);
    expect(JSON.stringify(snapshot).toLowerCase()).not.toContain("forbidden");
    expect(JSON.stringify(snapshot).toLowerCase()).not.toContain("manuscript");
  });

  it("keeps first-run missing inputs honest instead of creating example data", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "admin-personal-growth-empty-"));
    const snapshot = await readAdminPersonalGrowth(root, new Date("2026-08-27T08:00:00.000Z"));
    expect(snapshot.threads.state).toBe("missing");
    expect(snapshot.threads.primary).toBeNull();
    expect(snapshot.trends.state).toBe("missing");
    expect(snapshot.timeline.occurrences).toEqual([]);
    expect(snapshot.overview.monthlySpendUsd).toBe(0);
  });
});
