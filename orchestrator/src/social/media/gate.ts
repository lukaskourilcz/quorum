import { rm } from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson } from "../../state.js";
import type { CapabilityAwareQueueItem } from "../queue.js";
import {
  gitSocialAssetCommits,
  loadSocialAssetAllowHosts,
  verifySocialAssets,
  type SocialAssetCommits,
  type VerifiedSocialAsset
} from "./assets.js";
import { readRecordedAssetHashes } from "./recorded-hashes.js";

/** Where the runner records why an item's images were held: one file per queue file, same name. */
export function socialAssetHoldPath(queueFileName: string): string {
  return `social/asset-holds/${queueFileName}`;
}

/**
 * Split the items about to be sent into those whose frames are proved and those that are held.
 *
 * Runs after every other gate has passed and before any provider is called. A held item keeps its
 * queue file byte for byte, so it stays due and is checked again on the next run; the hold file
 * says why, and is removed once the frames pass. Items without images pass through untouched.
 * The same `fetchImpl` the adapter would use asks the hosts, so a test's recorded answers cover both.
 */
export async function gateSocialAssets<T extends { name: string; item: CapabilityAwareQueueItem }>(input: {
  entries: readonly T[];
  environment: NodeJS.ProcessEnv;
  repoRoot: string;
  stateRoot: string;
  configRoot: string;
  now: Date;
  commits?: SocialAssetCommits;
  fetchImpl?: typeof fetch;
  resolveImpl?: (hostname: string) => Promise<string[]>;
}): Promise<{ ready: T[]; verified: Map<string, VerifiedSocialAsset[]>; held: number }> {
  const ready: T[] = [];
  const verified = new Map<string, VerifiedSocialAsset[]>();
  let held = 0;
  if (!input.entries.some(({ item }) => item.content.assetPaths.length > 0)) {
    return { ready: [...input.entries], verified, held };
  }
  const allowHosts = await loadSocialAssetAllowHosts(input.configRoot);
  const commits = input.commits ?? gitSocialAssetCommits(input.repoRoot);
  for (const entry of input.entries) {
    if (entry.item.content.assetPaths.length === 0) {
      ready.push(entry);
      continue;
    }
    const recorded = await readRecordedAssetHashes({ item: entry.item, repoRoot: input.repoRoot, stateRoot: input.stateRoot });
    const verification = await verifySocialAssets(entry.item, {
      environment: input.environment,
      recorded,
      commits,
      allowHosts,
      now: input.now,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
    });
    if (verification.status === "held") {
      await atomicWriteJson(input.stateRoot, socialAssetHoldPath(entry.name), verification.hold);
      held += 1;
      continue;
    }
    await rm(path.join(input.stateRoot, socialAssetHoldPath(entry.name)), { force: true });
    verified.set(entry.name, verification.assets);
    ready.push(entry);
  }
  return { ready, verified, held };
}
