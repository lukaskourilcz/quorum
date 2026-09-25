import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { configRoot, repoRoot } from "../src/paths.js";
import { SocialConnectionSchema, type SocialConnection } from "../src/contracts/social-distribution.js";
import type { Channel } from "../src/social/channel-registry.js";
import type { VerifiedSocialAsset } from "../src/social/media/assets.js";
import { createMetaPublishAdapter, threadsTextLength } from "../src/social/meta.js";
import { SocialPublishHoldError } from "../src/social/publish.js";
import type { ResolvedPublisherTarget } from "../src/social/publisher-targets.js";
import { CapabilityAwareQueueItemSchema, capabilityAwareQueuePayloadHash, type CapabilityAwareQueueItem } from "../src/social/queue.js";
import instagramFixture from "./fixtures/social-meta/instagram.json" with { type: "json" };
import threadsFixture from "./fixtures/social-meta/threads.json" with { type: "json" };
import live from "./fixtures/social-meta/unauthenticated.live.json" with { type: "json" };
import { replayMeta, type MetaExchange } from "./fixtures/social-meta/replay.js";

const COMMIT = "81dced6d1d06ab4c82b4b87f5ee66867cc52215a";
const TOKEN = "fixture-token";
const ENV = {
  META_GRAPH_API_VERSION: "v26.0",
  FIXTURE_THREADS_TOKEN: TOKEN,
  FIXTURE_THREADS_USER: threadsFixture.account.userId,
  FIXTURE_INSTAGRAM_TOKEN: TOKEN,
  FIXTURE_INSTAGRAM_USER: instagramFixture.account.userId
};

const scenario = (fixture: { scenarios: Record<string, unknown> }, name: string) => fixture.scenarios[name] as MetaExchange[];

function channel(id: "threads" | "instagram"): Channel {
  return {
    id,
    specialist: id === "threads" ? "THREADS" : "INSTAGRAM",
    mode: "autopublish",
    connector: id === "threads" ? "meta_threads" : "meta_instagram",
    credentialRef: "unused",
    approvedScopes: ["fixture"],
    nativeFormats: ["text", "image", "carousel"],
    maxOrganicPostsPerDay: 1,
    minHoursBetweenPosts: 20,
    timezone: "Europe/Prague",
    enabledByHumanAt: "2026-09-26T06:00:00.000Z"
  };
}

type Login = SocialConnection["connector"]["loginMode"];

/** An activated connection of the shape B2 registers for devShark, parsed by the real contract. */
function target(platform: "threads" | "instagram", loginMode: Login): ResolvedPublisherTarget {
  const scopes = platform === "threads"
    ? ["threads_basic", "threads_content_publish"]
    : loginMode === "instagram-login"
      ? ["instagram_business_basic", "instagram_business_content_publish"]
      : ["instagram_basic", "instagram_content_publish"];
  const prefix = platform === "threads" ? "FIXTURE_THREADS" : "FIXTURE_INSTAGRAM";
  const connection = SocialConnectionSchema.parse({
    schemaVersion: "social-connection/1",
    id: `social-connection-devshark-${platform}`,
    profileId: `social-profile-devshark-${platform}`,
    platform,
    publicHandle: null,
    nativeAccountId: null,
    connector: { id: `meta-${platform}`, version: "1.0.0", providerId: "direct-meta", apiVersion: "v26.0", loginMode },
    credentialRef: `${prefix}_TOKEN`,
    nativeAccountIdRef: `${prefix}_USER`,
    approvedScopes: scopes,
    supportedCapabilities: ["publish-original"],
    mode: "autopublish",
    health: { status: "healthy", unavailableReason: null },
    tokenExpiresAt: null,
    appReviewExpiresAt: null,
    enabledByHumanAt: "2026-09-26T06:00:00.000Z",
    cadence: { maxOrganicPostsPerDay: 1, minHoursBetweenPosts: 20, timezone: "Europe/Prague" },
    lastVerified: null
  });
  return {
    profile: { id: connection.profileId } as ResolvedPublisherTarget["profile"],
    connection,
    credentialRef: `${prefix}_TOKEN`,
    nativeAccountIdRef: `${prefix}_USER`,
    providerId: "direct-meta",
    apiVersion: "v26.0"
  };
}

function framePath(platform: "threads" | "instagram", slide: number): string {
  return `/social/devshark/2026-09-26/en/slide-0${slide}.${platform === "threads" ? "png" : "jpg"}`;
}

