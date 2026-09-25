import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { configRoot, repoRoot } from "../src/paths.js";
import { BUFFER_API_URL, BUFFER_API_VERSION, BUFFER_REQUESTS_PER_POST } from "../src/social/buffer-api.js";
import { BUFFER_LINKEDIN_FORMAT, createBufferPublishAdapter, planBufferLinkedInPost } from "../src/social/buffer.js";
import { ChannelRegistrySchema, type Channel } from "../src/social/channel-registry.js";
import { SocialProviderRegistrySchema, loadSocialProviderRegistry } from "../src/social/providers.js";
import { ProviderRejectedError } from "../src/social/publish.js";
import { loadSocialPublisherRegistry, migrateLegacyQueueItem, type ResolvedPublisherTarget } from "../src/social/publisher-targets.js";
import { CapabilityAwareQueueItemSchema, capabilityAwareQueuePayloadHash, type CapabilityAwareQueueItem } from "../src/social/queue.js";
import { replayBuffer } from "./fixtures/buffer-replay.js";

// quorum#571: the LinkedIn transport. Every answer below is replayed from tests/fixtures/buffer/,
// transcribed from Buffer's published examples; nothing here reaches the network.

const API_KEY = "fixture-buffer-key-never-logged";
const CHANNEL_ID = "fixture-channel-devshark-linkedin";
const environment = {
  BUFFER_API_KEY: API_KEY,
  BUFFER_CHANNEL_ID_DEVSHARK_LINKEDIN: CHANNEL_ID,
  PUBLIC_SITE_URL: "https://boardlessai.example"
};
const slides = [1, 2, 3, 4, 5].map((slide) => `/social/devshark/2026-09-26/en/${slide}.png`);
const caption = "Which HTML element carries a page's main content?\n\nFive slides, one answer.";

async function linkedInChannel(): Promise<Channel> {
  const registry = ChannelRegistrySchema.parse(JSON.parse(await readFile(path.join(configRoot, "channels.json"), "utf8")) as unknown);
  return registry.channels.find(({ id }) => id === "linkedin")!;
}

async function target(): Promise<ResolvedPublisherTarget> {
  const registry = await loadSocialPublisherRegistry(configRoot);
  const connection = registry.connections.find(({ id }) => id === "social-connection-devshark-linkedin")!;
  return {
    profile: registry.profiles.find(({ id }) => id === connection.profileId)!,
    connection,
    credentialRef: connection.credentialRef!,
    nativeAccountIdRef: connection.nativeAccountIdRef!,
    providerId: "buffer",
    apiVersion: connection.connector.apiVersion
  };
}

async function item(overrides: { text?: string; assetPaths?: string[]; altText?: string | null } = {}): Promise<CapabilityAwareQueueItem> {
  const legacy = JSON.parse(await readFile(path.join(repoRoot, "state/social/queue/2026-08-05-cs-threads.json"), "utf8")) as unknown;
  const migrated = migrateLegacyQueueItem(legacy, await loadSocialPublisherRegistry(configRoot));
  const base = {
    ...migrated,
    id: "2026-09-26-devshark-en-linkedin",
    sourceVentureId: "marketingshark",
    releaseId: "marketingshark-2026-09-26-devshark",
    campaignId: "marketingshark-2026-09-26-devshark",
    target: { ...migrated.target, profileId: "social-profile-devshark-linkedin", connectionBindingRef: "social-connection-devshark-linkedin" },
    sourcePackage: {
      schemaVersion: "approved-publish-package/1" as const,
      artifactRef: "state/ventures/marketingshark/packages/2026-09-26/devshark/package.json",
      packageHash: "c".repeat(64)
    },
    locale: "en" as const,
    channel: "linkedin" as const,
    destination: "https://devshark.app/",
    utm: { source: "linkedin" as const, medium: "organic_social" as const, campaign: "marketingshark-2026-09-26-devshark", content: "quiz-carousel-en" },
    content: {
      ...migrated.content,
      text: overrides.text ?? caption,
      assetPaths: overrides.assetPaths ?? slides,
      altText: overrides.altText === undefined ? "Five slides of a devShark HTML question and its answer." : overrides.altText
    },
    status: "queued" as const,
    migration: null,
    approvalProvenance: { approvalRef: "fixture:approval", selectionRef: "fixture:selection", policyRef: null },
    selectedBy: "MAKO" as const
  };
  return CapabilityAwareQueueItemSchema.parse({ ...base, content: { ...base.content, contentHash: capabilityAwareQueuePayloadHash(base) } });
}

