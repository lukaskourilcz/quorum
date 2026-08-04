import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const queuePath = "state/priority-queue.json";

export interface AdminPriorityItem {
  id: string;
  venture: string;
  question: string;
  decisionAtStake: string;
  evidenceNeeded: string[];
  created: string;
  expires: string;
  status: "open" | "selected" | "why-not" | "archived";
  whyNotReason: string | null;
  consumedBy: string | null;
}

export interface AdminAutonomySnapshot {
  generatedAt: string | null;
  growth: Array<{
    venture: string;
    objective: string;
    signals: Array<{ id: string; label: string; value: number; unit: "count" | "ratio"; detail: string }>;
  }>;
  quality: {
    killedSlotReasons: Record<string, number>;
    vetoRate: number;
    firstPassRate: number;
    retryRate: number;
    sourceAgreementRate: number;
    verifierPassRate: number;
  };
  priorities: AdminPriorityItem[];
  social: Array<{
    venture: "caught-up" | "mma-files" | "titty-tuesdays";
    status: "locked" | "enabled" | "paused";
    counter: number;
    required: number;
    reason: string;
    updatedAt: string;
  }>;
}

interface StoredPriorityItem {
  schemaVersion: "priority-item/1";
  id: string;
  venture: string;
  question: string;
  decision_at_stake: string;
  evidence_needed: string[];
  requested_by: "VIZE";
  created: string;
  expires: string;
  status: AdminPriorityItem["status"];
  why_not_reason: string | null;
  consumed_by: string | null;
}

interface StoredQueue {
  schemaVersion: "priority-queue/1";
  items: StoredPriorityItem[];
  updatedAt: string;
}

export class PriorityPersistenceError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "CONFLICT" | "CORRUPT" | "REMOTE", message: string) {
    super(message);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validQueue(value: unknown): StoredQueue | null {
  const queue = record(value);
  if (queue?.schemaVersion !== "priority-queue/1" || !Array.isArray(queue.items) || typeof queue.updatedAt !== "string") return null;
  const items: StoredPriorityItem[] = [];
  for (const value of queue.items) {
    const item = record(value);
    if (
      item?.schemaVersion !== "priority-item/1" || typeof item.id !== "string" || !/^priority-[a-f0-9]{16}$/.test(item.id) ||
      typeof item.venture !== "string" || typeof item.question !== "string" || typeof item.decision_at_stake !== "string" ||
      !Array.isArray(item.evidence_needed) || !item.evidence_needed.every((entry) => typeof entry === "string") ||
      // Any council seat, not only VIZE. A seat may now propose a question and the writer records
      // who asked; the quarterly collector has written AUDIT here since before that. Insisting on
      // one name did not reject the item — it returned null for the WHOLE queue, so /admin stopped
      // rendering and the owner could no longer add or archive anything until the file was edited
      // by hand. A field this reader does not recognise is not a corrupt queue.
      typeof item.requested_by !== "string" || item.requested_by.length === 0 ||
      typeof item.created !== "string" || typeof item.expires !== "string" ||
      !["open", "selected", "why-not", "archived"].includes(String(item.status)) ||
      !(item.why_not_reason === null || typeof item.why_not_reason === "string") ||
      !(item.consumed_by === null || typeof item.consumed_by === "string")
    ) return null;
    items.push(item as unknown as StoredPriorityItem);
  }
  return { schemaVersion: "priority-queue/1", items, updatedAt: queue.updatedAt };
}

async function readQueue(root = repositoryRoot): Promise<StoredQueue> {
  try {
    const queue = validQueue(JSON.parse(await readFile(path.join(root, queuePath), "utf8")));
    if (!queue) throw new PriorityPersistenceError("CORRUPT", "The saved priority queue is malformed.");
    return queue;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: "priority-queue/1", items: [], updatedAt: new Date(0).toISOString() };
    }
    throw error;
  }
}

function publicPriorities(queue: StoredQueue): AdminPriorityItem[] {
  return queue.items
    .map((item) => ({
      id: item.id,
      venture: item.venture,
      question: item.question,
      decisionAtStake: item.decision_at_stake,
      evidenceNeeded: item.evidence_needed,
      created: item.created,
      expires: item.expires,
      status: item.status,
      whyNotReason: item.why_not_reason,
      consumedBy: item.consumed_by
    }))
    .sort((left, right) => right.created.localeCompare(left.created) || left.id.localeCompare(right.id));
}

