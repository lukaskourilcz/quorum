import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AutonomySnapshot } from "../autonomy/signals.js";
import type { BudgetLedgerEntry } from "../budget.js";
import { loadVentureRegistry } from "../ventures/registry.js";

/**
 * What the morning board is asked to review, assembled from records already on disk.
 *
 * Every board shift ever held returned NO_ACTION, because the only thing it was given to judge was
 * an opportunity pipeline containing fixtures. The council's job is now the ventures that exist:
 * what ran, what did not run and why, what it cost, and what the owner thought of the output. All
 * of that is already written down — this file only collects it.
 *
 * Zero model calls. Every failure degrades to a named absence rather than a thrown error: a
 * missing calendar file is a day with no schedule on record, not a morning that cannot happen.
 */
export interface OperationsPacket {
  /** The day under review — yesterday, in Prague terms, resolved by the caller. */
  reviewDate: string;
  ventures: Array<{
    id: string;
    name: string;
    status: string;
    growthObjective: string;
  }>;
  meetings: {
    scheduled: number;
    held: number;
    /** Every slot that did not meet, with the reason its skip record gives. */
    skipped: Array<{ date: string; phase: string; reason: string }>;
    /** Scheduled slots with neither a held record nor a skip record — the silent ones. */
    unaccounted: Array<{ date: string; kind: string }>;
  };
  spend: {
    dayUsd: number;
    monthToDateUsd: number;
    dayCapUsd: number;
    monthCapUsd: number;
  };
  quality: AutonomySnapshot["quality"] | null;
  /** Owner ratings recorded since the previous morning, per venture. */
  ratingDeltas: Array<{
    ventureId: string;
    perfect: number;
    good: number;
    bad: number;
  }>;
  /**
   * Nightly content scores when the content gate has written any. Absent is normal — the gate is
   * off by default — and reads as "no scores on record", never as a score of zero.
   */
  contentScores: Array<{
    ventureId: string;
    date: string;
    scored: number;
    unscored: number;
    averageFit: number | null;
  }>;
}

const CalendarSchema = z.object({
  weekOf: z.string(),
  slots: z.array(z.object({
    at: z.string(),
    kind: z.string(),
    status: z.string(),
    meetingRef: z.string().optional().nullable()
  }))
});

const SkipSchema = z.object({
  date: z.string(),
  phase: z.string(),
  reason: z.string()
});

const RatingSchema = z.object({
  ventureId: z.string(),
  rating: z.enum(["perfect", "good", "bad"]),
  ratedAt: z.string()
});

const ContentScoreSchema = z.object({
  schemaVersion: z.literal("content-score/1"),
  ventureId: z.string(),
  date: z.string(),
  items: z.array(z.object({
    fit: z.number().nullable(),
    unscored: z.boolean().optional()
  }))
});

