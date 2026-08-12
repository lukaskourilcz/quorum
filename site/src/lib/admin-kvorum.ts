import "server-only";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseRatingLedger, type RatingRecord } from "./rating-model";

export type AdminKvorumStoreState = "missing" | "unreadable" | "present";

export interface AdminKvorumSource {
  sourceId: string;
  sourceName: string;
  url: string;
  publishedAt: string;
  excerpt: string;
  discoveryOnly: boolean;
}

export interface AdminKvorumClaim {
  id: string;
  type: "fact-multi" | "fact-single" | "commentary";
  text: string;
  sources: AdminKvorumSource[];
}

export interface AdminKvorumCopyBlock {
  id: string;
  platform: string;
  format: string;
  locale: "cs" | "en" | "uk";
  text: string;
  altText: string | null;
  reason: string;
}

export interface AdminKvorumDraftText {
  capturedAt?: string;
  headline: string;
  summary: string;
  whyItMatters: string;
  whyThisIsWorthIt: string;
  ourAngle: string;
  ourAngleDiffers: string;
  platforms: string[];
  formats: string[];
  copyBlocks: AdminKvorumCopyBlock[];
}

export interface AdminKvorumRecommendation extends AdminKvorumDraftText {
  id: string;
  slug: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "approved" | "posted" | "archived" | "rejected";
  contentHash: string;
  ratings: RatingRecord[];
  evidence: {
    monitorDate: string;
    continuationOf: string | null;
    sources: AdminKvorumSource[];
    claims: AdminKvorumClaim[];
    stit: {
      internalOnly: true;
      summary: string;
      posts: Array<{
        postUrl: string;
        excerpt: string;
        engagement: { likes: number | null; comments: number | null; shares: number | null };
      }>;
    } | null;
  };
  gates: {
    evaluatedAt: string;
    passed: boolean;
    results: Array<{
      gate: string;
      verdict: "pass" | "fail";
      message: string;
      claimIds: string[];
    }>;
  };
  designLab: {
    status: "not-requested" | "queued" | "rendered" | "failed";
    requestedAt: string | null;
    resolvedAt: string | null;
    failureReason: string | null;
  };
  owner: {
    postingMode: "manual-only";
    approvedAt: string | null;
    postedAt: string | null;
    archivedAt: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    postedUrl: string | null;
    original: AdminKvorumDraftText | null;
    editHistory: Array<{ editedAt: string; fields: string[]; note: string }>;
  };
}

export interface AdminKvorumMonitorDay {
  date: string;
  generatedAt: string;
  fixtureOnly: boolean;
  itemsKept: number;
  sourceResults: Array<{
    sourceId: string;
    kind: "apify" | "feed";
    attempted: boolean;
    status: "success" | "skipped" | "failed" | "fixture";
    count: number;
    reason: string | null;
  }>;
  clusters: Array<{
    id: string;
    title: string;
    entityIds: string[];
    topicTokens: string[];
    continuationOf: string | null;
    rank: {
      position: number;
      score: number;
      factors: {
        corroboration: number;
        entityWeight: number;
        engagementSalience: number;
        novelty: number;
        standingTopicContinuity: number;
      };
    };
    sources: Array<AdminKvorumSource & {
      engagement: { likes: number | null; comments: number | null; shares: number | null } | null;
    }>;
  }>;
  purge: {
    retentionDays: 30;
    evaluatedAt: string;
    cutoffPublishedAt: string;
    rawItemsBefore: number;
    rawItemsAfter: number;
    purgedCount: number;
  };
}

export interface AdminKvorumQuota {
  month: string;
  shareCapUsd: number;
  estimatedUsedUsd: number;
  sharedAccountUsedUsd: number | null;
  reservedPerRun: number;
  updatedAt: string;
  perActorCounts: Array<{ actorId: string; runs: number; items: number; estimatedUsd: number }>;
}

export interface AdminKvorumSnapshot {
  recommendationsState: AdminKvorumStoreState;
  recommendations: AdminKvorumRecommendation[];
  monitorState: AdminKvorumStoreState;
  monitor: AdminKvorumMonitorDay[];
  quotaState: AdminKvorumStoreState;
  quota: AdminKvorumQuota | null;
  /** Count only: repository filenames do not cross the server-to-client boundary. */
  unreadable: number;
}

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maximum = 12_000): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum
    ? value.trim()
    : null;
}

