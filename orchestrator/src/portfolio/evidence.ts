import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { configRoot } from "../paths.js";
import { atomicWriteJson, readJson } from "../state.js";
import { createDigest } from "../sources/digest.js";
import { loadSourceRegistry } from "../sources/registry.js";
import { runScrapersDetailed } from "../sources/run.js";
import type { SourceFetchContext } from "../sources/types.js";
import { fetchCitoFighters, fetchCitoUpcomingEvents, fetchOddsApiMma, loadMmaSourceRegistry, type ApiBoutOdds, type CitoEventSummary, type CitoFighterSummary } from "../fightaiq/sources.js";
import { materializeFightAiQSources } from "../fightaiq/intake.js";
import { buildBackfillQueue, fetchWikimediaRoster, materializeWikimediaRoster, reconcileRosterStatuses, writeBackfillQueue, writeRosterStatus, type WikimediaRosterEntry } from "../fightaiq/roster.js";
import { loadBoutRecords, loadFighterRecords } from "../fightaiq/store.js";
import { rebuildDerivedFighterData } from "../fightaiq/derived.js";
import { reconcilePredictionResults, runConfirmedBoutAnalysis } from "../fightaiq/analysis.js";
import { enrichWikimediaBackfill } from "../fightaiq/wikimedia-backfill.js";

interface NetworkAllowlist {
  runtimeHosts: string[];
}

async function sourceContext(now: Date): Promise<SourceFetchContext> {
  const allowlist = JSON.parse(
    await readFile(path.join(configRoot, "network-allowlist.json"), "utf8")
  ) as NetworkAllowlist;
  return { allowHosts: allowlist.runtimeHosts, now };
}

export async function refreshIncubatorEvidence(input: {
  root: string;
  now: Date;
}): Promise<{ artifactPaths: string[]; evidenceRefs: string[] }> {
  const [registry, context] = await Promise.all([
    loadSourceRegistry(),
    sourceContext(input.now)
  ]);
  const run = await runScrapersDetailed(registry.sources, context);
  const digest = createDigest(run.items, 40);
  const evidenceRefs = [...new Set(digest.map((item) => `source:${item.sourceId}`))];
  const artifactPath = "ventures/incubator/evidence.json";
  await atomicWriteJson(input.root, artifactPath, {
    schemaVersion: "incubator-evidence/1",
    generatedAt: input.now.toISOString(),
    refs: evidenceRefs,
    packet: JSON.stringify(digest.map((item) => ({
      sourceId: item.sourceId,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      summary: item.summary,
      tags: item.tags
    }))),
    sourceResults: run.sources
  });
  return { artifactPaths: [artifactPath], evidenceRefs };
}

type SourceState = "success" | "skipped" | "failed";

interface FightSourceResult {
  sourceId: string;
  status: SourceState;
  reason: string | null;
  items: unknown[];
  quota?: {
    remainingCredits: number | null;
    usedCredits: number | null;
    lastRequestCredits: number | null;
    exhausted: boolean;
  };
}

function cleanFailure(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown source failure";
  return `${error.name}: ${error.message}`
    .replace(/([?&](?:api_?key|key|token|access_token)=)[^&\s]+/giu, "$1[redacted]")
    .slice(0, 300);
}

