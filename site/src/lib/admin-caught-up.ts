import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseEventsFile, type MagazineEvent } from "./caught-up-events-store";

/**
 * Read-only state for the DNESKAi admin tab.
 *
 * Everything here is a record the runtime already wrote. Nothing in this file
 * computes a number or reaches the network, so the panel can only ever show
 * what actually happened.
 */
export interface CaughtUpEngineSnapshot {
  lastEdition: { date: string; slug: string } | null;
  lastStreamSync: { date: string; stream: string; added: number } | null;
  lastDatasetAppend: { date: string; dataset: string } | null;
}

export interface CaughtUpAdminSnapshot {
  today: string;
  events: MagazineEvent[];
  engine: CaughtUpEngineSnapshot;
}

function stateDir(...parts: string[]): string {
  const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
  return path.join(repositoryRoot, "state", ...parts);
}

async function newestJson(dir: string): Promise<{ name: string; value: unknown } | null> {
  try {
    const names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
    const newest = names.at(-1);
    if (!newest) return null;
    return { name: newest, value: JSON.parse(await readFile(path.join(dir, newest), "utf8")) };
  } catch {
    return null;
  }
}

export async function readAdminCaughtUp(today = new Date().toISOString().slice(0, 10)): Promise<CaughtUpAdminSnapshot> {
  const [eventsRaw, delivery, stream, dataset] = await Promise.all([
    readFile(stateDir("ventures", "caught-up", "events", "events.json"), "utf8").catch(() => null),
    newestJson(stateDir("edition", "deliveries")),
    newestJson(stateDir("ventures", "caught-up", "streams")),
    newestJson(stateDir("ventures", "caught-up", "datasets")),
  ]);

  const parsed = eventsRaw ? parseEventsFile(JSON.parse(eventsRaw)) : null;

  const editionRecord = delivery?.value as { date?: string; slug?: string } | undefined;
  const streamRecord = stream?.value as { date?: string; stream?: string; added?: string[] } | undefined;
  const datasetRecord = dataset?.value as { date?: string; dataset?: string } | undefined;

  return {
    today,
    events: parsed?.events ?? [],
    engine: {
      lastEdition:
        editionRecord?.date && editionRecord.slug
          ? { date: editionRecord.date, slug: editionRecord.slug }
          : null,
      lastStreamSync:
        streamRecord?.date && streamRecord.stream
          ? { date: streamRecord.date, stream: streamRecord.stream, added: streamRecord.added?.length ?? 0 }
          : null,
      lastDatasetAppend:
        datasetRecord?.date && datasetRecord.dataset
          ? { date: datasetRecord.date, dataset: datasetRecord.dataset }
          : null,
    },
  };
}