function date(value: unknown): string | null {
  const candidate = text(value, 10);
  return candidate && /^\d{4}-\d{2}-\d{2}$/u.test(candidate) ? candidate : null;
}

function dateTime(value: unknown): string | null {
  const candidate = text(value, 40);
  return candidate && /^\d{4}-\d{2}-\d{2}T/u.test(candidate) && Number.isFinite(Date.parse(candidate))
    ? candidate
    : null;
}

function httpsUrl(value: unknown): string | null {
  const candidate = text(value, 2_000);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function nonnegative(value: unknown, integer = false): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && (!integer || Number.isInteger(value))
    ? value
    : null;
}

function strings(value: unknown, maximum = 80): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const parsed = value.map((entry) => text(entry, 160));
  return parsed.every((entry): entry is string => entry !== null) ? parsed : null;
}

function nullableDateTime(value: unknown): value is string | null {
  return value === null || dateTime(value) !== null;
}

function nullableText(value: unknown, maximum: number): value is string | null {
  return value === null || text(value, maximum) !== null;
}

function parseCopyBlock(value: unknown): AdminKvorumCopyBlock | null {
  const entry = object(value);
  const id = text(entry?.id, 80);
  const platform = text(entry?.platform, 80);
  const format = text(entry?.format, 80);
  const body = text(entry?.text, 12_000);
  const reason = text(entry?.reason, 800);
  if (!entry || !id || !platform || !format || !body || !reason
    || (entry.locale !== "cs" && entry.locale !== "en" && entry.locale !== "uk")
    || !nullableText(entry.altText, 2_000)) return null;
  return {
    id,
    platform,
    format,
    locale: entry.locale,
    text: body,
    altText: entry.altText === null ? null : entry.altText.trim(),
    reason
  };
}

function parseDraft(value: unknown, original = false): AdminKvorumDraftText | null {
  const entry = object(value);
  const headline = text(entry?.headline, 240);
  const summary = text(entry?.summary, 2_000);
  const whyItMatters = text(entry?.whyItMatters, 2_000);
  const whyThisIsWorthIt = text(entry?.whyThisIsWorthIt, 1_000);
  const ourAngle = text(entry?.ourAngle, 2_000);
  const ourAngleDiffers = text(entry?.ourAngleDiffers, 2_000);
  const platforms = strings(entry?.platforms, 10);
  const formats = strings(entry?.formats, 20);
  const copyBlocks = Array.isArray(entry?.copyBlocks) ? entry.copyBlocks.map(parseCopyBlock) : [];
  const capturedAt = original ? dateTime(entry?.capturedAt) : null;
  if (!entry || !headline || !summary || !whyItMatters || !whyThisIsWorthIt || !ourAngle
    || !ourAngleDiffers || !platforms?.length || !formats?.length || !Array.isArray(entry.copyBlocks)
    || copyBlocks.length === 0 || copyBlocks.some((block) => block === null) || (original && !capturedAt)) return null;
  return {
    ...(capturedAt ? { capturedAt } : {}),
    headline,
    summary,
    whyItMatters,
    whyThisIsWorthIt,
    ourAngle,
    ourAngleDiffers,
    platforms,
    formats,
    copyBlocks: copyBlocks as AdminKvorumCopyBlock[]
  };
}

type ParsedSource = { itemRef: string; source: AdminKvorumSource };

function parseSource(value: unknown): ParsedSource | null {
  const entry = object(value);
  const itemRef = text(entry?.itemRef, 40);
  const sourceId = text(entry?.sourceId, 80);
  const sourceName = text(entry?.sourceName, 120);
  const url = httpsUrl(entry?.url);
  const publishedAt = dateTime(entry?.publishedAt);
  const excerpt = text(entry?.excerpt, 600);
  if (!entry || !itemRef || !/^[a-f0-9]{40}$/u.test(itemRef) || !sourceId || !sourceName || !url
    || !publishedAt || !excerpt || typeof entry.discoveryOnly !== "boolean") return null;
  return {
    itemRef,
    source: { sourceId, sourceName, url, publishedAt, excerpt, discoveryOnly: entry.discoveryOnly }
  };
}

