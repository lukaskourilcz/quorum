import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildCarouselSummary,
  type CarouselSummary
} from "@boardlessai/carousel-studio";

const GITHUB_TOKEN_ENV = "BOARDLESSAI_GITHUB_TOKEN";
const INDEX_REF = "state/ventures/kvorum/recommendations/index.json";
const pendingWrites = new Map<string, Promise<unknown>>();

export type KvorumPersistenceCode =
  | "CONFLICT"
  | "INVALID"
  | "CORRUPT"
  | "UNCONFIGURED"
  | "REFUSED"
  | "REMOTE";

export class KvorumRecommendationPersistenceError extends Error {
  constructor(readonly code: KvorumPersistenceCode, message: string) {
    super(message);
  }
}

interface KvorumCopyBlock {
  id: string;
  platform: string;
  format: string;
  locale: "cs" | "en" | "uk";
  text: string;
  altText: string | null;
  reason: string;
}

interface KvorumOriginalDraft {
  capturedAt: string;
  headline: string;
  summary: string;
  whyItMatters: string;
  whyThisIsWorthIt: string;
  ourAngle: string;
  ourAngleDiffers: string;
  platforms: string[];
  formats: string[];
  copyBlocks: KvorumCopyBlock[];
}

interface KvorumRecommendation {
  schemaVersion: "venture-recommendation/1";
  id: string;
  ventureId: "kvorum";
  date: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "approved" | "posted" | "archived" | "rejected";
  headline: string;
  summary: string;
  whyItMatters: string;
  whyThisIsWorthIt: string;
  ourAngle: string;
  ourAngleDiffers: string;
  platforms: string[];
  formats: string[];
  copyBlocks: KvorumCopyBlock[];
  evidence: {
    kind: "monitor-cluster";
    sources: Array<{ sourceId: string; sourceName: string; discoveryOnly: boolean }>;
    [key: string]: unknown;
  };
  gateResults: { passed: boolean; [key: string]: unknown };
  designLab: {
    status: "not-requested" | "queued" | "rendered" | "failed";
    requestedAt: string | null;
    resolvedAt: string | null;
    recipeRef: string | null;
    artifactRefs: string[];
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
    resultRefs: string[];
    ratingRef: string | null;
    original: KvorumOriginalDraft | null;
    editHistory: Array<{
      editedAt: string;
      changedBy: "owner";
      fields: string[];
      note: string;
    }>;
  };
  [key: string]: unknown;
}

const TEXT_LIMITS = {
  headline: 240,
  summary: 2_000,
  whyItMatters: 2_000,
  whyThisIsWorthIt: 1_000,
  ourAngle: 2_000,
  ourAngleDiffers: 2_000
} as const;

type EditableTextField = keyof typeof TEXT_LIMITS;

interface CopyBlockEdit {
  id: string;
  text?: string;
  altText?: string | null;
  reason?: string;
}

interface RecommendationEdits extends Partial<Record<EditableTextField, string>> {
  copyBlocks?: CopyBlockEdit[];
}

export type KvorumRecommendationAction =
  | { action: "approve"; ref: string; edits?: RecommendationEdits }
  | { action: "reject"; ref: string; reason: string }
  | { action: "posted"; ref: string; postedUrl: string };

interface PersistenceResult<T> {
  value: T;
  commit: string | null;
  idempotent: boolean;
  persistence: "filesystem" | "github";
}

