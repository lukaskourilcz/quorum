import { stateRoot } from "../paths.js";
import { withFileLock } from "../state.js";
import { loadVentureRegistry } from "../ventures/registry.js";
import { runWebDevSignalDaily, type WebDevSignalDailyResult } from "../ventures/webdev-signal/run.js";
import type { CycleOptions } from "./types.js";
import type { VentureDayPreStepId, VentureDayPreStepOutcome } from "./venture-day.js";

/**
 * The production runner for a venture day's internal prerequisites.
 *
 * There is one: WebDev Signal's daily scan, which `config/webdev-signal.json` places
 * `before-anchor` on `cu-day`. This is the seam where it meets the engine's own rules, and each
 * rule is applied here rather than inside the runner so the runner stays a library a test can
 * call against a scratch root:
 *
 * - The venture's own pause switch, `status: "paused"` in the registry, ends the step before
 *   anything is read, the way `runCycle` ends a paused venture's room. The repository-wide
 *   `PAUSED` file and Caught Up's own switch never reach here — `runCycle` refuses the whole day
 *   first.
 * - The lock. `withFileLock` is not re-entrant and the day holds none across its steps, so a
 *   live scan takes and releases `.lock` exactly as a room does. A dry scan writes to the
 *   dry-run tree and takes no lock, like every other dry phase.
 * - The network. The transport refuses to fetch under `CI` unless the caller hands it a fetch,
 *   so the suite can never reach a real feed by accident. The scheduled cycle runs under `CI`
 *   too, so this is the one place that hands it the platform fetch — the deliberate opt-in the
 *   transport's guard was written to require.
 *
 * A thrown error is not caught here: the day's driver records it as a failed pre-step and goes on
 * to the first room, which is what "never costs the Caught Up day" means.
 */

export interface VentureDayPreStepDependencies {
  loadRegistry?: typeof loadVentureRegistry;
  runDaily?: typeof runWebDevSignalDaily;
  lockRoot?: string;
}

function outcomeFor(id: VentureDayPreStepId, result: WebDevSignalDailyResult): VentureDayPreStepOutcome {
  if (result.status === "not-anchored") {
    return { id, status: "paused", recordRef: null, note: "The dispatcher is not the phase the registration anchors to.", artifacts: [] };
  }
  return {
    id,
    status: result.status,
    recordRef: result.runRef,
    note: result.status === "already_recorded"
      ? `${result.pragueDate} already has a receipt.`
      : `${result.run.selectionOutcome}: ${result.run.nextSafeAction}`,
    artifacts: result.artifacts
  };
}

export async function runVentureDayPreStep(
  id: VentureDayPreStepId,
  options: CycleOptions,
  dependencies: VentureDayPreStepDependencies = {}
): Promise<VentureDayPreStepOutcome> {
  const registry = await (dependencies.loadRegistry ?? loadVentureRegistry)();
  const venture = registry.ventures.find((candidate) => candidate.id === "webdev-signal");
  if (!options.dry && venture?.status === "paused") {
    return { id, status: "paused", recordRef: null, note: "webdev-signal is paused in config/ventures.json.", artifacts: [] };
  }
  const runDaily = dependencies.runDaily ?? runWebDevSignalDaily;
  const run = () => runDaily({
    now: options.now ?? new Date(),
    dry: options.dry,
    dispatcherPhase: options.phase,
    ...(options.dry ? {} : { fetchImpl: fetch })
  });
  const result = options.dry ? await run() : await withFileLock(dependencies.lockRoot ?? stateRoot, ".lock", run);
  return outcomeFor(id, result);
}
