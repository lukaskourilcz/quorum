import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { SocialActivationSchema, SocialPostReceiptSchema } from "../contracts/autonomy.js";
import { atomicWriteJson, readJson, withFileLock } from "../state.js";
import { configRoot as defaultConfigRoot, repoRoot as defaultRepoRoot, stateRoot as defaultStateRoot } from "../paths.js";
import { pragueClockParts } from "../meetings/clock.js";
import { refreshSocialActivation, pauseVentureSocial } from "./activation.js";
import { ChannelRegistrySchema, assertLiveChannel } from "./channel-registry.js";
import { createMetaPublishAdapter } from "./meta.js";
import type { PublishAdapter } from "./publish.js";
import { assertQueueItemPublishable, QueueItemSchema, type QueueItem } from "./queue.js";
import { checkTittyTuesdaysPost, TT_SAFETY_CHECKER_VERSION } from "./tt-safety.js";

export interface SocialPublisherOptions {
  validateOnly: boolean;
  dryIfDisabled: boolean;
  now?: Date;
  environment?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  adapter?: PublishAdapter;
  repoRoot?: string;
  stateRoot?: string;
  configRoot?: string;
}

export interface SocialPublisherReport {
  status: "paused" | "draft_only" | "validated" | "complete";
  queueItems: number;
  due: number;
  published: number;
  ambiguous: number;
  skipped: number;
}

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

function receiptId(item: QueueItem): string {
  return `social-receipt-${createHash("sha256").update(`${item.venture}:${item.id}:${item.content.contentHash}`).digest("hex").slice(0, 16)}`;
}

function idempotencyKey(item: QueueItem): string {
  return createHash("sha256").update(`${item.venture}:${item.channel}:${item.id}:${item.content.contentHash}`).digest("hex");
}

