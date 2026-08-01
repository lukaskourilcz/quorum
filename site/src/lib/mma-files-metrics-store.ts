import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const relative = "state/ventures/mma-files/social/metrics.jsonl";
const pendingWrites = new Map<string, Promise<unknown>>();

export interface OwnerMetricsCapture {
  schemaVersion: "metrics-capture/1";
  postRef: string;
  window: "48h" | "7d";
  metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves?: number;
    clicks?: number;
    follows?: number;
  };
  source: "owner-entry";
  capturedAt: string;
}

export class MetricsPersistenceError extends Error {}

function integer(value: unknown): number | null {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000_000_000 ? parsed : null;
}

export function parseOwnerMetrics(value: unknown, now = new Date()): OwnerMetricsCapture | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const postRef = typeof input.postRef === "string" ? input.postRef.trim() : "";
  const window = input.window === "48h" || input.window === "7d" ? input.window : null;
  if (!/^article:[a-z0-9:-]+:(?:A|B):(?:instagram|threads):(?:en|cs)$/u.test(postRef) || postRef.length > 240 || !window) return null;
  const views = integer(input.views);
  const likes = integer(input.likes);
  const comments = integer(input.comments);
  const shares = integer(input.shares);
  const saves = input.saves === "" || input.saves === undefined ? undefined : integer(input.saves);
  const clicks = input.clicks === "" || input.clicks === undefined ? undefined : integer(input.clicks);
  const follows = input.follows === "" || input.follows === undefined ? undefined : integer(input.follows);
  if ([views, likes, comments, shares].some((entry) => entry === null) || saves === null || clicks === null || follows === null) return null;
  return {
    schemaVersion: "metrics-capture/1",
    postRef,
    window,
    metrics: { views: views!, likes: likes!, comments: comments!, shares: shares!, ...(saves === undefined ? {} : { saves }), ...(clicks === undefined ? {} : { clicks }), ...(follows === undefined ? {} : { follows }) },
    source: "owner-entry",
    capturedAt: now.toISOString()
  };
}

function parseLedger(raw: string): OwnerMetricsCapture[] {
  return raw.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as OwnerMetricsCapture);
}

function append(raw: string, capture: OwnerMetricsCapture): { content: string; idempotent: boolean } {
  const existing = parseLedger(raw).find((entry) => entry.postRef === capture.postRef && entry.window === capture.window);
  if (existing) {
    if (JSON.stringify({ ...existing, capturedAt: capture.capturedAt }) !== JSON.stringify(capture)) throw new MetricsPersistenceError("Metrics already exist for this post and window.");
    return { content: raw, idempotent: true };
  }
  return { content: `${raw}${JSON.stringify(capture)}\n`, idempotent: false };
}

async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  pendingWrites.set(key, next);
  try { return await next; } finally { if (pendingWrites.get(key) === next) pendingWrites.delete(key); }
}

async function writeFilesystem(capture: OwnerMetricsCapture, root = repositoryRoot): Promise<{ persistence: "filesystem"; idempotent: boolean }> {
  const target = path.resolve(root, relative);
  const boundary = path.relative(root, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) throw new MetricsPersistenceError("Metrics path escaped the repository.");
  return serialized(target, async () => {
    let raw = "";
    try { raw = await readFile(target, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const result = append(raw, capture);
    if (!result.idempotent) {
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
      try { await writeFile(temporary, result.content, { encoding: "utf8", mode: 0o600 }); await rename(temporary, target); }
      finally { await rm(temporary, { force: true }); }
    }
    return { persistence: "filesystem" as const, idempotent: result.idempotent };
  });
}

async function writeGitHub(capture: OwnerMetricsCapture, token: string): Promise<{ persistence: "github"; idempotent: boolean }> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const encoded = relative.split("/").map(encodeURIComponent).join("/");
  const endpoint = `https://api.github.com/repos/${repository}/contents/${encoded}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentResponse = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    let raw = "";
    let sha: string | undefined;
    if (currentResponse.status !== 404) {
      if (!currentResponse.ok) throw new MetricsPersistenceError(`GitHub metrics read failed with ${currentResponse.status}.`);
      const current = await currentResponse.json() as { encoding?: string; content?: string; sha?: string };
      if (current.encoding !== "base64" || !current.content || !current.sha) throw new MetricsPersistenceError("GitHub returned an invalid metrics file.");
      raw = Buffer.from(current.content.replaceAll("\n", ""), "base64").toString("utf8");
      sha = current.sha;
    }
    const result = append(raw, capture);
    if (result.idempotent) return { persistence: "github", idempotent: true };
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message: `admin: capture MMA Files metrics ${capture.postRef}`, content: Buffer.from(result.content, "utf8").toString("base64"), branch, ...(sha ? { sha } : {}) })
    });
    if (response.ok) return { persistence: "github", idempotent: false };
    if (response.status !== 409) throw new MetricsPersistenceError(`GitHub metrics write failed with ${response.status}.`);
  }
  throw new MetricsPersistenceError("The metrics file changed during every retry.");
}

export async function saveOwnerMetrics(capture: OwnerMetricsCapture, root = repositoryRoot) {
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (token) return writeGitHub(capture, token);
  if ((process.env.NODE_ENV === "production" || process.env.VERCEL) && root === repositoryRoot) throw new MetricsPersistenceError("Metrics storage is not configured for this deployment.");
  return writeFilesystem(capture, root);
}
