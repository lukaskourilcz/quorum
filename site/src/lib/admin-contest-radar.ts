import "server-only";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The owner-only Contest Radar snapshot, read on the server and nowhere else.
 *
 * One loader for the whole workspace. Every tab asks a different question about the same set of
 * opportunities — what is due today, what the sources did, what the owner has already done — and
 * answering each from its own reader is how two tabs end up disagreeing about whether something
 * is still open.
 *
 * The boundary is narrow because this venture is owner-only by decision. What crosses: titles,
 * canonical URLs, dates, states, counts, reasons and the owner's own events. What does not: any
 * page body, any request header, any credential, any repository filename. A malformed record
 * becomes a count.
 *
 * Nothing in this file can enter a contest, and nothing it hands the client can either. The
 * workspace is a reading surface over records and a place to record what a person did afterwards.
 */

export type ContestStoreState = "missing" | "unreadable" | "present";

export interface ContestAdminFact {
  value: string | number | boolean | null;
  confidence: string | null;
  unavailableReason: string | null;
}

export interface ContestAdminRow {
  id: string;
  title: string;
  canonicalUrl: string;
  organizer: string | null;
  track: string;
  kind: string;
  language: string | null;
  lifecycle: string;
  readiness: string;
  readinessReasons: string[];
  legitimacy: string;
  deadline: ContestAdminFact;
  prizeDescription: ContestAdminFact;
  prizeValue: ContestAdminFact;
  currency: ContestAdminFact;
  purchaseRequired: ContestAdminFact;
  mechanics: string[];
  effortTier: string;
  effortBasis: string;
  /** Fields two sources disagreed about, shown rather than silently resolved. */
  conflicts: Array<{ field: string; values: string[] }>;
  sourceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lockedFields: string[];
}

export interface ContestAdminOwnerEvent {
  id: string;
  contestId: string;
  recordedAt: string;
  action: string;
  result: string | null;
  note: string | null;
  actualMinutes: number | null;
  supersedesEventId: string | null;
  /** False once a later correction supersedes it. The history stays; the reader gets what stands. */
  stands: boolean;
}

export interface ContestAdminRun {
  date: string;
  outcome: string;
  reason: string;
  candidates: number;
  records: number;
  cacheReused: number;
  modelCalls: number;
  modelUsd: number;
  apifyUsd: number;
  sources: Array<{ sourceId: string; outcome: string; reason: string; itemsKept: number; malformedItems: number }>;
  nextSafeAction: string;
}

export interface ContestAdminSource {
  id: string;
  name: string;
  track: string;
  type: string;
  host: string;
  verdict: string;
  verdictReason: string;
  discoveryOnly: boolean;
  lastVerifiedOn: string;
  verificationDueOn: string;
}

/**
 * One optional pilot lane, as the owner needs to see it.
 *
 * `verdict` and `heldReason` are both here because they answer different questions: the verdict is
 * what the evidence says about the lane, and the held reason is why there is no evidence. A lane
 * showing "undecided" with no explanation would look like an oversight rather than a decision.
 */
export interface ContestAdminPilotLane {
  platform: string;
  enabled: boolean;
  heldReason: string;
  queries: number;
  maxResultsPerRun: number;
  maxCostUsd: number;
  /** From the newest receipt, when one exists. Nulls mean the lane has never run. */
  outcome: string | null;
  fetched: number | null;
  unique: number | null;
  entryReady: number | null;
  costUsd: number | null;
  costPerUniqueUsd: number | null;
  verdict: string | null;
  verdictReason: string | null;
}

export interface AdminContestRadarSnapshot {
  recordsState: ContestStoreState;
  records: ContestAdminRow[];
  runsState: ContestStoreState;
  runs: ContestAdminRun[];
  ownerEventsState: ContestStoreState;
  ownerEvents: ContestAdminOwnerEvent[];
  sourcesState: ContestStoreState;
  sources: ContestAdminSource[];
  pilotState: ContestStoreState;
  pilotLanes: ContestAdminPilotLane[];
  pilotDate: string | null;
  pilotMode: string | null;
  /** Read from the countersigned founding rather than assumed. */
  authority: { foundingCountersigned: boolean; paidPathsHeld: boolean };
  unreadable: number;
  snapshotHash: string;
}

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maximum = 500): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum
    ? value.trim()
    : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function fact(value: unknown): ContestAdminFact {
  const record = object(value);
  const raw = record?.value;
  return {
    value: typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? raw : null,
    confidence: text(record?.confidence, 20),
    unavailableReason: text(record?.unavailableReason, 40)
  };
}

