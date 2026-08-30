import { createHash } from "node:crypto";
import type { ContestRun } from "../../contracts/contest-radar.js";
import { runContestAdapter } from "./adapters.js";
import { clusterCandidates, prefilterCandidates } from "./canonical.js";
import { extractContestRecord } from "./extract.js";
import { fetchContestSource, type ContestFetchCache } from "./fetch.js";
import { rankContestRecords } from "./rank.js";
import { loadContestSourceRegistry, type ContestSourceRegistry } from "./sources.js";
import {
  readContestFetchCache,
  writeContestFetchCache,
  writeContestRecord,
  writeContestRun
} from "./store.js";

/**
 * One day's scan: fetch what is enabled, cluster it, extract it, rank it, write it down.
 *
 * The whole path costs `$0`. There is no model call and no paid provider in it, which is what the
 * founding decision means by the free path having to be useful on its own.
 *
 * Two failure rules run through every step. One malformed item costs one item — an adapter counts
 * a bad row and moves on. One failed source costs one source — a host that times out leaves a
 * reason in the receipt and the other three still produce records. A run that reached no source at
 * all is `failed`; a run that reached them and found nothing new is `quiet`, which is a success
 * with nothing to show and must not read as a fault.
 *
 * Idempotent on the day: re-running writes the same records to the same paths, and the run receipt
 * is keyed by date so a second run replaces the first rather than accumulating.
 */

export interface ContestScanResult {
  run: ContestRun;
  artifacts: string[];
}

function idempotencyKey(date: string, sourceIds: readonly string[]): string {
  return createHash("sha256").update(`${date}:${[...sourceIds].sort().join(",")}`).digest("hex").slice(0, 32);
}

