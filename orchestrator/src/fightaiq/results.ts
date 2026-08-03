import { BoutRecordSchema, type BoutRecord } from "../contracts/mma.js";
import { fighterSlug } from "./roster.js";
import { saveBoutRecord } from "./store.js";
import type { EventResult } from "./wikipedia-events.js";

/**
 * Write what happened onto the bouts we already had announced.
 *
 * A bout goes in as `announced` when the card is published and has to come out as `completed` with
 * a winner, or the rating engine never sees it and the derived record stays stuck at whatever the
 * last import left. This is the step that closes that loop after each event.
 *
 * Matching is on the pair and the day, not on the bout id: the id was minted from the announced
 * card and the result comes from the same article, but a late replacement changes who is fighting
 * and the pair is what identifies the fight that actually took place.
 */

export interface ResultApplication {
  boutRef: string;
  winner: "red" | "blue" | "draw" | "no-contest";
  method: string | null;
}

function pairKey(org: string, left: string, right: string, day: string): string {
  return [org, ...[fighterSlug(left), fighterSlug(right)].sort(), day].join("|");
}

export async function applyEventResults(input: {
  root: string;
  bouts: readonly BoutRecord[];
  cards: ReadonlyArray<{ org: "ufc" | "oktagon"; name: string; startsAtUtc: string; sourceTitle: string; results: readonly EventResult[] }>;
  retrievedAt: Date;
}): Promise<{ applied: ResultApplication[]; paths: string[]; unmatched: string[] }> {
  const retrievedAt = input.retrievedAt.toISOString();
  const open = new Map<string, BoutRecord>();
  for (const bout of input.bouts) {
    if (bout.status === "completed" || bout.status === "cancelled") continue;
    open.set(pairKey(bout.org, bout.fighters.red.split(":").at(-1)!, bout.fighters.blue.split(":").at(-1)!, bout.event.startsAtUtc.slice(0, 10)), bout);
  }

  const applied: ResultApplication[] = [];
  const paths: string[] = [];
  const unmatched: string[] = [];
  for (const card of input.cards) {
    const day = card.startsAtUtc.slice(0, 10);
    const sourceRef = `source:wikipedia:${retrievedAt.slice(0, 10)}:${card.name}`;
    for (const result of card.results) {
      const bout = open.get(pairKey(card.org, result.red, result.blue, day));
      if (!bout) {
        // A result with no announced bout on file: worth naming, not worth minting a record for.
        // The card reader is what decides which bouts we track, and it runs first.
        unmatched.push(`${card.name}: ${result.red} vs ${result.blue}`);
        continue;
      }
      // The template names the winner on the left; our record may have them on either side.
      const redIsResultRed = fighterSlug(bout.fighters.red.split(":").at(-1)!) === fighterSlug(result.red);
      const winner = result.winner === "red"
        ? redIsResultRed ? "red" as const : "blue" as const
        : result.winner;
      const sourceRefs = [...new Set([...bout.sourceRefs, sourceRef])].sort();
      const completed = BoutRecordSchema.parse({
        ...bout,
        status: "completed",
        sourceRefs,
        statusHistory: [...bout.statusHistory, {
          status: "completed",
          at: retrievedAt,
          sourceRefs: [sourceRef],
          note: `Result read from the ${card.name} article after the event.`
        }],
        result: {
          winner,
          method: result.method,
          round: result.round,
          elapsedSeconds: result.elapsedSeconds,
          sourceRefs: [sourceRef]
        },
        changeLog: [...bout.changeLog, {
          at: retrievedAt,
          kind: "status-change",
          fields: ["status", "result"],
          sourceRefs: [sourceRef],
          note: `${result.red} ${result.winner === "red" ? "def." : result.winner} ${result.blue}${result.method ? ` by ${result.method}` : ""}.`
        }],
        updatedAt: retrievedAt
      });
      const saved = await saveBoutRecord(completed, input.root);
      if (!saved.repeated) paths.push(saved.path);
      applied.push({ boutRef: bout.id, winner, method: result.method });
    }
  }
  return { applied, paths, unmatched };
}
