import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ContestSourceSchema, type ContestSource } from "../../contracts/contest-radar.js";
import { configRoot as defaultConfigRoot } from "../../paths.js";

/**
 * Which hosts Contest Radar will contact, and the audit that says why.
 *
 * The registry is the list, not a suggestion: an adapter may only fetch a source that appears here
 * with verdict `enabled`, and `docs/CONTEST-RADAR-SOURCES.md` records the request that produced
 * every verdict on 2026-08-30. Three sources are `rejected` for reasons no code change can fix —
 * one redirects to a login page, one answers 405 and one serves a bot challenge — and encoding
 * those refusals is as much the point as listing the working ones.
 */

export const ContestSourceRegistrySchema = z.strictObject({
  schemaVersion: z.literal("contest-source-registry/1"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  auditRef: z.string().trim().min(1).max(200),
  decisionRef: z.string().trim().min(1).max(200),
  auditedOn: z.iso.date(),
  sources: z.array(ContestSourceSchema).min(1).max(80)
}).superRefine((registry, context) => {
  const ids = registry.sources.map((source) => source.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Contest source ids must be unique", path: ["sources"] });
  }
  for (const [index, source] of registry.sources.entries()) {
    // A rejected source keeps its reason on file and loses its budget. Leaving it a request
    // allowance would let one edit elsewhere quietly bring a login wall back into the scan.
    if (source.verdict === "rejected" && source.maxRequestsPerRun > 0) {
      context.addIssue({ code: "custom", message: "A rejected source gets no request budget", path: ["sources", index, "maxRequestsPerRun"] });
    }
  }
});

export type ContestSourceRegistry = z.infer<typeof ContestSourceRegistrySchema>;

export async function loadContestSourceRegistry(configRoot = defaultConfigRoot): Promise<ContestSourceRegistry> {
  return ContestSourceRegistrySchema.parse(
    JSON.parse(await readFile(path.join(configRoot, "contest-radar-sources.json"), "utf8")) as unknown
  );
}

/** The only sources a run may fetch: enabled, with a request budget, and not discovery-only. */
export function fetchableSources(registry: ContestSourceRegistry): ContestSource[] {
  return registry.sources.filter((source) =>
    source.verdict === "enabled" && source.maxRequestsPerRun > 0 && !source.discoveryOnly);
}

/**
 * Sources that may open an investigation but never establish a fact.
 *
 * Kept separate from the fetchable set on purpose: merging them is how a Reddit post becomes a
 * deadline. A discovery lead reaches a record only after the contest's own rules page confirms it.
 */
export function discoverySources(registry: ContestSourceRegistry): ContestSource[] {
  return registry.sources.filter((source) => source.verdict === "enabled" && source.discoveryOnly);
}

/** Hosts an enabled source will contact, for the network allowlist to agree with. */
export function enabledHosts(registry: ContestSourceRegistry): string[] {
  return [...new Set(fetchableSources(registry).map((source) => source.host))]
    .filter((host) => host !== "internal")
    .sort();
}
