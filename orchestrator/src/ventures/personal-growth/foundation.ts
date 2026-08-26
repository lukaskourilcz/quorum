import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BudgetLedgerEntry } from "../../budget.js";
import {
  PersonalGrowthFoundationSchema,
  type PersonalGrowthFoundation
} from "../../contracts/personal-growth-foundation.js";
import { configRoot } from "../../paths.js";

export type PersonalGrowthDegradation = "healthy" | "reduced" | "low" | "critical" | "exhausted";

export interface PersonalGrowthBudgetState {
  activeMode: "default" | "buffer";
  degradation: PersonalGrowthDegradation;
  monthlyCapUsd: 20;
  spentUsd: number;
  committedUsd: number;
  remainingUsd: number;
  companyRemainingUsd: number;
  paidCallAllowed: boolean;
}

export class PersonalGrowthBudgetError extends Error {
  constructor(
    readonly code: "PROJECT_DISABLED" | "PAID_SYNTHESIS_DISABLED" | "PROJECT_CAP" | "COMPANY_CAP",
    message: string
  ) {
    super(message);
    this.name = "PersonalGrowthBudgetError";
  }
}

export async function loadPersonalGrowthFoundation(
  filePath = path.join(configRoot, "personal-growth.json")
): Promise<PersonalGrowthFoundation> {
  return PersonalGrowthFoundationSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

function monthSpend(entries: readonly BudgetLedgerEntry[], month: string): number {
  return entries
    .filter((entry) => entry.ventureId === "personal-growth" && entry.ts.startsWith(month))
    .reduce((sum, entry) => sum + entry.usd, 0);
}

function degradationForRatio(
  ratio: number,
  thresholds: PersonalGrowthFoundation["degradation"]
): PersonalGrowthDegradation {
  if (ratio >= 1) return "exhausted";
  if (ratio >= thresholds.lowBelowRatio) return "critical";
  if (ratio >= thresholds.reducedBelowRatio) return "low";
  if (ratio >= thresholds.healthyBelowRatio) return "reduced";
  return "healthy";
}

export function resolvePersonalGrowthBudgetState(input: {
  foundation: PersonalGrowthFoundation;
  ledger: readonly BudgetLedgerEntry[];
  now: Date;
  nonApiSpentUsd: number;
  committedUsd: number;
  companyRemainingUsd: number;
  reservationUsd?: number;
}): PersonalGrowthBudgetState {
  const amounts = [input.nonApiSpentUsd, input.committedUsd, input.companyRemainingUsd, input.reservationUsd ?? 0];
  if (Number.isNaN(input.now.getTime()) || amounts.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Personal Growth budget inputs must be finite, non-negative and dated");
  }
  const apiSpentUsd = monthSpend(input.ledger, input.now.toISOString().slice(0, 7));
  const spentUsd = Number((apiSpentUsd + input.nonApiSpentUsd).toFixed(8));
  const committedUsd = Number((input.committedUsd + (input.reservationUsd ?? 0)).toFixed(8));
  const projectRemainingUsd = Math.max(0, input.foundation.budget.monthlyAllInUsd - spentUsd - committedUsd);
  const remainingUsd = Number(Math.min(projectRemainingUsd, input.companyRemainingUsd).toFixed(8));
  const effectiveUsedUsd = input.foundation.budget.monthlyAllInUsd - remainingUsd;
  const degradation = degradationForRatio(
    effectiveUsedUsd / input.foundation.budget.monthlyAllInUsd,
    input.foundation.degradation
  );
  return {
    activeMode: input.foundation.budget.activeMode,
    degradation,
    monthlyCapUsd: input.foundation.budget.monthlyAllInUsd,
    spentUsd,
    committedUsd,
    remainingUsd,
    companyRemainingUsd: input.companyRemainingUsd,
    paidCallAllowed:
      input.foundation.featureGates.projectLive &&
      input.foundation.featureGates.paidSynthesis &&
      degradation !== "exhausted"
  };
}

export function assertPersonalGrowthReservation(input: Parameters<typeof resolvePersonalGrowthBudgetState>[0]): PersonalGrowthBudgetState {
  if (!input.foundation.featureGates.projectLive) {
    throw new PersonalGrowthBudgetError("PROJECT_DISABLED", "Personal Growth is disabled");
  }
  if (!input.foundation.featureGates.paidSynthesis) {
    throw new PersonalGrowthBudgetError("PAID_SYNTHESIS_DISABLED", "Paid Personal Growth synthesis is disabled");
  }
  const state = resolvePersonalGrowthBudgetState(input);
  if (input.companyRemainingUsd < (input.reservationUsd ?? 0)) {
    throw new PersonalGrowthBudgetError("COMPANY_CAP", "The company all-in cap cannot cover this Personal Growth reservation");
  }
  if (state.spentUsd + state.committedUsd > state.monthlyCapUsd) {
    throw new PersonalGrowthBudgetError("PROJECT_CAP", "The Personal Growth monthly all-in cap cannot cover this reservation");
  }
  return state;
}
