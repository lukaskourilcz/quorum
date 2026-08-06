import { loadVentureRegistry } from "../ventures/registry.js";
import { stateRoot } from "../paths.js";
import { resolveBackstopSweep } from "./sweep.js";

/**
 * Which slot, if any, a backstop sweep should rescue — as one line of JSON.
 *
 * The GitHub crons no longer name a slot each. Three sweeps a day ask this instead, and a sweep
 * with nothing to rescue prints `"phase": null` and costs the run nothing beyond the guard exit.
 */
function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
const now = new Date(valueAfter(args, "--at") ?? Date.now());
const outcome = await resolveBackstopSweep({
  registry: await loadVentureRegistry(),
  stateRoot,
  now
});
console.log(JSON.stringify({ phase: outcome.phase ?? "skip", reason: outcome.reason }));
