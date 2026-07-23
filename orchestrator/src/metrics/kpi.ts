import { z } from "zod";
import type { Stage } from "../types.js";

export const KpiDefinitionSchema = z.object({
  id: z.string().min(1),
  owner: z.string().min(1),
  metric: z.string().min(1),
  target: z.number().finite(),
  dir: z.enum(["up", "down"]),
  stages: z.array(z.string()).optional(),
  requires: z.string().optional(),
  warmupCycles: z.number().int().nonnegative().optional()
});
export type KpiDefinition = z.infer<typeof KpiDefinitionSchema>;

export interface KpiObservation {
  kpiId: string;
  value: number | null;
  status: "pass" | "fail" | "n/a" | "warmup";
  target: number;
  reason: string | null;
}

export function evaluateKpi(
  definition: KpiDefinition,
  value: number | null,
  context: {
    stage: Stage;
    cycleNumber: number;
    capabilities: ReadonlySet<string>;
  }
): KpiObservation {
  const kpi = KpiDefinitionSchema.parse(definition);
  if (kpi.stages && !kpi.stages.includes(context.stage)) {
    return {
      kpiId: kpi.id,
      value: null,
      status: "n/a",
      target: kpi.target,
      reason: `Not applicable in ${context.stage}.`
    };
  }
  if (kpi.requires && !context.capabilities.has(kpi.requires)) {
    return {
      kpiId: kpi.id,
      value: null,
      status: "n/a",
      target: kpi.target,
      reason: `Requires unavailable capability: ${kpi.requires}.`
    };
  }
  if (context.cycleNumber < (kpi.warmupCycles ?? 0)) {
    return {
      kpiId: kpi.id,
      value,
      status: "warmup",
      target: kpi.target,
      reason: `Warm-up through cycle ${kpi.warmupCycles}.`
    };
  }
  if (value === null) {
    return {
      kpiId: kpi.id,
      value: null,
      status: "n/a",
      target: kpi.target,
      reason: "No verified measurement is connected."
    };
  }
  const pass = kpi.dir === "up" ? value >= kpi.target : value <= kpi.target;
  return {
    kpiId: kpi.id,
    value,
    status: pass ? "pass" : "fail",
    target: kpi.target,
    reason: null
  };
}

export function targetWasLoosened(
  previous: KpiDefinition,
  next: KpiDefinition
): boolean {
  if (previous.id !== next.id || previous.dir !== next.dir) {
    throw new Error("Cannot compare different KPI contracts");
  }
  return previous.dir === "up"
    ? next.target < previous.target
    : next.target > previous.target;
}
