import "server-only";
import { createHash } from "node:crypto";
import {
  kvorumRepositoryRoot,
  KvorumRecommendationPersistenceError,
  persistKvorum
} from "./kvorum-admin-persistence";

const METRIC_KEYS = ["impressions", "reach", "saves", "shares", "comments", "follows"] as const;
type MetricKey = typeof METRIC_KEYS[number];

export type KvorumOwnerResultMetrics = Record<MetricKey, number | null>;

export interface KvorumOwnerResult {
  schemaVersion: "owner-result-entry/1";
  id: string;
  ventureId: "kvorum";
  recommendationId: string;
  recommendationRef: string;
  platform: string;
  postUrl: string;
  postedAt: string;
  capturedAt: string;
  enteredAt: string;
  enteredBy: "owner";
  metrics: KvorumOwnerResultMetrics;
  note: string | null;
}

export interface KvorumResultInput {
  recommendationRef: string;
  platform: string;
  capturedAt: string;
  metrics: KvorumOwnerResultMetrics;
  note: string | null;
}

export interface KvorumResultWrite {
  result: KvorumOwnerResult;
  resultRef: string;
  idempotent: boolean;
  persistence: "filesystem" | "github";
  commits: string[];
}

interface PostedRecommendation {
  id: string;
  date: string;
  updatedAt: string;
  status: "posted" | "archived";
  platforms: string[];
  owner: {
    postedAt: string;
    postedUrl: string;
    resultRefs: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === allowed.length && actual.every((key, index) => key === [...allowed].sort()[index]);
}

function slug(value: unknown, maximum = 160): value is string {
  return typeof value === "string" && value.length <= maximum
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

function dateTime(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))
    || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) return null;
  return new Date(value).toISOString();
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_000) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function recommendationRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^state\/ventures\/kvorum\/recommendations\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(value)
    ? value
    : null;
}

function metrics(value: unknown): KvorumOwnerResultMetrics | null {
  const entry = object(value);
  if (!entry || !exactKeys(entry, METRIC_KEYS)) return null;
  const parsed = {} as KvorumOwnerResultMetrics;
  for (const key of METRIC_KEYS) {
    const metric = entry[key];
    if (metric !== null && (typeof metric !== "number" || !Number.isInteger(metric) || metric < 0)) return null;
    parsed[key] = metric as number | null;
  }
  return Object.values(parsed).some((metric) => metric !== null) ? parsed : null;
}

export function parseKvorumResultInput(value: unknown): KvorumResultInput | null {
  const entry = object(value);
  if (!entry || !exactKeys(entry, ["recommendationRef", "platform", "capturedAt", "metrics", "note"])) return null;
  const ref = recommendationRef(entry.recommendationRef);
  const platform = slug(entry.platform, 80) ? entry.platform : null;
  const capturedAt = dateTime(entry.capturedAt);
  const parsedMetrics = metrics(entry.metrics);
  const note = entry.note === null
    ? null
    : typeof entry.note === "string" && entry.note.trim().length > 0 && entry.note.trim().length <= 800
      ? entry.note.trim()
      : undefined;
  if (!ref || !platform || !capturedAt || !parsedMetrics || note === undefined) return null;
  return { recommendationRef: ref, platform, capturedAt, metrics: parsedMetrics, note };
}

function postedRecommendation(value: unknown, ref: string): PostedRecommendation {
  const entry = object(value);
  const owner = object(entry?.owner);
  const postedAt = dateTime(owner?.postedAt);
  const postedUrl = httpsUrl(owner?.postedUrl);
  const filename = ref.split("/").at(-1)?.replace(/\.json$/u, "") ?? "";
  if (!entry || entry.schemaVersion !== "venture-recommendation/1" || entry.ventureId !== "kvorum"
    || !slug(entry.id) || typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(entry.date)
    || filename !== `${entry.date}-${filename.slice(11)}` || entry.id !== `kv-${filename}`
    || !dateTime(entry.updatedAt) || (entry.status !== "posted" && entry.status !== "archived")
    || !Array.isArray(entry.platforms) || !entry.platforms.every((platform) => slug(platform, 80))
    || !owner || owner.postingMode !== "manual-only" || !postedAt || !postedUrl
    || !Array.isArray(owner.resultRefs) || !owner.resultRefs.every((resultRef) => typeof resultRef === "string")) {
    throw new KvorumRecommendationPersistenceError(
      "CONFLICT",
      "Owner results can be entered only for an intact manually posted Kvórum recommendation."
    );
  }
  return {
    ...entry,
    id: entry.id,
    date: entry.date,
    updatedAt: dateTime(entry.updatedAt)!,
    status: entry.status,
    platforms: entry.platforms as string[],
    owner: {
      ...owner,
      postedAt,
      postedUrl,
      resultRefs: owner.resultRefs as string[]
    }
  };
}

function resultIdentity(input: KvorumResultInput): { id: string; ref: string } {
  const filename = input.recommendationRef.split("/").at(-1)!.replace(/\.json$/u, "");
  const date = filename.slice(0, 10);
  const fingerprint = createHash("sha256")
    .update(`${input.recommendationRef}\0${input.platform}\0${input.capturedAt}`)
    .digest("hex")
    .slice(0, 12);
  return {
    id: `kv-result-${date}-${fingerprint}`,
    ref: `state/ventures/kvorum/results/${date}-${fingerprint}.json`
  };
}

