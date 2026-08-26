import { createHash } from "node:crypto";
import {
  ImplementationProgressEventSchema,
  ImplementationProgressSchema,
  type ImplementationProgress,
  type ImplementationProgressEvent
} from "../contracts/implementation-program.js";
import { appendJsonLine, atomicWriteJson, readJson, withFileLock } from "../state.js";
import type { GitHubEvidenceCache } from "./github.js";

const ROOT = "programs";

export async function readImplementationProgress(stateRoot: string): Promise<ImplementationProgress | null> {
  let current: unknown = null;
  try {
    current = await readJson<unknown>(stateRoot, `${ROOT}/current.json`, null);
  } catch {
    // A torn or manually damaged current snapshot must not hide the last-known-good record.
  }
  const parsed = ImplementationProgressSchema.safeParse(current);
  if (parsed.success) return parsed.data;
  let fallback: unknown = null;
  try {
    fallback = await readJson<unknown>(stateRoot, `${ROOT}/last-known-good.json`, null);
  } catch {
    return null;
  }
  const previous = ImplementationProgressSchema.safeParse(fallback);
  return previous.success ? { ...previous.data, sourceFreshness: "stale" } : null;
}

export async function readImplementationGitHubCache(stateRoot: string): Promise<GitHubEvidenceCache | null> {
  let value: unknown;
  try {
    value = await readJson<unknown>(stateRoot, `${ROOT}/github-cache.json`, null);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const cache = value as Partial<GitHubEvidenceCache>;
  return cache.schemaVersion === "implementation-github-cache/1" && typeof cache.entries === "object" && cache.entries !== null
    ? cache as GitHubEvidenceCache
    : null;
}

/**
 * A protected Admin refresh is a request, never a direct GitHub call. A live orchestrator cycle
 * consumes it only when it is newer than the canonical snapshot. Invalid or future-dated records
 * fail closed, and the retained receipt makes processing idempotent without another mutable flag.
 */
export async function implementationRefreshPending(stateRoot: string, now = new Date()): Promise<boolean> {
  let value: unknown;
  try {
    value = await readJson<unknown>(stateRoot, `${ROOT}/refresh-request.json`, null);
  } catch {
    return false;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  if (request.schemaVersion !== "implementation-refresh-request/1" ||
    typeof request.requestedAt !== "string" ||
    typeof request.nextRequestAllowedAt !== "string" ||
    typeof request.requestedBy !== "string" ||
    !request.requestedBy.trim() || request.requestedBy.length > 120) return false;
  const requestedAt = Date.parse(request.requestedAt);
  const nextRequestAllowedAt = Date.parse(request.nextRequestAllowedAt);
  if (!Number.isFinite(requestedAt) || !Number.isFinite(nextRequestAllowedAt) ||
    nextRequestAllowedAt < requestedAt || requestedAt > now.getTime() + 60_000) return false;
  const current = await readImplementationProgress(stateRoot);
  return !current || requestedAt > Date.parse(current.generatedAt);
}

function transition(previous: ImplementationProgress["items"][number] | undefined, next: ImplementationProgress["items"][number]): ImplementationProgressEvent["transition"] | null {
  if (previous?.state === next.state) return null;
  if (next.state === "complete") return "item-completed";
  if (next.state === "in-progress") return "work-started";
  if (next.state === "implemented-awaiting-verification") return next.github.pullRequests.some((pull) => pull.merged) ? "pr-merged" : "evidence-valid";
  if (next.state === "blocked") return "blocker-added";
  if (next.state === "owner-action") return "owner-action-added";
  if (next.state === "held-optional") return "optional-held";
  if (next.state === "superseded") return "manifest-superseded";
  if (next.state === "inconsistent" || next.state === "stale") return "evidence-invalid";
  if (next.state === "ready") return previous?.state === "blocked" ? "blocker-cleared" : "ready";
  return null;
}

function progressEvents(previous: ImplementationProgress | null, next: ImplementationProgress): ImplementationProgressEvent[] {
  const before = new Map(previous?.items.map((item) => [item.itemId, item]) ?? []);
  return next.items.flatMap((item) => {
    const old = before.get(item.itemId);
    const kind = transition(old, item);
    if (!kind) return [];
    const programId = item.programRefs[0]!;
    const seed = `${next.generatedAt}:${programId}:${item.itemId}:${old?.state ?? "none"}:${item.state}:${kind}`;
    return [ImplementationProgressEventSchema.parse({
      schemaVersion: "implementation-progress-event/1",
      eventId: `program-event-${createHash("sha256").update(seed).digest("hex").slice(0, 20)}`,
      occurredAt: next.generatedAt,
      programId,
      itemId: item.itemId,
      transition: kind,
      fromState: old?.state ?? null,
      toState: item.state,
      evidenceRefs: item.evidenceRefs,
      snapshotHash: next.snapshotHash
    })];
  });
}

export async function persistImplementationProgress(input: {
  stateRoot: string;
  snapshot: ImplementationProgress;
  githubCache: GitHubEvidenceCache;
}): Promise<{ snapshotPath: string; eventCount: number }> {
  const snapshot = ImplementationProgressSchema.parse(input.snapshot);
  return withFileLock(input.stateRoot, `${ROOT}/writer.lock`, async () => {
    const previous = await readImplementationProgress(input.stateRoot);
    const events = progressEvents(previous, snapshot);
    for (const event of events) {
      await appendJsonLine(input.stateRoot, `${ROOT}/events/${event.occurredAt.slice(0, 7)}.jsonl`, event);
    }
    await atomicWriteJson(input.stateRoot, `${ROOT}/current.json`, snapshot);
    if (snapshot.sourceFreshness === "fresh" || snapshot.sourceFreshness === "partial") {
      await atomicWriteJson(input.stateRoot, `${ROOT}/last-known-good.json`, snapshot);
    }
    await atomicWriteJson(input.stateRoot, `${ROOT}/github-cache.json`, input.githubCache);
    return { snapshotPath: `${ROOT}/current.json`, eventCount: events.length };
  });
}
