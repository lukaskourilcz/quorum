import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseStoredFixedCostRegistry,
  replaceStoredFixedCosts,
  toAdminFixedCosts,
  type FixedCostEntry,
  type StoredFixedCostRegistry
} from "./fixed-cost-model";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const fixedCostPath = "config/fixed-costs.json";

export interface AdminFixedCostSnapshot {
  currency: "USD";
  costs: FixedCostEntry[];
}

export class FixedCostPersistenceError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "CONFLICT" | "CORRUPT" | "REMOTE", message: string) {
    super(message);
  }
}

async function readRegistry(root = repositoryRoot): Promise<StoredFixedCostRegistry> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path.join(root, fixedCostPath), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new FixedCostPersistenceError("UNAVAILABLE", "The fixed-cost file does not exist yet.");
    }
    throw error;
  }
  const registry = parseStoredFixedCostRegistry(parsed);
  if (!registry) throw new FixedCostPersistenceError("CORRUPT", "The saved fixed-cost list is malformed.");
  return registry;
}

function publicSnapshot(registry: StoredFixedCostRegistry): AdminFixedCostSnapshot {
  return { currency: "USD", costs: toAdminFixedCosts(registry) };
}

export async function readAdminFixedCosts(root = repositoryRoot): Promise<AdminFixedCostSnapshot> {
  return publicSnapshot(await readRegistry(root));
}

function nextRegistry(registry: StoredFixedCostRegistry, costs: FixedCostEntry[]): StoredFixedCostRegistry {
  const next = replaceStoredFixedCosts(registry, costs);
  if (!next) throw new FixedCostPersistenceError("CONFLICT", "Check every name, monthly amount, category and start date. Amounts must be greater than zero.");
  return next;
}

async function writeLocal(registry: StoredFixedCostRegistry, root = repositoryRoot): Promise<void> {
  const target = path.join(root, fixedCostPath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeGitHub(costs: FixedCostEntry[], token: string): Promise<StoredFixedCostRegistry> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const endpoint = `https://api.github.com/repos/${repository}/contents/${fixedCostPath}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    if (!response.ok) throw new FixedCostPersistenceError("REMOTE", `GitHub fixed-cost read failed with ${response.status}.`);
    const current = await response.json() as { content?: string; encoding?: string; sha?: string };
    if (current.encoding !== "base64" || !current.content || !current.sha) throw new FixedCostPersistenceError("REMOTE", "GitHub returned an invalid fixed-cost file.");
    const registry = parseStoredFixedCostRegistry(JSON.parse(Buffer.from(current.content.replaceAll("\n", ""), "base64").toString("utf8")));
    if (!registry) throw new FixedCostPersistenceError("CORRUPT", "The saved fixed-cost list is malformed.");
    const next = nextRegistry(registry, costs);
    const update = await fetch(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "admin: update fixed monthly costs",
        content: Buffer.from(`${JSON.stringify(next, null, 2)}\n`).toString("base64"),
        branch,
        sha: current.sha
      })
    });
    if (update.ok) return next;
    if (update.status !== 409) throw new FixedCostPersistenceError("REMOTE", `GitHub fixed-cost write failed with ${update.status}.`);
  }
  throw new FixedCostPersistenceError("CONFLICT", "The fixed-cost list changed during every save attempt.");
}

export async function updateAdminFixedCosts(costs: FixedCostEntry[]): Promise<AdminFixedCostSnapshot> {
  if (!Array.isArray(costs)) throw new FixedCostPersistenceError("CONFLICT", "Send a fixed-cost list.");
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (token) return publicSnapshot(await writeGitHub(costs, token));
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new FixedCostPersistenceError("UNAVAILABLE", "GitHub writing is not configured for this admin.");
  }
  const next = nextRegistry(await readRegistry(), costs);
  await writeLocal(next);
  return publicSnapshot(next);
}
