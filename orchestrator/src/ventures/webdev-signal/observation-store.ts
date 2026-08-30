import { readdir } from "node:fs/promises";
import {
  WebDevBaselineSchema,
  WebDevObservationSchema,
  type WebDevBaseline,
  type WebDevObservation
} from "../../contracts/webdev-signal.js";
import { atomicWriteJson, readJson, resolveStatePath } from "../../state.js";

/**
 * Where a day's observation lives, and how a malformed one costs exactly one day.
 *
 * One file per Prague edition day, named by that day, because the day is the join key for every
 * canonical record the observation points at. A file that cannot be parsed is dropped and counted
 * rather than thrown: a baseline that refuses to build because one day is corrupt tells the owner
 * nothing about the other twenty-seven.
 */

export function webDevObservationRef(date: string): string {
  return `ventures/webdev-signal/observations/${date}.json`;
}

export function webDevBaselineRef(endsOn: string): string {
  return `ventures/webdev-signal/baselines/${endsOn}.json`;
}

export async function writeWebDevObservation(root: string, observation: WebDevObservation): Promise<string> {
  const relative = webDevObservationRef(observation.date);
  await atomicWriteJson(root, relative, WebDevObservationSchema.parse(observation));
  return relative;
}

export async function writeWebDevBaseline(root: string, baseline: WebDevBaseline): Promise<string> {
  const relative = webDevBaselineRef(baseline.endsOn);
  await atomicWriteJson(root, relative, WebDevBaselineSchema.parse(baseline));
  return relative;
}

export interface WebDevObservationRead {
  observations: WebDevObservation[];
  /** Files that exist but could not be parsed. Visible, never silently skipped. */
  dropped: number;
}

export async function readWebDevObservations(
  root: string,
  options: { from?: string; to?: string } = {}
): Promise<WebDevObservationRead> {
  let names: string[];
  try {
    names = (await readdir(resolveStatePath(root, "ventures/webdev-signal/observations")))
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/u.test(name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { observations: [], dropped: 0 };
    throw error;
  }

  const observations: WebDevObservation[] = [];
  let dropped = 0;
  for (const name of names) {
    const date = name.slice(0, 10);
    if (options.from && date < options.from) continue;
    if (options.to && date > options.to) continue;
    // `readJson` throws on malformed bytes, which is right for a caller that needs the file and
    // wrong for a walk whose whole contract is that one bad day costs one day.
    let raw: unknown = null;
    try {
      raw = await readJson<unknown>(root, `ventures/webdev-signal/observations/${name}`, null);
    } catch {
      dropped += 1;
      continue;
    }
    const parsed = WebDevObservationSchema.safeParse(raw);
    if (parsed.success) observations.push(parsed.data);
    else dropped += 1;
  }
  return { observations, dropped };
}
