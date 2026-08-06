import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PublicMeetingSkip } from "@/lib/calendar-feed-model";
import { readsAsMachineText } from "@/lib/public-prose";

function skipsRoot() {
  const repoRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
  return path.join(repoRoot, "state", "meetings", "skips");
}

function parseSkip(value: unknown): PublicMeetingSkip | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== "meeting-skip/1") return null;
  const { date, phase, reason } = record;
  if (typeof date !== "string" || typeof phase !== "string" || typeof reason !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || phase.length === 0 || reason.length === 0) return null;
  // The reason is the whole of what a quiet cell says, so it has to read as a sentence. Two
  // August skips named the commit their release gate failed at and one linked a workflow run.
  if (readsAsMachineText(reason)) return null;
  return { date, phase, reason: reason.slice(0, 180) };
}

/**
 * Every slot a gate turned off, with the reason it gives the reader.
 *
 * Without these the calendar cannot tell a decision from an absence: a skipped meeting and a
 * meeting nobody reached both rendered as "Did not happen", which is what eleven slots looked
 * like on 2 August with no explanation available anywhere on the site.
 */
export async function getPublicMeetingSkips(): Promise<readonly PublicMeetingSkip[]> {
  let names: string[] = [];
  try {
    names = await readdir(skipsRoot());
  } catch {
    return [];
  }
  const parsed = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => {
    try {
      return parseSkip(JSON.parse(await readFile(path.join(skipsRoot(), name), "utf8")));
    } catch {
      return null;
    }
  }));
  return parsed.filter((skip): skip is PublicMeetingSkip => Boolean(skip));
}
