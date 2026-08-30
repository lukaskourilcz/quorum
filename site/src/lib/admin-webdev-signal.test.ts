import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readAdminWebDevSignal } from "./admin-webdev-signal";

afterEach(() => vi.unstubAllEnvs());

async function repository(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "webdev-admin-"));
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  await mkdir(path.join(root, "state", "decisions"), { recursive: true });
  await writeFile(
    path.join(root, "state/decisions/2026-08-28-webdev-signal-founding.md"),
    "# WebDev Signal founding\n\nStatus: countersigned\n\nHeld by this decision: live behavior held.\n",
    "utf8"
  );
  await mkdir(path.join(root, "config"), { recursive: true });
  await writeFile(path.join(root, "config/social-publisher-registry.json"), JSON.stringify({
    profiles: [
      { id: "social-profile-webdev-signal-cs", displayLabel: "WebDev Signal CZ", ventureRef: "webdev-signal", languages: ["cs"], lifecycle: "proposed", liveEligible: false },
      { id: "social-profile-caught-up", displayLabel: "Caught Up", ventureRef: "caught-up", languages: ["cs"], lifecycle: "proposed", liveEligible: false }
    ],
    connections: [{ id: "social-connection-caught-up-threads", profileId: "social-profile-caught-up" }]
  }), "utf8");
  return root;
}

async function observation(root: string, date: string, over: Record<string, unknown> = {}): Promise<void> {
  const directory = path.join(root, "state/ventures/webdev-signal/observations");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${date}.json`), JSON.stringify({
    schemaVersion: "webdev-observation/1",
    date,
    recordedAt: `${date}T06:00:00.000Z`,
    provenance: "fixture",
    refs: { runRef: `state/ventures/webdev-signal/runs/${date}.json`, selectionRef: null, evidenceBriefRef: null, packageRefs: [], renderReceiptRefs: [], profileRefs: [], sourceHealthRefs: [] },
    sources: { configured: 12, attempted: 12, healthy: 11, failed: 1, authorityClassesCovered: 2, layoutChanges: 0 },
    candidates: { fetched: 40, afterPrefilter: 28, duplicatesCollapsed: 4, held: 14, eligible: 6 },
    decision: { outcome: "selected", reason: "One material change crossed the threshold.", selectedRecordId: "rec-1", scoreMargin: { value: 0.2, unavailableReason: null }, confidence: { value: 0.8, unavailableReason: null }, ownerOverride: false },
    goviral: { status: "unavailable", changedWinner: false },
    editions: [
      { locale: "cs", state: "valid", holdReasons: [], claimParity: "pass", accessibility: "pass", renderState: "rendered", deliveryState: "held" },
      { locale: "en", state: "valid", holdReasons: [], claimParity: "pass", accessibility: "pass", renderState: "rendered", deliveryState: "held" }
    ],
    corrections: { opened: 0, resolved: 0, factualIncidents: 0, securityVersionIncidents: 0 },
    cost: { modelCalls: 0, providerCostUsd: 0, cacheReused: 8, callsAvoided: 2 },
    outcomes: [],
    snapshotHash: "a".repeat(64),
    ...over
  }), "utf8");
}

/**
 * One loader, not one per tab. Every tab asks a different question about the same Prague day, and
 * answering each from its own reader is how two tabs come to disagree about that day.
 */
describe("the WebDev Signal admin snapshot", () => {
  it("reads a venture that has never run as absent rather than broken", async () => {
    await repository();

    const snapshot = await readAdminWebDevSignal();

    expect(snapshot.observationsState).toBe("missing");
    expect(snapshot.days).toEqual([]);
    expect(snapshot.unreadable).toBe(0);
    // The posture comes from the countersigned record, not from an assumption.
    expect(snapshot.authority).toEqual({ foundingCountersigned: true, liveBehaviourHeld: true, accountsCreated: false });
  });

  it("returns days newest first and carries only this venture's profiles", async () => {
    const root = await repository();
    await observation(root, "2026-08-12");
    await observation(root, "2026-08-13");

    const snapshot = await readAdminWebDevSignal();

    expect(snapshot.days.map(({ date }) => date)).toEqual(["2026-08-13", "2026-08-12"]);
    expect(snapshot.profiles.map(({ id }) => id)).toEqual(["social-profile-webdev-signal-cs"]);
    expect(snapshot.profiles[0]?.connections).toEqual([]);
  });

  it("drops a malformed day as a count and never as a path", async () => {
    const root = await repository();
    await observation(root, "2026-08-12");
    await writeFile(
      path.join(root, "state/ventures/webdev-signal/observations/2026-08-13.json"),
      "{ not json",
      "utf8"
    );

    const snapshot = await readAdminWebDevSignal();

    expect(snapshot.days).toHaveLength(1);
    expect(snapshot.unreadable).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain(root);
    expect(JSON.stringify(snapshot)).not.toContain("2026-08-13.json");
  });

  it("hashes deterministically over the same state", async () => {
    const root = await repository();
    await observation(root, "2026-08-12");

    const first = await readAdminWebDevSignal();
    const second = await readAdminWebDevSignal();

    expect(first.snapshotHash).toBe(second.snapshotHash);
    expect(first.snapshotHash).toHaveLength(64);
  });

  it("keeps a NO_EDITION day's missing measures unavailable with their reason", async () => {
    const root = await repository();
    await observation(root, "2026-08-12", {
      decision: {
        outcome: "NO_EDITION",
        reason: "No candidate crossed the threshold.",
        selectedRecordId: null,
        scoreMargin: { value: null, unavailableReason: "no-edition-day" },
        confidence: { value: null, unavailableReason: "no-edition-day" },
        ownerOverride: false
      },
      editions: []
    });

    const snapshot = await readAdminWebDevSignal();

    expect(snapshot.days[0]?.outcome).toBe("NO_EDITION");
    expect(snapshot.days[0]?.scoreMargin).toEqual({ value: null, unavailableReason: "no-edition-day" });
  });
});
