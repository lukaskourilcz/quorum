import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import { ProviderConnectionBindingSchema, providerBindingHash } from "../../src/contracts/social-provider.js";
import { repoRoot } from "../../src/paths.js";
import type { PublishAdapter } from "../../src/social/publish.js";
import { SocialPublisherRegistrySchema, migrateLegacyQueueItem } from "../../src/social/publisher-targets.js";
import { SocialProviderRegistrySchema } from "../../src/social/providers.js";
import { CapabilityAwareQueueItemSchema, capabilityAwareQueuePayloadHash, type CapabilityAwareQueueItem } from "../../src/social/queue.js";
import type { SocialPublisherOptions } from "../../src/social/runner.js";

/**
 * Test support for the publisher's own decisions: a throwaway root where DNESKAi's Threads
 * connection is unlocked in every way the runner checks, one owner-approved text post queued inside
 * its window, and a stub adapter, so a test is about what the runner decides and writes.
 */
export const RUNNER_NOW = new Date("2026-08-27T10:00:00.000Z");
export const RUNNER_CONNECTION = "social-connection-caught-up-threads";

export async function readJsonFile(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

export async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function hashedQueueItem(item: CapabilityAwareQueueItem): CapabilityAwareQueueItem {
  return CapabilityAwareQueueItemSchema.parse({ ...item, content: { ...item.content, contentHash: capabilityAwareQueuePayloadHash(item) } });
}

/** The committed legacy post as an owner-approved item, written to `state/social/queue/b-approved.json`. */
export async function unlockedRunnerRoot(roots: string[]): Promise<{ root: string; approved: CapabilityAwareQueueItem }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "social-runner-"));
  roots.push(root);
  const config = path.join(root, "config");
  await mkdir(config, { recursive: true });
  for (const name of ["channels.json", "venture-capabilities.json", "social-publisher-registry.json", "social-providers.json"]) {
    await cp(path.join(repoRoot, "config", name), path.join(config, name));
  }
  const publisher = SocialPublisherRegistrySchema.parse(await readJsonFile(path.join(config, "social-publisher-registry.json")));
  const profile = publisher.profiles.find(({ id }) => id === "social-profile-caught-up")!;
  profile.lifecycle = "active";
  profile.liveEligible = true;
  const connection = publisher.connections.find(({ id }) => id === RUNNER_CONNECTION)!;
  connection.mode = "autopublish";
  connection.health = { status: "healthy", unavailableReason: null };
  connection.enabledByHumanAt = "2026-08-27T09:00:00.000Z";
  await writeJsonFile(path.join(config, "social-publisher-registry.json"), publisher);
  const providers = SocialProviderRegistrySchema.parse(await readJsonFile(path.join(config, "social-providers.json")));
  const index = providers.bindings.findIndex(({ connectionId }) => connectionId === RUNNER_CONNECTION);
  const activated = {
    ...providers.bindings[index]!,
    mode: "active" as const,
    ownerActivationRef: "owner:provider-activation-001",
    authorityRef: "owner:routine-authority-001",
    effectiveAt: "2026-08-27T09:00:00.000Z",
    health: { state: "healthy" as const, unavailableReason: "none" as const, lastVerifiedAt: "2026-08-27T09:00:00.000Z" }
  };
  providers.bindings[index] = ProviderConnectionBindingSchema.parse({ ...activated, bindingHash: providerBindingHash(activated) });
  await writeJsonFile(path.join(config, "social-providers.json"), providers);
  const channels = await readJsonFile(path.join(config, "channels.json")) as { channels: Array<{ id: string; mode: string; enabledByHumanAt: string | null }> };
  const threads = channels.channels.find(({ id }) => id === "threads")!;
  threads.mode = "autopublish";
  threads.enabledByHumanAt = "2026-08-27T09:00:00.000Z";
  await writeJsonFile(path.join(config, "channels.json"), channels);
  await writeJsonFile(path.join(root, "state/social/activation.json"), {
    schemaVersion: "social-activation/1",
    ventures: Object.fromEntries(["caught-up", "mma-files", "titty-tuesdays"].map((venture) => [venture, {
      status: venture === "caught-up" ? "enabled" : "locked",
      counter: venture === "caught-up" ? 7 : 0,
      required: venture === "caught-up" ? 7 : 1,
      reason: "Fixture authority is explicit.",
      updatedAt: "2026-08-27T09:30:00.000Z",
      unlockedAt: venture === "caught-up" ? "2026-08-27T09:00:00.000Z" : null,
      decisionReference: "D2-autonomy-build-2026-08-01"
    }])),
    updatedAt: "2026-08-27T09:30:00.000Z"
  });

  const migrated = migrateLegacyQueueItem(await readJsonFile(path.join(repoRoot, "state/social/queue/2026-08-05-cs-threads.json")), publisher);
  const approved = hashedQueueItem({
    ...migrated,
    id: "fixture-approved",
    status: "queued",
    publishWindow: { notBefore: "2026-08-27T09:00:00.000Z", notAfter: "2026-08-27T11:00:00.000Z" }
  });
  await writeJsonFile(path.join(root, "state/social/queue/b-approved.json"), approved);
  return { root, approved };
}

/** A v2 draft the owner has not approved: its own package, every check pending. */
export function pendingDraft(approved: CapabilityAwareQueueItem): CapabilityAwareQueueItem {
  return hashedQueueItem({
    ...approved,
    id: "fixture-pending-draft",
    status: "draft",
    migration: null,
    sourcePackage: { schemaVersion: "approved-publish-package/1", artifactRef: "state/ventures/caught-up/fixture-package.json", packageHash: "a".repeat(64) },
    content: { ...approved.content, text: `${approved.content.text}\n\nA second, unapproved draft.` },
    checks: Object.fromEntries(Object.keys(approved.checks).map((name) => [name, "pending"])) as CapabilityAwareQueueItem["checks"]
  });
}

export type StubAdapter = PublishAdapter & {
  publish: ReturnType<typeof vi.fn<PublishAdapter["publish"]>>;
  verify: ReturnType<typeof vi.fn<PublishAdapter["verify"]>>;
  findByIdempotencyKey: ReturnType<typeof vi.fn<NonNullable<PublishAdapter["findByIdempotencyKey"]>>>;
};

export function stubAdapter(): StubAdapter {
  return {
    publish: vi.fn<PublishAdapter["publish"]>().mockResolvedValue({ remoteId: "remote-1" }),
    verify: vi.fn<PublishAdapter["verify"]>().mockResolvedValue({ remoteId: "remote-1", remoteUrl: "https://www.threads.net/@fixture/post/remote-1" }),
    findByIdempotencyKey: vi.fn<NonNullable<PublishAdapter["findByIdempotencyKey"]>>().mockResolvedValue(null)
  };
}

export function runnerOptions(root: string, adapter: PublishAdapter, extra: Partial<SocialPublisherOptions> = {}): SocialPublisherOptions {
  return {
    validateOnly: false,
    dryIfDisabled: false,
    now: RUNNER_NOW,
    environment: { SOCIAL_KILL_SWITCH: "false", META_GRAPH_API_VERSION: "v26.0", CAUGHT_UP_THREADS_ACCESS_TOKEN: "fixture-token", CAUGHT_UP_THREADS_USER_ID: "fixture-user" },
    repoRoot: root,
    configRoot: path.join(root, "config"),
    stateRoot: path.join(root, "state"),
    adapter,
    ...extra
  };
}
