import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * What is waiting on the owner, read from the one file the collector writes.
 *
 * Parse-or-drop, like every other admin loader: a malformed entry costs that entry and is counted,
 * never the panel. Read-only by design — resolving an item means acting at its source (countersign
 * the inbox line, tick the NEEDED entry, set the variable), and the next collector run clears it.
 * A "mark done" button here would be a second source of truth for a fact the sources already hold.
 */
export interface OwnerAttentionItem {
  id: string;
  title: string;
  plain: string;
  steps: string[];
  sourceKind: "inbox" | "needed" | "runtime";
  sourceRef: string;
  since: string | null;
  urgency: "blocking" | "soon" | "whenever";
  needsPlainCopy: boolean;
}

export interface OwnerAttentionSnapshot {
  generatedAt: string | null;
  approvals: OwnerAttentionItem[];
  manualTasks: OwnerAttentionItem[];
  /** Entries that did not parse. Counted so the panel can say the file is partly unreadable. */
  unreadable: number;
  /** `missing` is the first run: the collector has not written the file yet. */
  state: "missing" | "present";
}

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum
    ? value.trim()
    : null;
}

function parseItem(value: unknown, allowed: ReadonlyArray<OwnerAttentionItem["sourceKind"]>): OwnerAttentionItem | null {
  const entry = record(value);
  const source = record(entry?.source);
  const id = text(entry?.id, 120);
  const title = text(entry?.title, 280);
  const plain = text(entry?.plain, 400);
  const sourceRef = text(source?.ref, 200);
  const kind = allowed.find((candidate) => candidate === source?.kind) ?? null;
  const urgency = ["blocking", "soon", "whenever"].includes(String(entry?.urgency))
    ? entry!.urgency as OwnerAttentionItem["urgency"]
    : null;
  if (!id || !title || !plain || !sourceRef || !kind || !urgency) return null;

  const steps = Array.isArray(entry?.steps)
    ? entry.steps.map((step) => text(step, 200)).filter((step): step is string => step !== null).slice(0, 3)
    : [];
  return {
    id,
    title,
    plain,
    steps,
    sourceKind: kind,
    sourceRef,
    since: text(entry?.since, 10),
    urgency,
    needsPlainCopy: entry?.needsPlainCopy === true
  };
}

export async function readOwnerAttention(root = repositoryRoot): Promise<OwnerAttentionSnapshot> {
  let raw: string;
  try {
    raw = await readFile(path.join(root, "state", "owner-attention.json"), "utf8");
  } catch {
    return { generatedAt: null, approvals: [], manualTasks: [], unreadable: 0, state: "missing" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { generatedAt: null, approvals: [], manualTasks: [], unreadable: 0, state: "missing" };
  }

  const file = record(parsed);
  if (file?.schemaVersion !== "owner-attention/1") {
    return { generatedAt: null, approvals: [], manualTasks: [], unreadable: 0, state: "missing" };
  }

  let unreadable = 0;
  const read = (values: unknown, allowed: ReadonlyArray<OwnerAttentionItem["sourceKind"]>) => {
    if (!Array.isArray(values)) return [];
    const items: OwnerAttentionItem[] = [];
    for (const value of values) {
      const item = parseItem(value, allowed);
      if (item) items.push(item);
      else unreadable += 1;
    }
    return items;
  };

  return {
    generatedAt: text(file.generatedAt, 40),
    approvals: read(file.approvals, ["inbox"]),
    manualTasks: read(file.manualTasks, ["needed", "runtime"]),
    unreadable,
    state: "present"
  };
}
