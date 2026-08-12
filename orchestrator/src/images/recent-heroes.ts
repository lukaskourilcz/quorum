import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The pictures the venture's last few articles already ran.
 *
 * Every rung above the plate picks from a pool, and no rung ever asked what the article before it
 * used. `sceneRotation` seeds its starting offset from the slug and its comment claims that
 * "neighbouring articles differ" — which is true only while the pool is larger than one. On
 * 12 August the day's concept had a single curated scene, the gate considered exactly one
 * candidate, and DNESKAi published the same server-room photograph it had published on 8 August.
 * Two different stories, byte-identical hero and thumbnail.
 *
 * A rotation is not a guarantee. This is the memory that makes it one: the ladder asks what has
 * just been used and treats a repeat like any other veto — it descends, which is the same answer
 * it already gives for a file it cannot fetch or a picture the vision gate refuses.
 *
 * Read from the recorded selections rather than from the delivered images, for the reason the
 * verdict store gives in its own header: what was chosen is written down once and read back
 * forever. Re-deriving it from bytes would also work and would answer a different question —
 * "what is on disk now" rather than "what did we choose" — and the two come apart the moment an
 * image correction replaces a hero.
 */

/** How far back a repeat still counts. */
export const RECENT_HERO_WINDOW = 10;

interface RecordedSelection {
  date?: unknown;
  selected?: unknown;
}

/**
 * Candidate ids the venture used most recently, newest first.
 *
 * Filenames are `<date>-<slug>.json`, so a reverse filename sort is a reverse date sort without
 * opening anything. An unreadable or malformed receipt costs that one entry and never the run:
 * the worst case is a repeat this guard would have caught, which is exactly where the system was
 * before it existed.
 */
export async function recentHeroIds(input: {
  venture: string;
  stateRoot: string;
  limit?: number;
  /** The article being selected for, so re-running a day does not veto its own recorded pick. */
  excludeSlug?: string;
}): Promise<Set<string>> {
  const directory = path.join(input.stateRoot, "ventures", input.venture, "image-selections");
  const used = new Set<string>();
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort().reverse();
  } catch {
    return used;
  }
  for (const name of names.slice(0, input.limit ?? RECENT_HERO_WINDOW)) {
    try {
      const record = JSON.parse(await readFile(path.join(directory, name), "utf8")) as RecordedSelection & { slug?: unknown };
      if (input.excludeSlug && record.slug === input.excludeSlug) continue;
      if (typeof record.selected === "string" && record.selected) used.add(record.selected);
    } catch {
      continue;
    }
  }
  return used;
}