function strings(value: unknown, maximum: number, limit = 40): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => text(entry, maximum) ?? []).slice(0, limit)
    : [];
}

async function readDirectory<T>(
  relative: string,
  pattern: RegExp,
  parse: (value: unknown) => T | null
): Promise<{ state: ContestStoreState; values: T[]; unreadable: number }> {
  const directory = path.join(repositoryRoot(), relative);
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => pattern.test(name)).sort();
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing", values: [], unreadable: 0 }
      : { state: "unreadable", values: [], unreadable: 1 };
  }

  const values: T[] = [];
  let unreadable = 0;
  for (const name of names) {
    try {
      const parsed = parse(JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown);
      if (parsed) values.push(parsed);
      else unreadable += 1;
    } catch {
      unreadable += 1;
    }
  }
  return { state: names.length === 0 ? "missing" : "present", values, unreadable };
}

function parseRecord(value: unknown): ContestAdminRow | null {
  const record = object(value);
  if (!record || record.schemaVersion !== "contest-record/1") return null;
  const id = text(record.id, 160);
  const title = text(record.title, 300);
  const canonicalUrl = text(record.canonicalUrl, 2_000);
  if (!id || !title || !canonicalUrl) return null;

  const dates = object(record.dates);
  const prize = object(record.prize);
  const cost = object(record.cost);
  const effort = object(record.effort);
  const legitimacy = object(record.legitimacy);

  return {
    id,
    title,
    canonicalUrl,
    organizer: text(record.organizer, 200),
    track: text(record.track, 20) ?? "consumer",
    kind: text(record.kind, 40) ?? "other",
    language: text(record.language, 4),
    lifecycle: text(record.lifecycle, 20) ?? "discovered",
    readiness: text(record.readiness, 30) ?? "unavailable",
    readinessReasons: strings(record.readinessReasons, 300, 20),
    legitimacy: text(legitimacy?.state, 20) ?? "unverified",
    deadline: fact(dates?.deadline),
    prizeDescription: fact(prize?.description),
    prizeValue: fact(prize?.valueAmount),
    currency: fact(prize?.currency),
    purchaseRequired: fact(cost?.purchaseRequired),
    mechanics: strings(record.mechanics, 200, 20),
    effortTier: text(effort?.tier, 20) ?? "unknown",
    effortBasis: text(effort?.basis, 300) ?? "",
    conflicts: Array.isArray(record.conflicts)
      ? record.conflicts.flatMap((entry) => {
        const conflict = object(entry);
        const field = text(conflict?.field, 80);
        return field ? [{ field, values: strings(conflict?.values, 300, 10) }] : [];
      })
      : [],
    sourceCount: Array.isArray(record.sourceRefs) ? record.sourceRefs.length : 0,
    firstSeenAt: text(record.firstSeenAt, 40) ?? "",
    lastSeenAt: text(record.lastSeenAt, 40) ?? "",
    lockedFields: strings(record.lockedFields, 80, 40)
  };
}

function parseRun(value: unknown): ContestAdminRun | null {
  const record = object(value);
  if (!record || record.schemaVersion !== "contest-run/1") return null;
  const date = text(record.date, 10);
  const outcome = text(record.outcome, 20);
  if (!date || !outcome) return null;
  const spend = object(record.spend);
  return {
    date,
    outcome,
    reason: text(record.reason, 400) ?? "",
    candidates: count(record.candidates),
    records: count(record.records),
    cacheReused: count(record.cacheReused),
    modelCalls: count(spend?.modelCalls),
    modelUsd: count(spend?.modelUsd),
    apifyUsd: count(spend?.apifyUsd),
    sources: Array.isArray(record.sources)
      ? record.sources.flatMap((entry) => {
        const source = object(entry);
        const sourceId = text(source?.sourceId, 160);
        return sourceId
          ? [{
            sourceId,
            outcome: text(source?.outcome, 20) ?? "skipped",
            reason: text(source?.reason, 300) ?? "",
            itemsKept: count(source?.itemsKept),
            malformedItems: count(source?.malformedItems)
          }]
          : [];
      })
      : [],
    nextSafeAction: text(record.nextSafeAction, 300) ?? ""
  };
}

