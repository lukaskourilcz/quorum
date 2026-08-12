import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  TS_RESEARCH_BRIEF_CEILING_USD,
  TS_RESEARCH_MONTHLY_CEILING_USD,
  TsBriefPrioritiesSchema,
  TsResearchLedgerEntrySchema,
  type TsBriefPriority,
  type TsResearchLedgerEntry,
  type TsResearchPurchase
} from "../../contracts/ts-research.js";
import { canonicalJson, sha256 } from "../../hashing.js";
import { configRoot } from "../../paths.js";

/**
 * Research, which the desk buys rarely and never twice.
 *
 * Everything here obeys the reserve-before/record-after rule: the ceiling is checked against the
 * ledger already on disk, then the provider is called, then the purchase is appended. A cost
 * recorded before the call could bill for a request that never happened, and a ceiling checked
 * after it is not a ceiling.
 *
 * Reuse comes first and costs nothing. A brief the desk already bought is answered from the
 * dossier on disk, so a standing priority that comes up every month is paid for once.
 */
export const TS_RESEARCH_LEDGER_PATH = "ventures/tehdejsi-svet/research-ledger.jsonl";
export const TS_DOSSIER_DIRECTORY = "ventures/tehdejsi-svet/dossiers";

export interface TsBrief {
  topicKey: string;
  question: string;
  language: "cs" | "uk" | "both";
}

/**
 * The idempotency key, as one string.
 *
 * The topic says what was asked about; the hash says exactly what was asked. Changing a brief's
 * wording is a new purchase, and leaving it alone is never a second one.
 */
export function briefHash(brief: TsBrief): string {
  return sha256(canonicalJson({
    topicKey: brief.topicKey,
    question: brief.question,
    language: brief.language
  }));
}

export async function loadBriefPriorities(root = configRoot): Promise<TsBriefPriority[]> {
  const file = TsBriefPrioritiesSchema.parse(
    JSON.parse(await readFile(path.join(root, "tehdejsi-brief-priorities.json"), "utf8"))
  );
  return [...file.priorities].sort((left, right) => left.rank - right.rank);
}

export function priorityBrief(priority: TsBriefPriority): TsBrief {
  return { topicKey: priority.topicKey, question: priority.question, language: priority.language };
}

export function parseTsResearchLedger(source: string): TsResearchLedgerEntry[] {
  return source
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => TsResearchLedgerEntrySchema.parse(JSON.parse(line)));
}