function parseRecommendation(value: unknown, filename: string): AdminKvorumRecommendation | null {
  const entry = object(value);
  const draft = parseDraft(entry);
  const id = text(entry?.id, 80);
  const recordDate = date(entry?.date);
  const createdAt = dateTime(entry?.createdAt);
  const updatedAt = dateTime(entry?.updatedAt);
  const evidence = object(entry?.evidence);
  const gates = object(entry?.gateResults);
  const designLab = object(entry?.designLab);
  const owner = object(entry?.owner);
  const match = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/u.exec(filename);
  if (!entry || !draft || entry.schemaVersion !== "venture-recommendation/1" || entry.ventureId !== "kvorum"
    || !id || !recordDate || !createdAt || !updatedAt || !match || match[1] !== recordDate
    || id !== `kv-${match[1]}-${match[2]}`
    || (entry.status !== "draft" && entry.status !== "approved" && entry.status !== "posted"
      && entry.status !== "archived" && entry.status !== "rejected")
    || !evidence || evidence.kind !== "monitor-cluster" || !gates || !designLab || !owner) return null;

  const monitorDate = date(evidence.monitorDate);
  const continuationOf = evidence.continuationOf === null ? null : text(evidence.continuationOf, 160);
  const parsedSources = Array.isArray(evidence.sources) ? evidence.sources.map(parseSource) : [];
  if (!monitorDate || (evidence.continuationOf !== null && !continuationOf) || parsedSources.length === 0
    || parsedSources.some((source) => source === null)) return null;
  const sources = parsedSources as ParsedSource[];
  const sourceByRef = new Map(sources.map((source) => [source.itemRef, source.source]));

  if (!Array.isArray(evidence.claims) || evidence.claims.length === 0) return null;
  const claims: AdminKvorumClaim[] = [];
  for (const value of evidence.claims) {
    const claim = object(value);
    const claimId = text(claim?.id, 80);
    const claimText = text(claim?.text, 1_000);
    const refs = strings(claim?.refs, 20);
    if (!claim || !claimId || !claimText || !refs?.length
      || (claim.type !== "fact-multi" && claim.type !== "fact-single" && claim.type !== "commentary")
      || refs.some((ref) => !sourceByRef.has(ref))) return null;
    claims.push({ id: claimId, type: claim.type, text: claimText, sources: refs.map((ref) => sourceByRef.get(ref)!) });
  }

  let stit: AdminKvorumRecommendation["evidence"]["stit"] = null;
  if (evidence.stitAttribution !== null) {
    const attribution = object(evidence.stitAttribution);
    const attributionSummary = text(attribution?.summary, 1_000);
    if (!attribution || attribution.internalOnly !== true || !attributionSummary || !Array.isArray(attribution.posts)) return null;
    const posts: NonNullable<AdminKvorumRecommendation["evidence"]["stit"]>["posts"] = [];
    for (const value of attribution.posts) {
      const post = object(value);
      const postUrl = httpsUrl(post?.postUrl);
      const excerpt = text(post?.excerpt, 600);
      const engagement = object(post?.engagement);
      if (!post || !postUrl || !excerpt || !engagement
        || ![engagement.likes, engagement.comments, engagement.shares]
          .every((metric) => metric === null || nonnegative(metric, true) !== null)) return null;
      posts.push({
        postUrl,
        excerpt,
        engagement: {
          likes: engagement.likes as number | null,
          comments: engagement.comments as number | null,
          shares: engagement.shares as number | null
        }
      });
    }
    stit = { internalOnly: true, summary: attributionSummary, posts };
  }

  const evaluatedAt = dateTime(gates.evaluatedAt);
  if (!evaluatedAt || typeof gates.passed !== "boolean" || !Array.isArray(gates.results)) return null;
  const gateResults: AdminKvorumRecommendation["gates"]["results"] = [];
  for (const value of gates.results) {
    const result = object(value);
    const gate = text(result?.gate, 80);
    const message = text(result?.message, 800);
    const claimIds = strings(result?.claimIds, 80);
    if (!result || !gate || !message || !claimIds || (result.verdict !== "pass" && result.verdict !== "fail")) return null;
    gateResults.push({ gate, verdict: result.verdict, message, claimIds });
  }

  if ((designLab.status !== "not-requested" && designLab.status !== "queued"
      && designLab.status !== "rendered" && designLab.status !== "failed")
    || !nullableDateTime(designLab.requestedAt) || !nullableDateTime(designLab.resolvedAt)
    || !nullableText(designLab.failureReason, 800)) return null;
  if (owner.postingMode !== "manual-only"
    || ![owner.approvedAt, owner.postedAt, owner.archivedAt, owner.rejectedAt].every(nullableDateTime)
    || !nullableText(owner.rejectionReason, 800)
    || (owner.postedUrl !== null && httpsUrl(owner.postedUrl) === null)
    || !Array.isArray(owner.editHistory)) return null;
  const original = owner.original === null ? null : parseDraft(owner.original, true);
  if (owner.original !== null && !original) return null;
  const editHistory: AdminKvorumRecommendation["owner"]["editHistory"] = [];
  for (const value of owner.editHistory) {
    const edit = object(value);
    const editedAt = dateTime(edit?.editedAt);
    const fields = strings(edit?.fields, 9);
    const note = text(edit?.note, 800);
    if (!edit || edit.changedBy !== "owner" || !editedAt || !fields?.length || !note) return null;
    editHistory.push({ editedAt, fields, note });
  }

  return {
    ...draft,
    id,
    slug: match[2]!,
    date: recordDate,
    createdAt,
    updatedAt,
    status: entry.status,
    contentHash: `sha256:${createHash("sha256").update(JSON.stringify(entry)).digest("hex").slice(0, 12)}`,
    ratings: [],
    evidence: {
      monitorDate,
      continuationOf,
      sources: sources.map(({ source }) => source),
      claims,
      stit
    },
    gates: { evaluatedAt, passed: gates.passed, results: gateResults },
    designLab: {
      status: designLab.status,
      requestedAt: designLab.requestedAt as string | null,
      resolvedAt: designLab.resolvedAt as string | null,
      failureReason: designLab.failureReason as string | null
    },
    owner: {
      postingMode: "manual-only",
      approvedAt: owner.approvedAt as string | null,
      postedAt: owner.postedAt as string | null,
      archivedAt: owner.archivedAt as string | null,
      rejectedAt: owner.rejectedAt as string | null,
      rejectionReason: owner.rejectionReason as string | null,
      postedUrl: owner.postedUrl === null ? null : httpsUrl(owner.postedUrl),
      original,
      editHistory
    }
  };
}

