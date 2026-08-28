import { z } from "zod";
import { DateTimeSchema, Sha256Schema } from "../../../contracts/common.js";
import type { WebDevCandidate, WebDevSource } from "../../../contracts/webdev-signal.js";
import { parseWebDevSource } from "./adapters.js";
import {
  WebDevSourceCacheSchema,
  type WebDevSourceCache,
  type WebDevSourceCacheEntry
} from "./cache.js";
import type { WebDevSourceRegistry } from "./registry.js";
import { collectableWebDevSources } from "./registry.js";
import { fetchWebDevSource, type WebDevTransportResult } from "./transport.js";

export const WebDevSourceHealthSchema = z.strictObject({
  schemaVersion: z.literal("webdev-source-health/1"),
  sourceId: z.string().trim().min(1).max(160),
  configuredState: z.enum(["enabled", "optional", "held", "rejected"]),
  runtimeState: z.enum(["healthy", "empty", "unchanged", "malformed", "failed", "held", "backoff", "disabled"]),
  lastAttemptAt: DateTimeSchema.nullable(),
  lastSuccessAt: DateTimeSchema.nullable(),
  lastNonEmptySuccessAt: DateTimeSchema.nullable(),
  itemsFetched: z.number().int().min(0).max(10_000),
  itemsKept: z.number().int().min(0).max(10_000),
  malformedItems: z.number().int().min(0).max(10_000),
  filteredItems: z.number().int().min(0).max(10_000),
  consecutiveFailures: z.number().int().min(0).max(1_000),
  layoutFingerprint: Sha256Schema.nullable(),
  layoutChanged: z.boolean(),
  retryAfterAt: DateTimeSchema.nullable(),
  reason: z.string().trim().min(1).max(240),
  verificationDueAt: z.iso.date(),
  requestCount: z.number().int().min(0).max(10),
  modelCalls: z.literal(0)
});

export type WebDevSourceHealth = z.infer<typeof WebDevSourceHealthSchema>;

export interface CollectWebDevSourcesInput {
  registry: WebDevSourceRegistry;
  cache: WebDevSourceCache;
  now: string;
  mode: "live" | "dry" | "fixture";
  includeOptional?: boolean;
  fixtureBodies?: Readonly<Record<string, Uint8Array>>;
  fetchImpl?: typeof fetch;
  resolveImpl?: (hostname: string) => Promise<string[]>;
  delayImpl?: (milliseconds: number) => Promise<void>;
}

export interface CollectWebDevSourcesResult {
  candidates: WebDevCandidate[];
  health: WebDevSourceHealth[];
  nextCache: WebDevSourceCache;
  cacheMutationAllowed: boolean;
  requestCount: number;
  modelCalls: 0;
}

function disabledHealth(source: WebDevSource, cache: WebDevSourceCacheEntry | undefined): WebDevSourceHealth {
  return WebDevSourceHealthSchema.parse({
    schemaVersion: "webdev-source-health/1",
    sourceId: source.id,
    configuredState: source.state,
    runtimeState: "disabled",
    lastAttemptAt: cache?.lastAttemptAt ?? null,
    lastSuccessAt: cache?.lastSuccessAt ?? null,
    lastNonEmptySuccessAt: cache?.lastNonEmptySuccessAt ?? null,
    itemsFetched: 0,
    itemsKept: 0,
    malformedItems: 0,
    filteredItems: 0,
    consecutiveFailures: cache?.consecutiveFailures ?? 0,
    layoutFingerprint: cache?.layoutFingerprint ?? null,
    layoutChanged: false,
    retryAfterAt: cache?.retryAfterAt ?? null,
    reason: `source-${source.state}:${source.stateReason}`.slice(0, 240),
    verificationDueAt: source.verificationDueAt,
    requestCount: 0,
    modelCalls: 0
  });
}

