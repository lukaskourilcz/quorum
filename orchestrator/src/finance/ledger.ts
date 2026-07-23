import { z } from "zod";

export const FinanceLedgerEntrySchema = z.object({
  id: z.string().min(1),
  ts: z.string().datetime(),
  type: z.enum([
    "revenue",
    "refund",
    "payment_fee",
    "api_cost",
    "treasury_cost",
    "other_cost"
  ]),
  amountUsd: z.number().positive(),
  verified: z.boolean(),
  sourceRef: z.string().min(1),
  reconciliationKey: z.string().min(1),
  note: z.string().max(500).optional()
});
export type FinanceLedgerEntry = z.infer<typeof FinanceLedgerEntrySchema>;

export interface FinanceLedger {
  schemaVersion: 1;
  currency: "USD";
  entries: FinanceLedgerEntry[];
}

export function normalizeFinanceLedger(value: unknown): FinanceLedger {
  const schema = z.object({
    schemaVersion: z.literal(1),
    currency: z.literal("USD"),
    entries: z.array(FinanceLedgerEntrySchema)
  });
  const ledger = schema.parse(value);
  const keys = new Set<string>();
  for (const entry of ledger.entries) {
    if (keys.has(entry.reconciliationKey)) {
      throw new Error(
        `Duplicate finance reconciliation key: ${entry.reconciliationKey}`
      );
    }
    keys.add(entry.reconciliationKey);
  }
  return ledger;
}

export function appendFinanceEntry(
  ledger: FinanceLedger,
  entry: FinanceLedgerEntry
): FinanceLedger {
  const normalized = normalizeFinanceLedger(ledger);
  const next = FinanceLedgerEntrySchema.parse(entry);
  if (
    normalized.entries.some(
      (candidate) => candidate.reconciliationKey === next.reconciliationKey
    )
  ) {
    return normalized;
  }
  return { ...normalized, entries: [...normalized.entries, next] };
}