export interface KvorumRecommendationActionResult {
  recommendation: KvorumRecommendation;
  summary: CarouselSummary | null;
  idempotent: boolean;
  persistence: "filesystem" | "github";
  commits: string[];
}

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonempty(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function copyBlock(value: unknown): value is KvorumCopyBlock {
  const entry = object(value);
  return Boolean(entry
    && nonempty(entry.id, 80)
    && nonempty(entry.platform, 80)
    && nonempty(entry.format, 80)
    && (entry.locale === "cs" || entry.locale === "en" || entry.locale === "uk")
    && nonempty(entry.text, 12_000)
    && (entry.altText === null || nonempty(entry.altText, 2_000))
    && nonempty(entry.reason, 800));
}

function recommendation(value: unknown, ref: string): KvorumRecommendation {
  const entry = object(value);
  const owner = object(entry?.owner);
  const designLab = object(entry?.designLab);
  const evidence = object(entry?.evidence);
  const gateResults = object(entry?.gateResults);
  const filename = ref.split("/").at(-1)?.replace(/\.json$/u, "") ?? "";
  const copyBlocks = entry?.copyBlocks;
  if (!entry
    || entry.schemaVersion !== "venture-recommendation/1"
    || entry.ventureId !== "kvorum"
    || !nonempty(entry.id, 80)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(String(entry.date))
    || !filename.startsWith(`${String(entry.date)}-`)
    || !["draft", "approved", "posted", "archived", "rejected"].includes(String(entry.status))
    || !nonempty(entry.headline, TEXT_LIMITS.headline)
    || !nonempty(entry.summary, TEXT_LIMITS.summary)
    || !nonempty(entry.whyItMatters, TEXT_LIMITS.whyItMatters)
    || !nonempty(entry.whyThisIsWorthIt, TEXT_LIMITS.whyThisIsWorthIt)
    || !nonempty(entry.ourAngle, TEXT_LIMITS.ourAngle)
    || !nonempty(entry.ourAngleDiffers, TEXT_LIMITS.ourAngleDiffers)
    || !Array.isArray(entry.platforms) || !entry.platforms.every((item) => typeof item === "string")
    || !Array.isArray(entry.formats) || !entry.formats.every((item) => typeof item === "string")
    || !Array.isArray(copyBlocks) || !copyBlocks.every(copyBlock)
    || !evidence || evidence.kind !== "monitor-cluster" || !Array.isArray(evidence.sources)
    || !evidence.sources.every((source) => {
      const candidate = object(source);
      return Boolean(candidate && nonempty(candidate.sourceId, 80)
        && nonempty(candidate.sourceName, 120) && typeof candidate.discoveryOnly === "boolean");
    })
    || !gateResults || typeof gateResults.passed !== "boolean"
    || !designLab || !["not-requested", "queued", "rendered", "failed"].includes(String(designLab.status))
    || !owner || owner.postingMode !== "manual-only" || !Array.isArray(owner.editHistory)
    || !("original" in owner)) {
    throw new KvorumRecommendationPersistenceError("CORRUPT", "The saved Kvórum recommendation is malformed.");
  }
  return entry as unknown as KvorumRecommendation;
}

function recommendationRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^state\/ventures\/kvorum\/recommendations\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(value)
    ? value
    : null;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseEdits(value: unknown): RecommendationEdits | null | undefined {
  if (value === undefined) return undefined;
  const edits = object(value);
  if (!edits || !exactKeys(edits, [...Object.keys(TEXT_LIMITS), "copyBlocks"])) return null;
  const parsed: RecommendationEdits = {};
  for (const [field, limit] of Object.entries(TEXT_LIMITS) as Array<[EditableTextField, number]>) {
    if (!(field in edits)) continue;
    if (!nonempty(edits[field], limit)) return null;
    parsed[field] = (edits[field] as string).trim();
  }
  if ("copyBlocks" in edits) {
    if (!Array.isArray(edits.copyBlocks) || edits.copyBlocks.length === 0 || edits.copyBlocks.length > 40) return null;
    const ids = new Set<string>();
    parsed.copyBlocks = [];
    for (const raw of edits.copyBlocks) {
      const block = object(raw);
      if (!block || !exactKeys(block, ["id", "text", "altText", "reason"]) || !nonempty(block.id, 80)) return null;
      if (ids.has(block.id)) return null;
      ids.add(block.id);
      const next: CopyBlockEdit = { id: block.id.trim() };
      if ("text" in block) {
        if (!nonempty(block.text, 12_000)) return null;
        next.text = block.text.trim();
      }
      if ("altText" in block) {
        if (block.altText !== null && !nonempty(block.altText, 2_000)) return null;
        next.altText = block.altText === null ? null : block.altText.trim();
      }
      if ("reason" in block) {
        if (!nonempty(block.reason, 800)) return null;
        next.reason = block.reason.trim();
      }
      if (Object.keys(next).length === 1) return null;
      parsed.copyBlocks.push(next);
    }
  }
  return parsed;
}

export function parseKvorumRecommendationAction(value: unknown): KvorumRecommendationAction | null {
  const body = object(value);
  if (!body || !exactKeys(body, ["action", "ref", "edits", "reason", "postedUrl"])) return null;
  const ref = recommendationRef(body.ref);
  if (!ref) return null;
  if (body.action === "approve") {
    if ("reason" in body || "postedUrl" in body) return null;
    const edits = parseEdits(body.edits);
    if (edits === null) return null;
    return { action: "approve", ref, ...(body.edits === undefined ? {} : { edits }) };
  }
  if (body.action === "reject") {
    if ("edits" in body || "postedUrl" in body || !nonempty(body.reason, 800)) return null;
    return { action: "reject", ref, reason: body.reason.trim() };
  }
  if (body.action === "posted") {
    if ("edits" in body || "reason" in body || typeof body.postedUrl !== "string") return null;
    try {
      const url = new URL(body.postedUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.toString().length > 2_000) return null;
      return { action: "posted", ref, postedUrl: url.toString() };
    } catch {
      return null;
    }
  }
  return null;
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new KvorumRecommendationPersistenceError("CORRUPT", `${label} is not valid JSON.`);
  }
}

