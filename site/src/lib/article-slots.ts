import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface PublicArticleSlot {
  date: string;
  slot: "am" | "pm";
  status: string;
  reason?: string;
}

function runsRoot() {
  const repoRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
  return path.join(repoRoot, "state", "ventures", "mma-files", "runs");
}

function parseRun(value: unknown): PublicArticleSlot | null {
  if (!value || typeof value !== "object") return null;
  const { date, slot, status, reason } = value as Record<string, unknown>;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  if (slot !== "am" && slot !== "pm") return null;
  if (typeof status !== "string" || status.length === 0) return null;
  return { date, slot, status, ...(typeof reason === "string" ? { reason: reason.slice(0, 180) } : {}) };
}

/**
 * What each MMA Files article slot did, which no meeting record can carry.
 *
 * The two article slots have no MeetingRecord kind, so the calendar fell through to "missed"
 * for both, every day, forever — including 2 August, when the 10:00 slot published the
 * Shevchenko profile and the 18:00 slot was killed with a stated reason.
 */
export async function getPublicArticleSlots(): Promise<readonly PublicArticleSlot[]> {
  let names: string[] = [];
  try {
    names = await readdir(runsRoot());
  } catch {
    return [];
  }
  const parsed = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => {
    try {
      return parseRun(JSON.parse(await readFile(path.join(runsRoot(), name), "utf8")));
    } catch {
      return null;
    }
  }));
  return parsed.filter((run): run is PublicArticleSlot => Boolean(run));
}
