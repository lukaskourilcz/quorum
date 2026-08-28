import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SocialLearningCheckpointSchema } from "../src/contracts/social-learning.js";
import { SocialMetricObservationSchema, socialMetricSnapshotHash } from "../src/contracts/social-results.js";
import { sha256 } from "../src/hashing.js";
import { appendSocialMetricObservation } from "../src/social/results.js";
import { runSocialLearningCheckpoint } from "../src/social/learning-checkpoint.js";
import { repoRoot } from "../src/paths.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("weekly Social Distribution learning checkpoint", () => {
  it("writes one immutable insufficient-data record per canonical profile", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "social-learning-checkpoint-")); roots.push(stateRoot);
    const now = new Date("2026-08-31T21:00:00.000Z");
    const first = await runSocialLearningCheckpoint({ repoRoot, stateRoot, now });
    const second = await runSocialLearningCheckpoint({ repoRoot, stateRoot, now: new Date("2026-08-31T21:30:00.000Z") });
    expect(first).toMatchObject({ profiles: 6, corrections: 0, droppedObservations: 0 });
    expect(second).toMatchObject({ profiles: 6, corrections: 0, droppedObservations: 0 });
    const manifest = SocialLearningCheckpointSchema.parse(JSON.parse(await readFile(path.join(stateRoot, "social/learning/checkpoints/social-profile-caught-up/2026-08-31.json"), "utf8")) as unknown);
    expect(manifest).toMatchObject({ correctionCount: 0, authorityGranted: false, publishingAuthorized: false });
    expect(manifest.evaluationRefs).toHaveLength(1);
    expect(await readdir(path.join(stateRoot, "social/learning/evaluations/social-profile-caught-up"))).toHaveLength(1);
  });

  it("preserves the prior evaluation when corrected canonical evidence arrives", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "social-learning-correction-")); roots.push(stateRoot);
    const now = new Date("2026-08-31T21:00:00.000Z");
    await runSocialLearningCheckpoint({ repoRoot, stateRoot, now });
    const fixture = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/social-results-contracts.valid.json"), "utf8")) as { observation: Record<string, unknown> };
    const fixtureObservation = SocialMetricObservationSchema.parse(fixture.observation);
    const idempotencyHash = sha256("social-learning-checkpoint:corrected-observation");
    const corrected = { ...fixtureObservation, id: `social-metric-observation-${idempotencyHash.slice(0, 20)}`, idempotencyHash, maturityWindow: "28d" as const, observedAt: "2026-08-30T08:00:00.000Z", snapshotHash: "0".repeat(64) };
    const observation = SocialMetricObservationSchema.parse({ ...corrected, snapshotHash: socialMetricSnapshotHash(corrected) });
    await appendSocialMetricObservation(stateRoot, observation);
    await runSocialLearningCheckpoint({ repoRoot, stateRoot, now });
    const manifest = SocialLearningCheckpointSchema.parse(JSON.parse(await readFile(path.join(stateRoot, "social/learning/checkpoints/social-profile-caught-up/2026-08-31.json"), "utf8")) as unknown);
    expect(manifest).toMatchObject({ correctionCount: 1 });
    expect(manifest.evaluationRefs).toHaveLength(2);
    expect(await readdir(path.join(stateRoot, "social/learning/evaluations/social-profile-caught-up"))).toHaveLength(2);
    expect(manifest.strategyVersionRefs).toHaveLength(1);
  });
});
