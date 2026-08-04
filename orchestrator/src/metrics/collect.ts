import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { KpiDefinitionSchema } from "./kpi.js";

/**
 * config/kpis.json - the role ownership and target registry.
 *
 * This file used to export `collectKpis`, which mapped those 89 definitions through
 * `evaluateKpi` into observations. Nothing ever called it: not a runtime module, not a
 * test. So the registry described 89 measurements, produced none, and `evaluateKpi` was
 * reachable only through the dead function. Meanwhile the one KPI artifact the system does
 * emit, state/kpis/latest.json, is built from the separate quarterly set in
 * config/kpis/<quarter>.json, whose ids did not overlap this file at all.
 *
 * The registry is kept, because it is load-bearing for something real: it records which
 * role owns which bar, and org/maintenance.ts checks a role still clears its KPI floor
 * before an organization change is applied. What is gone is the pretence that declaring a
 * metric here measures it. Every entry now states its measurement explicitly - either it
 * names a metric source the quarterly collector actually produces, or it says, in the
 * record itself, that it has no source and why.
 */
export const KpiMeasurementSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("quarterly"),
    /** Must match a metric_source in the current config/kpis/<quarter>.json entry for this id. */
    metricSource: z.string().min(1).max(240),
    note: z.string().min(1).max(600).optional()
  }),
  z.object({
    kind: z.literal("none"),
    /**
     * Why no number exists today. Required, and required to be specific: "there is no
     * source for this" is a correct answer, but only when it says what is missing.
     */
    reason: z.string().min(20).max(600)
  })
]);

export const KpiRegistryEntrySchema = KpiDefinitionSchema.extend({
  measurement: KpiMeasurementSchema
});

export const KpiRegistrySchema = z.object({
  meta: z.looseObject({}),
  kpis: z.array(KpiRegistryEntrySchema).min(1)
}).superRefine((registry, context) => {
  const seen = new Set<string>();
  for (const [index, kpi] of registry.kpis.entries()) {
    if (seen.has(kpi.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate KPI id: ${kpi.id}`,
        path: ["kpis", index, "id"]
      });
    }
    seen.add(kpi.id);
  }
});

export type KpiMeasurement = z.infer<typeof KpiMeasurementSchema>;
export type KpiRegistryEntry = z.infer<typeof KpiRegistryEntrySchema>;
export type KpiRegistry = z.infer<typeof KpiRegistrySchema>;

export function parseKpiRegistry(value: unknown): KpiRegistry {
  return KpiRegistrySchema.parse(value);
}

export async function loadKpiRegistry(configRoot: string): Promise<KpiRegistry> {
  return parseKpiRegistry(
    JSON.parse(await readFile(path.join(configRoot, "kpis.json"), "utf8")) as unknown
  );
}

/** How many registry entries name `agentId` as owner. The org maintenance KPI floor. */
export function countOwnedKpis(registry: KpiRegistry, agentId: string): number {
  return registry.kpis.filter((kpi) => kpi.owner === agentId).length;
}

/** Entries that carry a bar and an owner but no number. Reported, never presented as a failure. */
export function declaredWithoutSource(registry: KpiRegistry): readonly KpiRegistryEntry[] {
  return registry.kpis.filter((kpi) => kpi.measurement.kind === "none");
}

/** Entries wired to the quarterly collector, as id -> metric source. */
export function wiredMetricSources(registry: KpiRegistry): ReadonlyMap<string, string> {
  return new Map(
    registry.kpis.flatMap((kpi) =>
      kpi.measurement.kind === "quarterly" ? [[kpi.id, kpi.measurement.metricSource] as const] : []
    )
  );
}
