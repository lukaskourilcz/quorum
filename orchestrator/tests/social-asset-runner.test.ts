import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialAssetHoldSchema } from "../src/contracts/social-assets.js";
import { ProviderConnectionBindingSchema, providerBindingHash } from "../src/contracts/social-provider.js";
import { sha256 } from "../src/hashing.js";
import { repoRoot } from "../src/paths.js";
import type { PublishAdapter } from "../src/social/publish.js";
import { SocialProviderRegistrySchema } from "../src/social/providers.js";
import { SocialPublisherRegistrySchema, migrateLegacyQueueItem } from "../src/social/publisher-targets.js";
import { CapabilityAwareQueueItemSchema, capabilityAwareQueuePayloadHash } from "../src/social/queue.js";
import { runSocialPublisher } from "../src/social/runner.js";
import recorded from "./fixtures/social-assets/jsdelivr-head.json" with { type: "json" };

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const FRAME = "/social/2026-08-27/cs/instagram/frame-01.png";
const FRAME_BYTES = Buffer.from("DNESKAi frame one, as committed");
const NOW = new Date("2026-08-27T10:00:00.000Z");

async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: root });
  return stdout.trim();
}

/**
 * A checkout with DNESKAi's Instagram connection unlocked in every way the runner checks, one due
 * Instagram item naming one frame, and the frame written to disk but not yet committed.
 */
async function instagramFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "social-asset-runner-"));
  roots.push(root);
  await git(root, "init", "--quiet");
  const config = path.join(root, "config");
  const state = path.join(root, "state");
  await mkdir(config, { recursive: true });
  for (const name of ["channels.json", "venture-capabilities.json", "social-publisher-registry.json", "social-providers.json", "network-allowlist.json"]) {
    await cp(path.join(repoRoot, "config", name), path.join(config, name));
  }

  const publisher = SocialPublisherRegistrySchema.parse(await json(path.join(config, "social-publisher-registry.json")));
  const profile = publisher.profiles.find(({ id }) => id === "social-profile-caught-up")!;
  profile.lifecycle = "active";
  profile.liveEligible = true;
  const connection = publisher.connections.find(({ id }) => id === "social-connection-caught-up-instagram")!;
  connection.mode = "autopublish";
  connection.health = { status: "healthy", unavailableReason: null };
  connection.enabledByHumanAt = "2026-08-27T09:00:00.000Z";
  await writeJson(path.join(config, "social-publisher-registry.json"), publisher);

  const providers = SocialProviderRegistrySchema.parse(await json(path.join(config, "social-providers.json")));
  const index = providers.bindings.findIndex(({ connectionId }) => connectionId === connection.id);
  const activated = {
    ...providers.bindings[index]!,
    mode: "active" as const,
    ownerActivationRef: "owner:provider-activation-001",
    authorityRef: "owner:routine-authority-001",
    effectiveAt: "2026-08-27T09:00:00.000Z",
    health: { state: "healthy" as const, unavailableReason: "none" as const, lastVerifiedAt: "2026-08-27T09:00:00.000Z" }
  };
  providers.bindings[index] = ProviderConnectionBindingSchema.parse({ ...activated, bindingHash: providerBindingHash(activated) });
  await writeJson(path.join(config, "social-providers.json"), providers);

  const channels = await json(path.join(config, "channels.json")) as { channels: Array<{ id: string; mode: string; enabledByHumanAt: string | null }> };
  const instagram = channels.channels.find(({ id }) => id === "instagram")!;
  instagram.mode = "autopublish";
  instagram.enabledByHumanAt = "2026-08-27T09:00:00.000Z";
  await writeJson(path.join(config, "channels.json"), channels);

  const legacy = await json(path.join(repoRoot, "state/social/queue/2026-08-06-cs-instagram.json")) as { content: Record<string, unknown> };
  const migrated = migrateLegacyQueueItem({ ...legacy, content: { ...legacy.content, assetPaths: [FRAME] } }, publisher);
  const draft = {
    ...migrated,
    status: "draft" as const,
    publishWindow: { notBefore: "2026-08-27T09:00:00.000Z", notAfter: "2026-08-27T11:00:00.000Z" },
    content: { ...migrated.content, contentHash: "0".repeat(64) }
  };
  await writeJson(path.join(state, "social/queue/item.json"), CapabilityAwareQueueItemSchema.parse({ ...draft, content: { ...draft.content, contentHash: capabilityAwareQueuePayloadHash(draft) } }));
  await writeJson(path.join(state, "social/assets/2026-08-27.json"), { schemaVersion: 1, frameHashes: { [FRAME]: sha256(FRAME_BYTES) } });
  await writeJson(path.join(state, "social/activation.json"), {
    schemaVersion: "social-activation/1",
    ventures: Object.fromEntries(["caught-up", "mma-files", "titty-tuesdays"].map((venture) => [venture, {
      status: venture === "caught-up" ? "enabled" : "locked",
      counter: venture === "caught-up" ? 7 : 0,
      required: venture === "caught-up" ? 7 : 1,
      reason: venture === "caught-up" ? "Fixture authority is explicit." : "Fixture remains locked.",
      updatedAt: "2026-08-27T09:30:00.000Z",
      unlockedAt: venture === "caught-up" ? "2026-08-27T09:00:00.000Z" : null,
      decisionReference: "D2-autonomy-build-2026-08-01"
    }])),
    updatedAt: "2026-08-27T09:30:00.000Z"
  });
  await mkdir(path.join(root, "site/public", path.dirname(FRAME)), { recursive: true });
  await writeFile(path.join(root, "site/public", FRAME), FRAME_BYTES);
  return root;
}

