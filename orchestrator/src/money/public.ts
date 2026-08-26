import { z } from "zod";
import { BudgetLedgerEntrySchema, type BudgetLedgerEntry } from "../budget.js";
import { DateTimeSchema, openObject } from "../contracts/common.js";
import { normalizeFinanceLedger } from "../finance/ledger.js";
import {
  QuarterlyKpiEvaluationSchema,
  QuarterlyKpiSnapshotSchema,
  type QuarterlyKpiSnapshot
} from "../metrics/quarterly.js";
import { atomicWriteJson } from "../state.js";
import { VentureRegistrySchema } from "../contracts/venture-registry.js";
import { summarizeVentureSpend } from "../ventures/accounting.js";
import { fixedCostTotals } from "./fixed-costs.js";
import {
  MONETIZATION_METHODS,
  PublicMonetizationMethodSchema,
  type PublicMonetizationMethod
} from "./monetization.js";

const MoneyAmountSchema = z.number().finite().nonnegative();

export const PublicMoneySnapshotSchema = openObject({
  schemaVersion: z.literal("money-public/1"),
  generatedAt: DateTimeSchema,
  quarter: openObject({
    id: z.string().regex(/^\d{4}-Q[1-4]$/),
    start: z.iso.date(),
    end: z.iso.date(),
    daysRemaining: z.number().int().min(0).max(90),
    statuses: z.array(QuarterlyKpiEvaluationSchema).max(200)
  }),
  // The builder receives and validates the full canonical set, then removes owner-only methods.
  // The public contract therefore permits a bounded subset while the private source remains
  // complete. Requiring the source length here would force a private method onto the public page.
  monetization: z.array(PublicMonetizationMethodSchema).max(MONETIZATION_METHODS.length),
  costs: openObject({
    currency: z.literal("USD"),
    api: openObject({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      monthlyUsd: MoneyAmountSchema,
      cumulativeUsd: MoneyAmountSchema
    }),
    fixed: openObject({
      monthlyUsd: MoneyAmountSchema,
      cumulativeUsd: MoneyAmountSchema,
      byCategory: z.array(openObject({
        category: z.enum(["hosting", "database", "domain", "software", "email", "other"]),
        monthlyUsd: MoneyAmountSchema,
        cumulativeUsd: MoneyAmountSchema
      })).max(6)
    }),
    byVenture: z.array(openObject({
      ventureId: z.string().min(1).max(80),
      modelUsd: MoneyAmountSchema,
      researchUsd: MoneyAmountSchema.nullable(),
      sourceUsd: MoneyAmountSchema.nullable(),
      sourceNote: z.string().trim().min(1).max(240).nullable()
    })).max(50),
    totalMonthlyBurnUsd: MoneyAmountSchema,
    cumulativeSpendUsd: MoneyAmountSchema
  }),
  revenue: openObject({
    recognizedUsd: MoneyAmountSchema
  })
});

export type PublicMoneySnapshot = z.infer<typeof PublicMoneySnapshotSchema>;

function sumUsd(values: readonly number[]): number {
  return Number(values.reduce((sum, value) => sum + value, 0).toFixed(8));
}

export function buildPublicMoneySnapshot(input: {
  generatedAt: Date;
  kpiSnapshot: QuarterlyKpiSnapshot;
  monetization: readonly PublicMonetizationMethod[];
  fixedCosts: unknown;
  budgetEntries: readonly BudgetLedgerEntry[];
  financeLedger: unknown;
  ventureRegistry: unknown;
  ventureEvidenceCosts?: Readonly<Record<string, {
    researchUsd?: number | null;
    sourceUsd?: number | null;
    sourceNote?: string | null;
  }>>;
}): PublicMoneySnapshot {
  if (Number.isNaN(input.generatedAt.getTime())) throw new Error("Money snapshot date is invalid");
  const kpis = QuarterlyKpiSnapshotSchema.parse(input.kpiSnapshot);
  const monetization = input.monetization.map((method) => PublicMonetizationMethodSchema.parse(method));
  const budgetEntries = z.array(BudgetLedgerEntrySchema).parse(input.budgetEntries);
  const finance = normalizeFinanceLedger(input.financeLedger);
  const ventureRegistry = VentureRegistrySchema.parse(input.ventureRegistry);
  const publicVentureIds = new Set(ventureRegistry.ventures
    .filter((venture) => venture.visibility === "public")
    .map((venture) => venture.id));
  const fixed = fixedCostTotals(input.fixedCosts, input.generatedAt);
  const month = input.generatedAt.toISOString().slice(0, 7);
  const monthlyApiUsd = sumUsd(
    budgetEntries.filter((entry) => entry.ts.startsWith(month)).map((entry) => entry.usd)
  );
  const cumulativeApiUsd = sumUsd(budgetEntries.map((entry) => entry.usd));
  const recognizedUsd = sumUsd(
    finance.entries
      .filter((entry) => entry.type === "revenue" && entry.verified)
      .map((entry) => entry.amountUsd)
  );
  const modelSpend = new Map(summarizeVentureSpend(budgetEntries, ventureRegistry, month)
    .map((line) => [line.ventureId, line.usd]));
  const byVenture = ventureRegistry.ventures
    .filter((venture) => venture.visibility === "public")
    .map((venture) => {
    const evidence = input.ventureEvidenceCosts?.[venture.id];
    return {
      ventureId: venture.id,
      modelUsd: modelSpend.get(venture.id) ?? 0,
      researchUsd: evidence?.researchUsd ?? null,
      sourceUsd: evidence?.sourceUsd ?? null,
      sourceNote: evidence?.sourceNote ?? null
    };
  });
  const publicStatuses = kpis.statuses.filter((status) =>
    status.venture === "company" || publicVentureIds.has(status.venture));
  const publicMonetization = monetization.filter((method) => publicVentureIds.has(method.venture));
  return PublicMoneySnapshotSchema.parse({
    schemaVersion: "money-public/1",
    generatedAt: input.generatedAt.toISOString(),
    quarter: {
      id: kpis.quarterId,
      start: kpis.quarterStart,
      end: kpis.quarterEnd,
      daysRemaining: kpis.daysRemaining,
      statuses: publicStatuses
    },
    monetization: publicMonetization,
    costs: {
      currency: "USD",
      api: {
        month,
        monthlyUsd: monthlyApiUsd,
        cumulativeUsd: cumulativeApiUsd
      },
      fixed,
      byVenture,
      totalMonthlyBurnUsd: Number((monthlyApiUsd + fixed.monthlyUsd).toFixed(8)),
      cumulativeSpendUsd: Number((cumulativeApiUsd + fixed.cumulativeUsd).toFixed(8))
    },
    revenue: { recognizedUsd }
  });
}

export async function writePublicMoneySnapshot(
  root: string,
  snapshot: PublicMoneySnapshot
): Promise<string> {
  const relative = "money/public.json";
  await atomicWriteJson(root, relative, PublicMoneySnapshotSchema.parse(snapshot));
  return relative;
}
