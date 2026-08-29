import "server-only";
import { readFile } from "node:fs/promises";
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
    signals: Array<{ id: string; label: string; value: number | null; unit: "count" | "ratio"; detail: string }>;
  }>;
  quality: {
    killedSlotReasons: Record<string, number>;
    /**
     * Each rate is null when nothing was attempted.
     *
     * `ratio()` writes 0 for an empty denominator, so "Releases that passed 0%" meant zero releases
     * rather than zero passes. The snapshot records what each rate was divided by; anything the
     * runtime never attempted arrives here as null and the panel says so in words. Same `null != 0`
     * doctrine the public site runs on.
     */
    vetoRate: number | null;
    firstPassRate: number | null;
    retryRate: number | null;
    sourceAgreementRate: number | null;
    verifierPassRate: number | null;
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
    if (!queue) throw new Error("The saved priority queue is malformed.");
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
  const denominators = record(quality?.denominators);
  const count = (key: string) => {
    const value = denominators?.[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
  };
  /**
   * A rate the runtime actually measured, or null.
   *
   * A snapshot written before `denominators` existed has no counts at all, and there is no way to
   * tell its zeroes apart from real ones — so every rate in it reads as no-data until the next
   * 06:00 run rewrites the file. Guessing the other way would print the same lie this fixes.
   */
  const rate = (key: string, over: string) =>
    count(over) > 0 && typeof quality?.[key] === "number" && Number.isFinite(quality[key])
      ? quality[key] as number
      : null;
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
      vetoRate: rate("vetoRate", "meetings"),
      firstPassRate: rate("firstPassRate", "proofs"),
      retryRate: rate("retryRate", "proofs"),
      sourceAgreementRate: rate("sourceAgreementRate", "fighterFields"),
      verifierPassRate: rate("verifierPassRate", "proofs")
    },
    priorities: publicPriorities(queue),
    social
  };
}

/*
 * The write half of this module — the add/archive form and its GitHub fallback — went with the
 * owner's 2026-08-29 instruction to run the system autonomously: the council raises its own
 * priorities through the runtime, and the admin reads the queue rather than editing it.
 */