export async function readTsResearchLedger(root: string): Promise<TsResearchLedgerEntry[]> {
  try {
    return parseTsResearchLedger(await readFile(path.join(root, TS_RESEARCH_LEDGER_PATH), "utf8"));
  } catch (error) {
    // A ledger that does not exist yet is a venture that has bought nothing, not a failure.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** One writer, append-only, validated before it reaches the file. */
export async function appendTsResearchLedger(
  root: string,
  entries: readonly TsResearchLedgerEntry[]
): Promise<void> {
  if (entries.length === 0) return;
  const parsed = entries.map((entry) => TsResearchLedgerEntrySchema.parse(entry));
  const file = path.join(root, TS_RESEARCH_LEDGER_PATH);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, parsed.map((entry) => `${JSON.stringify(entry)}\n`).join(""), "utf8");
}

function purchases(ledger: readonly TsResearchLedgerEntry[]): TsResearchPurchase[] {
  return ledger.filter((entry): entry is TsResearchPurchase => entry.kind === "purchase");
}

function sameUtcMonth(timestamp: string, now: Date): boolean {
  return timestamp.slice(0, 7) === now.toISOString().slice(0, 7);
}

export function monthlySpendUsd(ledger: readonly TsResearchLedgerEntry[], now: Date): number {
  const total = purchases(ledger)
    .filter((entry) => sameUtcMonth(entry.completedAt, now))
    .reduce((sum, entry) => sum + entry.costUsd, 0);
  // Currency, so two decimals — floating-point drift across a month of appends is otherwise
  // enough to make a ceiling comparison wrong at the boundary.
  return Number(total.toFixed(4));
}

/**
 * The dossier a brief already has, or `null`.
 *
 * `null` is "never bought", which is not the same as "bought and worthless". The caller decides
 * whether to buy; this only answers whether it would be buying the same thing again.
 */
export function findPurchase(
  ledger: readonly TsResearchLedgerEntry[],
  brief: TsBrief
): TsResearchPurchase | null {
  const hash = briefHash(brief);
  return purchases(ledger).find((entry) => entry.topicKey === brief.topicKey && entry.briefHash === hash) ?? null;
}

export class TsResearchBudgetError extends Error {
  constructor(readonly code: "INVALID_CAP" | "BRIEF_CAP" | "MONTHLY_CAP", message: string) {
    super(message);
    this.name = "TsResearchBudgetError";
  }
}

export interface TsResearchReservation {
  envelopeUsd: number;
  monthlySpentUsd: number;
  monthlyRemainingUsd: number;
}

/**
 * The whole verdict on whether one brief may be bought, before any provider is touched.
 *
 * A reservation is refused rather than trimmed. Handing back a smaller envelope than the caller
 * asked for would buy a worse answer at the edge of the cap, which is the one place a partial
 * answer is least useful.
 */
export function assertTsResearchReservation(input: {
  envelopeUsd: number;
  now: Date;
  monthlyCeilingUsd?: number;
}, ledger: readonly TsResearchLedgerEntry[]): TsResearchReservation {
  const monthlyCeilingUsd = input.monthlyCeilingUsd ?? TS_RESEARCH_MONTHLY_CEILING_USD;
  if (!Number.isFinite(input.envelopeUsd) || input.envelopeUsd <= 0 ||
      !Number.isFinite(monthlyCeilingUsd) || monthlyCeilingUsd <= 0 ||
      monthlyCeilingUsd > TS_RESEARCH_MONTHLY_CEILING_USD) {
    throw new TsResearchBudgetError(
      "INVALID_CAP",
      "Research limits must be positive and cannot exceed the standing monthly ceiling"
    );
  }
  if (input.envelopeUsd > TS_RESEARCH_BRIEF_CEILING_USD) {
    throw new TsResearchBudgetError(
      "BRIEF_CAP",
      `One brief may cost at most $${TS_RESEARCH_BRIEF_CEILING_USD.toFixed(2)}; $${input.envelopeUsd.toFixed(2)} was asked for`
    );
  }
  const monthlySpentUsd = monthlySpendUsd(ledger, input.now);
  const monthlyRemainingUsd = Number((monthlyCeilingUsd - monthlySpentUsd).toFixed(4));
  if (input.envelopeUsd > monthlyRemainingUsd) {
    throw new TsResearchBudgetError(
      "MONTHLY_CAP",
      `The month has $${monthlyRemainingUsd.toFixed(2)} of research headroom and this brief needs $${input.envelopeUsd.toFixed(2)}`
    );
  }
  return { envelopeUsd: input.envelopeUsd, monthlySpentUsd, monthlyRemainingUsd };
}

export type TsResearchDecision =
  | { status: "reused"; purchase: TsResearchPurchase }
  | { status: "buy"; reservation: TsResearchReservation; briefHash: string; dossierRef: string }
  | { status: "declined"; code: TsResearchBudgetError["code"]; reason: string };

/**
 * Reuse, buy or decline — decided before anything is spent.
 *
 * A decline is an outcome and not an error. The desk writes without a dossier, which is the
 * ordinary case: research is an option this venture exercises a few times a month, and a
 * feature about a television programme needs none of it.
 */
export function decideResearch(input: {
  brief: TsBrief;
  envelopeUsd: number;
  now: Date;
  monthlyCeilingUsd?: number;
}, ledger: readonly TsResearchLedgerEntry[]): TsResearchDecision {
  const existing = findPurchase(ledger, input.brief);
  // Reuse is checked first and on purpose: a brief already answered is answered from disk even
  // when the month has no headroom left, because reading a file costs nothing.
  if (existing) return { status: "reused", purchase: existing };
  try {
    const reservation = assertTsResearchReservation(input, ledger);
    const hash = briefHash(input.brief);
    return {
      status: "buy",
      reservation,
      briefHash: hash,
      dossierRef: `state/${TS_DOSSIER_DIRECTORY}/${input.brief.topicKey}-${hash.slice(0, 12)}.json`
    };
  } catch (error) {
    if (error instanceof TsResearchBudgetError) {
      return { status: "declined", code: error.code, reason: error.message };
    }
    throw error;
  }
}

export interface TsResearchUsage {
  topicKey: string;
  briefHash: string;
  costUsd: number;
  /** Recommendation ids that cited this dossier. Empty means the spend bought nothing. */
  usedBy: string[];
}

/**
 * What the spend bought, derived from the appends rather than stored as a flag.
 *
 * A use entry that names no purchase is dropped rather than counted: it would otherwise be a way
 * to claim a dossier this ledger never paid for.
 */
export function researchUsage(ledger: readonly TsResearchLedgerEntry[]): TsResearchUsage[] {
  const byKey = new Map<string, TsResearchUsage>();
  for (const entry of purchases(ledger)) {
    byKey.set(`${entry.topicKey} ${entry.briefHash}`, {
      topicKey: entry.topicKey,
      briefHash: entry.briefHash,
      costUsd: entry.costUsd,
      usedBy: []
    });
  }
  for (const entry of ledger) {
    if (entry.kind !== "use") continue;
    const usage = byKey.get(`${entry.topicKey} ${entry.briefHash}`);
    if (usage && !usage.usedBy.includes(entry.recommendationId)) usage.usedBy.push(entry.recommendationId);
  }
  return [...byKey.values()];
}

/** The next standing priority the desk has not already bought. `null` when all of them are answered. */
export async function nextUnansweredPriority(
  ledger: readonly TsResearchLedgerEntry[],
  root = configRoot
): Promise<TsBriefPriority | null> {
  for (const priority of await loadBriefPriorities(root)) {
    if (findPurchase(ledger, priorityBrief(priority)) === null) return priority;
  }
  return null;
}
