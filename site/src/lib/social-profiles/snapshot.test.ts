import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseSocialProfileEvent, resolveSocialProfileSection } from "./model";
import { createAdminSocialProfileSimulations } from "./simulation-fixtures";
import { readAdminSocialProfiles } from "./snapshot";

const repositoryRoot = path.resolve(process.cwd(), "..");
const temporaryRoots: string[] = [];

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "social-profiles-test-"));
  temporaryRoots.push(root);
  for (const relative of [
    "config/social-publisher-registry.json",
    "config/social-amplification-policy.json",
    "config/venture-capabilities.json",
    "state/social/activation.json",
    "state/social/amplifiers/portfolio.json"
  ]) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await cp(path.join(repositoryRoot, relative), path.join(root, relative));
  }
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("Social Profiles server snapshot", () => {
  it("keeps real groups, capability truth and missing metrics honest", async () => {
    const snapshot = await readAdminSocialProfiles(repositoryRoot, {
      environment: { NODE_ENV: "test", SOCIAL_KILL_SWITCH: "true", CAUGHT_UP_THREADS_ACCESS_TOKEN: "must-not-cross" },
      now: new Date("2026-08-27T12:00:00.000Z")
    });

    expect(snapshot.ventureProfiles).toHaveLength(6);
    expect(snapshot.amplificationProfiles).toEqual([]);
    expect(snapshot.simulations).toEqual([]);
    expect(snapshot.campaigns).toEqual([]);
    expect(snapshot.campaignDecisions).toEqual([]);
    expect(snapshot.dropped).toEqual({ profiles: 0, connections: 0, amplifierProposals: 0, events: 0, campaigns: 0, campaignDecisions: 0, campaignEvents: 0, pauseRecords: 0 });
    expect(snapshot.posture).toMatchObject({ globalKillSwitch: "engaged", liveAuthorityGranted: false });
    expect(snapshot.ventureProfiles.find(({ profile }) => profile.ventureRef === "door-money")).toMatchObject({
      lifecycle: "proposed",
      capability: { decision: "allowed", governingReference: "GitHub #424" },
      connections: [],
      operationalMetrics: null
    });
    expect(snapshot.ventureProfiles.find(({ profile }) => profile.ventureRef === "booksofhistory")?.capability.decision).toBe("denied");
    expect(snapshot.ventureProfiles.find(({ profile }) => profile.ventureRef === "tehdejsi-svet")?.capability.decision).toBe("denied");
    expect(snapshot.ventureProfiles.some(({ profile }) => ["personal-growth", "kvorum"].includes(profile.ventureRef ?? ""))).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("must-not-cross");
  });

  it("loads the shared fifty-profile matrix only for an explicit non-production request", async () => {
    const shared = createAdminSocialProfileSimulations();
    const preview = await readAdminSocialProfiles(repositoryRoot, { includeSimulations: true, environment: { NODE_ENV: "test" } });
    const production = await readAdminSocialProfiles(repositoryRoot, { includeSimulations: true, environment: { NODE_ENV: "production" } });

    expect(shared).toHaveLength(50);
    expect(preview.simulations).toHaveLength(50);
    expect(preview.simulationsIncluded).toBe(true);
    expect(preview.ventureProfiles).toHaveLength(6);
    expect(preview.simulations[9]?.profile.displayLabel).toContain("extended multilingual");
    expect(preview.simulations.every(({ profile }) => profile.kind === "simulation" && !profile.liveEligible)).toBe(true);
    expect(production.simulations).toEqual([]);
    expect(production.simulationsIncluded).toBe(false);
  });

  it("drops one malformed record and reduces append-only lifecycle evidence", async () => {
    const root = await fixtureRoot();
    const registryPath = path.join(root, "config/social-publisher-registry.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as { profiles: unknown[]; connections: unknown[] };
    registry.profiles.push({ schemaVersion: "social-profile/1", id: "broken" });
    registry.connections.push({ schemaVersion: "social-connection/1", id: "broken" });
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    const event = {
      schemaVersion: "social-profile-event/1",
      eventId: "social-profile-event-door-money-pause-001",
      at: "2026-08-27T10:00:00.000Z",
      profileId: "social-profile-door-money",
      connectionId: null,
      action: "paused",
      actor: "owner",
      provenanceRef: "admin:social-profiles",
      reason: "Pause the internal proposal while its setup decision is reviewed.",
      supersededEventRef: null
    };
    await mkdir(path.join(root, "state/social/profile-events"), { recursive: true });
    await writeFile(path.join(root, "state/social/profile-events/event.json"), `${JSON.stringify(event, null, 2)}\n`);

    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test" } });
    expect(snapshot.dropped.profiles).toBe(1);
    expect(snapshot.dropped.connections).toBe(1);
    expect(snapshot.activity).toHaveLength(1);
    expect(snapshot.ventureProfiles.find(({ profile }) => profile.id === event.profileId)?.lifecycle).toBe("paused");
    expect(parseSocialProfileEvent({ ...event, action: "corrected" })).toBeNull();
  });

  it("projects validated campaign evidence without inventing results or Contest Radar records", async () => {
    const root = await fixtureRoot();
    const contracts = JSON.parse(await readFile(path.join(repositoryRoot, "contracts/fixtures/social-distribution-contracts.valid.json"), "utf8")) as { campaign: unknown };
    await mkdir(path.join(root, "state/social/campaigns"), { recursive: true });
    await writeFile(path.join(root, "state/social/campaigns/campaign.json"), `${JSON.stringify(contracts.campaign, null, 2)}\n`);
    await writeFile(path.join(root, "state/social/campaigns/skip.decision.json"), `${JSON.stringify({ schemaVersion: "social-campaign-generation-decision/1", id: "social-campaign-decision-aaaaaaaaaaaaaaaaaaaa", releaseId: "irrelevant-release", sourceVentureId: "mma-files", idempotencyKey: "a".repeat(64), decision: "skip", reasons: ["missing-stale-held-or-denied-capability"], campaignId: null, evidenceRefs: ["fixture:release"], decidedAt: "2026-08-27T00:00:00.000Z", authorityGranted: false, publishingAuthorized: false }, null, 2)}\n`);

    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test" } });
    expect(snapshot.campaigns).toHaveLength(1);
    expect(snapshot.campaigns[0]).toMatchObject({ campaign: { releaseId: "door-money-release-001", selectionOutcome: "primary-only", measurementAvailability: "manual-only" }, operationalResults: null, appliedEvents: 0, rejectedEvents: 0 });
    expect(snapshot.campaigns[0]!.targetApprovalHashes["door-money-primary"]).toMatch(/^[a-f0-9]{64}$/u);
    expect(snapshot.campaignDecisions).toMatchObject([{ sourceVentureId: "mma-files", decision: "skip" }]);
    expect(JSON.stringify(snapshot)).not.toContain("contest-radar");
  });

  it("falls unknown section bookmarks back to Venture Profiles", () => {
    expect(resolveSocialProfileSection("campaigns")).toBe("campaigns");
    expect(resolveSocialProfileSection("activity-setup")).toBe("activity-setup");
    expect(resolveSocialProfileSection("future-module")).toBe("venture-profiles");
  });
});