export async function runContestScan(input: {
  root: string;
  date: string;
  now: Date;
  registry?: ContestSourceRegistry;
  cache?: ContestFetchCache;
  mode?: "live" | "dry" | "fixture";
  trigger?: "schedule" | "manual" | "fixture";
  fetchImpl?: typeof fetch;
  /** Fixture bodies by source id, for a dry run that touches no network. */
  bodies?: Readonly<Record<string, string>>;
  configRoot?: string;
}): Promise<ContestScanResult> {
  const registry = input.registry ?? await loadContestSourceRegistry(input.configRoot);
  const mode = input.mode ?? "live";
  const startedAt = input.now.toISOString();
  const cache = input.cache ?? await readContestFetchCache(input.root);
  const nextCache: ContestFetchCache = { ...cache };

  const fetchable = registry.sources.filter((source) =>
    source.verdict === "enabled" && !source.discoveryOnly && source.maxRequestsPerRun > 0);
  const outcomes: ContestRun["sources"] = [];
  const candidates = [];
  let cacheReused = 0;
  let callsAvoided = 0;

  for (const source of fetchable) {
    const supplied = input.bodies?.[source.id];
    if (mode !== "live" && supplied === undefined) {
      // A dry run with no fixture for a source does not quietly reach the network for it.
      outcomes.push({
        sourceId: source.id,
        outcome: "skipped",
        reason: `No fixture body for ${source.id} in ${mode} mode.`,
        requestCount: 0,
        itemsFetched: 0,
        itemsKept: 0,
        malformedItems: 0
      });
      callsAvoided += 1;
      continue;
    }

    const fetched = supplied !== undefined
      ? { kind: "ok" as const, body: supplied, bodyHash: "", cache: { etag: null, lastModified: null, bodyHash: "", fetchedAt: startedAt }, requestCount: 0 }
      : await fetchContestSource({
        source,
        cache,
        now: input.now,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
      });

    if (fetched.kind === "skipped") {
      outcomes.push({ sourceId: source.id, outcome: "skipped", reason: fetched.reason, requestCount: 0, itemsFetched: 0, itemsKept: 0, malformedItems: 0 });
      continue;
    }
    if (fetched.kind === "failed") {
      // One failed source costs one source. The other three still produce records.
      outcomes.push({ sourceId: source.id, outcome: "failed", reason: fetched.reason, requestCount: fetched.requestCount, itemsFetched: 0, itemsKept: 0, malformedItems: 0 });
      continue;
    }
    if (fetched.kind === "unchanged") {
      nextCache[source.id] = fetched.cache;
      cacheReused += 1;
      outcomes.push({ sourceId: source.id, outcome: "unchanged", reason: "The source has not changed since the last run.", requestCount: fetched.requestCount, itemsFetched: 0, itemsKept: 0, malformedItems: 0 });
      continue;
    }

    if (supplied === undefined) nextCache[source.id] = fetched.cache;
    const adapted = runContestAdapter({ source, body: fetched.body, observedAt: startedAt });
    candidates.push(...adapted.candidates);
    outcomes.push({
      sourceId: source.id,
      outcome: adapted.candidates.length === 0 ? "empty" : "ok",
      reason: adapted.candidates.length === 0
        ? "The source answered but produced no readable item."
        : `Read ${adapted.candidates.length} items.`,
      requestCount: fetched.requestCount,
      itemsFetched: adapted.candidates.length + adapted.malformed,
      itemsKept: adapted.candidates.length,
      malformedItems: adapted.malformed
    });
  }

  const prefiltered = prefilterCandidates(candidates);
  const clusters = clusterCandidates(prefiltered.kept);
  const records = clusters
    .map((cluster) => extractContestRecord({ cluster, now: startedAt }))
    .filter((record): record is NonNullable<typeof record> => record !== null);

  const artifacts: string[] = [];
  if (mode === "live") {
    for (const record of records) artifacts.push(await writeContestRecord(input.root, record));
    artifacts.push(await writeContestFetchCache(input.root, nextCache));
  }

  // Ranking runs on every mode because it costs nothing and a dry run that could not show the
  // order would not prove the thing an owner most wants proved.
  rankContestRecords(records, input.date);

  // `empty` counts as reached. A source that answered 200 with no listings did its job and had
  // nothing today; excluding it made a legitimately quiet day — every source fine, nothing new —
  // report as a total failure, which is the opposite of what the receipt should say.
  const reached = outcomes.filter((outcome) =>
    outcome.outcome === "ok" || outcome.outcome === "unchanged" || outcome.outcome === "empty");
  const failed = outcomes.filter((outcome) => outcome.outcome === "failed");
  const outcome: ContestRun["outcome"] = fetchable.length === 0
    ? "held"
    : reached.length === 0
      ? "failed"
      : records.length === 0
        ? "quiet"
        : failed.length > 0
          ? "partial"
          : "success";

  const endedAt = new Date(input.now.getTime()).toISOString();
  const run: ContestRun = {
    schemaVersion: "contest-run/1",
    idempotencyKey: idempotencyKey(input.date, fetchable.map((source) => source.id)),
    date: input.date,
    trigger: input.trigger ?? (mode === "live" ? "schedule" : "fixture"),
    mode,
    startedAt,
    endedAt,
    durationMs: 0,
    sources: outcomes,
    candidates: prefiltered.kept.length,
    records: records.length,
    cacheReused,
    callsAvoided,
    spend: { modelCalls: 0, modelUsd: 0, apifyUsd: 0, reservationRef: null, actualCostRef: null },
    outcome,
    reason: outcome === "held"
      ? "No source is enabled, so the scan had nothing to reach."
      : outcome === "failed"
        ? "No enabled source answered."
        : outcome === "quiet"
          ? "Every source answered and nothing new survived the filters."
          : outcome === "partial"
            ? `${records.length} records, with ${failed.length} ${failed.length === 1 ? "source" : "sources"} failing.`
            : `${records.length} records from ${reached.length} sources.`,
    errors: failed.map((entry) => entry.reason).slice(0, 40),
    nextSafeAction: failed.length > 0
      ? "Check the failing sources' health before the next run; nothing needs a person today."
      : "Review the ranked list in the Admin. Nothing is entered automatically."
  };

  if (mode === "live") artifacts.push(await writeContestRun(input.root, run));
  return { run, artifacts };
}