export async function runSocialPublisher(options: SocialPublisherOptions): Promise<SocialPublisherReport> {
  const now = options.now ?? new Date();
  const environment = options.environment ?? process.env;
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const stateRoot = options.stateRoot ?? defaultStateRoot;
  const configRoot = options.configRoot ?? defaultConfigRoot;
  if (await exists(path.join(stateRoot, "PAUSED"))) {
    return { status: "paused", queueItems: 0, due: 0, published: 0, ambiguous: 0, skipped: 0 };
  }

  return withFileLock(stateRoot, ".social-lock", async () => {
    const current = SocialActivationSchema.safeParse(await readJson<unknown>(stateRoot, "social/activation.json", null));
    const checkedToday = current.success && pragueClockParts(new Date(current.data.updatedAt)).date === pragueClockParts(now).date;
    const activation = checkedToday ? current.data : await refreshSocialActivation({
      repoRoot,
      stateRoot,
      environment,
      now,
      safetyCheckerReady: TT_SAFETY_CHECKER_VERSION === "keeper-tt-1"
    });
    if (environment.SOCIAL_KILL_SWITCH !== "false" || await exists(path.join(stateRoot, "SOCIAL_PAUSED"))) {
      return { status: "paused", queueItems: 0, due: 0, published: 0, ambiguous: 0, skipped: 0 };
    }
    const registry = ChannelRegistrySchema.parse(JSON.parse(await readFile(path.join(configRoot, "channels.json"), "utf8")) as unknown);
    const queueDirectory = path.join(stateRoot, "social", "queue");
    const files = await readdir(queueDirectory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
    const entries = await Promise.all(files.filter((name) => name.endsWith(".json")).sort().map(async (name) => ({
      name,
      item: QueueItemSchema.parse(JSON.parse(await readFile(path.join(queueDirectory, name), "utf8")) as unknown)
    })));
    const channels = new Map(registry.channels.map((channel) => [channel.id, channel]));
    const due = entries.filter(({ item }) =>
      ["draft", "queued"].includes(item.status) &&
      new Date(item.publishWindow.notBefore).getTime() <= now.getTime() &&
      new Date(item.publishWindow.notAfter).getTime() >= now.getTime()
    );
    const enabledDue = due.filter(({ item }) => activation.ventures[item.venture].status === "enabled");

    for (const { item } of enabledDue) {
      const queued = item.status === "draft" ? { ...item, status: "queued" as const } : item;
      assertQueueItemPublishable(queued);
      assertLiveChannel(channels.get(item.channel)!, environment);
    }
    if (enabledDue.length === 0) {
      return { status: "draft_only", queueItems: entries.length, due: due.length, published: 0, ambiguous: 0, skipped: due.length };
    }
    if (options.validateOnly) {
      return { status: "validated", queueItems: entries.length, due: due.length, published: 0, ambiguous: 0, skipped: due.length };
    }

    const adapter = options.adapter ?? createMetaPublishAdapter(environment, options.fetchImpl);
    let published = 0;
    let failed = 0;
    let safetyKilled = 0;
    for (const { name, item } of enabledDue) {
      const channel = channels.get(item.channel)!;
      const key = idempotencyKey(item);
      const queued = QueueItemSchema.parse(item.status === "draft" ? { ...item, status: "queued" } : item);
      const safety = checkTittyTuesdaysPost(queued);
      if (!safety.passed) {
        const killed = QueueItemSchema.parse({ ...queued, status: "cancelled" });
        await Promise.all([
          atomicWriteJson(stateRoot, `social/queue/${name}`, killed),
          atomicWriteJson(stateRoot, `social/safety-kills/${queued.id}.json`, {
            schemaVersion: "social-safety-kill/1",
            venture: queued.venture,
            queueItemId: queued.id,
            checkerVersion: safety.version,
            reasons: safety.reasons,
            killedAt: now.toISOString()
          })
        ]);
        safetyKilled += 1;
        continue;
      }
      let remoteId: string | null = null;
      let remoteUrl: string | null = null;
      let errorMessage: string | null = null;
      let attemptCount: 1 | 2 = 1;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        attemptCount = attempt as 1 | 2;
        try {
          const existing = await adapter.findByIdempotencyKey?.(channel, key);
          remoteId = existing?.remoteId ?? (await adapter.publish(channel, queued, key)).remoteId;
          const verified = await adapter.verify(channel, queued, remoteId);
          remoteUrl = verified.remoteUrl;
          errorMessage = null;
          break;
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : String(error);
        }
      }
      const succeeded = remoteId !== null && remoteUrl !== null && errorMessage === null;
      const id = receiptId(queued);
      const receipt = SocialPostReceiptSchema.parse({
        schemaVersion: "social-post-receipt/1",
        id,
        venture: queued.venture,
        queueItemId: queued.id,
        channel: queued.channel,
        variant: queued.variant,
        idempotencyKey: key,
        contentHash: queued.content.contentHash,
        outcome: succeeded ? "published" : "paused",
        remoteId,
        remoteUrl,
        verifiedLive: succeeded,
        attemptCount,
        attemptedAt: now.toISOString(),
        verifiedAt: succeeded ? now.toISOString() : null,
        error: succeeded ? null : (errorMessage ?? "Post did not verify live").slice(0, 500)
      });
      const updated = QueueItemSchema.parse({
        ...queued,
        status: succeeded ? "published" : "failed",
        attempt: { idempotencyKey: key, claimedAt: now.toISOString(), attemptCount, lastError: receipt.error },
        receiptId: id
      });
      await Promise.all([
        atomicWriteJson(stateRoot, `social/queue/${name}`, updated),
        atomicWriteJson(stateRoot, `social/posts/${id}.json`, receipt)
      ]);
      if (succeeded) published += 1;
      else {
        failed += 1;
        await pauseVentureSocial({ stateRoot, venture: queued.venture, reason: `Post ${queued.id} failed twice: ${receipt.error}`, now });
      }
    }
    return { status: "complete", queueItems: entries.length, due: due.length, published, ambiguous: failed, skipped: due.length - enabledDue.length + safetyKilled };
  });
}