async function readOwnerEvents(): Promise<{ state: ContestStoreState; values: ContestAdminOwnerEvent[]; unreadable: number }> {
  const file = path.join(repositoryRoot(), "state/ventures/contest-radar/owner-events.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing", values: [], unreadable: 0 }
      : { state: "unreadable", values: [], unreadable: 1 };
  }

  const events = Array.isArray(object(raw)?.events) ? (object(raw)!.events as unknown[]) : [];
  const parsed: ContestAdminOwnerEvent[] = [];
  let unreadable = 0;
  for (const value of events) {
    const event = object(value);
    const id = text(event?.id, 160);
    const contestId = text(event?.contestId, 160);
    const action = text(event?.action, 30);
    const recordedAt = text(event?.recordedAt, 40);
    if (!id || !contestId || !action || !recordedAt) {
      unreadable += 1;
      continue;
    }
    parsed.push({
      id,
      contestId,
      recordedAt,
      action,
      result: text(event?.result, 20),
      note: text(event?.note, 1_000),
      actualMinutes: typeof event?.actualMinutes === "number" ? event.actualMinutes : null,
      supersedesEventId: text(event?.supersedesEventId, 160),
      stands: true
    });
  }

  // A correction supersedes an earlier event. Both stay on file — the history is the point — and
  // the reader is told which one still stands rather than reconstructing the chain themselves.
  const superseded = new Set(parsed.map((event) => event.supersedesEventId).filter((value): value is string => value !== null));
  return {
    state: parsed.length === 0 ? "missing" : "present",
    values: parsed.map((event) => ({ ...event, stands: !superseded.has(event.id) })),
    unreadable
  };
}

async function readSources(): Promise<{ state: ContestStoreState; values: ContestAdminSource[]; unreadable: number }> {
  try {
    const raw = JSON.parse(await readFile(
      path.join(repositoryRoot(), "config/contest-radar-sources.json"),
      "utf8"
    )) as unknown;
    const sources = Array.isArray(object(raw)?.sources) ? (object(raw)!.sources as unknown[]) : [];
    const values = sources.flatMap((entry): ContestAdminSource[] => {
      const source = object(entry);
      const id = text(source?.id, 160);
      if (!id) return [];
      return [{
        id,
        name: text(source?.name, 160) ?? id,
        track: text(source?.track, 20) ?? "consumer",
        type: text(source?.type, 20) ?? "html",
        host: text(source?.host, 200) ?? "",
        verdict: text(source?.verdict, 20) ?? "disabled",
        verdictReason: text(source?.verdictReason, 400) ?? "",
        discoveryOnly: source?.discoveryOnly === true,
        lastVerifiedOn: text(source?.lastVerifiedOn, 10) ?? "",
        verificationDueOn: text(source?.verificationDueOn, 10) ?? ""
      }];
    });
    return { state: values.length > 0 ? "present" : "missing", values, unreadable: 0 };
  } catch {
    return { state: "unreadable", values: [], unreadable: 1 };
  }
}

/**
 * The optional pilot's configured lanes, joined to the newest receipt if there is one.
 *
 * The configuration is the source of what a lane *is*; the receipt is the source of what it *did*.
 * A lane with no receipt shows nulls rather than zeros, because "never ran" and "ran and found
 * nothing" are the two answers the owner most needs to tell apart before deciding anything.
 */
