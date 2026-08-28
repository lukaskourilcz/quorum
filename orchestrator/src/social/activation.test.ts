import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialPostReceiptSchema } from "../contracts/autonomy.js";
import { MarketingPlanSchema } from "../contracts/marketing-plan.js";
import { atomicWriteJson } from "../state.js";
import { caughtUpUnlockCounter, mmaFilesUnlockCounter, refreshSocialActivation } from "./activation.js";
import { QueueItemSchema, queuePayloadHash, type QueueItem } from "./queue.js";
import { runSocialPublisher } from "./runner.js";
import { loadSocialPublisherRegistry } from "./publisher-targets.js";
import { checkTittyTuesdaysPost } from "./tt-safety.js";
import { composeTittyTuesdaysSocialQueue } from "./venture-packs.js";
import marketingPlanFixture from "../../../contracts/fixtures/marketing-plan.valid.json" with { type: "json" };
import sharp from "sharp";
import { configRoot as canonicalConfigRoot } from "../paths.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function root(): Promise<string> {
  const value = await mkdtemp(path.join(os.tmpdir(), "boardless-social-activation-"));
  roots.push(value);
  return value;
}

function environment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { SOCIAL_KILL_SWITCH: "false", META_GRAPH_API_VERSION: "v26.0", PUBLIC_SITE_URL: "https://boardless.example" };
  for (const prefix of ["CAUGHT_UP", "MMA_FILES", "TITTY_TUESDAYS"]) {
    result[`${prefix}_THREADS_ACCESS_TOKEN`] = "fixture-token";
    result[`${prefix}_THREADS_USER_ID`] = "fixture-user";
    result[`${prefix}_INSTAGRAM_ACCESS_TOKEN`] = "fixture-token";
    result[`${prefix}_INSTAGRAM_USER_ID`] = "fixture-user";
  }
  return result;
}

async function writeActivePublisherConfig(targetConfigRoot: string): Promise<void> {
  const registry = structuredClone(await loadSocialPublisherRegistry(canonicalConfigRoot));
  const profile = registry.profiles.find((candidate) => candidate.id === "social-profile-caught-up")!;
  profile.lifecycle = "active";
  profile.liveEligible = true;
  const connection = registry.connections.find((candidate) => candidate.id === "social-connection-caught-up-threads")!;
  connection.mode = "autopublish";
  connection.health = { status: "healthy", unavailableReason: null };
  connection.enabledByHumanAt = "2026-08-01T00:00:00.000Z";
  await Promise.all([
    writeFile(path.join(targetConfigRoot, "social-publisher-registry.json"), JSON.stringify(registry)),
    readFile(path.join(canonicalConfigRoot, "venture-capabilities.json")).then((source) =>
      writeFile(path.join(targetConfigRoot, "venture-capabilities.json"), source)
    )
  ]);
}

