import path from "node:path";
import { FighterCardSchema, independentMmaSourceCount, type BoutRecord, type FighterRecord } from "../contracts/mma.js";
import type { SourceFetchContext } from "../sources/types.js";
import { safeFetch, type SafeFetchOptions } from "../security/url.js";
import { atomicWriteJson, readJson } from "../state.js";

const USER_AGENT = "BoardlessAI-FightAIQ/1.0 (https://boardless-ai.vercel.app; source review bot)";
const PROFILE_FIELDS = ["name", "division", "record", "stance", "heightCm", "reachCm", "dateOfBirth", "team"] as const;

export interface WikimediaRosterEntry {
  org: "ufc" | "oktagon";
  name: string;
  slug: string;
  wikipediaTitle: string;
  wikipediaUrl: string;
  pageId: number;
}

interface WikimediaCategoryResponse {
  continue?: { cmcontinue?: string };
  query?: { categorymembers?: Array<{ pageid?: number; ns?: number; title?: string }> };
}

export function fighterSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/\([^)]*\)/gu, " ")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function sanitizeSourceText(value: string, maximum = 240): string {
  return value
    .replace(/<[^>]*>/gu, " ")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\{\{[^}]*\}\}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maximum);
}

export function projectWikimediaCategory(value: unknown, org: WikimediaRosterEntry["org"]): WikimediaRosterEntry[] {
  const response = value as WikimediaCategoryResponse;
  return (response.query?.categorymembers ?? []).flatMap((item) => {
    const title = typeof item.title === "string" ? sanitizeSourceText(item.title, 160) : "";
    const pageId = Number(item.pageid);
    const slug = fighterSlug(title);
    if (!title || !slug || !Number.isSafeInteger(pageId) || pageId <= 0 || item.ns !== 0) return [];
    return [{
      org,
      name: title,
      slug,
      wikipediaTitle: title,
      wikipediaUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
      pageId
    }];
  });
}

interface WikimediaTitleResponse {
  query?: {
    pages?: Array<{ pageid?: number; ns?: number; title?: string; missing?: boolean }>;
  };
}

export function projectWikimediaTitles(value: unknown, org: WikimediaRosterEntry["org"]): WikimediaRosterEntry[] {
  const response = value as WikimediaTitleResponse;
  return (response.query?.pages ?? []).flatMap((item) => {
    if (item.missing === true) return [];
    const title = typeof item.title === "string" ? sanitizeSourceText(item.title, 160) : "";
    const pageId = Number(item.pageid);
    const slug = fighterSlug(title);
    if (!title || !slug || !Number.isSafeInteger(pageId) || pageId <= 0 || item.ns !== 0) return [];
    return [{
      org,
      name: title,
      slug,
      wikipediaTitle: title,
      wikipediaUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
      pageId
    }];
  });
}

/**
 * Resolve named fighters instead of crawling a category.
 *
 * The category crawl below shares one `entries` map across an organization's categories and
 * stops at 500, so the UFC male category consumed the whole budget and the roster arrived
 * alphabetically truncated: the 840 cards on disk ran A-G and then thinned out, which is why
 * Alex Pereira, Alexander Volkanovski and Alexandre Pantoja were absent while 560 cards with
 * no bout history were present. It also cannot reach Oktagon at all, because the category it
 * asks for does not exist. Asking for the policy's titles directly avoids both problems and
 * costs about three requests instead of twenty on the same keyless endpoint.
 */
