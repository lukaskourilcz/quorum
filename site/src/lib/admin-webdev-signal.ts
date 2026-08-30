import "server-only";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The one server-only snapshot the WebDev Signal workspace reads.
 *
 * One loader, not one per tab. Every tab in that workspace is a different question about the same
 * Prague edition day — what ran, what was rejected, why one story won, whether both editions are
 * safe — and answering each from its own reader is how two tabs come to disagree about the same
 * day. The snapshot resolves everything on the server and hands the client plain JSON.
 *
 * It is also the sanitising boundary. What crosses it is bounded: dates, counts, states, reasons
 * and evidence refs. What does not cross is the raw source payload, the provider response, the
 * model response, any secret or token, any source body text and any repository filename — a
 * malformed file becomes a number, never a path.
 *
 * Absent, unreadable and empty are three different answers and the workspace shows all three.
 * WebDev Signal has never run, so "no observations" is currently the honest state of the venture
 * rather than a fault, and a tab that rendered it as an error would send the owner looking for a
 * bug that is not there.
 */

export type WebDevStoreState = "missing" | "unreadable" | "present";

export interface WebDevAdminMeasure {
  value: number | null;
  unavailableReason: string | null;
}

export interface WebDevAdminEdition {
  locale: "cs" | "en";
  state: "valid" | "held" | "absent";
  holdReasons: string[];
  claimParity: "pass" | "fail" | "unavailable";
  accessibility: "pass" | "fail" | "unavailable";
  renderState: "rendered" | "held" | "absent";
  deliveryState: "queued" | "held" | "published" | "absent" | "needs-reconciliation";
}

export interface WebDevAdminDay {
  date: string;
  provenance: "fixture" | "live";
  outcome: "selected" | "NO_EDITION" | "not-run";
  reason: string;
  selectedRecordId: string | null;
  scoreMargin: WebDevAdminMeasure;
  confidence: WebDevAdminMeasure;
  ownerOverride: boolean;
  goviral: { status: string; changedWinner: boolean };
  sources: {
    configured: number;
    attempted: number;
    healthy: number;
    failed: number;
    authorityClassesCovered: number;
    layoutChanges: number;
  };
  candidates: {
    fetched: number;
    afterPrefilter: number;
    duplicatesCollapsed: number;
    held: number;
    eligible: number;
  };
  editions: WebDevAdminEdition[];
  corrections: { opened: number; resolved: number; factualIncidents: number; securityVersionIncidents: number };
  cost: { modelCalls: number; providerCostUsd: number; cacheReused: number; callsAvoided: number };
  evidenceRefs: string[];
  snapshotHash: string;
}

export interface WebDevAdminProfile {
  id: string;
  displayLabel: string;
  locale: string;
  lifecycle: string;
  liveEligible: boolean;
  /** Always empty while the owner has not created the accounts, and the workspace says so. */
  connections: string[];
}

export interface WebDevAdminBaseline {
  startsOn: string;
  endsOn: string;
  observedDays: number;
  windowDays: number;
  verdict: string;
  verdictReason: string;
  eligibleStoryRate: { numerator: number; denominator: number; rate: number | null };
  noEditionRate: { numerator: number; denominator: number; rate: number | null };
  claimParityRate: { numerator: number; denominator: number; rate: number | null };
  verifiedPublishRate: { numerator: number; denominator: number; rate: number | null };
  providerCostUsd: number;
  modelCalls: number;
}