async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  pendingWrites.set(key, next);
  try {
    return await next;
  } finally {
    if (pendingWrites.get(key) === next) pendingWrites.delete(key);
  }
}

function resolvedLocalPath(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  const boundary = path.relative(root, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) {
    throw new KvorumRecommendationPersistenceError("INVALID", "Kvórum state path escaped the repository.");
  }
  return target;
}

async function writeLocal<T>(
  relative: string,
  mutate: (current: unknown | null) => { value: T; idempotent: boolean },
  root: string
): Promise<PersistenceResult<T>> {
  const target = resolvedLocalPath(root, relative);
  return serialized(target, async () => {
    let current: unknown | null = null;
    try {
      current = parseJson(await readFile(target, "utf8"), relative);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const changed = mutate(current);
    if (!changed.idempotent) {
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, jsonText(changed.value), { encoding: "utf8", mode: 0o600 });
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    return { ...changed, commit: null, persistence: "filesystem" as const };
  });
}

function githubFailure(status: number, what: string): KvorumRecommendationPersistenceError {
  if (status === 401 || status === 403) {
    return new KvorumRecommendationPersistenceError(
      "REFUSED",
      `GitHub refused the Kvórum ${what} with ${status}. ${GITHUB_TOKEN_ENV} is expired or lacks Contents read and write.`
    );
  }
  return new KvorumRecommendationPersistenceError("REMOTE", `GitHub Kvórum ${what} failed with ${status}.`);
}

async function writeGitHub<T>(
  relative: string,
  mutate: (current: unknown | null) => { value: T; idempotent: boolean },
  message: string,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<PersistenceResult<T>> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const endpoint = `https://api.github.com/repos/${repository}/contents/${relative.split("/").map(encodeURIComponent).join("/")}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2026-03-10"
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetcher(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    let current: unknown | null = null;
    let sha: string | undefined;
    if (response.status !== 404) {
      if (!response.ok) throw githubFailure(response.status, "read");
      const body = await response.json() as { content?: unknown; encoding?: unknown; sha?: unknown };
      if (body.encoding !== "base64" || typeof body.content !== "string" || typeof body.sha !== "string") {
        throw new KvorumRecommendationPersistenceError("REMOTE", "GitHub returned an invalid Kvórum file.");
      }
      current = parseJson(Buffer.from(body.content.replaceAll("\n", ""), "base64").toString("utf8"), relative);
      sha = body.sha;
    }
    const changed = mutate(current);
    if (changed.idempotent) return { ...changed, commit: null, persistence: "github" };
    const update = await fetcher(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(jsonText(changed.value), "utf8").toString("base64"),
        branch,
        ...(sha ? { sha } : {})
      })
    });
    if (update.ok) {
      const body = await update.json().catch(() => ({})) as { commit?: { sha?: unknown } };
      return {
        ...changed,
        commit: typeof body.commit?.sha === "string" ? body.commit.sha.slice(0, 7) : null,
        persistence: "github"
      };
    }
    if (update.status !== 409 && !(update.status === 422 && sha === undefined)) {
      throw githubFailure(update.status, "write");
    }
  }
  throw new KvorumRecommendationPersistenceError("CONFLICT", "Kvórum state changed during every save attempt.");
}

async function persist<T>(
  relative: string,
  mutate: (current: unknown | null) => { value: T; idempotent: boolean },
  message: string,
  root = repositoryRoot()
): Promise<PersistenceResult<T>> {
  const token = process.env[GITHUB_TOKEN_ENV];
  if (token) return writeGitHub(relative, mutate, message, token);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new KvorumRecommendationPersistenceError(
      "UNCONFIGURED",
      `${GITHUB_TOKEN_ENV} is not set on this deployment, so the Kvórum owner action was not recorded.`
    );
  }
  return writeLocal(relative, mutate, root);
}

function originalDraft(entry: KvorumRecommendation, capturedAt: string): KvorumOriginalDraft {
  return {
    capturedAt,
    headline: entry.headline,
    summary: entry.summary,
    whyItMatters: entry.whyItMatters,
    whyThisIsWorthIt: entry.whyThisIsWorthIt,
    ourAngle: entry.ourAngle,
    ourAngleDiffers: entry.ourAngleDiffers,
    platforms: [...entry.platforms],
    formats: [...entry.formats],
    copyBlocks: structuredClone(entry.copyBlocks)
  };
}

function editedRecommendation(
  entry: KvorumRecommendation,
  edits: RecommendationEdits | undefined
): { value: KvorumRecommendation; fields: string[] } {
  if (!edits) return { value: entry, fields: [] };
  const value = structuredClone(entry);
  const fields: string[] = [];
  for (const field of Object.keys(TEXT_LIMITS) as EditableTextField[]) {
    const next = edits[field];
    if (next !== undefined && value[field] !== next) {
      value[field] = next;
      fields.push(field);
    }
  }
  if (edits.copyBlocks) {
    const byId = new Map(value.copyBlocks.map((block) => [block.id, block]));
    for (const patch of edits.copyBlocks) {
      const block = byId.get(patch.id);
      if (!block) throw new KvorumRecommendationPersistenceError("INVALID", `Copy block ${patch.id} does not exist.`);
      if (patch.text !== undefined) block.text = patch.text;
      if (patch.altText !== undefined) block.altText = patch.altText;
      if (patch.reason !== undefined) block.reason = patch.reason;
    }
    if (JSON.stringify(value.copyBlocks) !== JSON.stringify(entry.copyBlocks)) fields.push("copyBlocks");
  }
  return { value, fields };
}

function transition(
  current: unknown | null,
  input: KvorumRecommendationAction,
  now: Date
): { value: KvorumRecommendation; idempotent: boolean } {
  if (current === null) throw new KvorumRecommendationPersistenceError("CONFLICT", "That Kvórum recommendation no longer exists.");
  const entry = recommendation(current, input.ref);
  if (!entry.gateResults.passed) {
    throw new KvorumRecommendationPersistenceError("CONFLICT", "A recommendation without passing gates cannot receive an owner action.");
  }
  const at = now.toISOString();
  if (Date.parse(at) < Date.parse(entry.updatedAt)) {
    throw new KvorumRecommendationPersistenceError("CONFLICT", "The owner action predates the saved recommendation.");
  }
  if (input.action === "approve") {
    const edited = editedRecommendation(entry, input.edits);
    if (entry.status === "approved") {
      if (edited.fields.length > 0) {
        throw new KvorumRecommendationPersistenceError("CONFLICT", "An approved recommendation cannot be edited by retry.");
      }
      return { value: entry, idempotent: true };
    }
    if (entry.status !== "draft") {
      throw new KvorumRecommendationPersistenceError("CONFLICT", `A ${entry.status} recommendation cannot be approved.`);
    }
    const value = edited.value;
    value.status = "approved";
    value.updatedAt = at;
    value.owner.approvedAt = at;
    if (edited.fields.length > 0) {
      value.owner.original = originalDraft(entry, at);
      value.owner.editHistory.push({
        editedAt: at,
        changedBy: "owner",
        fields: edited.fields,
        note: "Owner edited the draft before approval; the original remains attached."
      });
    }
    value.designLab = {
      status: "queued",
      requestedAt: at,
      resolvedAt: null,
      recipeRef: null,
      artifactRefs: [],
      failureReason: null
    };
    return { value, idempotent: false };
  }
  if (input.action === "reject") {
    if (entry.status === "rejected") {
      if (entry.owner.rejectionReason !== input.reason) {
        throw new KvorumRecommendationPersistenceError("CONFLICT", "That recommendation was rejected with a different reason.");
      }
      return { value: entry, idempotent: true };
    }
    if (entry.status !== "draft") {
      throw new KvorumRecommendationPersistenceError("CONFLICT", `A ${entry.status} recommendation cannot be rejected.`);
    }
    const value = structuredClone(entry);
    value.status = "rejected";
    value.updatedAt = at;
    value.owner.rejectedAt = at;
    value.owner.rejectionReason = input.reason;
    return { value, idempotent: false };
  }
  if (entry.status === "posted") {
    if (entry.owner.postedUrl !== input.postedUrl) {
      throw new KvorumRecommendationPersistenceError("CONFLICT", "That recommendation already records a different posted URL.");
    }
    return { value: entry, idempotent: true };
  }
  if (entry.status !== "approved") {
    throw new KvorumRecommendationPersistenceError("CONFLICT", `A ${entry.status} recommendation cannot record a posted URL.`);
  }
  const value = structuredClone(entry);
  value.status = "posted";
  value.updatedAt = at;
  value.owner.postedAt = at;
  value.owner.postedUrl = input.postedUrl;
  return { value, idempotent: false };
}

function summarySlug(entry: KvorumRecommendation): string {
  const prefix = `kv-${entry.date}-`;
  const slug = entry.id.startsWith(prefix) ? entry.id.slice(prefix.length) : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw new KvorumRecommendationPersistenceError("CORRUPT", "The recommendation id cannot address a Design Lab summary.");
  }
  return slug;
}

function designLabSummary(entry: KvorumRecommendation): CarouselSummary {
  return buildCarouselSummary({
    venture: "kvorum",
    slug: summarySlug(entry),
    date: entry.date,
    title: entry.headline,
    dek: entry.whyItMatters,
    points: [entry.summary, entry.ourAngle, entry.ourAngleDiffers],
    sources: entry.evidence.sources
      .filter((source) => !source.discoveryOnly && source.sourceId !== "stit-demokracie-facebook")
      .map((source) => ({ kind: "source", label: source.sourceName }))
      .filter((source, index, all) => all.findIndex((candidate) => candidate.label === source.label) === index),
    hasHero: false,
    heroCredit: null
  });
}

async function syncIndexStatus(
  ref: string,
  entry: KvorumRecommendation,
  now: Date,
  root: string
): Promise<PersistenceResult<unknown>> {
  return persist(INDEX_REF, (current) => {
    if (current === null) return { value: null, idempotent: true };
    const index = object(current);
    if (!index || !Array.isArray(index.queue) || typeof index.date !== "string") {
      throw new KvorumRecommendationPersistenceError("CORRUPT", "The Kvórum recommendation index is malformed.");
    }
    if (index.date !== entry.date) return { value: current, idempotent: true };
    const position = index.queue.findIndex((raw) => object(raw)?.ref === ref);
    if (position < 0) {
      throw new KvorumRecommendationPersistenceError("CORRUPT", "The current-day recommendation is missing from its queue index.");
    }
    const queueEntry = object(index.queue[position]);
    if (!queueEntry) throw new KvorumRecommendationPersistenceError("CORRUPT", "The Kvórum queue entry is malformed.");
    if (queueEntry.status === entry.status) return { value: current, idempotent: true };
    const value = structuredClone(index);
    (value.queue as unknown[])[position] = { ...queueEntry, status: entry.status };
    value.generatedAt = now.toISOString();
    return { value, idempotent: false };
  }, `admin: sync Kvórum queue ${entry.id}`, root);
}

export async function applyKvorumRecommendationAction(
  input: KvorumRecommendationAction,
  options: { root?: string; now?: Date } = {}
): Promise<KvorumRecommendationActionResult> {
  const root = options.root ?? repositoryRoot();
  const now = options.now ?? new Date();
  const changed = await persist(
    input.ref,
    (current) => transition(current, input, now),
    `admin: ${input.action} Kvórum recommendation`,
    root
  );
  const index = await syncIndexStatus(input.ref, changed.value, now, root);
  let summary: PersistenceResult<CarouselSummary> | null = null;
  if (input.action === "approve") {
    const value = designLabSummary(changed.value);
    const relative = `state/ventures/carousel-studio/summaries/kvorum/${value.date}-${value.slug}.json`;
    summary = await persist(relative, (current) => {
      if (current === null) return { value, idempotent: false };
      if (JSON.stringify(current) !== JSON.stringify(value)) {
        throw new KvorumRecommendationPersistenceError("CONFLICT", "A different Design Lab summary already exists for this recommendation.");
      }
      return { value, idempotent: true };
    }, `admin: queue Kvórum summary ${value.slug}`, root);
  }
  const commits = [changed.commit, index.commit, summary?.commit]
    .filter((commit): commit is string => typeof commit === "string");
  return {
    recommendation: changed.value,
    summary: summary?.value ?? null,
    idempotent: changed.idempotent && index.idempotent && (summary?.idempotent ?? true),
    persistence: changed.persistence,
    commits: [...new Set(commits)]
  };
}
