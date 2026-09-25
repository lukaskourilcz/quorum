import { execFile } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialPublishHoldSchema } from "../src/contracts/social-publish-hold.js";
import { ProviderConnectionBindingSchema, providerBindingHash } from "../src/contracts/social-provider.js";
import { canonicalJson, sha256 } from "../src/hashing.js";
import { configRoot as committedConfigRoot, repoRoot } from "../src/paths.js";
import { createMetaPublishAdapter } from "../src/social/meta.js";
import { SocialProviderRegistrySchema } from "../src/social/providers.js";
import { SocialPublisherRegistrySchema } from "../src/social/publisher-targets.js";
import { CapabilityAwareQueueItemSchema, capabilityAwareQueuePayloadHash, type CapabilityAwareQueueItem } from "../src/social/queue.js";
import { runSocialPublisher } from "../src/social/runner.js";
import threadsFixture from "./fixtures/social-meta/threads.json" with { type: "json" };
import { replayMeta, type MetaExchange } from "./fixtures/social-meta/replay.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const NOW = new Date("2026-09-26T08:00:00.000Z");
const TOKEN = "fixture-token";
const PACKAGE = "state/ventures/marketingshark/packages/2026-09-26/devshark/package.json";
const FRAMES = await Promise.all(["#0b2233", "#12324a", "#1a4260", "#225277", "#2a628d"].map((background) =>
  sharp({ create: { width: 1080, height: 1350, channels: 3, background } }).png().toBuffer()));
const framePath = (slide: number) => `/social/devshark/2026-09-26/en/slide-0${slide}.png`;
const scenario = (name: string) => threadsFixture.scenarios[name as keyof typeof threadsFixture.scenarios] as MetaExchange[];

async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(() => true, () => false);
}

async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: root });
  return stdout.trim();
}

/** An approved Threads item on DNESKAi's connection naming `frames` committed PNGs from a package. */
function approvedItem(frames: number, packageHash: string): CapabilityAwareQueueItem {
  const base = {
    schemaVersion: 2 as const,
    id: "fixture-threads-carousel",
    sourceVentureId: "caught-up",
    releaseId: "fixture-release",
    campaignId: "fixture-campaign",
    experimentId: null,
    target: {
      profileId: "social-profile-caught-up",
      profileRole: "venture-primary" as const,
      role: "primary" as const,
      connectionBindingRef: "social-connection-caught-up-threads",
      capabilityRef: null,
      amplifierEligibilityRef: null,
      campaignApprovalRef: null
    },
    action: "publish-original" as const,
    sourcePackage: { schemaVersion: "approved-publish-package/1" as const, artifactRef: PACKAGE, packageHash },
    locale: "en" as const,
    variant: "A" as const,
    channel: "threads" as const,
    objective: "trust" as const,
    audience: "Fixture readers",
    destination: "https://caught-up.example/",
    utm: { source: "threads" as const, medium: "organic_social" as const, campaign: "fixture", content: "fixture" },
    content: {
      text: threadsFixture.text,
      altText: threadsFixture.altTexts.slice(0, frames).join(" "),
      assetPaths: Array.from({ length: frames }, (_, index) => framePath(index + 1)),
      factualClaimRefs: ["FIXTURE-EVIDENCE-001"],
      rendererVersion: "carousel-studio-1" as const,
      contentHash: "0".repeat(64)
    },
    publishWindow: { notBefore: "2026-09-26T06:00:00.000Z", notAfter: "2026-09-26T21:00:00.000Z" },
    status: "queued" as const,
    checks: Object.fromEntries(["schema", "brand", "claims", "quill", "keeper", "duplicate", "accessibility", "budget", "capability", "authority", "policy"].map((name) => [name, "pass"])) as CapabilityAwareQueueItem["checks"],
    approvalProvenance: { approvalRef: "fixture:owner-approval", selectionRef: "fixture:selection", policyRef: null },
    selectedBy: "PULSE" as const,
    createdAt: "2026-09-26T05:00:00.000Z",
    attempt: null,
    receiptId: null,
    migration: null
  };
  return CapabilityAwareQueueItemSchema.parse({ ...base, content: { ...base.content, contentHash: capabilityAwareQueuePayloadHash(base) } });
}