function proof(index: number) {
  const packageHash = index.toString(16).padStart(64, "0");
  const checks = ["target-commit", "target-ci", "english-route", "czech-route", "title-slug", "content-hash", "hero-image", "image-dimensions", "attribution"].map((name) => ({
    name,
    status: "pass",
    detail: "Fixture check passed.",
    checkedAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`
  }));
  return {
    schemaVersion: "release-proof/1",
    id: `proof-${index.toString(16).padStart(16, "0")}`,
    venture: "caught-up",
    packageHash,
    targetRepository: "lukaskourilcz/aifirst",
    targetCommit: index.toString(16).padStart(40, "0"),
    deploymentUrl: "https://caught-up.example",
    checks,
    retryCount: 0,
    status: "passed",
    startedAt: `2026-08-${String(index + 1).padStart(2, "0")}T09:59:00.000Z`,
    completedAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`
  };
}

function queueItem(): QueueItem {
  const base = {
    schemaVersion: 1 as const,
    id: "caught-up-fixture-en-threads",
    venture: "caught-up" as const,
    locale: "en" as const,
    variant: "B" as const,
    campaignId: "caught-up-fixture",
    experimentId: null,
    channel: "threads" as const,
    objective: "trust" as const,
    audience: "Caught Up readers",
    destination: "https://caught-up.example/articles/fixture",
    utm: { source: "threads" as const, medium: "organic_social" as const, campaign: "fixture", content: "B" },
    content: { text: "A fixture post with a verified destination.", altText: null, assetPaths: [], factualClaimRefs: ["fixture:proof"], rendererVersion: "carousel-studio-1" as const, contentHash: "0".repeat(64) },
    publishWindow: { notBefore: "2026-08-08T08:00:00.000Z", notAfter: "2026-08-08T10:00:00.000Z" },
    status: "draft" as const,
    checks: { schema: "pass" as const, brand: "pass" as const, claims: "pass" as const, quill: "pass" as const, keeper: "pass" as const, duplicate: "pass" as const, accessibility: "pass" as const, budget: "pass" as const },
    selectedBy: "PULSE" as const,
    createdAt: "2026-08-08T07:55:00.000Z",
    attempt: null,
    receiptId: null
  };
  return QueueItemSchema.parse({ ...base, content: { ...base.content, contentHash: queuePayloadHash(base) } });
}

describe("per-venture social activation", () => {
  it("keeps NO_EDITION neutral and resets Caught Up after a failure", () => {
    expect(caughtUpUnlockCounter(["passed", "no-edition", "passed"])).toBe(2);
    expect(caughtUpUnlockCounter(["passed", "no-edition", "failed", "no-edition", "passed"])).toBe(1);
    expect(mmaFilesUnlockCounter(Array.from({ length: 10 }, () => "passed" as const))).toBe(10);
    expect(mmaFilesUnlockCounter(["passed", "failed", "passed"])).toBe(1);
  });

  it("unlocks Caught Up only after seven valid proofs and all brand credentials", async () => {
    const repoRoot = await root();
    const stateRoot = path.join(repoRoot, "state");
    await mkdir(path.join(stateRoot, "release-proofs", "caught-up"), { recursive: true });
    for (let index = 1; index <= 7; index += 1) await atomicWriteJson(stateRoot, `release-proofs/caught-up/${index}.json`, proof(index));
    const activation = await refreshSocialActivation({ repoRoot, stateRoot, environment: environment(), now: new Date("2026-08-08T07:00:00.000Z"), safetyCheckerReady: true });
    expect(activation.ventures["caught-up"]).toMatchObject({ status: "enabled", counter: 7, required: 7 });
    expect(JSON.parse(await readFile(path.join(stateRoot, "notify", "social-unlocks", "caught-up.json"), "utf8"))).toMatchObject({ decisionReference: "D2-autonomy-build-2026-08-01" });
  });

  it("blocks unsafe TT wording and any non-brand visual", () => {
    const safe = QueueItemSchema.parse({
      ...queueItem(), venture: "titty-tuesdays", channel: "instagram", locale: "cs", utm: { ...queueItem().utm, source: "instagram" }, content: {
        ...queueItem().content,
        text: "Úterní nápad stojí na jedné ostré větě.",
        altText: "Typographic brand card with one line of text.",
        assetPaths: ["/social/titty-tuesdays/fixture.png"]
      },
      publishWindow: { notBefore: "2026-08-04T08:00:00.000Z", notAfter: "2026-08-04T10:00:00.000Z" }
    });
    expect(checkTittyTuesdaysPost(safe).passed).toBe(true);
    expect(checkTittyTuesdaysPost({ ...safe, content: { ...safe.content, text: "Explicit nude photo" } }).passed).toBe(false);
    expect(checkTittyTuesdaysPost({ ...safe, content: { ...safe.content, assetPaths: ["/social/other/photo.webp"] } }).passed).toBe(false);
  });

  it("refreshes health counters once per Prague day while the global kill switch blocks publishing", async () => {
    const repoRoot = await root();
    const stateRoot = path.join(repoRoot, "state");
    const lockedEnvironment = { ...environment(), SOCIAL_KILL_SWITCH: "true" };
    const report = await runSocialPublisher({
      validateOnly: false,
      dryIfDisabled: true,
      now: new Date("2026-08-08T09:00:00.000Z"),
      environment: lockedEnvironment,
      repoRoot,
      stateRoot,
      configRoot: path.join(repoRoot, "config")
    });
    expect(report.status).toBe("paused");
    const activation = JSON.parse(await readFile(path.join(stateRoot, "social", "activation.json"), "utf8"));
    expect(activation.ventures["caught-up"]).toMatchObject({ counter: 0, required: 7 });
  });

  it("runs fixture post, verification and immutable receipt end to end", async () => {
    const repoRoot = await root();
    const stateRoot = path.join(repoRoot, "state");
    const configRoot = path.join(repoRoot, "config");
    await mkdir(configRoot, { recursive: true });
    await writeFile(path.join(configRoot, "channels.json"), JSON.stringify({ schemaVersion: 1, channels: [
      { id: "threads", specialist: "THREADS", mode: "autopublish", connector: "meta_threads", credentialRef: "unused", approvedScopes: ["threads_basic", "threads_content_publish"], nativeFormats: ["text"], maxOrganicPostsPerDay: 2, minHoursBetweenPosts: 6, timezone: "Europe/Prague", enabledByHumanAt: "2026-08-01T00:00:00.000Z" },
      { id: "instagram", specialist: "INSTAGRAM", mode: "autopublish", connector: "meta_instagram", credentialRef: "unused", approvedScopes: ["instagram_basic", "instagram_content_publish"], nativeFormats: ["image"], maxOrganicPostsPerDay: 1, minHoursBetweenPosts: 12, timezone: "Europe/Prague", enabledByHumanAt: "2026-08-01T00:00:00.000Z" }
    ] }));
    await writeActivePublisherConfig(configRoot);
    for (let index = 1; index <= 7; index += 1) await atomicWriteJson(stateRoot, `release-proofs/caught-up/${index}.json`, proof(index));
    await atomicWriteJson(stateRoot, "social/queue/fixture.json", queueItem());
    const adapter = {
      publish: vi.fn(async () => ({ remoteId: "fixture-post-1" })),
      verify: vi.fn(async () => ({ remoteId: "fixture-post-1", remoteUrl: "https://www.threads.net/@fixture/post/1" }))
    };
    const report = await runSocialPublisher({ validateOnly: false, dryIfDisabled: false, now: new Date("2026-08-08T09:00:00.000Z"), environment: environment(), adapter, repoRoot, stateRoot, configRoot });
    expect(report).toMatchObject({ status: "complete", published: 1, ambiguous: 0 });
    const receipts = await readdir(path.join(stateRoot, "social", "posts"));
    const receipt = SocialPostReceiptSchema.parse(JSON.parse(await readFile(path.join(stateRoot, "social", "posts", receipts[0]!), "utf8")));
    expect(receipt).toMatchObject({ variant: "B", verifiedLive: true, attemptCount: 1, outcome: "published" });
  });

  it("holds an ambiguous delivery for reconciliation, redacts it and pauses the exact connection", async () => {
    const repoRoot = await root();
    const stateRoot = path.join(repoRoot, "state");
    const configRoot = path.join(repoRoot, "config");
    await mkdir(configRoot, { recursive: true });
    await writeFile(path.join(configRoot, "channels.json"), JSON.stringify({ schemaVersion: 1, channels: [
      { id: "threads", specialist: "THREADS", mode: "autopublish", connector: "meta_threads", credentialRef: "unused", approvedScopes: ["threads_basic", "threads_content_publish"], nativeFormats: ["text"], maxOrganicPostsPerDay: 2, minHoursBetweenPosts: 6, timezone: "Europe/Prague", enabledByHumanAt: "2026-08-01T00:00:00.000Z" },
      { id: "instagram", specialist: "INSTAGRAM", mode: "autopublish", connector: "meta_instagram", credentialRef: "unused", approvedScopes: ["instagram_basic", "instagram_content_publish"], nativeFormats: ["image"], maxOrganicPostsPerDay: 1, minHoursBetweenPosts: 12, timezone: "Europe/Prague", enabledByHumanAt: "2026-08-01T00:00:00.000Z" }
    ] }));
    await writeActivePublisherConfig(configRoot);
    for (let index = 1; index <= 7; index += 1) await atomicWriteJson(stateRoot, `release-proofs/caught-up/${index}.json`, proof(index));
    await atomicWriteJson(stateRoot, "social/queue/fixture.json", queueItem());
    const adapter = {
      findByIdempotencyKey: vi.fn(async () => null),
      publish: vi.fn(async () => { throw new Error("Timeout after access_token=fixture-token may have reached Meta"); }),
      verify: vi.fn()
    };

    const report = await runSocialPublisher({
      validateOnly: false,
      dryIfDisabled: false,
      now: new Date("2026-08-08T09:00:00.000Z"),
      environment: environment(),
      adapter,
      repoRoot,
      stateRoot,
      configRoot
    });

    expect(report).toMatchObject({ status: "complete", published: 0, ambiguous: 1 });
    expect(adapter.findByIdempotencyKey).toHaveBeenCalledTimes(2);
    expect(adapter.publish).toHaveBeenCalledTimes(2);
    expect(adapter.verify).not.toHaveBeenCalled();
    const queued = JSON.parse(await readFile(path.join(stateRoot, "social/queue/fixture.json"), "utf8"));
    expect(queued).toMatchObject({ schemaVersion: 2, status: "needs_reconciliation" });
    expect(JSON.stringify(queued)).not.toContain("fixture-token");
    const pause = JSON.parse(await readFile(
      path.join(stateRoot, "social/pauses/connections/social-connection-caught-up-threads.json"),
      "utf8"
    ));
    expect(pause).toMatchObject({
      connectionId: "social-connection-caught-up-threads",
      profileId: "social-profile-caught-up"
    });
    expect(JSON.stringify(pause)).not.toContain("fixture-token");
  });

  it("renders TT typographic PNGs and schedules them only for Prague Tuesday", async () => {
    const repoRoot = await root();
    const stateRoot = path.join(repoRoot, "state");
    const paths = await composeTittyTuesdaysSocialQueue({
      repoRoot,
      stateRoot,
      plan: MarketingPlanSchema.parse(marketingPlanFixture),
      destinationBaseUrl: "https://titty-tuesdays.example",
      now: new Date("2026-08-01T10:00:00.000Z")
    });
    expect(paths.filter((value) => value.startsWith("social/queue/"))).toHaveLength(2);
    const queueFiles = await readdir(path.join(stateRoot, "social", "queue"));
    const items = await Promise.all(queueFiles.map(async (name) => QueueItemSchema.parse(JSON.parse(await readFile(path.join(stateRoot, "social", "queue", name), "utf8")))));
    expect(items.map((item) => item.channel).sort()).toEqual(["instagram", "threads"]);
    expect(items.every((item) => new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Prague", weekday: "long" }).format(new Date(item.publishWindow.notBefore)) === "Tuesday")).toBe(true);
    expect(items.every((item) => checkTittyTuesdaysPost(item).passed)).toBe(true);
    const instagram = items.find((item) => item.channel === "instagram")!;
    const metadata = await sharp(await readFile(path.join(repoRoot, "site", "public", instagram.content.assetPaths[0]!.slice(1)))).metadata();
    expect(metadata).toMatchObject({ format: "png", width: 1080, height: 1350 });
  });
});
