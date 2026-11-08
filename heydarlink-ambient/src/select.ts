import { createHash } from "node:crypto";
import type { Shot } from "./config.js";

/**
 * Picks the day's shots for one persona without repeating any until the whole list has run.
 *
 * The order inside a cycle is a shuffle keyed on the date and the persona, so a rerun of the same
 * day picks the same shots and the four accounts never march through their lists in lockstep.
 * A shot is spent when it is picked, whatever its frames become: a prompt the gates keep refusing
 * would otherwise be picked every morning and block the rotation.
 */
export function pickShots(input: {
  shots: readonly Shot[];
  used: readonly string[];
  count: number;
  date: string;
  persona: string;
}): { picked: Shot[]; used: string[] } {
  const known = new Set(input.shots.map((shot) => shot.id));
  // A shot removed from config leaves the rotation with it, so it cannot hold a slot forever.
  let used = input.used.filter((id) => known.has(id));
  const picked: Shot[] = [];
  const count = Math.min(input.count, input.shots.length);
  let cycle = 0;
  while (picked.length < count) {
    const taken = new Set([...used, ...picked.map((shot) => shot.id)]);
    const fresh = shuffle(
      input.shots.filter((shot) => !taken.has(shot.id)),
      `${input.date}:${input.persona}:${cycle}`
    );
    if (fresh.length === 0) {
      // The list is exhausted: a new cycle starts, keeping today's picks out of it.
      used = [];
      cycle += 1;
      continue;
    }
    const take = fresh.slice(0, count - picked.length);
    picked.push(...take);
    used = [...used, ...take.map((shot) => shot.id)];
  }
  return { picked, used: used.length >= input.shots.length ? [] : used };
}

function shuffle<T extends { id: string }>(items: T[], key: string): T[] {
  const rank = (item: T) => createHash("sha256").update(`${key}:${item.id}`).digest("hex");
  return [...items].sort((a, b) => (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0));
}
