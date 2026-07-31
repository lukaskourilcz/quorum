import "server-only";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  parseRatingLedger,
  type RatingRecord
} from "./rating-model";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const pendingWrites = new Map<string, Promise<unknown>>();

export class RatingPersistenceError extends Error {
  constructor(
    readonly code: "UNAVAILABLE" | "CONFLICT" | "CORRUPT" | "REMOTE",
    message: string
  ) {
    super(message);
  }
}

export interface AppendRatingResult {
  record: RatingRecord;
  idempotent: boolean;
  persistence: "filesystem" | "github";
}

function ratingPath(ventureId: string): string {
  return `state/ratings/${ventureId}/ledger.jsonl`;
}

function appendToLedger(raw: string, rating: RatingRecord): {
  content: string;
  record: RatingRecord;
  idempotent: boolean;
} {
  const ratings = parseRatingLedger(raw);
  if (!ratings) throw new RatingPersistenceError("CORRUPT", "The canonical rating ledger is malformed.");
  const replay = ratings.find((entry) =>
    entry.objectRef.id === rating.objectRef.id && entry.ratedAt === rating.ratedAt
  );
  if (replay) {
    if (JSON.stringify(replay) !== JSON.stringify(rating)) {
      throw new RatingPersistenceError("CONFLICT", "That rating timestamp is already attached to different content.");
    }
    return { content: raw, record: replay, idempotent: true };
  }
  return {
    content: `${raw}${JSON.stringify(rating)}\n`,
    record: rating,
    idempotent: false
  };
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

export async function appendRatingToFilesystem(
  rating: RatingRecord,
  root = repositoryRoot
): Promise<AppendRatingResult> {
  const relative = ratingPath(rating.ventureId);
  const target = path.resolve(root, relative);
  const boundary = path.relative(root, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) {
    throw new RatingPersistenceError("CONFLICT", "Rating path escaped the repository root.");
  }
  return serialized(target, async () => {
    let raw = "";
    try {
      raw = await readFile(target, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const appended = appendToLedger(raw, rating);
    if (!appended.idempotent) {
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, appended.content, { encoding: "utf8", mode: 0o600 });
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    return { record: appended.record, idempotent: appended.idempotent, persistence: "filesystem" };
  });
}

interface GitHubContentResponse {
  content?: string;
  encoding?: string;
  sha?: string;
}

async function appendRatingToGitHub(
  rating: RatingRecord,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<AppendRatingResult> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const relative = ratingPath(rating.ventureId);
  const encodedPath = relative.split("/").map(encodeURIComponent).join("/");
  const endpoint = `https://api.github.com/repos/${repository}/contents/${encodedPath}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2026-03-10"
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentResponse = await fetcher(`${endpoint}?ref=${encodeURIComponent(branch)}`, {
      headers,
      cache: "no-store"
    });
    let raw = "";
    let sha: string | undefined;
    if (currentResponse.status !== 404) {
      if (!currentResponse.ok) {
        throw new RatingPersistenceError("REMOTE", `GitHub rating read failed with ${currentResponse.status}.`);
      }
      const current = await currentResponse.json() as GitHubContentResponse;
      if (current.encoding !== "base64" || typeof current.content !== "string" || typeof current.sha !== "string") {
        throw new RatingPersistenceError("REMOTE", "GitHub returned an invalid rating ledger response.");
      }
      raw = Buffer.from(current.content.replaceAll("\n", ""), "base64").toString("utf8");
      sha = current.sha;
    }
    const appended = appendToLedger(raw, rating);
    if (appended.idempotent) {
      return { record: appended.record, idempotent: true, persistence: "github" };
    }
    const updateResponse = await fetcher(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `admin: rate ${rating.objectKind} ${rating.objectRef.id}`,
        content: Buffer.from(appended.content, "utf8").toString("base64"),
        branch,
        ...(sha ? { sha } : {})
      })
    });
    if (updateResponse.ok) {
      return { record: rating, idempotent: false, persistence: "github" };
    }
    if (updateResponse.status !== 409) {
      throw new RatingPersistenceError("REMOTE", `GitHub rating write failed with ${updateResponse.status}.`);
    }
  }
  throw new RatingPersistenceError("CONFLICT", "The rating ledger changed during all retry attempts.");
}

export async function appendRating(rating: RatingRecord): Promise<AppendRatingResult> {
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (token) return appendRatingToGitHub(rating, token);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new RatingPersistenceError(
      "UNAVAILABLE",
      "Canonical rating persistence is not configured for this deployment."
    );
  }
  return appendRatingToFilesystem(rating);
}
