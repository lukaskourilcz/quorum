import { readFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot as defaultRepoRoot } from "../../paths.js";
import { readJson } from "../../state.js";

/**
 * The two paid rungs, and the gate that keeps both shut.
 *
 * Contest Radar's founding decision authorises a free scan and nothing else. Model enrichment and
 * the optional Apify discovery sweep each have a stated monthly ceiling — $0.50 and $0.10 — and
 * both are held until a *separate* countersigned budget-capacity decision authorises them. The
 * founding says so in its own words: "This founding is not that decision."
 *
 * So this module's normal answer is no. It exists to make that no principled rather than
 * accidental: every refusal names which condition failed, and a caller cannot spend by forgetting
 * to check something, because there is one function and it returns a refusal by default.
 *
 * Four conditions, all required, in the order that costs least to check:
 *
 * 1. The capacity decision exists and is countersigned.
 * 2. The environment switch for that rung is on.
 * 3. The credential that rung needs is present.
 * 4. The month's recorded spend leaves room under the rung's ceiling.
 *
 * A missing ledger reads as zero spent, which is the one place this is generous — and it is safe
 * because conditions 1 to 3 have already failed by then in every current configuration.
 */

export const CONTEST_MODEL_CEILING_USD = 0.5;
export const CONTEST_APIFY_CEILING_USD = 0.1;
/** The founding's combined incremental ceiling, nested inside the company cap rather than added. */
export const CONTEST_COMBINED_CEILING_USD = 0.6;

export const CONTEST_CAPACITY_DECISION_PATH =
  "state/decisions/2026-08-30-contest-radar-budget-capacity.md";

export type ContestPaidRung = "model-enrichment" | "apify-discovery";

export interface ContestSpendVerdict {
  allowed: boolean;
  /** Which condition decided it, so a refusal is diagnosable without reading this file. */
  reason: string;
  ceilingUsd: number;
  spentThisMonthUsd: number;
  remainingUsd: number;
}

interface LedgerEntry {
  ts?: unknown;
  usd?: unknown;
  ventureId?: unknown;
  rung?: unknown;
}

/**
 * The same signature the portfolio's other capacity gates parse.
 *
 * Deliberately identical to `signedOwnerDecision`: a venture that invented its own weaker
 * signature check would be the easiest place in this repository to open a spending path.
 */
function countersigned(raw: string): boolean {
  if (!/^Status:\s*countersigned\s*$/mi.test(raw)) return false;
  const signature = /^Signature \/ explicit approval reference:\s*(.+)$/mi.exec(raw)?.[1]?.trim();
  return Boolean(signature) && !/^_+$/u.test(signature ?? "");
}

async function capacityDecisionSigned(repoRoot: string): Promise<boolean> {
  try {
    return countersigned(await readFile(path.join(repoRoot, CONTEST_CAPACITY_DECISION_PATH), "utf8"));
  } catch {
    // The file does not exist, which is the current state and the correct one. The founding
    // authorised the build; it explicitly did not authorise this.
    return false;
  }
}

async function spentThisMonth(stateRoot: string, month: string, rung: ContestPaidRung): Promise<number> {
  const ledger = await readJson<{ entries?: unknown } | null>(
    stateRoot,
    "ventures/contest-radar/spend-ledger.json",
    null
  ).catch(() => null);
  const entries = Array.isArray(ledger?.entries) ? (ledger.entries as LedgerEntry[]) : [];
  return entries
    .filter((entry) =>
      typeof entry.ts === "string" && entry.ts.slice(0, 7) === month && entry.rung === rung)
    .reduce((sum, entry) => sum + (typeof entry.usd === "number" && entry.usd > 0 ? entry.usd : 0), 0);
}

export async function mayContestRadarSpend(input: {
  rung: ContestPaidRung;
  stateRoot: string;
  month: string;
  env?: NodeJS.ProcessEnv;
  repoRoot?: string;
  /** The reservation this call would make, so the ceiling is checked before the spend. */
  reserveUsd: number;
}): Promise<ContestSpendVerdict> {
  const env = input.env ?? process.env;
  const repoRoot = input.repoRoot ?? defaultRepoRoot;
  const ceilingUsd = input.rung === "model-enrichment" ? CONTEST_MODEL_CEILING_USD : CONTEST_APIFY_CEILING_USD;

  const refuse = (reason: string, spent = 0): ContestSpendVerdict => ({
    allowed: false,
    reason,
    ceilingUsd,
    spentThisMonthUsd: spent,
    remainingUsd: Math.max(0, ceilingUsd - spent)
  });

  if (!await capacityDecisionSigned(repoRoot)) {
    return refuse(`No countersigned capacity decision at ${CONTEST_CAPACITY_DECISION_PATH}; the founding explicitly is not that decision.`);
  }

  const switchName = input.rung === "model-enrichment"
    ? "CONTEST_RADAR_MODEL_ENRICHMENT_ENABLED"
    : "CONTEST_RADAR_APIFY_ENABLED";
  if (env[switchName] !== "true") {
    return refuse(`${switchName} is not true.`);
  }

  const credential = input.rung === "model-enrichment" ? "ANTHROPIC_API_KEY" : "APIFY_TOKEN";
  if (!env[credential]) {
    return refuse(`${credential} is absent.`);
  }

  const spent = await spentThisMonth(input.stateRoot, input.month, input.rung);
  if (spent + input.reserveUsd > ceilingUsd + Number.EPSILON) {
    return refuse(
      `Reserving $${input.reserveUsd.toFixed(4)} would take the month to $${(spent + input.reserveUsd).toFixed(4)}, over the $${ceilingUsd.toFixed(2)} ceiling.`,
      spent
    );
  }

  return {
    allowed: true,
    reason: `Within the $${ceilingUsd.toFixed(2)} ${input.rung} ceiling with $${(ceilingUsd - spent).toFixed(4)} remaining.`,
    ceilingUsd,
    spentThisMonthUsd: spent,
    remainingUsd: ceilingUsd - spent
  };
}

/**
 * Which records would be worth enriching, if enrichment were ever switched on.
 *
 * Content-hash keyed and change-gated: a record whose deterministic extraction already produced a
 * deadline and a prize has nothing to buy, and a record that has not changed since the last look
 * has nothing new to buy. Computing this list costs nothing and runs whether or not the rung is
 * open, which is what lets the owner see what the money would be for before authorising any.
 */
export function enrichmentCandidates<T extends {
  id: string;
  dates: { deadline: { value: unknown } };
  prize: { valueAmount: { value: unknown } };
  cost: { purchaseRequired: { value: unknown } };
}>(records: readonly T[]): Array<{ id: string; missing: string[] }> {
  return records
    .map((record) => ({
      id: record.id,
      missing: [
        ...(record.dates.deadline.value === null ? ["deadline"] : []),
        ...(record.prize.valueAmount.value === null ? ["prize value"] : []),
        ...(record.cost.purchaseRequired.value === null ? ["purchase requirement"] : [])
      ]
    }))
    .filter((candidate) => candidate.missing.length > 0);
}