function run(root: string, adapter: PublishAdapter, fetchImpl: typeof fetch) {
  return runSocialPublisher({
    validateOnly: false,
    dryIfDisabled: false,
    now: NOW,
    environment: {
      SOCIAL_KILL_SWITCH: "false",
      META_GRAPH_API_VERSION: "v26.0",
      CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN: "fixture-token",
      CAUGHT_UP_INSTAGRAM_USER_ID: "fixture-user"
    },
    repoRoot: root,
    configRoot: path.join(root, "config"),
    stateRoot: path.join(root, "state"),
    adapter,
    fetchImpl,
    resolveImpl: async () => ["104.16.85.20"]
  });
}

function fakeAdapter() {
  const publish = vi.fn<PublishAdapter["publish"]>(async () => ({ remoteId: "ig-1" }));
  const verify = vi.fn<PublishAdapter["verify"]>(async () => ({ remoteId: "ig-1", remoteUrl: "https://www.instagram.com/p/fixture/" }));
  return { publish, verify, findByIdempotencyKey: vi.fn(async () => null) } satisfies PublishAdapter;
}

const pngAnswer = () => vi.fn<typeof fetch>(async () => new Response(null, { status: 200, headers: recorded.answers.committed.headers }));

describe("the publisher proves every frame before a platform fetches it", () => {
  it("holds an uncommitted frame, records why, and leaves the item exactly as it was", async () => {
    const root = await instagramFixture();
    const before = await readFile(path.join(root, "state/social/queue/item.json"), "utf8");
    const adapter = fakeAdapter();
    const fetchImpl = pngAnswer();

    const report = await run(root, adapter, fetchImpl);

    expect(report).toMatchObject({ status: "draft_only", published: 0, ambiguous: 0, assetHeld: 1 });
    expect(adapter.publish).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await readFile(path.join(root, "state/social/queue/item.json"), "utf8")).toBe(before);
    const hold = SocialAssetHoldSchema.parse(await json(path.join(root, "state/social/asset-holds/item.json")));
    expect(hold).toMatchObject({
      queueItemId: "caught-up-2026-08-06-cs-instagram",
      reason: "asset-unreachable",
      base: "jsdelivr",
      assets: [{ path: FRAME, outcome: "uncommitted", recordedSha256: sha256(FRAME_BYTES) }]
    });
  });

  it("sends a committed frame by the commit-pinned URL that answered 200, and clears the hold", async () => {
    const root = await instagramFixture();
    await run(root, fakeAdapter(), pngAnswer());
    await git(root, "add", "--", `site/public${FRAME}`);
    await git(root, "commit", "--quiet", "-m", "cycle: frames");
    const commit = await git(root, "rev-parse", "HEAD");
    const adapter = fakeAdapter();
    const fetchImpl = pngAnswer();

    const report = await run(root, adapter, fetchImpl);

    const url = `https://cdn.jsdelivr.net/gh/lukaskourilcz/quorum@${commit}/site/public${FRAME}`;
    expect(report).toMatchObject({ status: "complete", published: 1, assetHeld: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(url);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD" });
    expect(adapter.publish.mock.calls[0]?.[4]).toEqual([{ path: FRAME, url, sha256: sha256(FRAME_BYTES), contentType: "image/png", commit }]);
    await expect(readFile(path.join(root, "state/social/asset-holds/item.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("holds a committed frame jsDelivr answers 404 for, and never sends it by another URL", async () => {
    const root = await instagramFixture();
    await git(root, "add", "--", `site/public${FRAME}`);
    await git(root, "commit", "--quiet", "-m", "cycle: frames");
    const adapter = fakeAdapter();
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 404, headers: recorded.answers["unpushed-commit"].headers }));

    const report = await run(root, adapter, fetchImpl);

    expect(report).toMatchObject({ published: 0, assetHeld: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(adapter.publish).not.toHaveBeenCalled();
    const hold = SocialAssetHoldSchema.parse(await json(path.join(root, "state/social/asset-holds/item.json")));
    expect(hold.assets[0]).toMatchObject({ outcome: "unreachable", detail: expect.stringContaining("404") });
  });

  it("holds a committed frame whose bytes are not the recorded ones", async () => {
    const root = await instagramFixture();
    await writeFile(path.join(root, "site/public", FRAME), Buffer.from("a different frame"));
    await git(root, "add", "--", `site/public${FRAME}`);
    await git(root, "commit", "--quiet", "-m", "cycle: frames");
    const adapter = fakeAdapter();
    const fetchImpl = pngAnswer();

    const report = await run(root, adapter, fetchImpl);

    expect(report).toMatchObject({ published: 0, assetHeld: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(SocialAssetHoldSchema.parse(await json(path.join(root, "state/social/asset-holds/item.json"))).reason).toBe("asset-hash-mismatch");
  });
});
