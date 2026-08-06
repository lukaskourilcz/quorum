import { z } from "zod";
import { DateSchema, VentureIdSchema, openObject } from "./common.js";

export const KpiDirectionSchema = z.enum(["at-least", "at-most"]);
export const KpiUnitSchema = z.enum(["count", "ratio", "usd", "score", "boolean"]);

export const QuarterlyKpiSchema = openObject({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/).max(120),
  venture: z.union([VentureIdSchema, z.literal("company")]),
  name: z.string().trim().min(1).max(180),
  metric_source: z.string()
    .trim()
    .min(1)
    .max(240)
    .regex(/^(?:receipts|stats|state)\/[a-zA-Z0-9._/#-]+$/)
    .refine((value) => !value.includes(".."), "Metric sources cannot traverse directories"),
  target: z.number().finite().nonnegative(),
  direction: KpiDirectionSchema,
  unit: KpiUnitSchema,
  critical: z.boolean(),
  ramp_days: z.number().int().min(0).max(89),
  /**
   * A KPI kept on file but out of the active quarter, with the reason it cannot be measured yet.
   *
   * The social KPIs are the case this exists for: no channel has credentials, the triple-lock is
   * closed, and the earliest any of them could move is about a month away. Left active they
   * report "unavailable" every morning and drag a quarter-end reassessment behind them for a
   * reason that has nothing to do with the venture. Deleting them instead would lose the
   * definition and the target the owner already agreed. A deferred KPI is not evaluated, is not
   * counted in any status total, and says why.
   */
  deferred_reason: z.string().trim().min(1).max(200).optional()
}).superRefine((kpi, context) => {
  // A critical KPI is one whose miss forces a quarter-end reassessment. That is only meaningful
  // for something that can be measured: a critical KPI with a deferred measurement asks the
  // company to answer for a number nobody can produce.
  if (kpi.critical && kpi.deferred_reason) {
    context.addIssue({
      code: "custom",
      message: `A deferred KPI may not be critical: ${kpi.id}`,
      path: ["critical"]
    });
  }
});

export const KpiSetSchema = openObject({
  schemaVersion: z.literal("kpi-set/1"),
  quarter_id: z.string().regex(/^\d{4}-Q[1-4]$/),
  quarter_start: DateSchema,
  quarter_days: z.literal(90),
  kpis: z.array(QuarterlyKpiSchema).min(1).max(200)
}).superRefine((set, context) => {
  const ids = new Set<string>();
  for (const [index, kpi] of set.kpis.entries()) {
    if (ids.has(kpi.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate KPI id: ${kpi.id}`,
        path: ["kpis", index, "id"]
      });
    }
    ids.add(kpi.id);
  }
});

export type KpiDirection = z.infer<typeof KpiDirectionSchema>;
export type KpiUnit = z.infer<typeof KpiUnitSchema>;
export type QuarterlyKpi = z.infer<typeof QuarterlyKpiSchema>;
export type KpiSet = z.infer<typeof KpiSetSchema>;
