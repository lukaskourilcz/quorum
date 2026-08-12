import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyBhFeatureAction,
  assertBhOwnerResultTarget,
  BhFeaturePersistenceError
} from "./booksofhistory-features-store";
import {
  OWNER_RESULT_METRICS,
  parseOwnerResultEntry,
  type OwnerResultEntry,
  type OwnerResultLocale,
  type OwnerResultMetrics
} from "./owner-result-entry";

export interface BhOwnerResultRequest {
  recommendationId: string;
  locale: OwnerResultLocale;
  platform: string;
  postUrl: string;
  capturedAt: string;
  recordedAt: string;
  metrics: OwnerResultMetrics;
  note: string | null;
  idempotencyKey: string;
}

export interface BhOwnerResultWriteResult {
  entry: OwnerResultEntry;
  persistence: "filesystem" | "github";
  idempotent: boolean;
}

type Code = "UNAVAILABLE" | "CONFLICT" | "CORRUPT" | "REMOTE" | "UNCONFIGURED" | "REFUSED";

export class BhResultPersistenceError extends Error {
  constructor(readonly code: Code, message: string) { super(message); }
}

const RECOMMENDATION_ID = /^rec-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const RESULTS_ROOT = "state/ventures/booksofhistory/results";
const RECEIPTS_ROOT = "state/ventures/booksofhistory/result-actions";

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function https(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function parseBhOwnerResultRequest(value: unknown): BhOwnerResultRequest | null {
  const input = object(value);
  if (!input || !exactKeys(input, [
    "recommendationId", "locale", "platform", "postUrl", "capturedAt", "recordedAt",
    "metrics", "note", "idempotencyKey"
  ])) return null;
  const metrics = object(input.metrics);
  if (!metrics || !exactKeys(metrics, OWNER_RESULT_METRICS)) return null;
  if (!OWNER_RESULT_METRICS.every((key) => metrics[key] === null
    || (typeof metrics[key] === "number" && Number.isSafeInteger(metrics[key]) && Number(metrics[key]) >= 0))) return null;
  if (!OWNER_RESULT_METRICS.some((key) => metrics[key] !== null)) return null;
  if (typeof input.recommendationId !== "string" || !RECOMMENDATION_ID.test(input.recommendationId) || input.recommendationId.length > 160) return null;
  if (input.locale !== "cs" && input.locale !== "en") return null;
  if (typeof input.platform !== "string" || !SLUG.test(input.platform) || input.platform.length > 80) return null;
  if (!https(input.postUrl) || typeof input.capturedAt !== "string" || !INSTANT.test(input.capturedAt)) return null;
  if (typeof input.recordedAt !== "string" || !INSTANT.test(input.recordedAt) || Date.parse(input.capturedAt) > Date.parse(input.recordedAt)) return null;
  if (typeof input.idempotencyKey !== "string" || !KEY.test(input.idempotencyKey) || input.idempotencyKey.length > 80) return null;
  if (input.note !== null && (typeof input.note !== "string" || !input.note.trim() || input.note.length > 500)) return null;
  return {
    recommendationId: input.recommendationId,
    locale: input.locale,
    platform: input.platform,
    postUrl: input.postUrl,
    capturedAt: input.capturedAt,
    recordedAt: input.recordedAt,
    metrics: Object.fromEntries(OWNER_RESULT_METRICS.map((key) => [key, metrics[key]])) as OwnerResultMetrics,
    note: input.note === null ? null : input.note.trim(),
    idempotencyKey: input.idempotencyKey
  };
}

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function insideRoot(relative: string): string {
  const root = repositoryRoot();
  const target = path.join(root, relative);
  const boundary = path.relative(root, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) throw new BhResultPersistenceError("CONFLICT", "Result path escaped the repository.");
  return target;
}

async function optionalLocal(relative: string): Promise<unknown | null> {
  try { return JSON.parse(await readFile(insideRoot(relative), "utf8")) as unknown; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function remoteJson(relative: string, token: string): Promise<unknown | null> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const encoded = relative.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://api.github.com/repos/${repository}/contents/${encoded}?ref=${encodeURIComponent(branch)}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" },
    cache: "no-store"
  });
  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) throw new BhResultPersistenceError("REFUSED", `GitHub refused the result read with ${response.status}.`);
  if (!response.ok) throw new BhResultPersistenceError("REMOTE", `GitHub result read failed with ${response.status}.`);
  const body = await response.json() as { content?: string };
  return body.content ? JSON.parse(Buffer.from(body.content.replaceAll("\n", ""), "base64").toString("utf8")) as unknown : null;
}

