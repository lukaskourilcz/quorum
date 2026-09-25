import type { VentureRegistry } from "../../src/contracts/venture-registry.js";

/**
 * The live registry with every paused venture running, for tests of schedule mechanics.
 *
 * A paused venture leaves the clock (`operations-2026-09b`), so a test of how a daylight-saving
 * firing maps to a slot, how an article slot is recorded or how the budget ladder drops a room
 * would otherwise depend on which ventures the owner happens to run today. The mechanics are the
 * same for every venture; these tests exercise them on the full set of rooms. Tests of the
 * schedule the repository actually deploys read the real registry instead.
 */
export function allOperating(registry: VentureRegistry): VentureRegistry {
  return {
    ...registry,
    ventures: registry.ventures.map((venture) =>
      venture.status === "paused" ? { ...venture, status: "operating" as const } : venture)
  };
}

/** A `vi.mock` factory body for `src/ventures/registry.js` that serves `allOperating`. */
export async function registryModuleWithEveryVentureRunning(
  importOriginal: () => Promise<typeof import("../../src/ventures/registry.js")>
): Promise<typeof import("../../src/ventures/registry.js")> {
  const actual = await importOriginal();
  return {
    ...actual,
    readVentureRegistry: (...args: Parameters<typeof actual.readVentureRegistry>) =>
      allOperating(actual.readVentureRegistry(...args)),
    loadVentureRegistry: async (...args: Parameters<typeof actual.loadVentureRegistry>) =>
      allOperating(await actual.loadVentureRegistry(...args))
  };
}
