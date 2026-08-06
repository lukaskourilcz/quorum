import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * What a meeting was asked to decide before it opened.
 *
 * A record's `agendaRef` looks like `meeting-agendas/queue.json#agenda-1f7e454d7495c427`.
 * The id after the hash is the only part a reader needs, and the queue holds the sentence
 * the requesting room wrote. Without this the meeting page could only show the room's
 * standing brief, which is the same every day and answers a different question.
 */
export async function getMeetingAgendaSummaries(): Promise<ReadonlyMap<string, string>> {
  const repoRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
  const summaries = new Map<string, string>();
  let queue: unknown;
  try {
    queue = JSON.parse(
      await readFile(path.join(repoRoot, "state", "meeting-agendas", "queue.json"), "utf8")
    );
  } catch {
    return summaries;
  }
  const agendas = (queue as { agendas?: unknown })?.agendas;
  if (!Array.isArray(agendas)) return summaries;
  for (const agenda of agendas) {
    const entry = agenda as { id?: unknown; summary?: unknown };
    if (
      typeof entry?.id === "string" &&
      typeof entry.summary === "string" &&
      entry.summary.trim().length > 0 &&
      entry.summary.length <= 600
    ) {
      summaries.set(entry.id, entry.summary.trim());
    }
  }
  return summaries;
}

export function agendaIdFromRef(reference: string): string | null {
  const id = reference.split("#")[1]?.trim();
  return id && /^agenda-[a-z0-9]+$/.test(id) ? id : null;
}
