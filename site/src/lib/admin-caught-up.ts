import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseEventsFile, type MagazineEvent } from "./caught-up-events-store";

/**
 * Read-only state for the DNESKAi admin tab.
 *
 * Everything here is a record the runtime already wrote. Nothing in this file
 * computes a number or reaches the network, so the panel can only ever show
 * what actually happened.
 *
 * Each row reads its own contract, and they do not agree with each other: an
 * edition delivery stamps `date` and names the article by `articleUrl`, a
 * dataset receipt stamps `recordedAt` and has no `date` at all, a stream
 * receipt stamps `date`. Asking every one of them for `{date, slug}` is what
 * made the strip report "none on record" for an edition and two appends that
 * were sitting on disk.
 */
export interface CaughtUpEngineSnapshot {
  /** `slug` is null for the editions delivered before the URL was recorded. */
  lastEdition: { date: string; slug: string | null } | null;
  lastStreamSync: { date: string; stream: string; added: number } | null;
  lastDatasetAppend: { date: string; dataset: string } | null;
}

export interface CaughtUpAdminSnapshot {
  today: string;
  events: MagazineEvent[];
  engine: CaughtUpEngineSnapshot;
}

function stateDir(...parts: string[]): string {
  const root = process.env.BOARDLESSAI_REPO_ROOT ?? path.join(process.cwd(), "..");
  return path.join(root, "state", ...parts);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maximum = 400): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum
    ? value.trim()
    : null;
}

/** An ISO day, from either a `YYYY-MM-DD` field or the front of a timestamp. */
function day(value: unknown): string | null {
  const candidate = text(value, 40);
  const front = candidate?.slice(0, 10);
  return front && /^\d{4}-\d{2}-\d{2}$/.test(front) ? front : null;
}

/** Every readable JSON file in a directory, newest filename first. Missing is empty. */
async function jsonFiles(dir: string): Promise<unknown[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort().reverse();
  } catch {
    return [];
  }
  const parsed = await Promise.all(names.map(async (name) => {
    try {
      return JSON.parse(await readFile(path.join(dir, name), "utf8")) as unknown;
    } catch {
      return null;
    }
  }));
  return parsed.filter((value) => value !== null);
}

/**
 * The article slug, from the URL the delivery recorded.
 *
 * The delivery record has no `slug` field and never had one — the loader asked for one anyway and
 * fell through to null on every edition ever delivered.
 */
function slugFromArticleUrl(value: unknown): string | null {
  const url = text(value, 2_000);
  if (!url) return null;
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean).at(-1);
    return segment && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(segment) ? segment : null;
  } catch {
    return null;
  }
}

function lastEdition(deliveries: readonly unknown[]): CaughtUpEngineSnapshot["lastEdition"] {
  for (const value of deliveries) {
    const delivery = record(value);
    const date = day(delivery?.date);
    // A recorded NO_EDITION day is a real record of a decision, but it is not an edition.
    if (!date || delivery?.editionStatus === "no_edition") continue;
    return { date, slug: slugFromArticleUrl(delivery?.articleUrl) };
  }
  return null;
}

function lastDatasetAppend(receipts: readonly unknown[]): CaughtUpEngineSnapshot["lastDatasetAppend"] {
  const appends = receipts
    .map((value) => {
      const receipt = record(value);
      const date = day(receipt?.recordedAt) ?? day(receipt?.date);
      const dataset = text(receipt?.dataset, 80);
      return date && dataset ? { date, dataset } : null;
    })
    .filter((entry): entry is { date: string; dataset: string } => entry !== null)
    .sort((left, right) => right.date.localeCompare(left.date) || right.dataset.localeCompare(left.dataset));
  return appends[0] ?? null;
}

function lastStreamSync(receipts: readonly unknown[]): CaughtUpEngineSnapshot["lastStreamSync"] {
  for (const value of receipts) {
    const receipt = record(value);
    const date = day(receipt?.date);
    const stream = text(receipt?.stream, 80);
    if (!date || !stream) continue;
    return { date, stream, added: Array.isArray(receipt?.added) ? receipt.added.length : 0 };
  }
  return null;
}

export async function readAdminCaughtUp(today = new Date().toISOString().slice(0, 10)): Promise<CaughtUpAdminSnapshot> {
  const [eventsRaw, deliveries, streams, datasets] = await Promise.all([
    readFile(stateDir("ventures", "caught-up", "events", "events.json"), "utf8").catch(() => null),
    jsonFiles(stateDir("edition", "deliveries")),
    jsonFiles(stateDir("ventures", "caught-up", "streams")),
    jsonFiles(stateDir("ventures", "caught-up", "datasets")),
  ]);

  let parsed: ReturnType<typeof parseEventsFile> = null;
  try {
    parsed = eventsRaw ? parseEventsFile(JSON.parse(eventsRaw)) : null;
  } catch {
    parsed = null;
  }

  return {
    today,
    events: parsed?.events ?? [],
    engine: {
      lastEdition: lastEdition(deliveries),
      lastStreamSync: lastStreamSync(streams),
      lastDatasetAppend: lastDatasetAppend(datasets),
    },
  };
}
