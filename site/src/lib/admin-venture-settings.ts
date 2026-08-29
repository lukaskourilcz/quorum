import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * The owner's venture pause switches, and the one file they flip.
 *
 * A pause is not a new mechanism: it is the venture registry's own `status: "paused"`, which the
 * engine, the public calendar and the facilities wall already read. Flipping it here means the
 * next firing of any of that venture's phases ends before an agenda, agent or provider is
 * touched; the venture leaves the public wall and its desk channel leaves the workspace view on
 * the deploy the write itself triggers. The admin keeps the workspace visible so the archive
 * stays readable and the switch can be flipped back.
 *
 * Some ventures are not the owner's to pause, by his own rule: a venture others depend on cannot
 * be switched off without switching them off too. The Design Lab renders every venture's decks,
 * GoVIRAL supplies both magazines' trend intelligence, and FightAIQ is MMA Files' data supplier.
 * WebDev Signal is not founded, so there is nothing running to pause. None of the four appears
 * in Settings at all, and the writer refuses them independently of the page.
 */
export const UNPAUSABLE_VENTURES: Readonly<Record<string, string>> = {
  "carousel-studio": "The Design Lab renders every venture's decks.",
  goviral: "GoVIRAL supplies the magazines' trend intelligence.",
  fightaiq: "FightAIQ is MMA Files' data supplier.",
  "webdev-signal": "Not founded; nothing runs."
};

export interface AdminVentureSwitch {
  id: string;
  name: string;
  paused: boolean;
}

export interface AdminVentureSettings {
  ventures: AdminVentureSwitch[];
}

export class VentureSettingsPersistenceError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "CONFLICT" | "CORRUPT" | "REMOTE", message: string) {
    super(message);
  }
}

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const registryPath = "config/ventures.json";

interface StoredRegistry {
  schemaVersion: "venture-registry/1";
  ventures: Array<{ id: string; name: string; status: string } & Record<string, unknown>>;
}

function validRegistry(value: unknown): StoredRegistry | null {
  const registry = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (registry?.schemaVersion !== "venture-registry/1" || !Array.isArray(registry.ventures)) return null;
  for (const venture of registry.ventures) {
    const record = venture && typeof venture === "object" ? venture as Record<string, unknown> : null;
    if (typeof record?.id !== "string" || typeof record.name !== "string" || typeof record.status !== "string") return null;
  }
  return registry as unknown as StoredRegistry;
}

async function readRegistry(root = repositoryRoot): Promise<StoredRegistry> {
  const registry = validRegistry(JSON.parse(await readFile(path.join(root, registryPath), "utf8")));
  if (!registry) throw new VentureSettingsPersistenceError("CORRUPT", "The venture registry is malformed.");
  return registry;
}

function switches(registry: StoredRegistry): AdminVentureSwitch[] {
  return registry.ventures
    .filter((venture) => !(venture.id in UNPAUSABLE_VENTURES) && venture.status !== "exploration")
    .map((venture) => ({ id: venture.id, name: venture.name, paused: venture.status === "paused" }));
}

export async function readAdminVentureSettings(root = repositoryRoot): Promise<AdminVentureSettings> {
  return { ventures: switches(await readRegistry(root)) };
}

function flipped(registry: StoredRegistry, ventureId: string, paused: boolean): StoredRegistry {
  if (ventureId in UNPAUSABLE_VENTURES) {
    throw new VentureSettingsPersistenceError("CONFLICT", UNPAUSABLE_VENTURES[ventureId]!);
  }
  const venture = registry.ventures.find((candidate) => candidate.id === ventureId);
  if (!venture) throw new VentureSettingsPersistenceError("CONFLICT", "That project does not exist.");
  if (venture.status !== "operating" && venture.status !== "paused") {
    throw new VentureSettingsPersistenceError("CONFLICT", "Only an operating project can be paused here.");
  }
  return {
    ...registry,
    ventures: registry.ventures.map((candidate) =>
      candidate.id === ventureId ? { ...candidate, status: paused ? "paused" : "operating" } : candidate)
  };
}

async function writeLocal(registry: StoredRegistry, root = repositoryRoot): Promise<void> {
  const target = path.join(root, registryPath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeGitHub(ventureId: string, paused: boolean, token: string): Promise<StoredRegistry> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const endpoint = `https://api.github.com/repos/${repository}/contents/${registryPath}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    if (!response.ok) throw new VentureSettingsPersistenceError("REMOTE", `GitHub registry read failed with ${response.status}.`);
    const current = await response.json() as { content?: string; encoding?: string; sha?: string };
    if (current.encoding !== "base64" || !current.content || !current.sha) throw new VentureSettingsPersistenceError("REMOTE", "GitHub returned an invalid registry file.");
    const registry = validRegistry(JSON.parse(Buffer.from(current.content.replaceAll("\n", ""), "base64").toString("utf8")));
    if (!registry) throw new VentureSettingsPersistenceError("CORRUPT", "The venture registry is malformed.");
    const next = flipped(registry, ventureId, paused);
    const update = await fetch(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `admin: ${paused ? "pause" : "resume"} ${ventureId}`,
        content: Buffer.from(`${JSON.stringify(next, null, 2)}\n`).toString("base64"),
        branch,
        sha: current.sha
      })
    });
    if (update.ok) return next;
    if (update.status !== 409) throw new VentureSettingsPersistenceError("REMOTE", `GitHub registry write failed with ${update.status}.`);
  }
  throw new VentureSettingsPersistenceError("CONFLICT", "The registry changed during every save attempt.");
}

export async function setVenturePaused(ventureId: string, paused: boolean, root = repositoryRoot): Promise<AdminVentureSettings> {
  if (typeof ventureId !== "string" || typeof paused !== "boolean") {
    throw new VentureSettingsPersistenceError("CONFLICT", "Send a project id and whether it is paused.");
  }
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (token) return { ventures: switches(await writeGitHub(ventureId, paused, token)) };
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new VentureSettingsPersistenceError("UNAVAILABLE", "GitHub writing is not configured for this admin.");
  }
  const next = flipped(await readRegistry(root), ventureId, paused);
  await writeLocal(next, root);
  return { ventures: switches(next) };
}