function transportHealth(source: WebDevSource, result: Exclude<WebDevTransportResult, { kind: "fetched" }>): WebDevSourceHealth {
  const runtimeState = result.kind === "unchanged" ? "unchanged" : result.kind;
  return WebDevSourceHealthSchema.parse({
    schemaVersion: "webdev-source-health/1",
    sourceId: source.id,
    configuredState: source.state,
    runtimeState,
    lastAttemptAt: result.nextCache.lastAttemptAt,
    lastSuccessAt: result.nextCache.lastSuccessAt,
    lastNonEmptySuccessAt: result.nextCache.lastNonEmptySuccessAt,
    itemsFetched: 0,
    itemsKept: 0,
    malformedItems: 0,
    filteredItems: 0,
    consecutiveFailures: result.nextCache.consecutiveFailures,
    layoutFingerprint: result.nextCache.layoutFingerprint,
    layoutChanged: false,
    retryAfterAt: result.nextCache.retryAfterAt,
    reason: result.reason,
    verificationDueAt: source.verificationDueAt,
    requestCount: result.attempts,
    modelCalls: 0
  });
}

function failedParseCache(source: WebDevSource, existing: WebDevSourceCacheEntry | undefined, transport: WebDevTransportResult, now: string, reason: string): WebDevSourceCacheEntry {
  const failures = (existing?.consecutiveFailures ?? 0) + 1;
  return {
    ...transport.nextCache,
    lastAttemptAt: now,
    lastSuccessAt: existing?.lastSuccessAt ?? null,
    lastNonEmptySuccessAt: existing?.lastNonEmptySuccessAt ?? null,
    layoutFingerprint: existing?.layoutFingerprint ?? null,
    consecutiveFailures: failures,
    heldReason: failures >= source.healthPolicy.failureThreshold ? reason.slice(0, 240) : null
  };
}