function parseSourceResult(value: unknown): AdminKvorumMonitorDay["sourceResults"][number] | null {
  const entry = object(value);
  const sourceId = text(entry?.sourceId, 80);
  const count = nonnegative(entry?.count, true);
  if (!entry || !sourceId || count === null || typeof entry.attempted !== "boolean"
    || (entry.kind !== "apify" && entry.kind !== "feed")
    || (entry.status !== "success" && entry.status !== "skipped"
      && entry.status !== "failed" && entry.status !== "fixture")
    || !nullableText(entry.reason, 300)) return null;
  return {
    sourceId,
    kind: entry.kind,
    attempted: entry.attempted,
    status: entry.status,
    count,
    reason: entry.reason === null ? null : entry.reason.trim()
  };
}

function parseMonitor(value: unknown, filename: string): AdminKvorumMonitorDay | null {
  const entry = object(value);
  const recordDate = date(entry?.date);
  const generatedAt = dateTime(entry?.generatedAt);
  const itemsKept = nonnegative(entry?.itemsKept, true);
  const purge = object(entry?.purge);
  if (!entry || entry.schemaVersion !== "kvorum-monitor/1" || `${recordDate}.json` !== filename
    || !recordDate || !generatedAt || typeof entry.fixtureOnly !== "boolean" || itemsKept === null
    || !Array.isArray(entry.sourceResults) || !Array.isArray(entry.rawItems)
    || !Array.isArray(entry.clusters) || !Array.isArray(entry.ranks) || !purge) return null;
  const sourceResults = entry.sourceResults.map(parseSourceResult);
  if (sourceResults.length === 0 || sourceResults.some((result) => result === null)
    || itemsKept !== entry.rawItems.length) return null;

  const engagementByUrl = new Map<string, { likes: number | null; comments: number | null; shares: number | null }>();
  for (const value of entry.rawItems) {
    const item = object(value);
    const url = httpsUrl(item?.url);
    const source = object(item?.source);
    if (!item || !url || !source || !text(source.id, 80) || !text(source.name, 120)
      || !dateTime(item.publishedAt) || !text(item.text, 4_000) || !strings(item.entities, 40)) return null;
    if (item.stit !== undefined) {
      const stit = object(item.stit);
      if (!stit || ![stit.likes, stit.comments, stit.shares]
        .every((metric) => metric === null || nonnegative(metric, true) !== null)) return null;
      engagementByUrl.set(url, {
        likes: stit.likes as number | null,
        comments: stit.comments as number | null,
        shares: stit.shares as number | null
      });
    }
  }

  const ranks = new Map<string, AdminKvorumMonitorDay["clusters"][number]["rank"]>();
  for (const value of entry.ranks) {
    const rank = object(value);
    const factors = object(rank?.factors);
    const clusterId = text(rank?.clusterId, 40);
    const position = nonnegative(rank?.position, true);
    const score = nonnegative(rank?.score);
    if (!rank || !factors || !clusterId || position === null || position === 0 || score === null) return null;
    const parsedFactors = {
      corroboration: nonnegative(factors.corroboration),
      entityWeight: nonnegative(factors.entityWeight),
      engagementSalience: nonnegative(factors.engagementSalience),
      novelty: nonnegative(factors.novelty),
      standingTopicContinuity: nonnegative(factors.standingTopicContinuity)
    };
    if (Object.values(parsedFactors).some((factor) => factor === null)) return null;
    ranks.set(clusterId, { position, score, factors: parsedFactors as NonNullableValues<typeof parsedFactors> });
  }

  const clusters: AdminKvorumMonitorDay["clusters"] = [];
  for (const value of entry.clusters) {
    const cluster = object(value);
    const id = text(cluster?.id, 40);
    const title = text(cluster?.title, 240);
    const entityIds = strings(cluster?.entityIds, 40);
    const topicTokens = strings(cluster?.topicTokens, 40);
    const continuationOf = cluster?.continuationOf === null ? null : text(cluster?.continuationOf, 160);
    const rank = id ? ranks.get(id) : undefined;
    if (!cluster || !id || !title || !entityIds || !topicTokens || !rank || !Array.isArray(cluster.attributions)
      || (cluster.continuationOf !== null && !continuationOf)) return null;
    const sources = cluster.attributions.map(parseSource);
    if (sources.length === 0 || sources.some((source) => source === null)) return null;
    clusters.push({
      id,
      title,
      entityIds,
      topicTokens,
      continuationOf,
      rank,
      sources: (sources as ParsedSource[]).map(({ source }) => ({
        ...source,
        engagement: engagementByUrl.get(source.url) ?? null
      }))
    });
  }
  if (clusters.length !== ranks.size) return null;

  const retentionDays = nonnegative(purge.retentionDays, true);
  const evaluatedAt = dateTime(purge.evaluatedAt);
  const cutoffPublishedAt = dateTime(purge.cutoffPublishedAt);
  const rawItemsBefore = nonnegative(purge.rawItemsBefore, true);
  const rawItemsAfter = nonnegative(purge.rawItemsAfter, true);
  if (retentionDays !== 30 || !evaluatedAt || !cutoffPublishedAt || rawItemsBefore === null
    || rawItemsAfter === null || !Array.isArray(purge.purged)) return null;
  return {
    date: recordDate,
    generatedAt,
    fixtureOnly: entry.fixtureOnly,
    itemsKept,
    sourceResults: sourceResults as AdminKvorumMonitorDay["sourceResults"],
    clusters: clusters.sort((left, right) => left.rank.position - right.rank.position),
    purge: {
      retentionDays: 30,
      evaluatedAt,
      cutoffPublishedAt,
      rawItemsBefore,
      rawItemsAfter,
      purgedCount: purge.purged.length
    }
  };
}