async function rejection(promise: Promise<unknown>): Promise<ProviderRejectedError> {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(ProviderRejectedError);
  return error as ProviderRejectedError;
}

const trackedLink = "https://devshark.app/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=marketingshark-2026-09-26-devshark&utm_content=quiz-carousel-en";

describe("Buffer LinkedIn adapter: create", () => {
  it("checks the Page channel, then creates one shareNow post with slide one, the caption and the tracked link", async () => {
    const { fetchImpl, calls } = replayBuffer({ BoardlessBufferChannel: ["channel-linkedin-page"], BoardlessBufferCreatePost: ["create-post-success"] });
    const adapter = createBufferPublishAdapter(environment, fetchImpl);
    const result = await adapter.publish(await linkedInChannel(), await item(), "a".repeat(64), await target());

    expect(result).toEqual({ remoteId: "fixture-post-0001" });
    expect(calls.map(({ url, operation, authorization }) => [url, operation, authorization])).toEqual([
      [BUFFER_API_URL, "BoardlessBufferChannel", `Bearer ${API_KEY}`],
      [BUFFER_API_URL, "BoardlessBufferCreatePost", `Bearer ${API_KEY}`]
    ]);
    expect(calls[1]!.variables).toEqual({
      input: {
        text: `${caption}\n\n${trackedLink}`,
        channelId: CHANNEL_ID,
        schedulingType: "automatic",
        mode: "shareNow",
        assets: [{ image: { url: "https://boardlessai.example/social/devshark/2026-09-26/en/1.png", metadata: { altText: "Five slides of a devShark HTML question and its answer." } } }]
      }
    });
    // Buffer never picks the time: no queue slot, no custom schedule.
    expect(JSON.stringify(calls[1]!.variables)).not.toMatch(/addToQueue|customScheduled|dueAt/u);
  });

  it("keeps the committed format at single-image until the owner's live test is recorded", () => {
    expect(BUFFER_LINKEDIN_FORMAT).toBe("single-image");
  });

  it("sends every slide with the caption as approved once multi-image is confirmed", async () => {
    const plan = planBufferLinkedInPost(await item(), "multi-image", (asset) => `https://cdn.example${asset}`);
    expect(plan).toMatchObject({ format: "multi-image", text: caption });
    expect(plan.imageUrls).toEqual(slides.map((slide) => `https://cdn.example${slide}`));
  });

  it("adds no second link to a caption that already carries the destination, and posts text alone", async () => {
    const linked = `${caption}\n\nhttps://devshark.app`;
    expect(planBufferLinkedInPost(await item({ text: linked, assetPaths: [] }), "single-image", String)).toEqual({
      text: linked, imageUrls: [], format: "text", altText: "Five slides of a devShark HTML question and its answer."
    });
  });

  it("returns the first post for a repeated idempotency key without a second create", async () => {
    const { fetchImpl, calls } = replayBuffer({ BoardlessBufferChannel: ["channel-linkedin-page"], BoardlessBufferCreatePost: ["create-post-success"] });
    const adapter = createBufferPublishAdapter(environment, fetchImpl);
    const [channel, queued, resolved] = await Promise.all([linkedInChannel(), item(), target()]);
    await adapter.publish(channel, queued, "b".repeat(64), resolved);
    expect(await adapter.publish(channel, queued, "b".repeat(64), resolved)).toEqual({ remoteId: "fixture-post-0001" });
    expect(await adapter.findByIdempotencyKey!(channel, "b".repeat(64), resolved)).toEqual({ remoteId: "fixture-post-0001" });
    expect(calls.filter(({ operation }) => operation === "BoardlessBufferCreatePost")).toHaveLength(1);
  });
});