function parseSavedResult(value: unknown): KvorumOwnerResult | null {
  const entry = object(value);
  const parsedMetrics = metrics(entry?.metrics);
  const postedAt = dateTime(entry?.postedAt);
  const capturedAt = dateTime(entry?.capturedAt);
  const enteredAt = dateTime(entry?.enteredAt);
  if (!entry || entry.schemaVersion !== "owner-result-entry/1" || entry.ventureId !== "kvorum"
    || !slug(entry.id) || !slug(entry.recommendationId) || !recommendationRef(entry.recommendationRef)
    || !slug(entry.platform, 80) || !httpsUrl(entry.postUrl) || !postedAt
    || !capturedAt || !enteredAt || Date.parse(capturedAt) < Date.parse(postedAt)
    || Date.parse(enteredAt) < Date.parse(capturedAt) || entry.enteredBy !== "owner"
    || !parsedMetrics || (entry.note !== null && (typeof entry.note !== "string" || entry.note.trim().length === 0
      || entry.note.trim().length > 800))) return null;
  return entry as unknown as KvorumOwnerResult;
}

function sameEnteredResult(left: KvorumOwnerResult, right: KvorumOwnerResult): boolean {
  return left.id === right.id
    && left.recommendationId === right.recommendationId
    && left.recommendationRef === right.recommendationRef
    && left.platform === right.platform
    && left.postUrl === right.postUrl
    && left.postedAt === right.postedAt
    && left.capturedAt === right.capturedAt
    && JSON.stringify(left.metrics) === JSON.stringify(right.metrics)
    && left.note === right.note;
}

export async function writeKvorumOwnerResult(
  input: KvorumResultInput,
  options: { root?: string; now?: Date } = {}
): Promise<KvorumResultWrite> {
  const root = options.root ?? kvorumRepositoryRoot();
  const now = options.now ?? new Date();
  const enteredAt = now.toISOString();
  if (Date.parse(input.capturedAt) > now.getTime()) {
    throw new KvorumRecommendationPersistenceError("INVALID", "A Kvórum result cannot be captured in the future.");
  }

  const inspected = await persistKvorum(input.recommendationRef, (current) => ({
    value: postedRecommendation(current, input.recommendationRef),
    idempotent: true
  }), "admin: inspect posted Kvórum recommendation", root);
  const recommendation = inspected.value;
  if (!recommendation.platforms.includes(input.platform)) {
    throw new KvorumRecommendationPersistenceError("INVALID", "That platform is not part of the recommendation intent.");
  }
  if (Date.parse(input.capturedAt) < Date.parse(recommendation.owner.postedAt)) {
    throw new KvorumRecommendationPersistenceError("INVALID", "A Kvórum result cannot predate the manual post.");
  }

  const identity = resultIdentity(input);
  if (recommendation.owner.resultRefs.length >= 40 && !recommendation.owner.resultRefs.includes(identity.ref)) {
    throw new KvorumRecommendationPersistenceError("CONFLICT", "That recommendation already has the maximum result history.");
  }
  const proposed: KvorumOwnerResult = {
    schemaVersion: "owner-result-entry/1",
    id: identity.id,
    ventureId: "kvorum",
    recommendationId: recommendation.id,
    recommendationRef: input.recommendationRef,
    platform: input.platform,
    postUrl: recommendation.owner.postedUrl,
    postedAt: recommendation.owner.postedAt,
    capturedAt: input.capturedAt,
    enteredAt,
    enteredBy: "owner",
    metrics: input.metrics,
    note: input.note
  };
  const saved = await persistKvorum(identity.ref, (current) => {
    if (current === null) return { value: proposed, idempotent: false };
    const existing = parseSavedResult(current);
    if (!existing) throw new KvorumRecommendationPersistenceError("CORRUPT", "The saved Kvórum owner result is malformed.");
    if (!sameEnteredResult(existing, proposed)) {
      throw new KvorumRecommendationPersistenceError(
        "CONFLICT",
        "A different Kvórum result already uses that recommendation, platform and capture time."
      );
    }
    return { value: existing, idempotent: true };
  }, `admin: record Kvórum owner result ${identity.id}`, root);

  const linked = await persistKvorum(input.recommendationRef, (current) => {
    const entry = postedRecommendation(current, input.recommendationRef);
    if (entry.owner.postedAt !== saved.value.postedAt || entry.owner.postedUrl !== saved.value.postUrl) {
      throw new KvorumRecommendationPersistenceError("CONFLICT", "The manual post receipt changed during result entry.");
    }
    if (entry.owner.resultRefs.includes(identity.ref)) return { value: entry, idempotent: true };
    if (entry.owner.resultRefs.length >= 40) {
      throw new KvorumRecommendationPersistenceError("CONFLICT", "That recommendation already has the maximum result history.");
    }
    const value = structuredClone(entry);
    value.updatedAt = enteredAt;
    value.owner.resultRefs.push(identity.ref);
    return { value, idempotent: false };
  }, `admin: link Kvórum owner result ${identity.id}`, root);

  return {
    result: saved.value,
    resultRef: identity.ref,
    idempotent: saved.idempotent && linked.idempotent,
    persistence: saved.persistence,
    commits: [...new Set([saved.commit, linked.commit].filter((commit): commit is string => typeof commit === "string"))]
  };
}

export { KvorumRecommendationPersistenceError } from "./kvorum-admin-persistence";