/** What `verifySocialAssets` hands the adapter: the proved URL and each frame's own alt text. */
function proved(platform: "threads" | "instagram", count: number): VerifiedSocialAsset[] {
  return Array.from({ length: count }, (_, index) => ({
    path: framePath(platform, index + 1),
    url: `https://cdn.jsdelivr.net/gh/lukaskourilcz/quorum@${COMMIT}/site/public${framePath(platform, index + 1)}`,
    sha256: String(index + 1).repeat(64),
    contentType: platform === "threads" ? "image/png" as const : "image/jpeg" as const,
    commit: COMMIT,
    altText: threadsFixture.altTexts[index]!
  }));
}

/** An owner-approved item, every check passed, the hash bound: what the publisher hands the adapter. */
function approved(platform: "threads" | "instagram", frames: number, text?: string): CapabilityAwareQueueItem {
  const base = {
    schemaVersion: 2 as const,
    id: `ms-2026-09-26-devshark-en-${platform}`,
    sourceVentureId: "marketingshark",
    releaseId: "marketingshark-2026-09-26-devshark",
    campaignId: "marketingshark-2026-09-26-devshark",
    experimentId: null,
    target: {
      profileId: `social-profile-devshark-${platform}`,
      profileRole: "venture-primary" as const,
      role: "primary" as const,
      connectionBindingRef: `social-connection-devshark-${platform}`,
      capabilityRef: null,
      amplifierEligibilityRef: null,
      campaignApprovalRef: null
    },
    action: "publish-original" as const,
    sourcePackage: { schemaVersion: "approved-publish-package/1" as const, artifactRef: "state/ventures/marketingshark/packages/2026-09-26/devshark/package.json", packageHash: "a".repeat(64) },
    locale: "en" as const,
    variant: "A" as const,
    channel: platform,
    objective: "value_action" as const,
    audience: "Working developers who want one real question a day",
    destination: "https://devshark.example/",
    utm: { source: platform, medium: "organic_social" as const, campaign: "marketingshark-devshark", content: "2026-09-26-en-q1" },
    content: {
      text: text ?? (platform === "threads" ? threadsFixture.text : instagramFixture.caption),
      altText: threadsFixture.altTexts.slice(0, Math.max(1, frames)).join(" "),
      assetPaths: Array.from({ length: frames }, (_, index) => framePath(platform, index + 1)),
      factualClaimRefs: ["marketingshark:question:q1"],
      rendererVersion: "carousel-studio-1" as const,
      contentHash: "0".repeat(64)
    },
    publishWindow: { notBefore: "2026-09-26T06:00:00.000Z", notAfter: "2026-09-26T21:00:00.000Z" },
    status: "queued" as const,
    checks: Object.fromEntries(["schema", "brand", "claims", "quill", "keeper", "duplicate", "accessibility", "budget", "capability", "authority", "policy"].map((name) => [name, "pass"])) as CapabilityAwareQueueItem["checks"],
    approvalProvenance: { approvalRef: "fixture:owner-approval", selectionRef: "state/meetings/2026-09-26-ms-daily.json", policyRef: null },
    selectedBy: "MAKO" as const,
    createdAt: "2026-09-26T05:00:00.000Z",
    attempt: null,
    receiptId: null,
    migration: null
  };
  return CapabilityAwareQueueItemSchema.parse({ ...base, content: { ...base.content, contentHash: capabilityAwareQueuePayloadHash(base) } });
}

function adapterFor(exchanges: readonly MetaExchange[]) {
  const replay = replayMeta(exchanges, { accessToken: TOKEN, substitutions: { commit: COMMIT } });
  const sleep = vi.fn(async (_milliseconds: number) => undefined);
  return { ...replay, sleep, adapter: createMetaPublishAdapter(ENV, replay.fetchImpl, { sleep }) };
}

async function publishAndVerify(platform: "threads" | "instagram", loginMode: Login, frames: number, exchanges: readonly MetaExchange[]) {
  const run = adapterFor(exchanges);
  const item = approved(platform, frames);
  const destination = target(platform, loginMode);
  const { remoteId } = await run.adapter.publish(channel(platform), item, "1".repeat(64), destination, proved(platform, frames));
  const verified = await run.adapter.verify(channel(platform), item, remoteId, destination);
  return { ...run, remoteId, verified };
}