export async function refreshFightAiQEvidence(input: {
  root: string;
  date: string;
  now: Date;
}): Promise<{ artifactPaths: string[]; evidenceRefs: string[]; contentHash: string; materialChange: boolean }> {
  const [registry, context] = await Promise.all([
    loadMmaSourceRegistry(),
    sourceContext(input.now)
  ]);
  const wired = new Set(registry.sources.filter((source) => source.state === "wired").map((source) => source.id));
  const month = input.date.slice(0, 7);
  const quotaPath = "ventures/fightaiq/source-snapshots/quota.json";
  const priorQuota = await readJson<{ month?: string; remainingCredits?: number | null }>(input.root, quotaPath, {});
  const oddsKey = process.env.THE_ODDS_API_KEY?.trim() ?? "";
  const citoKey = process.env.CITO_API_KEY?.trim() ?? "";
  const results: FightSourceResult[] = [];
  let oddsEvents: ApiBoutOdds[] = [];
  let citoFighters: CitoFighterSummary[] = [];
  let citoEvents: CitoEventSummary[] = [];
  let wikimediaRoster: WikimediaRosterEntry[] = [];

  if (!wired.has("the-odds-api")) {
    results.push({ sourceId: "the-odds-api", status: "skipped", reason: "Source is not wired.", items: [] });
  } else if (!oddsKey) {
    results.push({ sourceId: "the-odds-api", status: "skipped", reason: "THE_ODDS_API_KEY is unavailable.", items: [] });
  } else {
    try {
      const odds = await fetchOddsApiMma({
        apiKey: oddsKey,
        context,
        remainingCredits: priorQuota.month === month ? priorQuota.remainingCredits : null
      });
      oddsEvents = odds.events;
      results.push({
        sourceId: "the-odds-api",
        status: odds.events.length > 0 ? "success" : "skipped",
        reason: odds.events.length > 0 ? null : odds.exhausted ? "Monthly source credits are exhausted." : "No MMA prices were returned.",
        items: odds.events,
        quota: {
          remainingCredits: odds.remainingCredits,
          usedCredits: odds.usedCredits,
          lastRequestCredits: odds.lastRequestCredits,
          exhausted: odds.exhausted
        }
      });
      await atomicWriteJson(input.root, quotaPath, {
        schemaVersion: "fightaiq-source-quota/1",
        month,
        remainingCredits: odds.remainingCredits,
        updatedAt: input.now.toISOString()
      });
    } catch (error) {
      results.push({ sourceId: "the-odds-api", status: "failed", reason: cleanFailure(error), items: [] });
    }
  }

  const citoQuotaPath = "mma/source-quota/cito.json";
  const citoQuota = await readJson<{ month?: string; day?: string; monthlyCalls?: number; dailyCalls?: number; nextFighterPage?: number; currentCycleFighterRefs?: string[] }>(input.root, citoQuotaPath, {});
  const citoMonthlyCalls = citoQuota.month === month ? citoQuota.monthlyCalls ?? 0 : 0;
  const citoDailyCalls = citoQuota.day === input.date ? citoQuota.dailyCalls ?? 0 : 0;
  const citoCallReservation = 5;
  let citoQuotaRecorded = false;
  let citoRosterCycleComplete = false;
  let citoRosterCycleRefs: string[] = [];
  if (!wired.has("cito-ufc")) {
    results.push({ sourceId: "cito-ufc", status: "skipped", reason: "Source is not wired.", items: [] });
  } else if (!citoKey) {
    results.push({ sourceId: "cito-ufc", status: "skipped", reason: "CITO_API_KEY is unavailable.", items: [] });
  } else if (citoMonthlyCalls + citoCallReservation > 500 || citoDailyCalls + citoCallReservation > 200) {
    results.push({ sourceId: "cito-ufc", status: "skipped", reason: "The free-tier quota guard stopped this run before a request.", items: [] });
  } else {
    try {
      [citoFighters, citoEvents] = await Promise.all([
        fetchCitoFighters({ apiKey: citoKey, context, page: citoQuota.nextFighterPage ?? 1 }),
        fetchCitoUpcomingEvents({ apiKey: citoKey, context })
      ]);
      const items = [
        ...citoFighters.map((fighter) => ({ kind: "fighter", ...fighter })),
        ...citoEvents.map((event) => ({ kind: "event", ...event }))
      ];
      results.push({
        sourceId: "cito-ufc",
        status: items.length > 0 ? "success" : "skipped",
        reason: items.length > 0 ? null : "No UFC fighter or upcoming-event records were returned.",
        items
      });
      const currentPage = citoQuota.nextFighterPage ?? 1;
      const priorCycleRefs = currentPage > 1 ? citoQuota.currentCycleFighterRefs ?? [] : [];
      citoRosterCycleRefs = [...new Set([...priorCycleRefs, ...citoFighters.map((fighter) => `ufc:${fighter.slug}`)])].sort();
      citoRosterCycleComplete = citoFighters.length < 50;
      await atomicWriteJson(input.root, citoQuotaPath, {
        schemaVersion: "cito-free-quota/1",
        month,
        day: input.date,
        monthlyCalls: citoMonthlyCalls + citoCallReservation,
        dailyCalls: citoDailyCalls + citoCallReservation,
        reservedCallsPerRun: citoCallReservation,
        nextFighterPage: citoRosterCycleComplete ? 1 : currentPage + 1,
        currentCycleFighterRefs: citoRosterCycleComplete ? [] : citoRosterCycleRefs,
        updatedAt: input.now.toISOString()
      });
      citoQuotaRecorded = true;
    } catch (error) {
      results.push({ sourceId: "cito-ufc", status: "failed", reason: cleanFailure(error), items: [] });
    }
  }

  if (wired.has("wikimedia")) {
    try {
      const rosters = await Promise.all([
        fetchWikimediaRoster({ org: "ufc", context }),
        fetchWikimediaRoster({ org: "oktagon", context })
      ]);
      wikimediaRoster = rosters.flat();
      results.push({
        sourceId: "wikimedia",
        status: wikimediaRoster.length ? "success" : "skipped",
        reason: wikimediaRoster.length ? null : "The reviewed fighter categories returned no pages.",
        items: wikimediaRoster
      });
    } catch (error) {
      results.push({ sourceId: "wikimedia", status: "failed", reason: cleanFailure(error), items: [] });
    }
  }

  const evidenceRefs = results
    .filter((result) => result.status === "success")
    .map((result) => `source:${result.sourceId}:${input.date}`);
  const artifactPath = `ventures/fightaiq/source-snapshots/${input.date}.json`;
  const previousDate = new Date(Date.parse(`${input.date}T12:00:00.000Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [sameDaySnapshot, previousSnapshot] = await Promise.all([
    readJson<{ contentHash?: string }>(input.root, artifactPath, {}),
    readJson<{ contentHash?: string }>(
      input.root,
      `ventures/fightaiq/source-snapshots/${previousDate}.json`,
      {}
    )
  ]);
  const contentHash = createHash("sha256")
    .update(JSON.stringify(results.map(({ sourceId, status, items, quota }) => ({
      sourceId,
      status,
      items,
      ...(quota ? { quota: { exhausted: quota.exhausted } } : {})
    }))))
    .digest("hex");
  const priorContentHash = sameDaySnapshot.contentHash ?? previousSnapshot.contentHash ?? null;
  await atomicWriteJson(input.root, artifactPath, {
    schemaVersion: "fightaiq-source-snapshot/1",
    date: input.date,
    retrievedAt: input.now.toISOString(),
    contentHash,
    evidenceRefs,
    sources: results
  });
  const normalizedPaths = await materializeFightAiQSources({
    root: input.root,
    retrievedAt: input.now,
    citoFighters,
    citoEvents,
    odds: oddsEvents
  });
  const wikimediaPaths = await materializeWikimediaRoster({ root: input.root, entries: wikimediaRoster, retrievedAt: input.now });
  const rosterStatusPaths: string[] = [];
  if (citoRosterCycleComplete) {
    const currentFighters = await loadFighterRecords(path.join(input.root, "mma", "fighters"));
    rosterStatusPaths.push(...await reconcileRosterStatuses({
      root: input.root,
      org: "ufc",
      fighters: currentFighters,
      seenFighterRefs: new Set(citoRosterCycleRefs),
      sourceRef: `source:cito-ufc:${input.date}:complete-roster`,
      reviewedAt: input.now,
      externalIdKey: "cito"
    }));
  }
  const backfillPaths: string[] = [];
  const backfillRunPath = "mma/backfill/last-run.json";
  try {
    const [preliminaryFighters, preliminaryBouts] = await Promise.all([
      loadFighterRecords(path.join(input.root, "mma", "fighters")),
      loadBoutRecords(path.join(input.root, "mma", "bouts"))
    ]);
    const queue = buildBackfillQueue({ fighters: preliminaryFighters, bouts: preliminaryBouts, now: input.now });
    const backfill = await enrichWikimediaBackfill({ root: input.root, fighters: preliminaryFighters, bouts: preliminaryBouts, queue, context, retrievedAt: input.now });
    backfillPaths.push(...backfill.paths);
    await atomicWriteJson(input.root, backfillRunPath, {
      schemaVersion: "wikimedia-backfill-run/1",
      status: "success",
      processed: backfill.processed,
      artifacts: backfill.paths,
      generatedAt: input.now.toISOString()
    });
  } catch (error) {
    await atomicWriteJson(input.root, backfillRunPath, {
      schemaVersion: "wikimedia-backfill-run/1",
      status: "failed",
      processed: 0,
      artifacts: [],
      reason: cleanFailure(error),
      generatedAt: input.now.toISOString()
    });
  }
  const [fighters, bouts] = await Promise.all([
    loadFighterRecords(path.join(input.root, "mma", "fighters")),
    loadBoutRecords(path.join(input.root, "mma", "bouts"))
  ]);
  const rebuilt = rebuildDerivedFighterData({ fighters, bouts, now: input.now });
  const derivedPaths: string[] = [];
  for (const fighter of rebuilt) {
    const relative = `mma/fighters/${fighter.id}.json`;
    await atomicWriteJson(input.root, relative, fighter);
    derivedPaths.push(relative);
  }
  const evaluationPaths = await reconcilePredictionResults({ root: input.root, bouts, now: input.now });
  const queuePath = await writeBackfillQueue({ root: input.root, fighters: rebuilt, bouts, now: input.now });
  const queue = buildBackfillQueue({ fighters: rebuilt, bouts, now: input.now });
  const rosterStatusPath = await writeRosterStatus({ root: input.root, fighters: rebuilt, bouts, queue, now: input.now });
  return {
    artifactPaths: [artifactPath, ...(results.some((result) => result.quota) ? [quotaPath] : []), ...(citoQuotaRecorded ? [citoQuotaPath] : []), ...normalizedPaths, ...wikimediaPaths, ...rosterStatusPaths, ...backfillPaths, backfillRunPath, ...derivedPaths, ...evaluationPaths, queuePath, rosterStatusPath],
    evidenceRefs,
    contentHash,
    materialChange: priorContentHash !== contentHash
  };
}

export async function refreshFightAiQAnalysis(input: { root: string; now: Date }): Promise<string[]> {
  const [fighters, bouts] = await Promise.all([
    loadFighterRecords(path.join(input.root, "mma", "fighters")),
    loadBoutRecords(path.join(input.root, "mma", "bouts"))
  ]);
  return runConfirmedBoutAnalysis({ root: input.root, fighters, bouts, now: input.now });
}