async function writeActivation(stateRoot: string): Promise<void> {
  await writeJson(path.join(stateRoot, "social/activation.json"), {
    schemaVersion: "social-activation/1",
    ventures: Object.fromEntries(["caught-up", "mma-files", "titty-tuesdays"].map((venture) => [venture, {
      status: venture === "caught-up" ? "enabled" : "locked",
      counter: venture === "caught-up" ? 7 : 0,
      required: venture === "caught-up" ? 7 : 1,
      reason: venture === "caught-up" ? "Fixture authority is explicit." : "Fixture remains locked.",
      updatedAt: "2026-09-26T07:30:00.000Z",
      unlockedAt: venture === "caught-up" ? "2026-09-26T07:00:00.000Z" : null,
      decisionReference: "D2-autonomy-build-2026-08-01"
    }])),
    updatedAt: "2026-09-26T07:30:00.000Z"
  });
}

/**
 * A checkout where DNESKAi's Threads connection is unlocked in every way the runner checks, the
 * frames and their package are committed, and one approved Threads item names `frames` of them.
 */
async function unlockedCheckout(frames: number): Promise<{ root: string; commit: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "social-meta-runner-"));
  roots.push(root);
  await git(root, "init", "--quiet");
  const config = path.join(root, "config");
  await mkdir(config, { recursive: true });
  for (const name of ["channels.json", "venture-capabilities.json", "social-publisher-registry.json", "social-providers.json", "network-allowlist.json"]) {
    await cp(path.join(repoRoot, "config", name), path.join(config, name));
  }
  const publisher = SocialPublisherRegistrySchema.parse(await json(path.join(config, "social-publisher-registry.json")));
  const profile = publisher.profiles.find(({ id }) => id === "social-profile-caught-up")!;
  profile.lifecycle = "active";
  profile.liveEligible = true;
  const connection = publisher.connections.find(({ id }) => id === "social-connection-caught-up-threads")!;
  connection.mode = "autopublish";
  connection.health = { status: "healthy", unavailableReason: null };
  connection.enabledByHumanAt = "2026-09-26T07:00:00.000Z";
  await writeJson(path.join(config, "social-publisher-registry.json"), publisher);
  const providers = SocialProviderRegistrySchema.parse(await json(path.join(config, "social-providers.json")));
  const index = providers.bindings.findIndex(({ connectionId }) => connectionId === connection.id);
  const activated = {
    ...providers.bindings[index]!,
    mode: "active" as const,
    ownerActivationRef: "owner:provider-activation-001",
    authorityRef: "owner:routine-authority-001",
    effectiveAt: "2026-09-26T07:00:00.000Z",
    health: { state: "healthy" as const, unavailableReason: "none" as const, lastVerifiedAt: "2026-09-26T07:00:00.000Z" }
  };
  providers.bindings[index] = ProviderConnectionBindingSchema.parse({ ...activated, bindingHash: providerBindingHash(activated) });
  await writeJson(path.join(config, "social-providers.json"), providers);
  const channels = await json(path.join(config, "channels.json")) as { channels: Array<{ id: string; mode: string; enabledByHumanAt: string | null }> };
  const threads = channels.channels.find(({ id }) => id === "threads")!;
  threads.mode = "autopublish";
  threads.enabledByHumanAt = "2026-09-26T07:00:00.000Z";
  await writeJson(path.join(config, "channels.json"), channels);

  // The approved package records each frame's hash and each slide's alt text.
  const built = {
    id: "fixture-package",
    carousels: { en: { slides: threadsFixture.altTexts.map((alt) => ({ alt })) } },
    render: { frames: FRAMES.map((bytes, index) => ({ locale: "en", slide: index + 1, png: { path: framePath(index + 1), sha256: sha256(bytes), bytes: bytes.byteLength } })) }
  };
  await writeJson(path.join(root, PACKAGE), built);
  for (const [index, bytes] of FRAMES.entries()) {
    await mkdir(path.join(root, "site/public", path.dirname(framePath(index + 1))), { recursive: true });
    await writeFile(path.join(root, "site/public", framePath(index + 1)), bytes);
  }
  await git(root, "add", "--", "site/public/social");
  await git(root, "commit", "--quiet", "-m", "cycle: frames");
  const commit = await git(root, "rev-parse", "HEAD");
  await writeJson(path.join(root, "state/social/queue/item.json"), approvedItem(frames, sha256(canonicalJson(built))));
  await writeActivation(path.join(root, "state"));
  return { root, commit };
}