type NonNullableValues<T> = { [K in keyof T]: Exclude<T[K], null> };

function parseQuota(value: unknown): AdminKvorumQuota | null {
  const entry = object(value);
  const month = text(entry?.month, 7);
  const shareCapUsd = nonnegative(entry?.shareCapUsd);
  const estimatedUsedUsd = nonnegative(entry?.estimatedUsedUsd);
  const reservedPerRun = nonnegative(entry?.reservedPerRun);
  const updatedAt = dateTime(entry?.updatedAt);
  const perActorCounts = object(entry?.perActorCounts);
  if (!entry || entry.schemaVersion !== "kvorum-apify-quota/1" || !month || !/^\d{4}-\d{2}$/u.test(month)
    || shareCapUsd === null || estimatedUsedUsd === null || reservedPerRun === null || !updatedAt || !perActorCounts
    || (entry.sharedAccountUsedUsd !== null && nonnegative(entry.sharedAccountUsedUsd) === null)) return null;
  const actors: AdminKvorumQuota["perActorCounts"] = [];
  for (const [actorId, value] of Object.entries(perActorCounts)) {
    const actor = object(value);
    const runs = nonnegative(actor?.runs, true);
    const items = nonnegative(actor?.items, true);
    const estimatedUsd = nonnegative(actor?.estimatedUsd);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(actorId) || !actor || runs === null || items === null || estimatedUsd === null) return null;
    actors.push({ actorId, runs, items, estimatedUsd });
  }
  return {
    month,
    shareCapUsd,
    estimatedUsedUsd,
    sharedAccountUsedUsd: entry.sharedAccountUsedUsd as number | null,
    reservedPerRun,
    updatedAt,
    perActorCounts: actors.sort((left, right) => left.actorId.localeCompare(right.actorId))
  };
}

