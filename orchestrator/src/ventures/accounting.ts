import type { BudgetLedgerEntry } from "../budget.js";
import type { VentureRegistry } from "../contracts/venture-registry.js";
import { ventureIdForPhase } from "./registry.js";

export interface VentureSpendLine {
  ventureId: string | "global";
  usd: number;
}

export function resolveLedgerVentureId(
  entry: BudgetLedgerEntry,
  registry: VentureRegistry
): string | "global" {
  return entry.ventureId ?? ventureIdForPhase(registry, entry.phase);
}

export function summarizeVentureSpend(
  entries: readonly BudgetLedgerEntry[],
  registry: VentureRegistry,
  month: string
): VentureSpendLine[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.ts.slice(0, 7) !== month) continue;
    const ventureId = resolveLedgerVentureId(entry, registry);
    totals.set(ventureId, (totals.get(ventureId) ?? 0) + entry.usd);
  }
  return [...totals.entries()]
    .map(([ventureId, usd]) => ({
      ventureId,
      usd: Number(usd.toFixed(8))
    }))
    .sort((left, right) => left.ventureId.localeCompare(right.ventureId));
}
