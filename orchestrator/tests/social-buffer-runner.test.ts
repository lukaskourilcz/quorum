import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderConnectionBindingSchema, providerBindingHash } from "../src/contracts/social-provider.js";
import { repoRoot } from "../src/paths.js";
import { SocialProviderRegistrySchema } from "../src/social/providers.js";
import { SocialPublisherRegistrySchema, migrateLegacyQueueItem } from "../src/social/publisher-targets.js";
import { CapabilityAwareQueueItemSchema, capabilityAwareQueuePayloadHash } from "../src/social/queue.js";
import { runSocialPublisher } from "../src/social/runner.js";
import { replayBuffer, type BufferOperation } from "./fixtures/buffer-replay.js";

/*
 * quorum#571: the runner sends a LinkedIn item through the Buffer adapter only when every gate is
 * open, and holds it when the binding is held.
 *
 * marketingShark is not a publishing venture until the owner countersigns
 * devshark-social-2026-09a, so a devShark item cannot reach the adapter at all. To isolate the
 * binding as the one closed gate, these fixtures give Caught Up (a publishing venture) a LinkedIn
 * connection on Buffer inside a temporary copy of the configuration. Nothing here touches the
 * committed registries, and every Buffer answer is replayed from tests/fixtures/buffer/.
 */

const roots: string[] = [];
const NOW = new Date("2026-09-26T09:00:00.000Z");
const API_KEY = "fixture-buffer-key-never-logged";
const CHANNEL_ID = "fixture-channel-devshark-linkedin";
const environment = {
  SOCIAL_KILL_SWITCH: "false",
  BUFFER_API_KEY: API_KEY,
  BUFFER_CHANNEL_ID_CAUGHT_UP_LINKEDIN: CHANNEL_ID,
  PUBLIC_SITE_URL: "https://boardlessai.example"
};

async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function linkedInRoot(bindingMode: "held" | "active"): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "social-buffer-runner-"));
  roots.push(root);
  const config = path.join(root, "config");
  await mkdir(config, { recursive: true });
  for (const name of ["channels.json", "venture-capabilities.json", "social-publisher-registry.json", "social-providers.json"]) {
    await cp(path.join(repoRoot, "config", name), path.join(config, name));
  }

  const publisher = SocialPublisherRegistrySchema.parse(await json(path.join(config, "social-publisher-registry.json")));
  const profile = publisher.profiles.find(({ id }) => id === "social-profile-caught-up")!;
  profile.lifecycle = "active";
  profile.liveEligible = true;
  const template = publisher.connections.find(({ id }) => id === "social-connection-devshark-linkedin")!;
  publisher.connections.push({
    ...structuredClone(template),
    id: "social-connection-caught-up-linkedin",
    profileId: profile.id,
    nativeAccountIdRef: "BUFFER_CHANNEL_ID_CAUGHT_UP_LINKEDIN",
    mode: "autopublish",
    health: { status: "healthy", unavailableReason: null },
    enabledByHumanAt: "2026-09-25T09:00:00.000Z"
  });
  await writeJson(path.join(config, "social-publisher-registry.json"), SocialPublisherRegistrySchema.parse(publisher));

  const providers = SocialProviderRegistrySchema.parse(await json(path.join(config, "social-providers.json")));
  // What the owner's recorded live test would do: raise Buffer's verdict. The binding decides.
  providers.providers.find(({ id }) => id === "buffer")!.verdict = "enabled";
  const devShark = providers.bindings.find(({ providerId }) => providerId === "buffer")!;
  const binding = {
    ...structuredClone(devShark),
    id: "social-provider-binding-caught-up-linkedin-buffer",
    connectionId: "social-connection-caught-up-linkedin",
    credentialRefs: ["BUFFER_API_KEY", "BUFFER_CHANNEL_ID_CAUGHT_UP_LINKEDIN"],
    ...(bindingMode === "active" ? {
      mode: "active" as const,
      ownerActivationRef: "owner:provider-activation-fixture",
      authorityRef: "owner:routine-authority-fixture",
      effectiveAt: "2026-09-25T09:00:00.000Z",
      health: { state: "healthy" as const, unavailableReason: "none" as const, lastVerifiedAt: "2026-09-25T09:00:00.000Z" }
    } : {})
  };
  providers.bindings.push(ProviderConnectionBindingSchema.parse({ ...binding, bindingHash: providerBindingHash(binding) }));
  await writeJson(path.join(config, "social-providers.json"), SocialProviderRegistrySchema.parse(providers));

  const channels = await json(path.join(config, "channels.json")) as { channels: Array<{ id: string; mode: string; enabledByHumanAt: string | null }> };
  const linkedin = channels.channels.find(({ id }) => id === "linkedin")!;
  linkedin.mode = "autopublish";
  linkedin.enabledByHumanAt = "2026-09-25T09:00:00.000Z";
  await writeJson(path.join(config, "channels.json"), channels);

  const legacy = await json(path.join(repoRoot, "state/social/queue/2026-08-05-cs-threads.json"));
  const migrated = migrateLegacyQueueItem(legacy, publisher);
  const draft = {
    ...migrated,
    id: "caught-up-2026-09-26-cs-linkedin",
    channel: "linkedin" as const,
    utm: { ...migrated.utm, source: "linkedin" as const },
    target: { ...migrated.target, connectionBindingRef: "social-connection-caught-up-linkedin" },
    content: { ...migrated.content, assetPaths: ["/social/caught-up/2026-09-26/cs/1.png"] },
    publishWindow: { notBefore: "2026-09-26T08:00:00.000Z", notAfter: "2026-09-26T12:00:00.000Z" }
  };
  await writeJson(path.join(root, "state/social/queue/item.json"), CapabilityAwareQueueItemSchema.parse({
    ...draft,
    content: { ...draft.content, contentHash: capabilityAwareQueuePayloadHash(draft) }
  }));
  await writeJson(path.join(root, "state/social/activation.json"), {
    schemaVersion: "social-activation/1",
    ventures: Object.fromEntries(["caught-up", "mma-files", "titty-tuesdays"].map((venture) => [venture, {
      status: venture === "caught-up" ? "enabled" : "locked",
      counter: venture === "caught-up" ? 7 : 0,
      required: venture === "caught-up" ? 7 : 1,
      reason: venture === "caught-up" ? "Fixture authority is explicit." : "Fixture remains locked.",
      updatedAt: NOW.toISOString(),
      unlockedAt: venture === "caught-up" ? "2026-09-25T09:00:00.000Z" : null,
      decisionReference: "D2-autonomy-build-2026-08-01"
    }])),
    updatedAt: NOW.toISOString()
  });
  return root;
}