async function readPilot(): Promise<{
  state: ContestStoreState;
  lanes: ContestAdminPilotLane[];
  date: string | null;
  mode: string | null;
  unreadable: number;
}> {
  let configured: Array<Record<string, unknown>>;
  try {
    const raw = JSON.parse(await readFile(
      path.join(repositoryRoot(), "config/contest-radar-social-pilot.json"),
      "utf8"
    )) as unknown;
    const lanes = object(raw)?.lanes;
    configured = Array.isArray(lanes) ? lanes.flatMap((lane) => object(lane) ? [object(lane)!] : []) : [];
  } catch {
    return { state: "unreadable", lanes: [], date: null, mode: null, unreadable: 1 };
  }
  if (configured.length === 0) return { state: "missing", lanes: [], date: null, mode: null, unreadable: 0 };

  const receipt = await readNewestJson("state/ventures/contest-radar/social-pilot");
  const measured = new Map<string, Record<string, unknown>>();
  const receiptLanes = object(receipt?.body)?.lanes;
  if (Array.isArray(receiptLanes)) {
    for (const entry of receiptLanes) {
      const lane = object(entry);
      const platform = text(lane?.platform, 20);
      if (lane && platform) measured.set(platform, lane);
    }
  }

  const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
  const lanes = configured.flatMap((lane): ContestAdminPilotLane[] => {
    const platform = text(lane.platform, 20);
    if (!platform) return [];
    const seen = measured.get(platform);
    return [{
      platform,
      enabled: lane.enabled === true,
      heldReason: text(lane.heldReason, 600) ?? "",
      queries: Array.isArray(lane.queries) ? lane.queries.length : 0,
      maxResultsPerRun: number(lane.maxResultsPerRun) ?? 0,
      maxCostUsd: number(lane.maxCostUsd) ?? 0,
      outcome: seen ? text(seen.outcome, 20) : null,
      fetched: seen ? number(seen.fetched) : null,
      unique: seen ? number(seen.unique) : null,
      entryReady: seen ? number(seen.entryReady) : null,
      costUsd: seen ? number(seen.costUsd) : null,
      costPerUniqueUsd: seen ? number(seen.costPerUniqueUsd) : null,
      verdict: seen ? text(seen.verdict, 20) : null,
      verdictReason: seen ? text(seen.verdictReason, 400) : null
    }];
  });

  return {
    state: "present",
    lanes,
    date: receipt ? receipt.name.slice(0, 10) : null,
    mode: receipt ? text(object(receipt.body)?.mode, 20) : null,
    unreadable: 0
  };
}

async function readNewestJson(relative: string): Promise<{ name: string; body: unknown } | null> {
  try {
    const directory = path.join(repositoryRoot(), relative);
    const names = (await readdir(directory))
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/u.test(name))
      .sort()
      .reverse();
    const newest = names[0];
    if (!newest) return null;
    return { name: newest, body: JSON.parse(await readFile(path.join(directory, newest), "utf8")) as unknown };
  } catch {
    return null;
  }
}

async function readAuthority(): Promise<AdminContestRadarSnapshot["authority"]> {
  try {
    const raw = await readFile(
      path.join(repositoryRoot(), "state/decisions/2026-08-30-contest-radar-founding.md"),
      "utf8"
    );
    return {
      foundingCountersigned: /^Status:\s*countersigned\s*$/mu.test(raw),
      paidPathsHeld: /Held by this decision/u.test(raw)
    };
  } catch {
    return { foundingCountersigned: false, paidPathsHeld: true };
  }
}

export async function readAdminContestRadar(): Promise<AdminContestRadarSnapshot> {
  const [records, runs, ownerEvents, sources, pilot, authority] = await Promise.all([
    readDirectory("state/ventures/contest-radar/records", /\.json$/u, parseRecord),
    readDirectory("state/ventures/contest-radar/runs", /^\d{4}-\d{2}-\d{2}\.json$/u, parseRun),
    readOwnerEvents(),
    readSources(),
    readPilot(),
    readAuthority()
  ]);

  const body = {
    recordsState: records.state,
    records: records.values.sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt) || left.id.localeCompare(right.id)),
    runsState: runs.state,
    runs: runs.values.sort((left, right) => right.date.localeCompare(left.date)),
    ownerEventsState: ownerEvents.state,
    ownerEvents: ownerEvents.values.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt)),
    sourcesState: sources.state,
    sources: sources.values.sort((left, right) => left.id.localeCompare(right.id)),
    pilotState: pilot.state,
    pilotLanes: pilot.lanes.sort((left, right) => left.platform.localeCompare(right.platform)),
    pilotDate: pilot.date,
    pilotMode: pilot.mode,
    authority,
    unreadable: records.unreadable + runs.unreadable + ownerEvents.unreadable + sources.unreadable + pilot.unreadable
  };
  return { ...body, snapshotHash: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
}
