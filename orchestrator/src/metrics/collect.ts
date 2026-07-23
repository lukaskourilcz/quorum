import type { KpiDefinition, KpiObservation } from "./kpi.js";
import { evaluateKpi } from "./kpi.js";
import type { Stage } from "../types.js";

export function collectKpis(
  definitions: readonly KpiDefinition[],
  measurements: Readonly<Record<string, number | null>>,
  context: {
    stage: Stage;
    cycleNumber: number;
    capabilities: ReadonlySet<string>;
  }
): KpiObservation[] {
  return definitions.map((definition) =>
    evaluateKpi(definition, measurements[definition.metric] ?? null, context)
  );
}