/** jsDelivr answers every committed frame; Meta answers from the fixture, strictly in order. */
function network(exchanges: readonly MetaExchange[], commit: string) {
  const meta = replayMeta(exchanges, { accessToken: TOKEN, substitutions: { commit } });
  const heads: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (new URL(url).hostname === "cdn.jsdelivr.net") {
      heads.push(url);
      return new Response(null, { status: 200, headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable" } });
    }
    return meta.fetchImpl(input, init);
  });
  return { fetchImpl, heads, meta };
}

function publish(root: string, fetchImpl: typeof fetch, sleep = vi.fn(async (_milliseconds: number) => undefined)) {
  const environment = {
    SOCIAL_KILL_SWITCH: "false",
    META_GRAPH_API_VERSION: "v26.0",
    CAUGHT_UP_THREADS_ACCESS_TOKEN: TOKEN,
    CAUGHT_UP_THREADS_USER_ID: threadsFixture.account.userId
  };
  return runSocialPublisher({
    validateOnly: false,
    dryIfDisabled: false,
    now: NOW,
    environment,
    repoRoot: root,
    configRoot: path.join(root, "config"),
    stateRoot: path.join(root, "state"),
    fetchImpl,
    resolveImpl: async () => ["104.16.85.20"],
    adapter: createMetaPublishAdapter(environment, fetchImpl, { sleep })
  });
}

describe("the publisher sends a Threads carousel through the real Direct Meta adapter", () => {
  it("proves five frames, reads the limit, posts the carousel with each slide's alt text and verifies it live", async () => {
    const { root, commit } = await unlockedCheckout(5);
    const { fetchImpl, heads, meta } = network(scenario("carousel"), commit);
    const sleep = vi.fn(async (_milliseconds: number) => undefined);

    const report = await publish(root, fetchImpl, sleep);

    expect(report).toMatchObject({ status: "complete", published: 1, ambiguous: 0, assetHeld: 0, publishHeld: 0 });
    expect(heads).toHaveLength(5);
    expect(meta.remaining()).toBe(0);
    expect(sleep.mock.calls).toEqual([[30_000], [30_000]]);
    const item = CapabilityAwareQueueItemSchema.parse(await json(path.join(root, "state/social/queue/item.json")));
    expect(item.status).toBe("published");
    const receipt = await json(path.join(root, `state/social/posts/${item.receiptId}.json`)) as Record<string, unknown>;
    expect(receipt).toMatchObject({ outcome: "published", remoteId: "18090000000000020", remoteUrl: "https://www.threads.com/@fixture/post/18090000000000020", verifiedLive: true });
    expect(JSON.stringify(receipt)).not.toContain(TOKEN);
  });
});

describe("a full publishing limit holds the item without a send, a failure or a pause", () => {
  it("records the hold, leaves the item as it was, and sends it on the next run once there is room", async () => {
    const { root, commit } = await unlockedCheckout(5);
    const queueFile = path.join(root, "state/social/queue/item.json");
    const before = await readFile(queueFile, "utf8");
    const exhausted = network(scenario("quota-exhausted"), commit);

    const held = await publish(root, exhausted.fetchImpl);

    expect(held).toMatchObject({ status: "complete", published: 0, ambiguous: 0, publishHeld: 1 });
    expect(exhausted.meta.seen.map((request) => request.url)).toEqual([`https://graph.threads.net/v26.0/${threadsFixture.account.userId}/threads_publishing_limit`]);
    expect(await readFile(queueFile, "utf8")).toBe(before);
    const hold = SocialPublishHoldSchema.parse(await json(path.join(root, "state/social/publish-holds/item.json")));
    expect(hold).toMatchObject({
      queueItemId: "fixture-threads-carousel",
      connectionId: "social-connection-caught-up-threads",
      reason: "publishing-quota-exhausted",
      quota: { usage: 250, total: 250, durationSeconds: 86_400 },
      publishingAuthorized: false
    });
    expect(JSON.stringify(hold)).not.toMatch(new RegExp(`${TOKEN}|${threadsFixture.account.userId}`, "u"));
    expect(await exists(path.join(root, "state/social/pauses"))).toBe(false);
    expect(await exists(path.join(root, "state/social/posts"))).toBe(false);

    const room = network(scenario("carousel"), commit);
    const sent = await publish(root, room.fetchImpl);

    expect(sent).toMatchObject({ published: 1, publishHeld: 0 });
    expect(room.meta.remaining()).toBe(0);
    expect(await exists(path.join(root, "state/social/publish-holds/item.json"))).toBe(false);
  });
});

