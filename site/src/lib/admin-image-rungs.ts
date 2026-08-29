import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Which rung of the certainty ladder actually dressed the last article.
 *
 * The ladder writes a verdict beside every package — every candidate it considered, what the
 * vision gate scored it, and which rung finally answered — precisely so the run report can say
 * *why* a picture was chosen rather than re-deriving it later. Nothing in the admin has ever read
 * those files, so the one number that says whether the picture desk is working could only be found
 * by opening JSON on disk.
 *
 * Recorded, not derived: this reports what the ladder wrote and never re-runs it. A venture with
 * no directory has simply never produced one, which is a different thing from a venture whose
 * pictures are failing, and the two are reported differently.
 */
export const IMAGE_RUNGS = ["entity-linked", "curated", "search", "illustration", "plate"] as const;

export type ImageRung = (typeof IMAGE_RUNGS)[number];

export interface VentureImageRung {
  /** The most recent selection on file, or null when the venture has never recorded one. */
  date: string | null;
  slug: string | null;
  rung: ImageRung | null;
  /** True when the last article fell all the way to the drawn plate. */
  fellToPlate: boolean;
  /** How many of the last ten selections ended on the plate, for the cadence rather than the day. */
  plateCount: number;
  sampled: number;
  /** Records that exist but could not be read. Visible, never silently dropped. */
  malformed: number;
}

const RECENT_WINDOW = 10;

function isRung(value: unknown): value is ImageRung {
  return typeof value === "string" && (IMAGE_RUNGS as readonly string[]).includes(value);
}

async function readVentureRungs(root: string, venture: string): Promise<VentureImageRung> {
  const empty: VentureImageRung = {
    date: null, slug: null, rung: null, fellToPlate: false, plateCount: 0, sampled: 0, malformed: 0
  };
  const directory = path.join(root, "state", "ventures", venture, "image-selections");
  let files: string[];
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
  } catch {
    // No directory is "never produced one", not "unavailable". The caller says so in those words.
    return empty;
  }
  // The filename leads with the delivery date, so lexical order is chronological.
  const recent = files.sort().reverse().slice(0, RECENT_WINDOW);
  let malformed = 0;
  let plateCount = 0;
  let newest: { date: string; slug: string; rung: ImageRung } | null = null;
  for (const file of recent) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path.join(directory, file), "utf8"));
    } catch {
      malformed += 1;
      continue;
    }
    const record = parsed as { date?: unknown; slug?: unknown; rung?: unknown };
    if (typeof record.date !== "string" || typeof record.slug !== "string" || !isRung(record.rung)) {
      malformed += 1;
      continue;
    }
    if (record.rung === "plate") plateCount += 1;
    newest ??= { date: record.date, slug: record.slug, rung: record.rung };
  }
  if (!newest) return { ...empty, malformed, sampled: recent.length - malformed };
  return {
    date: newest.date,
    slug: newest.slug,
    rung: newest.rung,
    fellToPlate: newest.rung === "plate",
    plateCount,
    sampled: recent.length - malformed,
    malformed
  };
}

export async function readAdminImageRungs(
  ventures: readonly string[],
  root = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..")
): Promise<Record<string, VentureImageRung>> {
  const entries = await Promise.all(
    ventures.map(async (venture) => [venture, await readVentureRungs(root, venture)] as const)
  );
  return Object.fromEntries(entries);
}