describe("Direct Meta: Threads images and carousels (quorum#572)", () => {
  it("still posts text alone: the limit, one TEXT container, the publish, and no wait", async () => {
    const run = await publishAndVerify("threads", "threads-oauth", 0, scenario(threadsFixture, "text"));

    expect(run.verified).toEqual({ remoteId: "18090000000000001", remoteUrl: "https://www.threads.com/@fixture/post/18090000000000001" });
    expect(run.sleep).not.toHaveBeenCalled();
    expect(run.remaining()).toBe(0);
  });

  it("posts one image as an IMAGE container, waits the recommended 30 seconds, and publishes once it is FINISHED", async () => {
    const run = await publishAndVerify("threads", "threads-oauth", 1, scenario(threadsFixture, "image"));

    expect(run.remoteId).toBe("18090000000000011");
    expect(run.sleep.mock.calls).toEqual([[30_000]]);
    expect(run.remaining()).toBe(0);
  });

  it("posts five frames as carousel items and one CAROUSEL container, and polls until the container finishes", async () => {
    const run = await publishAndVerify("threads", "threads-oauth", 5, scenario(threadsFixture, "carousel"));

    // Each child is an IMAGE with is_carousel_item and its own slide's alt text; the text rides on
    // the carousel container only. The replay checked every parameter of every request.
    expect(run.seen.filter((request) => request.params.is_carousel_item === "true").map((request) => request.params.alt_text)).toEqual(threadsFixture.altTexts);
    expect(run.sleep.mock.calls).toEqual([[30_000], [30_000]]);
    expect(run.verified.remoteUrl).toBe("https://www.threads.com/@fixture/post/18090000000000020");
    expect(run.remaining()).toBe(0);
  });

  it("holds Threads text longer than Threads counts, before any request", async () => {
    const run = adapterFor([]);
    // 480 plain characters and six sharks: 480 + 6 x 4 UTF-8 bytes = 504 by Threads' count.
    const text = `${"a".repeat(480)}${"🦈".repeat(6)}`;
    expect(text.length).toBeLessThanOrEqual(500);
    expect(threadsTextLength(text)).toBe(504);

    const refused = run.adapter.publish(channel("threads"), approved("threads", 1, text), "1".repeat(64), target("threads", "threads-oauth"), proved("threads", 1));
    await expect(refused).rejects.toBeInstanceOf(SocialPublishHoldError);
    await expect(refused).rejects.toMatchObject({ reason: "platform-text-limit", quota: null });
    expect(run.fetchImpl).not.toHaveBeenCalled();
  });

  it("counts characters the way Threads documents", () => {
    expect(threadsTextLength("devShark")).toBe(8);
    expect(threadsTextLength("čeština")).toBe(7);
    expect(threadsTextLength("čeština")).toBe(8);
    expect(threadsTextLength("🦈")).toBe(4);
    expect(threadsTextLength("👩‍💻")).toBe(11);
  });
});

describe("Direct Meta: Instagram JPEG carousels on both login paths (quorum#572)", () => {
  it("posts devShark's carousel through Instagram Login on graph.instagram.com, captioning only the container", async () => {
    const run = await publishAndVerify("instagram", "instagram-login", 5, scenario(instagramFixture, "carousel"));

    expect(run.seen.every((request) => request.url.startsWith("https://graph.instagram.com/v26.0/"))).toBe(true);
    expect(run.seen.filter((request) => "caption" in request.params)).toHaveLength(1);
    expect(run.seen.filter((request) => request.params.is_carousel_item === "true").map((request) => request.params.image_url))
      .toEqual(proved("instagram", 5).map((asset) => asset.url));
    // Instagram's first status read comes straight away; it waits a minute only while IN_PROGRESS.
    expect(run.sleep).not.toHaveBeenCalled();
    // An IG Media names its public URL `permalink`; `permalink_url` is a Facebook Post field.
    expect(run.seen.at(-1)?.params.fields).toBe("id,permalink");
    expect(run.verified.remoteUrl).toBe("https://www.instagram.com/p/FIXTURE0020/");
    expect(run.remaining()).toBe(0);
  });

  it("posts one JPEG through Facebook Login on graph.facebook.com, as DNESKAi's connection does", async () => {
    const run = await publishAndVerify("instagram", "instagram-facebook-login", 1, scenario(instagramFixture, "image"));

    expect(run.seen.every((request) => request.url.startsWith("https://graph.facebook.com/v26.0/"))).toBe(true);
    expect(run.remoteId).toBe("18100000000000011");
    expect(run.remaining()).toBe(0);
  });

  it("refuses a login path and scope set that do not belong together, before any request", async () => {
    const run = adapterFor([]);
    const facebookScopesOnInstagramLogin = target("instagram", "instagram-facebook-login");
    const mixed = { ...facebookScopesOnInstagramLogin, connection: { ...facebookScopesOnInstagramLogin.connection, connector: { ...facebookScopesOnInstagramLogin.connection.connector, loginMode: "instagram-login" as const } } };

    await expect(run.adapter.publish(channel("instagram"), approved("instagram", 1), "1".repeat(64), mixed, proved("instagram", 1)))
      .rejects.toThrow(/missing an official publish scope/u);
    expect(run.fetchImpl).not.toHaveBeenCalled();
  });
});