async function readDirectory<T>(
  relative: string,
  filename: RegExp,
  parse: (value: unknown, filename: string) => T | null
): Promise<{ state: AdminKvorumStoreState; values: T[]; unreadable: number }> {
  const directory = path.join(repositoryRoot(), relative);
  let names: string[];
  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && filename.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing", values: [], unreadable: 0 }
      : { state: "unreadable", values: [], unreadable: 1 };
  }
  let unreadable = 0;
  const values: T[] = [];
  for (const name of names) {
    try {
      const parsed = parse(JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown, name);
      if (parsed) values.push(parsed);
      else unreadable += 1;
    } catch {
      unreadable += 1;
    }
  }
  return {
    state: names.length > 0 && values.length === 0 && unreadable > 0 ? "unreadable" : "present",
    values,
    unreadable
  };
}

async function readQuota(): Promise<{ state: AdminKvorumStoreState; value: AdminKvorumQuota | null; unreadable: number }> {
  const filename = path.join(repositoryRoot(), "state/kvorum/source-quota/apify.json");
  try {
    const value = parseQuota(JSON.parse(await readFile(filename, "utf8")) as unknown);
    return value
      ? { state: "present", value, unreadable: 0 }
      : { state: "unreadable", value: null, unreadable: 1 };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing", value: null, unreadable: 0 }
      : { state: "unreadable", value: null, unreadable: 1 };
  }
}

async function readRatings(): Promise<{ values: RatingRecord[]; unreadable: number }> {
  try {
    const raw = await readFile(path.join(repositoryRoot(), "state/ratings/kvorum/ledger.jsonl"), "utf8");
    const values = parseRatingLedger(raw);
    return values
      ? {
          values: values.filter((rating) => rating.ventureId === "kvorum" && rating.objectKind === "recommendation"),
          unreadable: 0
        }
      : { values: [], unreadable: 1 };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { values: [], unreadable: 0 }
      : { values: [], unreadable: 1 };
  }
}

/**
 * The plain-data boundary for the three Kvórum admin tabs.
 *
 * Dated records are canonical, so the replaceable recommendation index is deliberately not read.
 * Invalid records are counted and dropped independently; a malformed day cannot take the whole
 * workspace down. Repository paths and filenames stay on this side of the boundary.
 */
export async function readAdminKvorum(): Promise<AdminKvorumSnapshot> {
  const [recommendations, monitor, quota, ratings] = await Promise.all([
    readDirectory(
      "state/ventures/kvorum/recommendations",
      /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u,
      parseRecommendation
    ),
    readDirectory("state/ventures/kvorum/monitor", /^\d{4}-\d{2}-\d{2}\.json$/u, parseMonitor),
    readQuota(),
    readRatings()
  ]);
  const recommendationValues = recommendations.values
    .map((recommendation) => ({
      ...recommendation,
      ratings: ratings.values
        .filter((rating) => rating.objectRef.id === recommendation.id)
        .sort((left, right) => right.ratedAt.localeCompare(left.ratedAt) || right.id.localeCompare(left.id))
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  return {
    recommendationsState: recommendations.state,
    recommendations: recommendationValues,
    monitorState: monitor.state,
    monitor: monitor.values.sort((left, right) => right.date.localeCompare(left.date)),
    quotaState: quota.state,
    quota: quota.value,
    unreadable: recommendations.unreadable + monitor.unreadable + quota.unreadable + ratings.unreadable
  };
}
