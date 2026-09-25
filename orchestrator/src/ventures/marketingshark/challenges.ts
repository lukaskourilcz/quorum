import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { repoRoot } from "../../paths.js";
import { canonicalJson } from "./bank.js";
import { weekIndexOf } from "./kinds.js";
import { epochOrder } from "./ledger.js";

/**
 * devShark's coding challenges, as the Wednesday teaser may use them (quorum#576).
 *
 * A teaser shows an Easy challenge's prompt and its first hint, never the solution. The snapshot
 * is therefore built to be unable to carry one: each entry is a strict object of the prompt, the
 * first hint and the facts slide 1 names, and the importer never reads a solution, a later hint,
 * a test or the starter code. The difficulty label is devShark's own (`difficultyOf`, its step D5),
 * recorded as imported and never derived here from a tier: an authored override in the product can
 * move a label, and a second copy of the rule would go on saying "Easy" after it had.
 */

export const CHALLENGE_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type ChallengeDifficulty = (typeof CHALLENGE_DIFFICULTIES)[number];

/** Where every label in a snapshot came from. The importer refuses a checkout that cannot supply it. */
export const CHALLENGE_LABEL_SOURCE = "shared/coding-catalog.ts#difficultyOf";

export const ChallengeSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80),
  track: z.enum(["javascript", "typescript", "react", "algorithms"]),
  title: z.string().min(1).max(80),
  difficulty: z.enum(CHALLENGE_DIFFICULTIES),
  prompt: z.string().min(1).max(600),
  firstHint: z.string().min(1).max(300)
});
export type Challenge = z.infer<typeof ChallengeSchema>;

export const ChallengeBankSnapshotSchema = z.strictObject({
  schemaVersion: z.literal("marketingshark-challenges/1"),
  brandId: z.literal("devshark"),
  sourceRepo: z.string().min(1),
  sourceCommit: z.string().min(7),
  importedAt: z.iso.datetime({ offset: true }),
  labelSource: z.literal(CHALLENGE_LABEL_SOURCE),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  challenges: z.array(ChallengeSchema).min(1)
}).superRefine((snapshot, context) => {
  const ids = snapshot.challenges.map((challenge) => challenge.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "challenge ids must be unique", path: ["challenges"] });
});
export type ChallengeBankSnapshot = z.infer<typeof ChallengeBankSnapshotSchema>;

export function challengesContentHash(challenges: readonly Challenge[]): string {
  return createHash("sha256").update(canonicalJson(challenges)).digest("hex");
}

/** How a track reads on a slide. */
export const TRACK_LABELS: Readonly<Record<Challenge["track"], string>> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  react: "React",
  algorithms: "Algorithms"
};

/** "Easy", as devShark's own chip prints it. */
export function difficultyLabel(difficulty: ChallengeDifficulty): string {
  return `${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)}`;
}

/** Inline-code backticks are markup on a slide, not words; the prompt keeps its words exactly. */
export function slideText(value: string): string {
  return value.replace(/`([^`]*)`/gu, "$1");
}

/**
 * The committed snapshot, or null when none has been imported yet.
 *
 * Absent is a state, not a fault: until devShark ships its labels there is nothing to import, and
 * the Wednesday room takes the quiz instead. A snapshot that is there but does not hash to its own
 * challenges is a fault and throws, because its order is seeded from that hash.
 */
export async function loadChallengeSnapshot(snapshotPath: string, root = repoRoot): Promise<ChallengeBankSnapshot | null> {
  const absolute = path.isAbsolute(snapshotPath) ? snapshotPath : path.join(root, snapshotPath);
  let raw: string;
  try {
    raw = await readFile(absolute, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const snapshot = ChallengeBankSnapshotSchema.parse(JSON.parse(raw));
  const actual = challengesContentHash(snapshot.challenges);
  if (actual !== snapshot.contentHash) {
    throw new Error(`${snapshotPath} contentHash ${snapshot.contentHash.slice(0, 12)} does not match its challenges (${actual.slice(0, 12)})`);
  }
  return snapshot;
}

/**
 * The week's challenge: one of the labelled difficulty whose words fit their slides, the same one
 * for every run in a week, turning over on Mondays through a seeded order of the whole snapshot.
 *
 * The order is keyed per id, like the question bank's, so an import that adds challenges leaves
 * the relative order of the old ones alone.
 */
export function selectChallenge(input: {
  snapshot: ChallengeBankSnapshot;
  difficulty: ChallengeDifficulty;
  date: string;
  fits: (challenge: Challenge) => boolean;
}): Challenge | null {
  const eligible = input.snapshot.challenges.filter((challenge) => challenge.difficulty === input.difficulty && input.fits(challenge));
  if (eligible.length === 0) return null;
  const byId = new Map(eligible.map((challenge) => [challenge.id, challenge]));
  const order = epochOrder([...byId.keys()], input.snapshot.contentHash);
  return byId.get(order[weekIndexOf(input.date) % order.length]!) ?? null;
}