async function readJsonFile(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function listJson(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

/** The Monday of the ISO week a date belongs to, which is how calendar files are named. */
export function mondayOf(date: string): string {
  const at = new Date(`${date}T12:00:00Z`);
  const weekday = (at.getUTCDay() + 6) % 7;
  at.setUTCDate(at.getUTCDate() - weekday);
  return at.toISOString().slice(0, 10);
}

async function meetingReview(stateRoot: string, reviewDate: string): Promise<OperationsPacket["meetings"]> {
  const calendar = CalendarSchema.safeParse(
    await readJsonFile(path.join(stateRoot, "calendar", `${mondayOf(reviewDate)}.json`))
  );
  const slots = calendar.success
    ? calendar.data.slots.filter((slot) => slot.at.slice(0, 10) === reviewDate)
    : [];

  const skips: OperationsPacket["meetings"]["skipped"] = [];
  const skipDirectory = path.join(stateRoot, "meetings", "skips");
  for (const name of await listJson(skipDirectory)) {
    if (!name.startsWith(reviewDate)) continue;
    const parsed = SkipSchema.safeParse(await readJsonFile(path.join(skipDirectory, name)));
    if (parsed.success) skips.push(parsed.data);
  }

  const skippedPhases = new Set(skips.map((skip) => skip.phase));
  const held = slots.filter((slot) => slot.status === "held").length;
  // A slot that neither met nor left a skip record is the interesting case: the meeting-skip
  // pattern says every non-event writes a reason, so a silent one is a bug worth naming.
  const unaccounted = slots
    .filter((slot) => slot.status !== "held" && !skippedPhases.has(slot.kind))
    .map((slot) => ({ date: reviewDate, kind: slot.kind }));

  return { scheduled: slots.length, held, skipped: skips, unaccounted };
}

async function ratingDeltas(
  stateRoot: string,
  since: string,
  until: string
): Promise<OperationsPacket["ratingDeltas"]> {
  const root = path.join(stateRoot, "ratings");
  let ventures: string[];
  try {
    ventures = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }

  const deltas: OperationsPacket["ratingDeltas"] = [];
  for (const ventureId of ventures) {
    let raw: string;
    try {
      raw = await readFile(path.join(root, ventureId, "ledger.jsonl"), "utf8");
    } catch {
      continue;
    }
    const counts = { perfect: 0, good: 0, bad: 0 };
    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
      let parsed;
      try {
        parsed = RatingSchema.safeParse(JSON.parse(line));
      } catch {
        continue;
      }
      // One malformed line costs that line, never the ledger.
      if (!parsed.success) continue;
      const day = parsed.data.ratedAt.slice(0, 10);
      if (day >= since && day <= until) counts[parsed.data.rating] += 1;
    }
    if (counts.perfect + counts.good + counts.bad > 0) deltas.push({ ventureId, ...counts });
  }
  return deltas;
}

async function contentScores(stateRoot: string, reviewDate: string): Promise<OperationsPacket["contentScores"]> {
  const venturesRoot = path.join(stateRoot, "ventures");
  let ventures: string[];
  try {
    ventures = (await readdir(venturesRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }

  const scores: OperationsPacket["contentScores"] = [];
  for (const ventureId of ventures) {
    const parsed = ContentScoreSchema.safeParse(
      await readJsonFile(path.join(venturesRoot, ventureId, "content-scores", `${reviewDate}.json`))
    );
    if (!parsed.success) continue;
    const rated = parsed.data.items.filter((item) => typeof item.fit === "number");
    scores.push({
      ventureId,
      date: parsed.data.date,
      scored: rated.length,
      unscored: parsed.data.items.length - rated.length,
      // null, not 0: a day whose items all failed to score has no average, and printing one
      // would make an absence look like a verdict.
      averageFit: rated.length === 0
        ? null
        : Number((rated.reduce((sum, item) => sum + (item.fit ?? 0), 0) / rated.length).toFixed(2))
    });
  }
  return scores;
}

export async function buildOperationsPacket(input: {
  repoRoot: string;
  stateRoot: string;
  /** The day being reviewed, normally yesterday in Prague. */
  reviewDate: string;
  /** The morning before this one, so rating deltas cover exactly the gap. */
  since: string;
  autonomy: AutonomySnapshot | null;
  ledger: readonly BudgetLedgerEntry[];
  dayCapUsd: number;
  monthCapUsd: number;
}): Promise<OperationsPacket> {
  const registry = await loadVentureRegistry();
  const month = input.reviewDate.slice(0, 7);
  const sum = (predicate: (entry: BudgetLedgerEntry) => boolean) =>
    Number(input.ledger.filter(predicate).reduce((total, entry) => total + entry.usd, 0).toFixed(8));

  const [meetings, deltas, scores] = await Promise.all([
    meetingReview(input.stateRoot, input.reviewDate),
    ratingDeltas(input.stateRoot, input.since, input.reviewDate),
    contentScores(input.stateRoot, input.reviewDate)
  ]);

  return {
    reviewDate: input.reviewDate,
    ventures: registry.ventures.map((venture) => ({
      id: venture.id,
      name: venture.name,
      status: venture.status,
      growthObjective: venture.growth_objective.label
    })),
    meetings,
    spend: {
      dayUsd: sum((entry) => entry.ts.slice(0, 10) === input.reviewDate),
      monthToDateUsd: sum((entry) => entry.ts.slice(0, 7) === month),
      dayCapUsd: input.dayCapUsd,
      monthCapUsd: input.monthCapUsd
    },
    quality: input.autonomy?.quality ?? null,
    ratingDeltas: deltas,
    contentScores: scores
  };
}
