import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { ChannelRegistrySchema, assertLiveChannel } from "./channel-registry.js";
import { createMetaPublishAdapter } from "./meta.js";
import {
  assertQueueItemPublishable,
  claimQueueItem,
  QueueItemSchema,
  reconcileQueueItem,
  type QueueItem
} from "./queue.js";
import { atomicWriteJson, withFileLock } from "../state.js";
import { configRoot, stateRoot } from "../paths.js";

export interface SocialPublisherOptions {
  validateOnly: boolean;
  dryIfDisabled: boolean;
  now?: Date;
  environment?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
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
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeReceipt(
  item: QueueItem,
  outcome: "published" | "ambiguous",
  now: Date,
  remoteId: string | null
): Promise<void> {
  const attemptCount = item.attempt?.attemptCount;
  const lastError = item.attempt?.lastError;
  if (!attemptCount || !item.receiptId) {
    throw new Error(`Queue item ${item.id} has no reconciled attempt`);
  }
  await atomicWriteJson(
    stateRoot,
    `social/posts/${item.receiptId}.json`,
    {
      schemaVersion: 1,
      id: item.receiptId,
      queueItemId: item.id,
      channel: item.channel,
      contentHash: item.content.contentHash,
      outcome,
      remoteId,
      attemptedAt: now.toISOString(),
      error: lastError ?? null,
      sanitizedProviderMetadata: {}
    }
  );
}

export async function runSocialPublisher(
  options: SocialPublisherOptions
): Promise<SocialPublisherReport> {
  const now = options.now ?? new Date();
  const environment = options.environment ?? process.env;
  if (
    (await exists(path.join(stateRoot, "PAUSED"))) ||
    (await exists(path.join(stateRoot, "SOCIAL_PAUSED")))
  ) {
    return {
      status: "paused",
      queueItems: 0,
      due: 0,
      published: 0,
      ambiguous: 0,
      skipped: 0
    };
  }

  return withFileLock(stateRoot, ".social-lock", async () => {
    const registry = ChannelRegistrySchema.parse(
      JSON.parse(
        await readFile(path.join(configRoot, "channels.json"), "utf8")
      ) as unknown
    );
    const queueDirectory = path.join(stateRoot, "social", "queue");
    const files = (await readdir(queueDirectory))
      .filter((name) => name.endsWith(".json"))
      .sort();
    const entries = await Promise.all(
      files.map(async (name) => ({
        name,
        item: QueueItemSchema.parse(
          JSON.parse(await readFile(path.join(queueDirectory, name), "utf8")) as unknown
        )
      }))
    );
    const channels = new Map(registry.channels.map((channel) => [channel.id, channel]));
    const due = entries.filter(
      ({ item }) =>
        item.status === "queued" &&
        new Date(item.publishWindow.notBefore).getTime() <= now.getTime()
    );
    const autopublishDue = due.filter(
      ({ item }) => channels.get(item.channel)?.mode === "autopublish"
    );

    for (const { item } of autopublishDue) {
      assertQueueItemPublishable(item);
      assertLiveChannel(channels.get(item.channel)!, environment);
    }

    if (registry.channels.every((channel) => channel.mode === "draft")) {
      return {
        status: "draft_only",
        queueItems: entries.length,
        due: due.length,
        published: 0,
        ambiguous: 0,
        skipped: due.length
      };
    }
    if (options.validateOnly) {
      return {
        status: "validated",
        queueItems: entries.length,
        due: due.length,
        published: 0,
        ambiguous: 0,
        skipped: due.length
      };
    }
    if (autopublishDue.length === 0 && options.dryIfDisabled) {
      return {
        status: "validated",
        queueItems: entries.length,
        due: due.length,
        published: 0,
        ambiguous: 0,
        skipped: due.length
      };
    }

    const adapter = createMetaPublishAdapter(environment, options.fetchImpl);
    let published = 0;
    let ambiguous = 0;

    for (const { name, item } of autopublishDue) {
      const channel = channels.get(item.channel)!;
      const claimId = createHash("sha256")
        .update(`${item.channel}:${item.id}:${item.content.contentHash}`)
        .digest("hex");
      const claimed = claimQueueItem(item, claimId, now);
      await atomicWriteJson(stateRoot, `social/queue/${name}`, claimed);
      if (claimed.status !== "publishing") {
        continue;
      }
      let reconciled: QueueItem;
      let remoteId: string | null = null;
      try {
        const result = await adapter.publish(channel, claimed, claimId);
        remoteId = result.remoteId;
        reconciled = reconcileQueueItem(claimed, {
          outcome: "published",
          remoteId: result.remoteId
        });
        published += 1;
      } catch (error) {
        reconciled = reconcileQueueItem(claimed, {
          outcome: "ambiguous",
          error: error instanceof Error ? error.message : "Unknown connector failure"
        });
        ambiguous += 1;
      }
      await atomicWriteJson(stateRoot, `social/queue/${name}`, reconciled);
      await writeReceipt(
        reconciled,
        reconciled.status === "published" ? "published" : "ambiguous",
        now,
        remoteId
      );
    }

    return {
      status: "complete",
      queueItems: entries.length,
      due: due.length,
      published,
      ambiguous,
      skipped: due.length - autopublishDue.length
    };
  });
}