async function putGitHub(relative: string, value: unknown, message: string, token: string): Promise<void> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const encoded = relative.split("/").map(encodeURIComponent).join("/");
  const endpoint = `https://api.github.com/repos/${repository}/contents/${encoded}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2026-03-10" };
  const current = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
  if (current.status === 401 || current.status === 403) throw new BhResultPersistenceError("REFUSED", `GitHub refused the result read with ${current.status}.`);
  if (!current.ok && current.status !== 404) throw new BhResultPersistenceError("REMOTE", `GitHub result read failed with ${current.status}.`);
  const sha = current.ok ? (await current.json() as { sha?: string }).sha : undefined;
  const response = await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify({
    message,
    content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`).toString("base64"),
    branch,
    ...(sha ? { sha } : {})
  }) });
  if (response.status === 401 || response.status === 403) throw new BhResultPersistenceError("REFUSED", `GitHub refused the result write with ${response.status}.`);
  if (!response.ok) throw new BhResultPersistenceError("REMOTE", `GitHub result write failed with ${response.status}.`);
}

async function writeLocal(relative: string, value: unknown): Promise<void> {
  const target = insideRoot(relative);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}

async function resultsApproved(): Promise<boolean> {
  try {
    const inbox = await readFile(insideRoot("state/INBOX.md"), "utf8");
    return /^- \[[xX]\] HUMAN_APPROVAL BH-RESULTS-004\b/mu.test(inbox);
  } catch { return false; }
}

function requestHash(input: BhOwnerResultRequest): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function entryFor(input: BhOwnerResultRequest): OwnerResultEntry {
  const measurement = {
    recommendationId: input.recommendationId,
    locale: input.locale,
    platform: input.platform,
    postUrl: input.postUrl,
    capturedAt: input.capturedAt,
    recordedAt: input.recordedAt,
    metrics: input.metrics,
    note: input.note
  };
  const resultId = `result-${createHash("sha256").update(JSON.stringify(measurement)).digest("hex").slice(0, 20)}`;
  return {
    schemaVersion: "owner-result-entry/1",
    resultId,
    ventureId: "booksofhistory",
    recommendationId: input.recommendationId,
    locale: input.locale,
    platform: input.platform,
    postUrl: input.postUrl,
    capturedAt: input.capturedAt,
    recordedAt: input.recordedAt,
    enteredBy: "owner",
    metrics: input.metrics,
    note: input.note
  };
}

export async function recordBhOwnerResult(input: BhOwnerResultRequest): Promise<BhOwnerResultWriteResult> {
  if (!(await resultsApproved())) {
    throw new BhResultPersistenceError("CONFLICT", "BH-RESULTS-004 is not approved; owner results remain disabled.");
  }
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (!token && (process.env.NODE_ENV === "production" || process.env.VERCEL)) {
    throw new BhResultPersistenceError("UNCONFIGURED", "BOOKSOFHISTORY result storage is not configured for this deployment.");
  }
  const hash = requestHash(input);
  const receiptRelative = `${RECEIPTS_ROOT}/${input.recommendationId}/${input.idempotencyKey}.json`;
  const existingReceipt = token ? await remoteJson(receiptRelative, token) : await optionalLocal(receiptRelative);
  const existingReceiptRecord = object(existingReceipt);
  if (existingReceiptRecord) {
    const parsed = parseOwnerResultEntry(existingReceiptRecord.entry);
    if (existingReceiptRecord.requestHash !== hash || !parsed) throw new BhResultPersistenceError("CONFLICT", "Idempotency key was already used for a different owner result.");
    return { entry: parsed, persistence: token ? "github" : "filesystem", idempotent: true };
  }

  const entry = entryFor(input);
  await assertBhOwnerResultTarget(entry).catch((error) => {
    if (error instanceof BhFeaturePersistenceError) throw new BhResultPersistenceError(error.code, error.message);
    throw error;
  });
  const resultRelative = `${RESULTS_ROOT}/${entry.resultId}.json`;
  const existingResult = token ? await remoteJson(resultRelative, token) : await optionalLocal(resultRelative);
  if (existingResult !== null && JSON.stringify(parseOwnerResultEntry(existingResult)) !== JSON.stringify(entry)) {
    throw new BhResultPersistenceError("CONFLICT", `Result id ${entry.resultId} already names another record.`);
  }
  if (existingResult === null) {
    if (token) await putGitHub(resultRelative, entry, `admin: record BOOKSOFHISTORY ${entry.locale} result`, token);
    else await writeLocal(resultRelative, entry);
  }

  await applyBhFeatureAction({
    action: "result",
    recommendationId: entry.recommendationId,
    locale: entry.locale,
    resultRef: resultRelative.replace(/^state\//u, ""),
    idempotencyKey: `result-${entry.resultId.slice("result-".length)}`,
    at: entry.recordedAt
  }).catch((error) => {
    if (error instanceof BhFeaturePersistenceError) throw new BhResultPersistenceError(error.code, error.message);
    throw error;
  });

  const receipt = { schemaVersion: "bh-owner-result-action/1", requestHash: hash, entry };
  if (token) await putGitHub(receiptRelative, receipt, `admin: record ${input.idempotencyKey}`, token);
  else await writeLocal(receiptRelative, receipt);
  return { entry, persistence: token ? "github" : "filesystem", idempotent: false };
}
