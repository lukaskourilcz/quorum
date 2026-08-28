import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderConnectionBindingSchema, providerBindingHash } from "../src/contracts/social-provider.js";
import { repoRoot } from "../src/paths.js";
import type { PublishAdapter } from "../src/social/publish.js";
import { CapabilityAwareQueueItemSchema, capabilityAwareQueuePayloadHash } from "../src/social/queue.js";
import { runSocialPublisher } from "../src/social/runner.js";
import { SocialProviderRegistrySchema } from "../src/social/providers.js";
import { SocialPublisherRegistrySchema, migrateLegacyQueueItem } from "../src/social/publisher-targets.js";

const roots: string[] = [];

async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function activeFixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "social-provider-runner-"));
  roots.push(root);
  const config = path.join(root, "config");
  const state = path.join(root, "state");
  await mkdir(config, { recursive: true });
  for (const name of ["channels.json", "venture-capabilities.json", "social-publisher-registry.json", "social-providers.json"]) {
    await cp(path.join(repoRoot, "config", name), path.join(config, name));
  }

  const publisher = SocialPublisherRegistrySchema.parse(await json(path.join(config, "social-publisher-registry.json")));
  const profile = publisher.profiles.find(({ id }) => id === "social-profile-caught-up")!;
  profile.lifecycle = "active";
  profile.liveEligible = true;
  const connection = publisher.connections.find(({ id }) => id === "social-connection-caught-up-threads")!;
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
  const threads = channels.channels.find(({ id }) => id === "threads")!;
  threads.mode = "autopublish";
  threads.enabledByHumanAt = "2026-08-27T09:00:00.000Z";
  await writeJson(path.join(config, "channels.json"), channels);

  const legacy = await json(path.join(repoRoot, "state/social/queue/2026-08-05-cs-threads.json"));
  const migrated = migrateLegacyQueueItem(legacy, publisher);
  const draft = {
    ...migrated,
    publishWindow: { notBefore: "2026-08-27T09:00:00.000Z", notAfter: "2026-08-27T11:00:00.000Z" },
    content: { ...migrated.content, contentHash: "0".repeat(64) }
  };
  const item = CapabilityAwareQueueItemSchema.parse({ ...draft, content: { ...draft.content, contentHash: capabilityAwareQueuePayloadHash(draft) } });
  await writeJson(path.join(state, "social/queue/item.json"), item);
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
    }])) ,
    updatedAt: "2026-08-27T09:30:00.000Z"
  });
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("provider-aware social runner", () => {
  it("records an ambiguous provider receipt and never sends the item a second time", async () => {
    const root = await activeFixtureRoot();
    const publish = vi.fn<PublishAdapter["publish"]>().mockRejectedValue(new Error("timeout access_token=secret-value"));
    const verify = vi.fn<PublishAdapter["verify"]>();
    const adapter: PublishAdapter = { publish, verify, findByIdempotencyKey: vi.fn().mockResolvedValue(null) };
    const options = {
      validateOnly: false,
      dryIfDisabled: false,
      now: new Date("2026-08-27T10:00:00.000Z"),
      environment: {
        SOCIAL_KILL_SWITCH: "false",
        META_GRAPH_API_VERSION: "v26.0",
        META_THREADS_ACCESS_TOKEN: "fixture-global",
        CAUGHT_UP_THREADS_ACCESS_TOKEN: "secret-value",
        CAUGHT_UP_THREADS_USER_ID: "fixture-user"
      },
      repoRoot: root,
      configRoot: path.join(root, "config"),
      stateRoot: path.join(root, "state"),
      adapter
    } as const;

    const first = await runSocialPublisher(options);
    const second = await runSocialPublisher(options);
    expect(first).toMatchObject({ status: "complete", published: 0, ambiguous: 1 });
    expect(second).toMatchObject({ status: "draft_only", published: 0 });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(verify).not.toHaveBeenCalled();

    const queue = await json(path.join(root, "state/social/queue/item.json")) as { status: string; receiptId: string };
    const canonical = await json(path.join(root, `state/social/posts/${queue.receiptId}.json`)) as Record<string, unknown>;
    const providerRef = String(canonical.providerDeliveryReceiptRef);
    const providerReceipt = await json(path.join(root, providerRef)) as Record<string, unknown>;
    expect(queue.status).toBe("needs_reconciliation");
    expect(canonical).toMatchObject({ outcome: "paused", verifiedLive: false });
    expect(providerReceipt).toMatchObject({ state: "ambiguous", rawPayloadExcluded: true });
    expect(providerReceipt).not.toHaveProperty("rawPayload");
    expect(JSON.stringify({ canonical, providerReceipt })).not.toContain("secret-value");
  });
});
