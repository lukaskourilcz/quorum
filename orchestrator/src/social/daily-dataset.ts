import { readFileSync } from "node:fs";
import path from "node:path";
import { BoardlessDatasetSchema, type DatasetEntry } from "../contracts/boardless-dataset.js";
import { configRoot } from "../paths.js";
import { safeFetch } from "../security/url.js";

/**
 * DNESKAi's lesson or fact of the day, resolved exactly as the reader resolves it.
 *
 * The datasets live in aifirst (`data/ai-lessons.json`, `data/ai-facts.json`), not here: this
 * repository only records the appends. A social post that shows "today's lesson" has to show the
 * entry the reader shows on the same date, so it reads the published file and applies the reader's
 * own rule — whole calendar days from the anchor, modulo the length (aifirst `lib/daily.ts`).
 *
 * A read that fails is an absence, never a guess: the caller drafts nothing that needed the entry.
 */
export type DailyDatasetName = "ai-lessons" | "ai-facts";

export const DATASET_SOURCE = "https://raw.githubusercontent.com/lukaskourilcz/aifirst/main/data";

function daysBetween(anchor: string, date: string): number {
  const utc = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year!, month! - 1, day!);
  };
  return Math.round((utc(date) - utc(anchor)) / 86_400_000);
}

/** The entry the reader reveals on `date`. */
export function dailyDatasetEntry(file: { anchor: string; entries: readonly DatasetEntry[] }, date: string): DatasetEntry | null {
  if (file.entries.length === 0) return null;
  const effective = date >= file.anchor ? date : file.anchor;
  const offset = daysBetween(file.anchor, effective);
  return file.entries[((offset % file.entries.length) + file.entries.length) % file.entries.length] ?? null;
}

function allowedHosts(): string[] {
  const raw = readFileSync(path.join(configRoot, "network-allowlist.json"), "utf8");
  return (JSON.parse(raw) as { runtimeHosts: string[] }).runtimeHosts;
}

/** The published dataset's entry for a date, or null with the reason logged. */
export async function readDailyDatasetEntry(input: {
  dataset: DailyDatasetName;
  date: string;
  fetchImpl?: typeof fetch;
  resolveImpl?: (hostname: string) => Promise<string[]>;
}): Promise<DatasetEntry | null> {
  try {
    const response = await safeFetch(`${DATASET_SOURCE}/${input.dataset}.json`, {
      allowHosts: allowedHosts(),
      maxBytes: 2_000_000,
      timeoutMs: 10_000,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
    });
    const parsed = BoardlessDatasetSchema.safeParse(JSON.parse(new TextDecoder().decode(response.body)));
    if (!parsed.success || parsed.data.dataset !== input.dataset) throw new Error(`${input.dataset} is not a valid boardless-dataset/1 file`);
    return dailyDatasetEntry(parsed.data, input.date);
  } catch (error) {
    console.warn(JSON.stringify({ event: "daily_dataset_unavailable", dataset: input.dataset, date: input.date, reason: error instanceof Error ? error.message : String(error) }));
    return null;
  }
}