describe("Direct Meta reads the publishing limit before any send (quorum#572)", () => {
  it("holds when the limit has no room for one more post, and writes nothing", async () => {
    for (const [platform, loginMode, fixture, total] of [
      ["threads", "threads-oauth", threadsFixture, 250],
      ["instagram", "instagram-login", instagramFixture, 100]
    ] as const) {
      const run = adapterFor(scenario(fixture, "quota-exhausted"));
      const refused = run.adapter.publish(channel(platform), approved(platform, 5), "1".repeat(64), target(platform, loginMode), proved(platform, 5));

      await expect(refused).rejects.toBeInstanceOf(SocialPublishHoldError);
      await expect(refused).rejects.toMatchObject({ reason: "publishing-quota-exhausted", quota: { usage: total, total, durationSeconds: 86_400 } });
      expect(run.seen.map((request) => request.method)).toEqual(["GET"]);
      expect(run.remaining()).toBe(0);
    }
  });

  it("holds when the limit cannot be read, as a missing or expired token answers", async () => {
    for (const [platform, loginMode, answer] of [
      ["threads", "threads-oauth", live.answers["threads-publishing-limit"]],
      ["instagram", "instagram-login", live.answers["instagram-content-publishing-limit"]]
    ] as const) {
      const recorded = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(answer.body), { status: answer.status, headers: answer.headers }));
      const adapter = createMetaPublishAdapter(ENV, recorded, { sleep: async () => undefined });
      const refused = adapter.publish(channel(platform), approved(platform, 1), "1".repeat(64), target(platform, loginMode), proved(platform, 1));

      await expect(refused).rejects.toMatchObject({ reason: "publishing-quota-unreadable", quota: null, message: expect.stringContaining("HTTP 400") });
      expect(recorded).toHaveBeenCalledTimes(1);
      expect(String(recorded.mock.calls[0]?.[0])).toMatch(/_publishing_limit\?fields=quota_usage%2Cconfig&access_token=/u);
    }
  });
});

describe("Direct Meta outcomes the publisher must treat as ambiguous (quorum#572)", () => {
  it("stops at a container ERROR with Meta's error_message, and never calls threads_publish", async () => {
    const run = adapterFor(scenario(threadsFixture, "container-error"));
    const failed = run.adapter.publish(channel("threads"), approved("threads", 1), "1".repeat(64), target("threads", "threads-oauth"), proved("threads", 1));

    await expect(failed).rejects.toThrow(/Threads container is ERROR \(UNKNOWN\) before publish; nothing was published/u);
    await expect(failed).rejects.not.toBeInstanceOf(SocialPublishHoldError);
    expect(run.seen.some((request) => request.url.endsWith("/threads_publish"))).toBe(false);
    expect(run.remaining()).toBe(0);
  });

  it("gives up on a container still IN_PROGRESS after five reads, without publishing it", async () => {
    const [quota, create] = scenario(threadsFixture, "image") as [MetaExchange, MetaExchange];
    const pending: MetaExchange = {
      request: { method: "GET", url: "https://graph.threads.net/v26.0/17890000000000011", params: { fields: "status,error_message" } },
      response: { status: 200, body: { status: "IN_PROGRESS", id: "17890000000000011" } }
    };
    const run = adapterFor([quota, create, pending, pending, pending, pending, pending]);

    await expect(run.adapter.publish(channel("threads"), approved("threads", 1), "1".repeat(64), target("threads", "threads-oauth"), proved("threads", 1)))
      .rejects.toThrow(/still IN_PROGRESS after 5 reads; nothing was published/u);
    expect(run.sleep.mock.calls).toEqual([[30_000], [30_000], [30_000], [30_000], [30_000]]);
    expect(run.remaining()).toBe(0);
  });

  it("surfaces a publish request that timed out as an error, not as a hold", async () => {
    const run = adapterFor(scenario(threadsFixture, "publish-timeout"));
    const failed = run.adapter.publish(channel("threads"), approved("threads", 1), "1".repeat(64), target("threads", "threads-oauth"), proved("threads", 1));

    await expect(failed).rejects.toThrow(/aborted due to timeout/u);
    await expect(failed).rejects.not.toBeInstanceOf(SocialPublishHoldError);
    expect(run.remaining()).toBe(0);
  });
});

describe("the adapter's hosts", () => {
  it("names only official Graph hosts, each on the runtime allowlist", async () => {
    const source = await readFile(path.join(repoRoot, "orchestrator/src/social/meta.ts"), "utf8");
    const allowlist = JSON.parse(await readFile(path.join(configRoot, "network-allowlist.json"), "utf8")) as { runtimeHosts: string[] };
    const hosts = [...new Set(source.match(/graph\.[a-z]+\.(?:com|net)/gu))].sort();

    expect(hosts).toEqual(["graph.facebook.com", "graph.instagram.com", "graph.threads.net"]);
    for (const host of hosts) expect(allowlist.runtimeHosts, host).toContain(host);
  });
});