export async function collectWebDevSources(input: CollectWebDevSourcesInput): Promise<CollectWebDevSourcesResult> {
  const validatedCache = WebDevSourceCacheSchema.parse(input.cache);
  const nextCache: WebDevSourceCache = { schemaVersion: "webdev-source-cache/1", entries: { ...validatedCache.entries } };
  const candidates: WebDevCandidate[] = [];
  const health: WebDevSourceHealth[] = [];
  const collectableIds = new Set(collectableWebDevSources(input.registry, input.includeOptional).map(({ id }) => id));
  let requestCount = 0;

  for (const source of input.registry.sources) {
    const existing = validatedCache.entries[source.id];
    if (!collectableIds.has(source.id)) {
      health.push(disabledHealth(source, existing));
      continue;
    }
    const transport = await fetchWebDevSource({
      source,
      now: input.now,
      cache: existing,
      mode: input.mode,
      fixtureBody: input.fixtureBodies?.[source.id],
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {}),
      ...(input.delayImpl ? { delayImpl: input.delayImpl } : {})
    });
    requestCount += transport.attempts;
    if (transport.kind !== "fetched") {
      health.push(transportHealth(source, transport));
      if (input.mode === "live") nextCache.entries[source.id] = transport.nextCache;
      continue;
    }
    try {
      const parsed = await parseWebDevSource(source, transport.body, { fetchedAt: input.now, fixture: input.mode === "fixture" });
      const layoutChanged = !parsed.empty
        && existing?.layoutFingerprint !== null
        && existing?.layoutFingerprint !== undefined
        && existing.layoutFingerprint !== parsed.layoutFingerprint;
      if (layoutChanged) {
        const reason = "layout-fingerprint-changed";
        const failedCache = failedParseCache(source, existing, transport, input.now, reason);
        const held = failedCache.consecutiveFailures >= source.healthPolicy.failureThreshold;
        health.push(WebDevSourceHealthSchema.parse({
          schemaVersion: "webdev-source-health/1",
          sourceId: source.id,
          configuredState: source.state,
          runtimeState: held ? "held" : "failed",
          lastAttemptAt: input.now,
          lastSuccessAt: existing?.lastSuccessAt ?? null,
          lastNonEmptySuccessAt: existing?.lastNonEmptySuccessAt ?? null,
          itemsFetched: parsed.itemsSeen,
          itemsKept: 0,
          malformedItems: parsed.malformedItems,
          filteredItems: parsed.filteredItems,
          consecutiveFailures: failedCache.consecutiveFailures,
          layoutFingerprint: existing?.layoutFingerprint ?? null,
          layoutChanged: true,
          retryAfterAt: null,
          reason,
          verificationDueAt: source.verificationDueAt,
          requestCount: transport.attempts,
          modelCalls: 0
        }));
        if (input.mode === "live") nextCache.entries[source.id] = failedCache;
        continue;
      }
      const sourceCache = {
        ...transport.nextCache,
        lastNonEmptySuccessAt: parsed.candidates.length > 0 ? input.now : existing?.lastNonEmptySuccessAt ?? null,
        layoutFingerprint: parsed.empty ? existing?.layoutFingerprint ?? parsed.layoutFingerprint : parsed.layoutFingerprint,
        consecutiveFailures: 0,
        heldReason: null
      };
      if (input.mode === "live") nextCache.entries[source.id] = sourceCache;
      candidates.push(...parsed.candidates);
      const runtimeState = parsed.empty ? "empty" : parsed.malformedItems > 0 ? "malformed" : "healthy";
      health.push(WebDevSourceHealthSchema.parse({
        schemaVersion: "webdev-source-health/1",
        sourceId: source.id,
        configuredState: source.state,
        runtimeState,
        lastAttemptAt: input.now,
        lastSuccessAt: input.now,
        lastNonEmptySuccessAt: sourceCache.lastNonEmptySuccessAt,
        itemsFetched: parsed.itemsSeen,
        itemsKept: parsed.candidates.length,
        malformedItems: parsed.malformedItems,
        filteredItems: parsed.filteredItems,
        consecutiveFailures: 0,
        layoutFingerprint: parsed.layoutFingerprint,
        layoutChanged: false,
        retryAfterAt: null,
        reason: parsed.empty ? "healthy-empty" : parsed.malformedItems > 0 ? "item-failures-isolated" : "healthy",
        verificationDueAt: source.verificationDueAt,
        requestCount: transport.attempts,
        modelCalls: 0
      }));
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 240) : "adapter-failure";
      const failedCache = failedParseCache(source, existing, transport, input.now, reason);
      const held = failedCache.consecutiveFailures >= source.healthPolicy.failureThreshold;
      health.push(WebDevSourceHealthSchema.parse({
        schemaVersion: "webdev-source-health/1",
        sourceId: source.id,
        configuredState: source.state,
        runtimeState: held ? "held" : "failed",
        lastAttemptAt: input.now,
        lastSuccessAt: existing?.lastSuccessAt ?? null,
        lastNonEmptySuccessAt: existing?.lastNonEmptySuccessAt ?? null,
        itemsFetched: 0,
        itemsKept: 0,
        malformedItems: 0,
        filteredItems: 0,
        consecutiveFailures: failedCache.consecutiveFailures,
        layoutFingerprint: existing?.layoutFingerprint ?? null,
        layoutChanged: reason.includes("layout-invalid"),
        retryAfterAt: null,
        reason,
        verificationDueAt: source.verificationDueAt,
        requestCount: transport.attempts,
        modelCalls: 0
      }));
      if (input.mode === "live") nextCache.entries[source.id] = failedCache;
    }
    if (input.mode === "live" && source.limits.spacingMs > 0) {
      await (input.delayImpl ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))))(source.limits.spacingMs);
    }
  }

  return {
    candidates: candidates.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt)
      || left.sourceId.localeCompare(right.sourceId)
      || left.sourceItemId.localeCompare(right.sourceItemId)),
    health: health.sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    nextCache: input.mode === "live" ? WebDevSourceCacheSchema.parse(nextCache) : validatedCache,
    cacheMutationAllowed: input.mode === "live",
    requestCount,
    modelCalls: 0
  };
}
