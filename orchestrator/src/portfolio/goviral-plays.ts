import { existsSync } from "node:fs";
import path from "node:path";
import {
  GoViralPlayLibrarySchema,
  GoViralPlaySchema,
  riceScore,
  type GoViralPlay
} from "../contracts/goviral-play-library.js";
import { readText } from "../state.js";

/**
 * Reading GoVIRAL's play library off disk, ranked, with every absence named.
 *
 * The library is owner-written and starts empty, which is the state it will be in until the owner
 * has a play with a screenshot and a number behind it. An empty library is not a fault and must
 * not look like one: it produces a `reason` the brief prints, not a thrown error and not a silent
 * gap. The same goes rung by rung — a file that will not parse costs the library, a play that will
 * not parse costs that play, and a screenshot whose file is not on disk costs the screenshot while
 * the play keeps its rating.
 *
 * Nothing here calls a model, a network or a provider. Ranking is arithmetic over stored fields.
 */

export const PLAY_LIBRARY_STATE_PATH = "ventures/goviral/plays/library.json";

export interface RankedPlay {
  play: GoViralPlay;
  rice: number;
  /** True when the play names a screenshot and the file it names is not in the repository. */
  screenshotMissing: boolean;
}

export interface PlayLibraryRead {
  plays: readonly RankedPlay[];
  /** Entries that were in the file and did not survive their own contract. */
  dropped: number;
  /** Why the library is empty or unavailable; null when it parsed and holds plays. */
  reason: string | null;
}

const EMPTY: PlayLibraryRead = { plays: [], dropped: 0, reason: null };

/** Highest RICE first, then by id, so the same library always ranks the same way. */
function rank(left: RankedPlay, right: RankedPlay): number {
  return right.rice - left.rice || left.play.id.localeCompare(right.play.id, "en");
}

export function rankPlays(plays: readonly GoViralPlay[], repoRoot: string): RankedPlay[] {
  return plays
    .map((play) => ({
      play,
      rice: riceScore(play),
      screenshotMissing: play.screenshot !== null && !existsSync(path.join(repoRoot, play.screenshot.path))
    }))
    .sort(rank);
}

export async function loadGoViralPlayLibrary(input: {
  stateRoot: string;
  repoRoot: string;
}): Promise<PlayLibraryRead> {
  const raw = await readText(input.stateRoot, PLAY_LIBRARY_STATE_PATH);
  if (!raw.trim()) {
    return { ...EMPTY, reason: `No play library on file at state/${PLAY_LIBRARY_STATE_PATH}.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ...EMPTY, reason: `state/${PLAY_LIBRARY_STATE_PATH} is not readable JSON.` };
  }
  const library = GoViralPlayLibrarySchema.safeParse(parsed);
  if (library.success) {
    return {
      plays: rankPlays(library.data.plays, input.repoRoot),
      dropped: 0,
      reason: library.data.plays.length === 0 ? "The play library is on file and holds no play yet." : null
    };
  }
  // The envelope failed, which is usually one bad play rather than a bad file. Salvage the plays
  // that do parse instead of losing a library the owner spent evenings filling; count the rest so
  // the brief can say a play was dropped rather than quietly showing a shorter list.
  const entries = (parsed as { plays?: unknown })?.plays;
  if (!Array.isArray(entries)) {
    return { ...EMPTY, reason: `state/${PLAY_LIBRARY_STATE_PATH} does not match goviral-play-library/1.` };
  }
  const kept: GoViralPlay[] = [];
  let dropped = 0;
  for (const entry of entries) {
    const play = GoViralPlaySchema.safeParse(entry);
    if (play.success) kept.push(play.data);
    else dropped += 1;
  }
  return {
    plays: rankPlays(kept, input.repoRoot),
    dropped,
    reason: kept.length === 0
      ? `state/${PLAY_LIBRARY_STATE_PATH} holds no play that matches goviral-play-library/1.`
      : null
  };
}

/**
 * One play as the brief prints it: what it is, how long it takes to read, what it beat and what
 * the rating rests on. A play with no benchmark says so — an unbenchmarked play is capped at 50%
 * confidence by its own contract, and the reader deserves to see which of the two it is looking at.
 */
export function renderPlayLine(entry: RankedPlay): string {
  const { play } = entry;
  const benchmark = play.benchmark
    ? `beat ${play.benchmark.baseline}${play.benchmark.unit} with ${play.benchmark.achieved}${play.benchmark.unit} on ${play.benchmark.metric} over ${play.benchmark.measuredOver}`
    : "no benchmark on file, so the rating is an opinion at 50% confidence";
  const screenshot = play.screenshot === null
    ? "no screenshot"
    : entry.screenshotMissing
      ? `screenshot recorded at ${play.screenshot.path} and the file is missing`
      : `screenshot ${play.screenshot.path}`;
  return `RICE ${entry.rice.toFixed(1)} · ${play.category} · ${play.readTimeMinutes} min read — ${play.title}: ${benchmark}; ${screenshot}.`;
}
