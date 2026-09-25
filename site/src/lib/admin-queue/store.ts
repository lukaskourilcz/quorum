import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where the Queue's writes land: the GitHub Contents API in a deployment, the checkout in
 * development. The same split `caught-up-events-store.ts` and every other admin writer use.
 *
 * Only two directories may be written, and only JSON files in them: the queue items and the
 * owner's queue events. An item is replaced only against the version that was read — the blob
 * sha on GitHub, the bytes on disk — so a publisher run that claimed the item in between turns
 * the owner's action into a conflict instead of overwriting the claim.
 */
export type QueueActionCode = "INVALID" | "NOT_FOUND" | "REFUSED" | "CONFLICT" | "UNCONFIGURED" | "REMOTE" | "UNAVAILABLE" | "CORRUPT";

export class QueueActionError extends Error {
  constructor(readonly code: QueueActionCode, message: string) { super(message); }
}

const ALLOWED = /^state\/social\/(?:queue|queue-events)\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u;
const TOKEN_ENV = "BOARDLESSAI_GITHUB_TOKEN";

export interface StoredQueueFile {
  value: unknown;
  /** The version the read saw: GitHub's blob sha, or the hash of the bytes on disk. */
  version: string;
}

export interface QueueStore {
  persistence: "github" | "filesystem";
  read(relative: string): Promise<StoredQueueFile | null>;
  /** Writes a file that must not exist yet. Answers false when it already does. */
  create(relative: string, value: unknown, message: string): Promise<boolean>;
  replace(relative: string, value: unknown, version: string, message: string): Promise<void>;
}

function guard(relative: string): string {
  if (!ALLOWED.test(relative) || relative.includes("..")) throw new QueueActionError("REFUSED", "The queue refused a path outside its two directories.");
  return relative;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function localStore(root: string): QueueStore {
  const resolve = (relative: string) => {
    const target = path.join(root, guard(relative));
    const boundary = path.relative(root, target);
    if (boundary.startsWith("..") || path.isAbsolute(boundary)) throw new QueueActionError("REFUSED", "The queue path escaped the repository.");
    return target;
  };
  const version = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
  return {
    persistence: "filesystem",
    async read(relative) {
      let bytes: string;
      try { bytes = await readFile(resolve(relative), "utf8"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      try { return { value: JSON.parse(bytes) as unknown, version: version(bytes) }; }
      catch { throw new QueueActionError("CORRUPT", "The queue item is not valid JSON."); }
    },
    async create(relative, value) {
      const target = resolve(relative);
      await mkdir(path.dirname(target), { recursive: true });
      try {
        await writeFile(target, json(value), { encoding: "utf8", flag: "wx" });
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw error;
      }
    },
    async replace(relative, value, expected) {
      const target = resolve(relative);
      const current = await readFile(target, "utf8").catch(() => null);
      if (current === null || version(current) !== expected) throw new QueueActionError("CONFLICT", "The queue item changed while the action was being saved; reload and decide again.");
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, json(value), { encoding: "utf8" });
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    }
  };
}

function githubStore(token: string): QueueStore {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" };
  const endpoint = (relative: string) => `https://api.github.com/repos/${repository}/contents/${guard(relative).split("/").map(encodeURIComponent).join("/")}`;
  const put = (relative: string, value: unknown, message: string, sha?: string) => fetch(endpoint(relative), {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: Buffer.from(json(value), "utf8").toString("base64"), branch, ...(sha ? { sha } : {}) })
  });
  const refused = (status: number, what: string) => status === 401 || status === 403
    ? new QueueActionError("UNCONFIGURED", `GitHub refused the queue ${what} with ${status}.`)
    : new QueueActionError("REMOTE", `GitHub queue ${what} failed with ${status}.`);
  return {
    persistence: "github",
    async read(relative) {
      const response = await fetch(`${endpoint(relative)}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
      if (response.status === 404) return null;
      if (!response.ok) throw refused(response.status, "read");
      const body = await response.json() as { content?: unknown; encoding?: unknown; sha?: unknown };
      if (typeof body.content !== "string" || body.encoding !== "base64" || typeof body.sha !== "string") throw new QueueActionError("CORRUPT", "GitHub returned the queue item without readable content.");
      try { return { value: JSON.parse(Buffer.from(body.content.replaceAll("\n", ""), "base64").toString("utf8")) as unknown, version: body.sha }; }
      catch { throw new QueueActionError("CORRUPT", "The queue item on GitHub is not valid JSON."); }
    },
    async create(relative, value, message) {
      const response = await put(relative, value, message);
      if (response.ok) return true;
      // GitHub answers 422 when a create names a path that already has a blob.
      if (response.status === 422) return false;
      throw refused(response.status, "write");
    },
    async replace(relative, value, version, message) {
      const response = await put(relative, value, message, version);
      if (response.ok) return;
      if (response.status === 409 || response.status === 422) throw new QueueActionError("CONFLICT", "The queue item changed on GitHub while the action was being saved; reload and decide again.");
      throw refused(response.status, "write");
    }
  };
}

export function queueStore(root: string): QueueStore {
  const token = process.env[TOKEN_ENV];
  if (token) return githubStore(token);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new QueueActionError("UNCONFIGURED", "This deployment cannot save queue actions: the GitHub token is not configured.");
  }
  return localStore(root);
}