export async function readAdminAutonomy(root = repositoryRoot): Promise<AdminAutonomySnapshot> {
  const queue = await readQueue(root);
  let autonomy: Record<string, unknown> | null = null;
  try {
    autonomy = record(JSON.parse(await readFile(path.join(root, "state/autonomy/latest.json"), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const growth = Array.isArray(autonomy?.growth) ? autonomy.growth as AdminAutonomySnapshot["growth"] : [];
  const quality = record(autonomy?.quality);
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
  let social: AdminAutonomySnapshot["social"] = [];
  try {
    const activation = record(JSON.parse(await readFile(path.join(root, "state/social/activation.json"), "utf8")));
    const ventures = record(activation?.ventures);
    social = (["caught-up", "mma-files", "titty-tuesdays"] as const).flatMap((venture) => {
      const value = record(ventures?.[venture]);
      const status = value?.status === "locked" || value?.status === "enabled" || value?.status === "paused" ? value.status : null;
      return status && typeof value?.counter === "number" && typeof value.required === "number" && typeof value.reason === "string" && typeof value.updatedAt === "string"
        ? [{ venture, status, counter: value.counter, required: value.required, reason: value.reason, updatedAt: value.updatedAt }]
        : [];
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    generatedAt: typeof autonomy?.generatedAt === "string" ? autonomy.generatedAt : null,
    growth,
    quality: {
      killedSlotReasons: record(quality?.killedSlotReasons) as Record<string, number> ?? {},
      vetoRate: number(quality?.vetoRate),
      firstPassRate: number(quality?.firstPassRate),
      retryRate: number(quality?.retryRate),
      sourceAgreementRate: number(quality?.sourceAgreementRate),
      verifierPassRate: number(quality?.verifierPassRate)
    },
    priorities: publicPriorities(queue),
    social
  };
}

function updatedQueue(queue: StoredQueue, input: { action: "add"; venture: string; question: string; decisionAtStake: string; evidenceNeeded: string[] } | { action: "archive"; itemId: string }, now: Date): StoredQueue {
  if (input.action === "archive") {
    let found = false;
    const items = queue.items.map((item) => {
      if (item.id !== input.itemId) return item;
      found = true;
      if (item.status !== "open") throw new PriorityPersistenceError("CONFLICT", "Only an open priority can be archived.");
      return { ...item, status: "archived" as const };
    });
    if (!found) throw new PriorityPersistenceError("CONFLICT", "That priority item no longer exists.");
    return { ...queue, items, updatedAt: now.toISOString() };
  }
  const venture = input.venture.trim();
  const question = input.question.trim();
  const decisionAtStake = input.decisionAtStake.trim();
  const evidenceNeeded = [...new Set(input.evidenceNeeded.map((entry) => entry.trim()).filter(Boolean))].slice(0, 12);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(venture) || !question || question.length > 280 || !decisionAtStake || decisionAtStake.length > 280) {
    throw new PriorityPersistenceError("CONFLICT", "Add a valid project, question and concrete decision at stake.");
  }
  const created = now.toISOString();
  const id = `priority-${createHash("sha256").update(`${venture}\n${question}\n${decisionAtStake}\n${created}`).digest("hex").slice(0, 16)}`;
  const expires = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  return {
    ...queue,
    items: [...queue.items, {
      schemaVersion: "priority-item/1",
      id,
      venture,
      question,
      decision_at_stake: decisionAtStake,
      evidence_needed: evidenceNeeded,
      requested_by: "VIZE",
      created,
      expires,
      status: "open",
      why_not_reason: null,
      consumed_by: null
    }],
    updatedAt: created
  };
}

async function writeLocal(queue: StoredQueue, root = repositoryRoot): Promise<void> {
  const target = path.join(root, queuePath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(queue, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeGitHub(input: Parameters<typeof updatedQueue>[1], token: string, now: Date): Promise<StoredQueue> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const endpoint = `https://api.github.com/repos/${repository}/contents/${queuePath}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    if (!response.ok) throw new PriorityPersistenceError("REMOTE", `GitHub priority read failed with ${response.status}.`);
    const current = await response.json() as { content?: string; encoding?: string; sha?: string };
    if (current.encoding !== "base64" || !current.content || !current.sha) throw new PriorityPersistenceError("REMOTE", "GitHub returned an invalid priority file.");
    const queue = validQueue(JSON.parse(Buffer.from(current.content.replaceAll("\n", ""), "base64").toString("utf8")));
    if (!queue) throw new PriorityPersistenceError("CORRUPT", "The saved priority queue is malformed.");
    const next = updatedQueue(queue, input, now);
    const update = await fetch(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: input.action === "add" ? `admin: add ${input.venture} priority` : `admin: archive ${input.itemId}`,
        content: Buffer.from(`${JSON.stringify(next, null, 2)}\n`).toString("base64"),
        branch,
        sha: current.sha
      })
    });
    if (update.ok) return next;
    if (update.status !== 409) throw new PriorityPersistenceError("REMOTE", `GitHub priority write failed with ${update.status}.`);
  }
  throw new PriorityPersistenceError("CONFLICT", "The priority queue changed during every save attempt.");
}

export async function updatePriorityQueue(input: Parameters<typeof updatedQueue>[1], now = new Date()): Promise<AdminPriorityItem[]> {
  const token = process.env.BOARDLESSAI_GITHUB_TOKEN;
  if (token) return publicPriorities(await writeGitHub(input, token, now));
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new PriorityPersistenceError("UNAVAILABLE", "GitHub writing is not configured for this admin.");
  const next = updatedQueue(await readQueue(), input, now);
  await writeLocal(next);
  return publicPriorities(next);
}
