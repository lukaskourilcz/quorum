import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSocialLifecycleHolds } from "../src/social/profile-lifecycle.js";

const roots: string[] = [];

async function writeEvent(root: string, suffix: string, value: Record<string, unknown>): Promise<void> {
  const directory = path.join(root, "social/profile-events"); await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${suffix}.json`), `${JSON.stringify({ schemaVersion: "social-profile-event/1", eventId: `social-profile-event-${suffix}`, at: "2026-08-27T12:00:00.000Z", actor: "owner", provenanceRef: "admin:social-profiles", reason: "Bounded fixture lifecycle reason.", supersededEventRef: null, ...value }, null, 2)}\n`);
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("Social Profile lifecycle runtime holds", () => {
  it("turns profile and connection stop evidence into independent runtime holds", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-lifecycle-")); roots.push(root);
    await writeEvent(root, "profile-pause", { profileId: "social-profile-caught-up", connectionId: null, action: "paused" });
    await writeEvent(root, "connection-disconnect", { profileId: "social-profile-caught-up", connectionId: "social-connection-caught-up-threads", action: "disconnected" });
    const result = await loadSocialLifecycleHolds(root);
    expect([...result.pausedProfileIds]).toEqual(["social-profile-caught-up"]);
    expect([...result.pausedConnectionIds]).toEqual(["social-connection-caught-up-threads"]);
    expect(result.malformed).toBe(0);
  });

  it("drops malformed evidence without losing valid holds", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-lifecycle-")); roots.push(root);
    await writeEvent(root, "profile-retired", { profileId: "social-profile-mma-files", connectionId: null, action: "retired" });
    await writeFile(path.join(root, "social/profile-events/broken.json"), "{");
    const result = await loadSocialLifecycleHolds(root);
    expect(result.pausedProfileIds.has("social-profile-mma-files")).toBe(true);
    expect(result.malformed).toBe(1);
  });
});
