import { repoRoot, stateRoot } from "../paths.js";
import { deriveImplementationProgress } from "./derive.js";
import { PublicGitHubReadClient, synchronizeGitHubEvidence, type GitHubReadClient } from "./github.js";
import { readImplementationManifestRegistry } from "./manifests.js";
import { runImplementationProbes } from "./probes.js";
import { implementationRefreshPending, persistImplementationProgress, readImplementationGitHubCache, readImplementationProgress } from "./store.js";

export { implementationRefreshPending } from "./store.js";

export const PROGRAM_SYNC_COOLDOWN_MS = 15 * 60 * 1_000;

export function programSyncConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  if (environment.CI === "true") return false;
  return Boolean(environment.GITHUB_TOKEN?.trim()) || environment.PROGRAMS_PUBLIC_GITHUB_SYNC === "1";
}

export async function synchronizeImplementationPrograms(input: {
  repoRoot?: string;
  stateRoot?: string;
  now?: Date;
  client?: GitHubReadClient;
  force?: boolean;
} = {}): Promise<{ path: string; eventCount: number; skipped: boolean }> {
  const repository = input.repoRoot ?? repoRoot;
  const state = input.stateRoot ?? stateRoot;
  const now = input.now ?? new Date();
  const previous = await readImplementationProgress(state);
  if (!input.force && previous && now.getTime() - Date.parse(previous.generatedAt) < PROGRAM_SYNC_COOLDOWN_MS) {
    return { path: "programs/current.json", eventCount: 0, skipped: true };
  }
  const registry = await readImplementationManifestRegistry(repository);
  const [cache, probes] = await Promise.all([
    readImplementationGitHubCache(state),
    runImplementationProbes({ registry, repoRoot: repository })
  ]);
  const github = await synchronizeGitHubEvidence({
    registry,
    client: input.client ?? new PublicGitHubReadClient(),
    cache,
    now
  });
  const lastSuccessfulSyncAt = github.failedItems === 0
    ? now.toISOString()
    : previous?.lastSuccessfulSyncAt ?? null;
  const snapshot = deriveImplementationProgress({
    registry,
    githubEvidence: github.evidence,
    probeResults: probes,
    generatedAt: now,
    github: {
      cacheStatus: github.cacheStatus,
      rateRemaining: github.rateRemaining,
      rateResetAt: github.rateResetAt,
      failedItems: github.failedItems
    },
    boundedErrors: github.errors,
    lastSuccessfulSyncAt
  });
  const stored = await persistImplementationProgress({ stateRoot: state, snapshot, githubCache: github.cache });
  return { path: stored.snapshotPath, eventCount: stored.eventCount, skipped: false };
}
