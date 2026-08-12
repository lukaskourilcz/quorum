import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const GITHUB_TOKEN_ENV = "BOARDLESSAI_GITHUB_TOKEN";
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

export interface KvorumPersistenceResult<T> {
  value: T;
  commit: string | null;
  idempotent: boolean;
  persistence: "filesystem" | "github";
}

export function kvorumRepositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
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
): Promise<KvorumPersistenceResult<T>> {
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
): Promise<KvorumPersistenceResult<T>> {
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

export async function persistKvorum<T>(
  relative: string,
  mutate: (current: unknown | null) => { value: T; idempotent: boolean },
  message: string,
  root = kvorumRepositoryRoot()
): Promise<KvorumPersistenceResult<T>> {
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
