import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BudgetLedgerEntrySchema, type BudgetLedgerEntry } from "../budget.js";
import type { CostReport } from "../contracts/cost-report.js";
import { atomicWriteJson } from "../state.js";
import { parseVentureRegistry } from "../ventures/registry.js";
import { cycleMonth, type DecisionRecordInput, type DeliveryRecordInput, type RecordedEnvelopeInput } from "./cost-attribution.js";
import { buildCostReport, newestLedgerMonth } from "./cost-report.js";
import { fetchProviderBilling } from "./provider-billing.js";

/**
 * Writes `state/money/cost-report.json`: what each edition and each decision cost this month, and
 * each room's envelope against what it actually metered.
 *
 * `state/money` is inside the cycle commit allowlist and `state/finance` and `state/treasury` are
 * not, which is why the report lives here rather than beside the finance ledger.
 *
 * Everything it reads is already committed. The one outbound call it can make is the provider
 * billing read, which is off unless two environment switches are both set, makes no model call
 * and costs nothing. Exits non-zero only when it cannot honestly produce the report — the same
 * posture `finance-page-cli.ts` takes, because a wrong cost table is worse than a missing one.
 */

export const COST_REPORT_RELATIVE_PATH = "money/cost-report.json";

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

async function readJsonFile(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

async function listJson(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    // A directory that does not exist yet is an empty month, not a broken run.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

interface Counted<T> {
  rows: T[];
  unreadable: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** `state/budget/ledger.json` is append-only and large; a row that fails the contract is counted, never guessed at. */
function budgetEntries(value: unknown): Counted<BudgetLedgerEntry> {
  const ledger = record(value);
  if (!Array.isArray(ledger?.entries)) {
    throw new Error("state/budget/ledger.json has no entries array.");
  }
  const rows: BudgetLedgerEntry[] = [];
  let unreadable = 0;
  for (const raw of ledger.entries) {
    const parsed = BudgetLedgerEntrySchema.safeParse(raw);
    if (parsed.success) rows.push(parsed.data);
    else unreadable += 1;
  }
  return { rows, unreadable };
}

async function readDecisions(root: string, month: string): Promise<Counted<DecisionRecordInput>> {
  const directory = path.join(root, "state", "decisions");
  const prefix = month.replace("-", "");
  const rows: DecisionRecordInput[] = [];
  let unreadable = 0;
  for (const name of await listJson(directory)) {
    if (!name.startsWith(prefix)) continue;
    let entry: Record<string, unknown> | null;
    try {
      entry = record(await readJsonFile(path.join(directory, name)));
    } catch {
      unreadable += 1;
      continue;
    }
    const cycleId = text(entry?.cycleId);
    const phase = text(entry?.phase);
    const outcome = text(entry?.outcome);
    const generatedAt = text(entry?.generatedAt);
    if (!cycleId || !phase || !outcome || !generatedAt || Number.isNaN(new Date(generatedAt).getTime())) {
      unreadable += 1;
      continue;
    }
    rows.push({ cycleId, phase, outcome, generatedAt: new Date(generatedAt).toISOString() });
  }
  return { rows, unreadable };
}

async function readDeliveries(root: string, month: string): Promise<Counted<DeliveryRecordInput>> {
  const directory = path.join(root, "state", "edition", "deliveries");
  const rows: DeliveryRecordInput[] = [];
  let unreadable = 0;
  for (const name of await listJson(directory)) {
    if (!name.startsWith(month)) continue;
    let entry: Record<string, unknown> | null;
    try {
      entry = record(await readJsonFile(path.join(directory, name)));
    } catch {
      unreadable += 1;
      continue;
    }
    const date = text(entry?.date);
    const status = text(entry?.status);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !status) {
      unreadable += 1;
      continue;
    }
    rows.push({
      date,
      status,
      articleUrl: text(entry?.articleUrl),
      packageHash: text(entry?.packageHash)
    });
  }
  return { rows, unreadable };
}

/**
 * The envelope each cycle declared, read from the scorecard that recorded it.
 *
 * Only a record knows this number. `config/ventures.json` carries the room's own envelope, but a
 * `cu-edition` cycle reserves that plus the edition-production budget, and comparing a $0.58 run
 * against the registry's $0.08 reports nine overspends a month that never happened.
 *
 * The scorecard rather than the meeting record, because a scorecard is one file per cycle.
 * Meeting records are keyed `<date>-<phase>.json`, so a day that opens the same room twice keeps
 * only the second — for September that left six of ten `cu-edition` cycles with no envelope to
 * compare against. `state/scorecards/<cycleId>.json` has all of them, and its
 * `estimatedWorstCaseUsd` is the figure the runtime actually reserved against.
 *
 * Its sibling `actualUsd` is deliberately not read. It sums the room's own seats and omits the
 * `image_gate` call billed against the same cycle, so it is smaller than what the day cost. The
 * budget ledger is the only file that records every call.
 */
async function readRecordedEnvelopes(root: string, month: string): Promise<Counted<RecordedEnvelopeInput>> {
  const directory = path.join(root, "state", "scorecards");
  const rows: RecordedEnvelopeInput[] = [];
  const prefix = month.replace("-", "");
  let unreadable = 0;
  for (const name of await listJson(directory)) {
    // Cheap prefilter on the filename so a month's report does not open every scorecard ever written.
    if (!name.startsWith(prefix)) continue;
    let entry: Record<string, unknown> | null;
    try {
      entry = record(await readJsonFile(path.join(directory, name)));
    } catch {
      unreadable += 1;
      continue;
    }
    // A dry run is a $0 fixture rehearsal and never belongs in a month's spend comparison.
    if (entry?.fixture === true) continue;
    const cycleId = text(entry?.cycleId);
    const estimatedWorstCaseUsd = entry?.estimatedWorstCaseUsd;
    if (!cycleId || cycleMonth(cycleId) !== month || typeof estimatedWorstCaseUsd !== "number" || !Number.isFinite(estimatedWorstCaseUsd) || estimatedWorstCaseUsd < 0) {
      unreadable += 1;
      continue;
    }
    rows.push({ cycleId, estimatedWorstCaseUsd });
  }
  return { rows, unreadable };
}

export interface WriteCostReportOptions {
  root?: string;
  month?: string;
  now?: Date;
}

export async function writeCostReport(options: WriteCostReportOptions = {}): Promise<CostReport> {
  const root = options.root ?? repositoryRoot();
  const now = options.now ?? new Date();
  const [ledger, registryFile] = await Promise.all([
    readJsonFile(path.join(root, "state", "budget", "ledger.json")),
    readJsonFile(path.join(root, "config", "ventures.json"))
  ]);
  const budget = budgetEntries(ledger);
  const registry = parseVentureRegistry(registryFile);
  const month = options.month ?? newestLedgerMonth(budget.rows) ?? now.toISOString().slice(0, 7);

  const [decisions, deliveries, envelopes, billing] = await Promise.all([
    readDecisions(root, month),
    readDeliveries(root, month),
    readRecordedEnvelopes(root, month),
    fetchProviderBilling({ month, now })
  ]);

  const report = buildCostReport({
    generatedAt: now.toISOString(),
    month,
    budgetEntries: budget.rows,
    decisions: decisions.rows,
    deliveries: deliveries.rows,
    envelopes: envelopes.rows,
    registry,
    billed: billing.billing,
    billingDetail: billing.detail,
    unreadable: {
      decisions: decisions.unreadable,
      deliveries: deliveries.unreadable,
      envelopes: envelopes.unreadable,
      ledgerRows: budget.unreadable
    }
  });

  await atomicWriteJson(path.join(root, "state"), COST_REPORT_RELATIVE_PATH, report);
  return report;
}

function monthArgument(argv: readonly string[]): string | undefined {
  const index = argv.indexOf("--month");
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (value && !/^\d{4}-\d{2}$/.test(value)) throw new Error(`--month expects YYYY-MM, received "${value}".`);
  return value;
}

async function main(): Promise<void> {
  const month = monthArgument(process.argv.slice(2));
  const report = await writeCostReport(month ? { month } : {});
  const billed = report.billed ? `$${report.billed.totalUsd.toFixed(2)}` : "unavailable";
  console.log(
    `state/${COST_REPORT_RELATIVE_PATH} written for ${report.month}: metered $${report.metered.total.totalUsd.toFixed(2)} across ${report.metered.total.calls} calls, ${report.metered.editions.length} editions, ${report.metered.decisions.length} decisions, billed ${billed}.`
  );
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