export interface AdminWebDevSignalSnapshot {
  observationsState: WebDevStoreState;
  days: WebDevAdminDay[];
  baselineState: WebDevStoreState;
  baseline: WebDevAdminBaseline | null;
  profilesState: WebDevStoreState;
  profiles: WebDevAdminProfile[];
  /** The venture's own posture, read from the countersigned founding rather than assumed. */
  authority: {
    foundingCountersigned: boolean;
    liveBehaviourHeld: boolean;
    accountsCreated: boolean;
  };
  /** Count only: repository filenames never cross this boundary. */
  unreadable: number;
  /** Deterministic over everything above, so two reads of the same state agree. */
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

function text(value: unknown, maximum = 2_000): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum
    ? value.trim()
    : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function measure(value: unknown): WebDevAdminMeasure {
  const record = object(value);
  const numeric = record?.value;
  return {
    value: typeof numeric === "number" && Number.isFinite(numeric) ? numeric : null,
    unavailableReason: text(record?.unavailableReason, 60)
  };
}

function rate(value: unknown): { numerator: number; denominator: number; rate: number | null } {
  const record = object(value);
  const ratio = record?.rate;
  return {
    numerator: count(record?.numerator),
    denominator: count(record?.denominator),
    rate: typeof ratio === "number" && Number.isFinite(ratio) ? ratio : null
  };
}

async function readDirectory<T>(
  relative: string,
  pattern: RegExp,
  parse: (value: unknown) => T | null
): Promise<{ state: WebDevStoreState; values: T[]; unreadable: number }> {
  const directory = path.join(repositoryRoot(), relative);
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => pattern.test(name)).sort();
  } catch (error) {
    // A directory that does not exist is the state of a venture that has not run, which is the
    // truth about this one today. It is not an error and must not render as one.
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

function parseDay(value: unknown): WebDevAdminDay | null {
  const record = object(value);
  if (!record || record.schemaVersion !== "webdev-observation/1") return null;
  const date = text(record.date, 10);
  const decision = object(record.decision);
  const sources = object(record.sources);
  const candidates = object(record.candidates);
  const corrections = object(record.corrections);
  const cost = object(record.cost);
  const goviral = object(record.goviral);
  const refs = object(record.refs);
  const outcome = text(decision?.outcome, 20);
  const snapshotHash = text(record.snapshotHash, 64);
  if (!date || !decision || !outcome || !snapshotHash) return null;
  if (outcome !== "selected" && outcome !== "NO_EDITION" && outcome !== "not-run") return null;

  const editions = Array.isArray(record.editions)
    ? record.editions.flatMap((entry): WebDevAdminEdition[] => {
      const edition = object(entry);
      const locale = text(edition?.locale, 2);
      const state = text(edition?.state, 10);
      if (!edition || (locale !== "cs" && locale !== "en")) return [];
      if (state !== "valid" && state !== "held" && state !== "absent") return [];
      return [{
        locale,
        state,
        holdReasons: Array.isArray(edition.holdReasons)
          ? edition.holdReasons.flatMap((reason) => text(reason, 240) ?? [])
          : [],
        claimParity: (text(edition.claimParity, 12) ?? "unavailable") as WebDevAdminEdition["claimParity"],
        accessibility: (text(edition.accessibility, 12) ?? "unavailable") as WebDevAdminEdition["accessibility"],
        renderState: (text(edition.renderState, 12) ?? "absent") as WebDevAdminEdition["renderState"],
        deliveryState: (text(edition.deliveryState, 24) ?? "absent") as WebDevAdminEdition["deliveryState"]
      }];
    })
    : [];

  // Evidence refs travel; source bodies, provider payloads and filenames do not.
  const evidenceRefs = refs
    ? Object.values(refs).flatMap((value) => Array.isArray(value)
      ? value.flatMap((entry) => text(entry, 300) ?? [])
      : text(value, 300) ?? [])
    : [];

  return {
    date,
    provenance: text(record.provenance, 8) === "live" ? "live" : "fixture",
    outcome,
    reason: text(decision.reason, 500) ?? "No reason recorded.",
    selectedRecordId: text(decision.selectedRecordId, 200),
    scoreMargin: measure(decision.scoreMargin),
    confidence: measure(decision.confidence),
    ownerOverride: decision.ownerOverride === true,
    goviral: {
      status: text(goviral?.status, 24) ?? "unavailable",
      changedWinner: goviral?.changedWinner === true
    },
    sources: {
      configured: count(sources?.configured),
      attempted: count(sources?.attempted),
      healthy: count(sources?.healthy),
      failed: count(sources?.failed),
      authorityClassesCovered: count(sources?.authorityClassesCovered),
      layoutChanges: count(sources?.layoutChanges)
    },
    candidates: {
      fetched: count(candidates?.fetched),
      afterPrefilter: count(candidates?.afterPrefilter),
      duplicatesCollapsed: count(candidates?.duplicatesCollapsed),
      held: count(candidates?.held),
      eligible: count(candidates?.eligible)
    },
    editions,
    corrections: {
      opened: count(corrections?.opened),
      resolved: count(corrections?.resolved),
      factualIncidents: count(corrections?.factualIncidents),
      securityVersionIncidents: count(corrections?.securityVersionIncidents)
    },
    cost: {
      modelCalls: count(cost?.modelCalls),
      providerCostUsd: count(cost?.providerCostUsd),
      cacheReused: count(cost?.cacheReused),
      callsAvoided: count(cost?.callsAvoided)
    },
    evidenceRefs,
    snapshotHash
  };
}

function parseBaseline(value: unknown): WebDevAdminBaseline | null {
  const record = object(value);
  if (!record || record.schemaVersion !== "webdev-baseline/1") return null;
  const editorial = object(record.editorial);
  const editionQuality = object(record.editionQuality);
  const publishing = object(record.publishing);
  const cost = object(record.cost);
  const startsOn = text(record.startsOn, 10);
  const endsOn = text(record.endsOn, 10);
  const verdict = text(record.verdict, 24);
  if (!startsOn || !endsOn || !verdict) return null;
  return {
    startsOn,
    endsOn,
    observedDays: count(record.observedDays),
    windowDays: count(record.windowDays),
    verdict,
    verdictReason: text(record.verdictReason, 600) ?? "No reason recorded.",
    eligibleStoryRate: rate(editorial?.eligibleStoryRate),
    noEditionRate: rate(editorial?.noEditionRate),
    claimParityRate: rate(editionQuality?.claimParityRate),
    verifiedPublishRate: rate(publishing?.verifiedPublishRate),
    providerCostUsd: count(cost?.providerCostUsd),
    modelCalls: count(cost?.modelCalls)
  };
}

async function readProfiles(): Promise<{ state: WebDevStoreState; values: WebDevAdminProfile[]; unreadable: number }> {
  try {
    const raw = JSON.parse(await readFile(
      path.join(repositoryRoot(), "config/social-publisher-registry.json"),
      "utf8"
    )) as unknown;
    const registry = object(raw);
    const profiles = Array.isArray(registry?.profiles) ? registry.profiles : [];
    const connections = Array.isArray(registry?.connections) ? registry.connections : [];
    const values = profiles.flatMap((entry): WebDevAdminProfile[] => {
      const profile = object(entry);
      if (profile?.ventureRef !== "webdev-signal") return [];
      const id = text(profile.id, 120);
      if (!id) return [];
      return [{
        id,
        displayLabel: text(profile.displayLabel, 120) ?? id,
        locale: Array.isArray(profile.languages) ? (text(profile.languages[0], 8) ?? "unknown") : "unknown",
        lifecycle: text(profile.lifecycle, 24) ?? "unknown",
        liveEligible: profile.liveEligible === true,
        connections: connections.flatMap((candidate) => {
          const connection = object(candidate);
          return connection?.profileId === id ? [text(connection.id, 140) ?? []].flat() : [];
        })
      }];
    });
    return { state: values.length > 0 ? "present" : "missing", values, unreadable: 0 };
  } catch {
    return { state: "unreadable", values: [], unreadable: 1 };
  }
}

async function readAuthority(): Promise<AdminWebDevSignalSnapshot["authority"]> {
  try {
    const raw = await readFile(
      path.join(repositoryRoot(), "state/decisions/2026-08-28-webdev-signal-founding.md"),
      "utf8"
    );
    return {
      foundingCountersigned: /^Status:\s*countersigned\s*$/mu.test(raw),
      liveBehaviourHeld: /Held by this decision/u.test(raw),
      // No connection exists until the owner makes one, and the registry is where that shows up.
      accountsCreated: false
    };
  } catch {
    return { foundingCountersigned: false, liveBehaviourHeld: true, accountsCreated: false };
  }
}

export async function readAdminWebDevSignal(): Promise<AdminWebDevSignalSnapshot> {
  const [observations, baselines, profiles, authority] = await Promise.all([
    readDirectory("state/ventures/webdev-signal/observations", /^\d{4}-\d{2}-\d{2}\.json$/u, parseDay),
    readDirectory("state/ventures/webdev-signal/baselines", /^\d{4}-\d{2}-\d{2}\.json$/u, parseBaseline),
    readProfiles(),
    readAuthority()
  ]);

  const days = observations.values.sort((left, right) => right.date.localeCompare(left.date));
  const baseline = baselines.values.sort((left, right) => right.endsOn.localeCompare(left.endsOn))[0] ?? null;
  const body = {
    observationsState: observations.state,
    days,
    baselineState: baselines.state,
    baseline,
    profilesState: profiles.state,
    profiles: profiles.values.sort((left, right) => left.id.localeCompare(right.id)),
    authority,
    unreadable: observations.unreadable + baselines.unreadable + profiles.unreadable
  };
  return {
    ...body,
    snapshotHash: createHash("sha256").update(JSON.stringify(body)).digest("hex")
  };
}
