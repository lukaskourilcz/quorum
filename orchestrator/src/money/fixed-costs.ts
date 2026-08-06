import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const FixedCostCategorySchema = z.enum([
  "hosting",
  "database",
  "domain",
  "software",
  "email",
  "other"
]);

export const FixedCostEntrySchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  monthly_usd: z.number().finite().positive().max(1_000_000),
  category: FixedCostCategorySchema,
  since: z.iso.date()
});

export const FixedCostRegistrySchema = z.strictObject({
  schemaVersion: z.literal("fixed-costs/1"),
  currency: z.literal("USD"),
  costs: z.array(FixedCostEntrySchema).max(100),
  /**
   * The owner's statement that an empty list means zero rather than unanswered.
   *
   * Without it, `costs: []` is ambiguous — nobody has entered the subscriptions yet, or there are
   * none — and the collector had to treat it as unmeasured, so `company.monthly-all-in-usd`, a
   * critical KPI, read "unavailable" for the whole quarter. Setting the flag is the answer; it
   * comes off the moment a real subscription is entered.
   */
  confirmedNoFixedCosts: z.boolean().optional(),
  $comment: z.union([
    z.string().max(2_000),
    z.array(z.string().max(500)).max(20)
  ]).optional()
}).superRefine((registry, context) => {
  const keys = new Set<string>();
  for (const [index, cost] of registry.costs.entries()) {
    const key = `${cost.name.toLocaleLowerCase("en-US")}\n${cost.since}`;
    if (keys.has(key)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate fixed cost: ${cost.name}`,
        path: ["costs", index, "name"]
      });
    }
    keys.add(key);
  }
});

export type FixedCostCategory = z.infer<typeof FixedCostCategorySchema>;
export type FixedCostEntry = z.infer<typeof FixedCostEntrySchema>;
export type FixedCostRegistry = z.infer<typeof FixedCostRegistrySchema>;

export function normalizeFixedCostRegistry(value: unknown): FixedCostRegistry {
  return FixedCostRegistrySchema.parse(value);
}

function inclusiveCalendarMonths(since: string, asOf: Date): number {
  const start = new Date(`${since}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.getTime() > asOf.getTime()) return 0;
  return (
    (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12
    + asOf.getUTCMonth()
    - start.getUTCMonth()
    + 1
  );
}

export interface FixedCostTotals {
  monthlyUsd: number;
  cumulativeUsd: number;
  byCategory: Array<{
    category: FixedCostCategory;
    monthlyUsd: number;
    cumulativeUsd: number;
  }>;
}

export function fixedCostTotals(value: unknown, asOf: Date): FixedCostTotals {
  if (Number.isNaN(asOf.getTime())) throw new Error("Fixed-cost evaluation date is invalid");
  const registry = normalizeFixedCostRegistry(value);
  const totals = new Map<FixedCostCategory, { monthlyUsd: number; cumulativeUsd: number }>();
  for (const cost of registry.costs) {
    const months = inclusiveCalendarMonths(cost.since, asOf);
    if (months === 0) continue;
    const current = totals.get(cost.category) ?? { monthlyUsd: 0, cumulativeUsd: 0 };
    totals.set(cost.category, {
      monthlyUsd: current.monthlyUsd + cost.monthly_usd,
      cumulativeUsd: current.cumulativeUsd + (cost.monthly_usd * months)
    });
  }
  const byCategory = [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, total]) => ({
      category,
      monthlyUsd: Number(total.monthlyUsd.toFixed(8)),
      cumulativeUsd: Number(total.cumulativeUsd.toFixed(8))
    }));
  return {
    monthlyUsd: Number(byCategory.reduce((sum, item) => sum + item.monthlyUsd, 0).toFixed(8)),
    cumulativeUsd: Number(byCategory.reduce((sum, item) => sum + item.cumulativeUsd, 0).toFixed(8)),
    byCategory
  };
}

export async function loadFixedMonthlyUsd(configRoot: string, asOf: Date): Promise<number> {
  const raw = JSON.parse(await readFile(path.join(configRoot, "fixed-costs.json"), "utf8")) as unknown;
  return fixedCostTotals(raw, asOf).monthlyUsd;
}
