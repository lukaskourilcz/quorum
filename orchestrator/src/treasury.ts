import { z } from "zod";

export const TreasuryEntrySchema = z.object({
  id: z.string().min(1),
  ts: z.string().datetime(),
  kind: z.enum(["request", "approval", "commitment", "payment", "release"]),
  amountUsd: z.number().nonnegative(),
  purpose: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected", "committed", "paid", "released"]),
  approvalRef: z.string().nullable(),
  recurring: z.boolean(),
  reconciliationKey: z.string().min(1)
});
export type TreasuryEntry = z.infer<typeof TreasuryEntrySchema>;

export interface TreasuryPosition {
  spentUsd: number;
  committedUsd: number;
  availableUsd: number;
  reserveUsd: number;
}

export function treasuryPosition(
  entries: readonly TreasuryEntry[],
  {
    monthlyCapUsd = 20,
    profitable = false,
    reserveRate = 0.2
  }: {
    monthlyCapUsd?: number;
    profitable?: boolean;
    reserveRate?: number;
  } = {}
): TreasuryPosition {
  const parsed = entries.map((entry) => TreasuryEntrySchema.parse(entry));
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (seen.has(entry.reconciliationKey)) {
      throw new Error(`Duplicate treasury key: ${entry.reconciliationKey}`);
    }
    seen.add(entry.reconciliationKey);
  }
  const spentUsd = parsed
    .filter((entry) => entry.kind === "payment" && entry.status === "paid")
    .reduce((sum, entry) => sum + entry.amountUsd, 0);
  const committedUsd = parsed
    .filter(
      (entry) =>
        entry.kind === "commitment" && entry.status === "committed"
    )
    .reduce((sum, entry) => sum + entry.amountUsd, 0);
  const reserveUsd = profitable ? 0 : monthlyCapUsd * reserveRate;
  return {
    spentUsd: Number(spentUsd.toFixed(8)),
    committedUsd: Number(committedUsd.toFixed(8)),
    reserveUsd: Number(reserveUsd.toFixed(8)),
    availableUsd: Number(
      Math.max(0, monthlyCapUsd - reserveUsd - spentUsd - committedUsd).toFixed(8)
    )
  };
}

export function assertSpendAllowed(
  amountUsd: number,
  position: TreasuryPosition,
  approvalRef: string | null
): void {
  if (!approvalRef) {
    throw new Error("External spend requires an explicit approval reference");
  }
  if (amountUsd <= 0 || amountUsd > position.availableUsd) {
    throw new Error("Spend is outside the available zero-based budget");
  }
}
