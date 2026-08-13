import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type TehdejsiStateCode = "UNAVAILABLE" | "CONFLICT" | "CORRUPT" | "REMOTE" | "REFUSED";

export class TehdejsiStateError extends Error {
  constructor(readonly code: TehdejsiStateCode, message: string) { super(message); }
}

const DEFAULT_ROOT = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const ALLOWED = /^state\/ventures\/tehdejsi-svet\/[a-z0-9._/-]+$/u;

function target(relative: string, root: string): string {
  if (!ALLOWED.test(relative) || relative.includes("..")) throw new TehdejsiStateError("CONFLICT", "Tehdejsi svet state path was refused.");
  const resolved = path.join(root, relative);
  const boundary = path.relative(root, resolved);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) throw new TehdejsiStateError("CONFLICT", "Tehdejsi svet state path escaped the repository.");
  return resolved;
}

export async function readTehdejsiStateJson(relative: string, root = DEFAULT_ROOT): Promise<unknown> {
  try { return JSON.parse(await readFile(target(relative, root), "utf8")) as unknown; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new TehdejsiStateError("UNAVAILABLE", `${relative} is missing.`);
    if (error instanceof SyntaxError) throw new TehdejsiStateError("CORRUPT", `${relative} is not valid JSON.`);
    throw error;
  }
}

async function localWrite(relative: string, value: unknown, root: string): Promise<void> {
  const file = target(relative, root);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

async function remoteWrite(relative: string, value: unknown, message: string, token: string): Promise<string> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const endpoint = `https://api.github.com/repos/${repository}/contents/${relative.split("/").map(encodeURIComponent).join("/")}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    if (current.status === 401 || current.status === 403) throw new TehdejsiStateError("REFUSED", `GitHub refused the state read with ${current.status}.`);
    if (!current.ok && current.status !== 404) throw new TehdejsiStateError("REMOTE", `GitHub state read failed with ${current.status}.`);
    const sha = current.ok ? (await current.json() as { sha?: string }).sha : undefined;
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`).toString("base64"), branch, ...(sha ? { sha } : {}) })
    });
    if (response.ok) {
      const body = await response.json() as { commit?: { sha?: unknown } };
      return typeof body.commit?.sha === "string" ? body.commit.sha : "github-write";
    }
    if (response.status !== 409 && !(response.status === 422 && !sha)) {
      if (response.status === 401 || response.status === 403) throw new TehdejsiStateError("REFUSED", `GitHub refused the state write with ${response.status}.`);
      throw new TehdejsiStateError("REMOTE", `GitHub state write failed with ${response.status}.`);
    }
  }
  throw new TehdejsiStateError("CONFLICT", "Tehdejsi svet state changed during every save attempt.");
}

export async function persistTehdejsiState(
  relative: string,
  value: unknown,
  message: string,
  root = DEFAULT_ROOT
): Promise<{ persistence: "filesystem" | "github"; commit: string | null }> {
  target(relative, root);
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (token) return { persistence: "github", commit: await remoteWrite(relative, value, message, token) };
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new TehdejsiStateError("REFUSED", "Canonical writes require the configured GitHub token.");
  await localWrite(relative, value, root);
  return { persistence: "filesystem", commit: null };
}