export async function fetchWikimediaRosterByTitles(input: {
  org: WikimediaRosterEntry["org"];
  titles: readonly string[];
  context: SourceFetchContext;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<WikimediaRosterEntry[]> {
  const entries = new Map<string, WikimediaRosterEntry>();
  const unique = [...new Set(input.titles.filter((title) => title.trim().length > 0))];
  // The API accepts at most 50 titles per query.
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50);
    const endpoint = new URL("https://en.wikipedia.org/w/api.php");
    endpoint.searchParams.set("action", "query");
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("formatversion", "2");
    endpoint.searchParams.set("redirects", "1");
    endpoint.searchParams.set("maxlag", "5");
    endpoint.searchParams.set("titles", batch.join("|"));
    const response = await safeFetch(endpoint.toString(), {
      allowHosts: input.context.allowHosts,
      headers: { "User-Agent": USER_AGENT },
      maxBytes: 750_000,
      fetchImpl: input.fetchImpl,
      resolveImpl: input.resolveImpl
    });
    const payload = JSON.parse(new TextDecoder().decode(response.body)) as unknown;
    for (const entry of projectWikimediaTitles(payload, input.org)) entries.set(`${entry.org}:${entry.slug}`, entry);
  }
  return [...entries.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function fetchWikimediaRoster(input: {
  org: WikimediaRosterEntry["org"];
  context: SourceFetchContext;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<WikimediaRosterEntry[]> {
  const categories = input.org === "ufc"
    ? ["Ultimate Fighting Championship male fighters", "Ultimate Fighting Championship female fighters"]
    : ["Oktagon MMA champions"];
  const entries = new Map<string, WikimediaRosterEntry>();
  for (const category of categories) {
    let continuation: string | undefined;
    for (let page = 0; page < 6; page += 1) {
      const endpoint = new URL("https://en.wikipedia.org/w/api.php");
      endpoint.searchParams.set("action", "query");
      endpoint.searchParams.set("format", "json");
      endpoint.searchParams.set("formatversion", "2");
      endpoint.searchParams.set("list", "categorymembers");
      endpoint.searchParams.set("cmnamespace", "0");
      endpoint.searchParams.set("cmlimit", "100");
      endpoint.searchParams.set("cmtitle", `Category:${category}`);
      endpoint.searchParams.set("maxlag", "5");
      if (continuation) endpoint.searchParams.set("cmcontinue", continuation);
      const response = await safeFetch(endpoint.toString(), {
        allowHosts: input.context.allowHosts,
        headers: { "User-Agent": USER_AGENT },
        maxBytes: 750_000,
        fetchImpl: input.fetchImpl,
        resolveImpl: input.resolveImpl
      });
      const payload = JSON.parse(new TextDecoder().decode(response.body)) as WikimediaCategoryResponse;
      for (const entry of projectWikimediaCategory(payload, input.org)) entries.set(`${entry.org}:${entry.slug}`, entry);
      continuation = payload.continue?.cmcontinue;
      if (!continuation || entries.size >= 500) break;
    }
  }
  return [...entries.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function field(value: string, sourceRef: string, retrievedAt: string) {
  return { value, sourceRefs: [sourceRef], retrievedAt, status: "provisional" as const, corroborated: false };
}

function addAgreeingSource(current: FighterRecord["fields"][string] | undefined, value: string, sourceRef: string, retrievedAt: string) {
  if (!current) return field(value, sourceRef, retrievedAt);
  if (String(current.value).trim().toLocaleLowerCase("en") !== value.trim().toLocaleLowerCase("en")) return current;
  const sourceRefs = [...new Set([...current.sourceRefs, sourceRef])].sort();
  const corroborated = independentMmaSourceCount(sourceRefs) >= 2;
  return { ...current, sourceRefs, retrievedAt, corroborated, status: corroborated ? "verified" as const : current.status };
}

function eligible(fields: FighterRecord["fields"], criticalFields: readonly string[], fighter: FighterRecord | null): boolean {
  const open = new Set((fighter?.discrepancies ?? []).filter((item) => item.status === "open").map((item) => item.field));
  return criticalFields.every((name) => {
    const value = fields[name];
    return Boolean(value?.status === "verified" && value.corroborated && independentMmaSourceCount(value.sourceRefs) >= 2 && !open.has(name));
  });
}

function cardForEntry(entry: WikimediaRosterEntry, retrievedAt: string, existing: FighterRecord | null): FighterRecord {
  const id = `${entry.org}:${entry.slug}` as const;
  const sourceRef = `source:wikipedia:${entry.pageId}`;
  const nameField = addAgreeingSource(existing?.fields.name, entry.name, sourceRef, retrievedAt);
  const fields: FighterRecord["fields"] = { ...(existing?.fields ?? {}), name: nameField };
  const gaps = PROFILE_FIELDS.filter((name) => !fields[name] || fields[name]?.value === null);
  const populated = PROFILE_FIELDS.length - gaps.length;
  const corroborated = PROFILE_FIELDS.filter((name) => fields[name]?.corroborated).length;
  const criticalFields = existing?.criticalFields ?? ["name", "division", "record"];
  const source = {
    id: sourceRef,
    url: entry.wikipediaUrl,
    publisher: "Wikipedia",
    title: entry.wikipediaTitle,
    retrievedAt,
    evidenceTier: "secondary" as const,
    license: "CC BY-SA"
  };
  const sources = [...(existing?.sources ?? []).filter((item) => item.id !== sourceRef), source].sort((left, right) => left.id.localeCompare(right.id));
  return FighterCardSchema.parse({
    schemaVersion: "fighter-card/1",
    id,
    slug: entry.slug,
    org: entry.org,
    canonicalName: existing?.canonicalName ?? entry.name,
    aliases: existing?.aliases ?? [],
    identity: {
      ...(existing?.identity ?? { wikidataId: null, externalIds: {} }),
      wikipediaTitle: entry.wikipediaTitle,
      externalIds: { ...(existing?.identity.externalIds ?? {}), wikipediaPageId: String(entry.pageId) }
    },
    organizationHistory: existing?.organizationHistory ?? [{ org: entry.org, from: null, to: null, status: "unknown", sourceRefs: [sourceRef] }],
    sources,
    fields,
    criticalFields,
    discrepancies: existing?.discrepancies ?? [],
    history: existing?.history ?? [],
    statsProfiles: existing?.statsProfiles ?? [],
    rating: existing?.rating ?? { system: "glicko2", rating: 1500, deviation: 350, volatility: 0.06, boutCount: 0, asOfBoutRef: null, updatedAt: retrievedAt },
    quality: { evidenceTier: existing?.quality.evidenceTier ?? "secondary", gaps, lastReviewedAt: existing?.quality.lastReviewedAt ?? null },
    changeLog: existing?.changeLog ?? [{ at: retrievedAt, kind: "created", fields: ["identity", "name"], sourceRefs: [sourceRef], note: "Created from a Wikipedia fighter category." }],
    completeness: Number((populated / PROFILE_FIELDS.length).toFixed(4)),
    corroboration: Number((corroborated / PROFILE_FIELDS.length).toFixed(4)),
    modelEligible: eligible(fields, criticalFields, existing),
    modelVersion: existing?.modelVersion ?? "mma-0.1.0+00000000",
    updatedAt: existing?.updatedAt ?? retrievedAt
  });
}

export async function materializeWikimediaRoster(input: {
  root: string;
  entries: readonly WikimediaRosterEntry[];
  retrievedAt: Date;
}): Promise<string[]> {
  const output: string[] = [];
  for (const entry of [...input.entries].sort((left, right) => `${left.org}:${left.slug}`.localeCompare(`${right.org}:${right.slug}`))) {
    const relative = `mma/fighters/${entry.org}:${entry.slug}.json`;
    const current = await readJson<unknown | null>(input.root, relative, null);
    const existing = current === null ? null : FighterCardSchema.parse(current);
    const card = cardForEntry(entry, input.retrievedAt.toISOString(), existing);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(card)) await atomicWriteJson(input.root, relative, card);
    output.push(relative);
  }
  return output;
}

export interface BackfillQueueItem {
  fighterRef: string;
  priority: number;
  reason: "upcoming-bout" | "missing-history" | "missing-profile" | "stale";
  gaps: string[];
}

export function buildBackfillQueue(input: {
  fighters: readonly FighterRecord[];
  bouts: readonly BoutRecord[];
  now: Date;
  staleAfterDays?: number;
}): BackfillQueueItem[] {
  const upcoming = new Set(input.bouts
    .filter((bout) => !["completed", "cancelled", "postponed"].includes(bout.status) && Date.parse(bout.event.startsAtUtc) >= input.now.getTime())
    .flatMap((bout) => [bout.fighters.red, bout.fighters.blue]));
  const staleBefore = input.now.getTime() - (input.staleAfterDays ?? 30) * 86_400_000;
  return input.fighters.flatMap((fighter) => {
    const gaps = [...fighter.quality.gaps];
    const reason: BackfillQueueItem["reason"] | null = upcoming.has(fighter.id)
      ? "upcoming-bout"
      : fighter.history.length === 0
        ? "missing-history"
        : gaps.length > 0
          ? "missing-profile"
          : Date.parse(fighter.updatedAt) < staleBefore
            ? "stale"
            : null;
    if (!reason) return [];
    const base = reason === "upcoming-bout" ? 1_000 : reason === "missing-history" ? 600 : reason === "missing-profile" ? 300 : 100;
    return [{ fighterRef: fighter.id, priority: base + Math.min(99, gaps.length * 10), reason, gaps }];
  }).sort((left, right) => right.priority - left.priority || left.fighterRef.localeCompare(right.fighterRef));
}

export async function writeBackfillQueue(input: { root: string; fighters: readonly FighterRecord[]; bouts: readonly BoutRecord[]; now: Date }): Promise<string> {
  const relative = "mma/backfill/queue.json";
  await atomicWriteJson(input.root, relative, {
    schemaVersion: "mma-backfill-queue/1",
    generatedAt: input.now.toISOString(),
    items: buildBackfillQueue(input)
  });
  return relative;
}

export async function reconcileRosterStatuses(input: {
  root: string;
  org: FighterRecord["org"];
  fighters: readonly FighterRecord[];
  seenFighterRefs: ReadonlySet<string>;
  sourceRef: string;
  reviewedAt: Date;
  externalIdKey: string;
}): Promise<string[]> {
  const changedPaths: string[] = [];
  const timestamp = input.reviewedAt.toISOString();
  const day = timestamp.slice(0, 10);
  for (const fighter of input.fighters.filter((item) => item.org === input.org && item.identity.externalIds[input.externalIdKey])) {
    const nextStatus = input.seenFighterRefs.has(fighter.id) ? "active" as const : "former" as const;
    const organizationHistory = structuredClone(fighter.organizationHistory);
    const current = organizationHistory.filter((entry) => entry.org === input.org).at(-1);
    if (current?.status === nextStatus) continue;
    if (current && current.to === null) current.to = day;
    organizationHistory.push({ org: input.org, from: day, to: null, status: nextStatus, sourceRefs: [input.sourceRef] });
    const card = FighterCardSchema.parse({
      ...fighter,
      organizationHistory,
      changeLog: [...fighter.changeLog, {
        at: timestamp,
        kind: "status-change",
        fields: ["organizationHistory"],
        sourceRefs: [input.sourceRef],
        note: nextStatus === "active" ? "The completed roster crawl lists this fighter as active." : "The completed roster crawl no longer lists this fighter as active."
      }],
      updatedAt: timestamp
    });
    const relative = `mma/fighters/${fighter.id}.json`;
    await atomicWriteJson(input.root, relative, card);
    changedPaths.push(relative);
  }
  return changedPaths;
}

export async function writeRosterStatus(input: {
  root: string;
  fighters: readonly FighterRecord[];
  bouts: readonly BoutRecord[];
  queue: readonly BackfillQueueItem[];
  now: Date;
}): Promise<string> {
  const statusCounts = (org: FighterRecord["org"]) => ({
    active: input.fighters.filter((fighter) => fighter.org === org && fighter.organizationHistory.at(-1)?.status === "active").length,
    former: input.fighters.filter((fighter) => fighter.org === org && fighter.organizationHistory.at(-1)?.status === "former").length,
    unknown: input.fighters.filter((fighter) => fighter.org === org && fighter.organizationHistory.at(-1)?.status === "unknown").length
  });
  const relative = "mma/roster/status.json";
  await atomicWriteJson(input.root, relative, {
    schemaVersion: "mma-roster-status/1",
    generatedAt: input.now.toISOString(),
    organizations: { ufc: statusCounts("ufc"), oktagon: statusCounts("oktagon") },
    confirmedUpcomingBouts: input.bouts.filter((bout) => ["confirmed", "weigh-in"].includes(bout.status) && Date.parse(bout.event.startsAtUtc) >= input.now.getTime()).length,
    queuedForEnrichment: input.queue.length,
    priorityFighters: input.queue.filter((item) => item.reason === "upcoming-bout").length,
    note: "Unknown means a historical identity was found but no reviewed current-roster source has confirmed active status."
  });
  return relative;
}

export function fighterCardPath(root: string, fighterRef: string): string {
  return path.join(root, "mma", "fighters", `${fighterRef}.json`);
}