describe("an ambiguous Meta outcome is reconciled, never resent", () => {
  it("marks a timed-out publish needs_reconciliation, pauses the connection and sends nothing on the next run", async () => {
    const { root, commit } = await unlockedCheckout(1);
    const first = network(scenario("publish-timeout"), commit);

    const report = await publish(root, first.fetchImpl);

    expect(report).toMatchObject({ status: "complete", published: 0, ambiguous: 1, publishHeld: 0 });
    expect(first.meta.remaining()).toBe(0);
    const item = CapabilityAwareQueueItemSchema.parse(await json(path.join(root, "state/social/queue/item.json")));
    expect(item.status).toBe("needs_reconciliation");
    expect(item.attempt?.lastError).toMatch(/aborted due to timeout/u);
    expect(await exists(path.join(root, "state/social/pauses/connections/social-connection-caught-up-threads.json"))).toBe(true);
    const providerReceipts = await readdir(path.join(root, "state/social/provider-receipts"));
    expect(await json(path.join(root, "state/social/provider-receipts", providerReceipts[0]!))).toMatchObject({ state: "ambiguous", reconciliationRef: null, rawPayloadExcluded: true });

    const second = network([], commit);
    const again = await publish(root, second.fetchImpl);
    expect(again).toMatchObject({ published: 0, ambiguous: 0 });
    expect(second.fetchImpl).not.toHaveBeenCalled();
  });
});

describe("a Meta container that ends ERROR fails the item, because Meta has said nothing will publish", () => {
  it("records a refusal: the item fails for owner review, the connection pauses, and nothing resends", async () => {
    const { root, commit } = await unlockedCheckout(1);
    const { fetchImpl, meta } = network(scenario("container-error"), commit);

    const report = await publish(root, fetchImpl);

    expect(report).toMatchObject({ status: "complete", published: 0, ambiguous: 0, rejected: 1, publishHeld: 0 });
    expect(meta.seen.some((request) => request.url.endsWith("/threads_publish"))).toBe(false);
    expect(meta.remaining()).toBe(0);
    const item = CapabilityAwareQueueItemSchema.parse(await json(path.join(root, "state/social/queue/item.json")));
    expect(item).toMatchObject({ status: "failed", attempt: { lastError: expect.stringContaining("ERROR (UNKNOWN) before publish; nothing was published") } });
    const [providerReceipt] = await readdir(path.join(root, "state/social/provider-receipts"));
    expect(await json(path.join(root, "state/social/provider-receipts", providerReceipt!))).toMatchObject({ state: "failed", remoteId: null, reconciliationRef: null });
    const [receipt] = await readdir(path.join(root, "state/social/posts"));
    expect(await json(path.join(root, "state/social/posts", receipt!))).toMatchObject({ outcome: "failed", verifiedLive: false, remoteId: null });
    expect(await exists(path.join(root, "state/social/pauses/connections/social-connection-caught-up-threads.json"))).toBe(true);
    expect(await exists(path.join(root, "state/social/publish-holds/item.json"))).toBe(false);

    const second = network([], commit);
    const again = await publish(root, second.fetchImpl);
    expect(again).toMatchObject({ published: 0, ambiguous: 0, rejected: 0 });
    expect(second.fetchImpl).not.toHaveBeenCalled();
  });
});

describe("nothing is sent while connections are held", () => {
  it("never reaches jsDelivr or Meta for approved image items against the committed registry", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "social-meta-held-"));
    roots.push(stateRoot);
    await writeActivation(stateRoot);
    for (const frames of [1, 5]) {
      await writeJson(path.join(stateRoot, `social/queue/item-${frames}.json`), approvedItem(frames, "a".repeat(64)));
    }
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("the publisher reached the network while every connection is held");
    });

    const report = await runSocialPublisher({
      validateOnly: false,
      dryIfDisabled: false,
      now: NOW,
      environment: { SOCIAL_KILL_SWITCH: "false", META_GRAPH_API_VERSION: "v26.0", CAUGHT_UP_THREADS_ACCESS_TOKEN: TOKEN, CAUGHT_UP_THREADS_USER_ID: "fixture-user" },
      repoRoot,
      configRoot: committedConfigRoot,
      stateRoot,
      fetchImpl,
      adapter: createMetaPublishAdapter({}, fetchImpl, { sleep: async () => undefined })
    });

    expect(report).toMatchObject({ status: "draft_only", published: 0, ambiguous: 0, assetHeld: 0, publishHeld: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