describe("Buffer LinkedIn adapter: verify", () => {
  it("reads the post back until Buffer reports it sent, and returns the LinkedIn permalink", async () => {
    const { fetchImpl, calls } = replayBuffer({ BoardlessBufferPost: ["post-sending", "post-sent"] });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const adapter = createBufferPublishAdapter(environment, fetchImpl, { sleep });
    await expect(adapter.verify(await linkedInChannel(), await item(), "fixture-post-0001", await target())).resolves.toEqual({
      remoteId: "fixture-post-0001",
      remoteUrl: "https://www.linkedin.com/feed/update/urn:li:share:7000000000000000001/"
    });
    expect(calls.map(({ variables }) => variables)).toEqual([{ input: { id: "fixture-post-0001" } }, { input: { id: "fixture-post-0001" } }]);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("never verifies a failed, unsent or foreign post", async () => {
    const [channel, queued, resolved] = await Promise.all([linkedInChannel(), item(), target()]);
    const sleep = async () => {};
    const failed = replayBuffer({ BoardlessBufferPost: ["post-error"] });
    await expect(createBufferPublishAdapter(environment, failed.fetchImpl, { sleep }).verify(channel, queued, "fixture-post-0001", resolved))
      .rejects.toThrow(/LinkedIn send failed: LinkedIn could not fetch the image/u);
    const stuck = replayBuffer({ BoardlessBufferPost: ["post-sending", "post-sending", "post-sending"] });
    await expect(createBufferPublishAdapter(environment, stuck.fetchImpl, { sleep }).verify(channel, queued, "fixture-post-0001", resolved))
      .rejects.toThrow(/has not sent the post yet \(status sending\)/u);
    expect(stuck.calls).toHaveLength(3);
    const foreign = replayBuffer({ BoardlessBufferPost: ["post-sent"] });
    await expect(createBufferPublishAdapter(environment, foreign.fetchImpl, { sleep }).verify(channel, queued, "another-post", resolved))
      .rejects.toThrow(/does not match/u);
    // A refused read proves nothing about the post, so it is never a definite rejection.
    const limited = replayBuffer({ BoardlessBufferPost: ["rate-limited"] });
    const error = await createBufferPublishAdapter(environment, limited.fetchImpl, { sleep }).verify(channel, queued, "fixture-post-0001", resolved).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ProviderRejectedError);
  });
});

describe("Buffer LinkedIn adapter: ambiguous and refused answers", () => {
  it("keeps a create that timed out, failed on Buffer's side or answered unreadably ambiguous", async () => {
    const [channel, queued, resolved] = await Promise.all([linkedInChannel(), item(), target()]);
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    for (const answer of [timeout, "create-post-unexpected"]) {
      const { fetchImpl } = replayBuffer({ BoardlessBufferChannel: ["channel-linkedin-page"], BoardlessBufferCreatePost: [answer] });
      const error = await createBufferPublishAdapter(environment, fetchImpl).publish(channel, queued, "c".repeat(64), resolved).catch((reason: unknown) => reason);
      expect(error, String(answer)).toBeInstanceOf(Error);
      expect(error, String(answer)).not.toBeInstanceOf(ProviderRejectedError);
    }
  });

  it("refuses a rate-limited create as certain to have created nothing, with Buffer's wait", async () => {
    const { fetchImpl } = replayBuffer({ BoardlessBufferChannel: ["channel-linkedin-page"], BoardlessBufferCreatePost: ["rate-limited"] });
    const error = await rejection(createBufferPublishAdapter(environment, fetchImpl).publish(await linkedInChannel(), await item(), "d".repeat(64), await target()));
    expect(error).toMatchObject({ reason: "rate-limited", retryAfterSeconds: 753 });
    expect(error.message).toBe("Buffer rate limit reached on the 15m window; nothing was created; retry after 753 s");
  });

  it("stops before any create when the channel check is refused or cannot cover a whole post", async () => {
    const [channel, queued, resolved] = await Promise.all([linkedInChannel(), item(), target()]);
    for (const [answer, reason, message] of [
      ["rate-limited", "rate-limited", /rate limit/u],
      ["channel-low-quota", "rate-limited", new RegExp(`5 requests left.*up to ${BUFFER_REQUESTS_PER_POST}`, "u")],
      ["channel-linkedin-profile", "channel-unavailable", /LinkedIn profile, not a Page/u],
      ["unauthorized", "channel-unavailable", /UNAUTHORIZED/u]
    ] as const) {
      const { fetchImpl, calls } = replayBuffer({ BoardlessBufferChannel: [answer] });
      const error = await rejection(createBufferPublishAdapter(environment, fetchImpl).publish(channel, queued, "e".repeat(64), resolved));
      expect(error.reason, answer).toBe(reason);
      expect(error.message, answer).toMatch(message);
      expect(calls.map(({ operation }) => operation), answer).toEqual(["BoardlessBufferChannel"]);
    }
  });

  it("refuses typed validation and plan-limit answers as definite", async () => {
    const [channel, queued, resolved] = await Promise.all([linkedInChannel(), item(), target()]);
    for (const [answer, reason] of [["create-post-invalid-input", "invalid-input"], ["create-post-limit-reached", "plan-limit"], ["unauthorized", "unauthorized"]] as const) {
      const { fetchImpl } = replayBuffer({ BoardlessBufferChannel: ["channel-linkedin-page"], BoardlessBufferCreatePost: [answer] });
      const error = await rejection(createBufferPublishAdapter(environment, fetchImpl).publish(channel, queued, "f".repeat(64), resolved));
      expect(error.reason, answer).toBe(reason);
      expect(error.message, answer).not.toContain(API_KEY);
    }
  });

  it("refuses anything but its own LinkedIn binding, and an over-long post, before any request", async () => {
    const [channel, queued, resolved] = await Promise.all([linkedInChannel(), item(), target()]);
    const cases: Array<[string, Parameters<ReturnType<typeof createBufferPublishAdapter>["publish"]>, NodeJS.ProcessEnv]> = [
      ["no target", [channel, queued, "0".repeat(64), undefined], environment],
      ["Direct Meta target", [channel, queued, "0".repeat(64), { ...resolved, providerId: "direct-meta" }], environment],
      ["Instagram channel", [{ ...channel, id: "instagram", connector: "meta_instagram" }, queued, "0".repeat(64), resolved], environment],
      ["stale API version", [channel, queued, "0".repeat(64), { ...resolved, apiVersion: "v1" }], environment],
      ["no Buffer grant", [channel, queued, "0".repeat(64), { ...resolved, connection: { ...resolved.connection, approvedScopes: [] } }], environment],
      ["no channel reference", [channel, queued, "0".repeat(64), resolved], { ...environment, BUFFER_CHANNEL_ID_DEVSHARK_LINKEDIN: "" }],
      ["over-long", [channel, await item({ text: "x".repeat(2_990) }), "0".repeat(64), resolved], environment]
    ];
    for (const [name, args, env] of cases) {
      const { fetchImpl, calls } = replayBuffer({});
      await rejection(createBufferPublishAdapter(env, fetchImpl).publish(...args));
      expect(calls, name).toHaveLength(0);
    }
  });
});

describe("Buffer provider record", () => {
  it("records Buffer as the held LinkedIn-only transport at $0", async () => {
    const registry = await loadSocialProviderRegistry(configRoot);
    const buffer = registry.providers.find(({ id }) => id === "buffer")!;
    const binding = registry.bindings.find(({ providerId }) => providerId === "buffer")!;
    expect(buffer).toMatchObject({
      role: "managed-scheduler",
      supportedPlatforms: ["linkedin"],
      apiVersion: BUFFER_API_VERSION,
      verdict: "held",
      idempotency: { providerKeySupported: false, remoteLookup: "remote-id-only" },
      cost: { plan: "Buffer Free", purchaseAuthorized: false },
      strategyAuthority: false,
      contentGenerationAuthority: false
    });
    expect(buffer.limits.requestOrPostLimit).toContain(`at most ${BUFFER_REQUESTS_PER_POST}`);
    expect(buffer.cost.exitPath).toMatch(/Revoke the API key/u);
    expect(binding).toMatchObject({ providerImplementationVersion: buffer.implementationVersion, providerApiVersion: BUFFER_API_VERSION, mode: "held" });
  });

  it("refuses a registry in which Buffer would serve Instagram or Threads", async () => {
    const registry = await loadSocialProviderRegistry(configRoot);
    for (const platform of ["instagram", "threads"] as const) {
      const widened = structuredClone(registry);
      widened.providers.find(({ id }) => id === "buffer")!.supportedPlatforms.push(platform);
      expect(SocialProviderRegistrySchema.safeParse(widened).success, platform).toBe(false);
    }
  });
});

describe("Buffer's place in the runtime", () => {
  it("reaches Buffer from one module, with one mutation that publishes now and nothing else", async () => {
    const sourceRoot = path.join(repoRoot, "orchestrator/src");
    const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
    const sources = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".ts")).map((entry) => path.join(entry.parentPath, entry.name));
    const callers: string[] = [];
    for (const file of sources) {
      if (/api\.buffer\.com/u.test(await readFile(file, "utf8"))) callers.push(path.relative(repoRoot, file));
    }
    expect(callers).toEqual(["orchestrator/src/social/buffer-api.ts"]);

    const api = await readFile(path.join(sourceRoot, "social/buffer-api.ts"), "utf8");
    expect(api.match(/\bmutation \w+/gu)).toEqual(["mutation BoardlessBufferCreatePost"]);
    expect(api.match(/mode: "\w+"/gu)).toEqual(['mode: "shareNow"']);
    expect(api).not.toMatch(/firstComment|linkAttachment|saveToDraft|createIdea|deletePost|editPost|metrics|metricool\.com|api\.ayrshare\.com|hook\.us\d+\.make\.com/u);
  });
});