async function run(root: string, script: Partial<Record<BufferOperation, Array<string | Error>>>) {
  const replay = replayBuffer(script);
  const report = await runSocialPublisher({
    validateOnly: false,
    dryIfDisabled: false,
    now: NOW,
    environment,
    fetchImpl: replay.fetchImpl,
    repoRoot: root,
    configRoot: path.join(root, "config"),
    stateRoot: path.join(root, "state")
  });
  return { report, calls: replay.calls };
}

async function everythingWritten(root: string): Promise<string> {
  const entries = await readdir(path.join(root, "state"), { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
  return (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("the runner and the Buffer LinkedIn transport", () => {
  it("holds the item and sends no request while the Buffer binding is held", async () => {
    const root = await linkedInRoot("held");
    const before = await readFile(path.join(root, "state/social/queue/item.json"), "utf8");
    const { report, calls } = await run(root, {});
    expect(report).toMatchObject({ status: "draft_only", due: 1, published: 0, ambiguous: 0, rejected: 0 });
    expect(calls).toHaveLength(0);
    expect(await readFile(path.join(root, "state/social/queue/item.json"), "utf8")).toBe(before);
  });

  it("publishes once through Buffer when every gate is open, and records a verified $0 receipt", async () => {
    const root = await linkedInRoot("active");
    const { report, calls } = await run(root, {
      BoardlessBufferChannel: ["channel-linkedin-page"],
      BoardlessBufferCreatePost: ["create-post-success"],
      BoardlessBufferPost: ["post-sent"]
    });
    expect(report).toMatchObject({ status: "complete", published: 1, ambiguous: 0, rejected: 0 });
    expect(calls.map(({ operation }) => operation)).toEqual(["BoardlessBufferChannel", "BoardlessBufferCreatePost", "BoardlessBufferPost"]);

    const item = await json(path.join(root, "state/social/queue/item.json")) as { status: string; receiptId: string };
    const canonical = await json(path.join(root, `state/social/posts/${item.receiptId}.json`)) as Record<string, unknown>;
    const provider = await json(path.join(root, String(canonical.providerDeliveryReceiptRef))) as Record<string, unknown>;
    expect(item.status).toBe("published");
    expect(canonical).toMatchObject({ outcome: "published", channel: "linkedin", providerId: "buffer", remoteId: "fixture-post-0001", verifiedLive: true });
    expect(provider).toMatchObject({
      providerId: "buffer",
      state: "published",
      publicUrl: "https://www.linkedin.com/feed/update/urn:li:share:7000000000000000001/",
      status: "Buffer post verified sent to LinkedIn.",
      actualCostUsd: 0,
      rawPayloadExcluded: true
    });
    expect(await everythingWritten(root)).not.toContain(API_KEY);

    const again = await run(root, {});
    expect(again.calls).toHaveLength(0);
  });

  it("fails a rate-limited item for owner review, records the limit and never resends it", async () => {
    const root = await linkedInRoot("active");
    const { report } = await run(root, { BoardlessBufferChannel: ["channel-linkedin-page"], BoardlessBufferCreatePost: ["rate-limited"] });
    expect(report).toMatchObject({ status: "complete", published: 0, ambiguous: 0, rejected: 1 });

    const item = await json(path.join(root, "state/social/queue/item.json")) as { status: string; receiptId: string };
    const canonical = await json(path.join(root, `state/social/posts/${item.receiptId}.json`)) as Record<string, unknown>;
    const provider = await json(path.join(root, String(canonical.providerDeliveryReceiptRef))) as Record<string, unknown>;
    const health = await readdir(path.join(root, "state/social/provider-health"));
    const snapshot = await json(path.join(root, "state/social/provider-health", health[0]!)) as Record<string, unknown>;
    expect(item.status).toBe("failed");
    expect(canonical).toMatchObject({ outcome: "failed", remoteId: null, verifiedLive: false });
    expect(String(canonical.error)).toContain("nothing was created; retry after 753 s");
    expect(provider).toMatchObject({ state: "failed", remoteId: null, publicUrl: null });
    expect(snapshot).toMatchObject({ providerId: "buffer", rateLimitStatus: "limited" });
    expect(await json(path.join(root, "state/social/pauses/connections/social-connection-caught-up-linkedin.json"))).toMatchObject({
      reason: expect.stringContaining("was refused by its provider")
    });

    expect((await run(root, {})).calls).toHaveLength(0);
  });

  it("holds an unanswered create for reconciliation and never sends it a second time", async () => {
    const root = await linkedInRoot("active");
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    const { report } = await run(root, { BoardlessBufferChannel: ["channel-linkedin-page"], BoardlessBufferCreatePost: [timeout] });
    expect(report).toMatchObject({ status: "complete", published: 0, ambiguous: 1, rejected: 0 });

    const item = await json(path.join(root, "state/social/queue/item.json")) as { status: string; receiptId: string };
    const canonical = await json(path.join(root, `state/social/posts/${item.receiptId}.json`)) as Record<string, unknown>;
    const provider = await json(path.join(root, String(canonical.providerDeliveryReceiptRef))) as Record<string, unknown>;
    expect(item.status).toBe("needs_reconciliation");
    expect(canonical).toMatchObject({ outcome: "paused", verifiedLive: false });
    expect(provider).toMatchObject({ state: "ambiguous", rawPayloadExcluded: true });

    const again = await run(root, {});
    expect(again.calls.filter(({ operation }) => operation === "BoardlessBufferCreatePost")).toHaveLength(0);
  });

  it("sends nothing for a devShark LinkedIn item on the committed configuration, whatever the environment", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-buffer-committed-"));
    roots.push(root);
    const publisher = SocialPublisherRegistrySchema.parse(await json(path.join(repoRoot, "config/social-publisher-registry.json")));
    const legacy = await json(path.join(repoRoot, "state/social/queue/2026-08-05-cs-threads.json"));
    const migrated = migrateLegacyQueueItem(legacy, publisher);
    const draft = {
      ...migrated,
      id: "2026-09-26-devshark-en-linkedin",
      sourceVentureId: "marketingshark",
      target: { ...migrated.target, profileId: "social-profile-devshark-linkedin", connectionBindingRef: "social-connection-devshark-linkedin" },
      channel: "linkedin" as const,
      locale: "en" as const,
      utm: { ...migrated.utm, source: "linkedin" as const },
      status: "queued" as const,
      publishWindow: { notBefore: "2026-09-26T08:00:00.000Z", notAfter: "2026-09-26T12:00:00.000Z" }
    };
    await writeJson(path.join(root, "state/social/queue/item.json"), CapabilityAwareQueueItemSchema.parse({
      ...draft,
      content: { ...draft.content, contentHash: capabilityAwareQueuePayloadHash(draft) }
    }));
    await cp(path.join(repoRoot, "state/social/activation.json"), path.join(root, "state/social/activation.json"));
    const replay = replayBuffer({});
    const report = await runSocialPublisher({
      validateOnly: false,
      dryIfDisabled: false,
      now: NOW,
      environment: { ...environment, BUFFER_CHANNEL_ID_DEVSHARK_LINKEDIN: CHANNEL_ID },
      fetchImpl: replay.fetchImpl,
      repoRoot: root,
      stateRoot: path.join(root, "state")
    });
    expect(report).toMatchObject({ published: 0, ambiguous: 0, rejected: 0 });
    expect(replay.calls).toHaveLength(0);
  });
});
