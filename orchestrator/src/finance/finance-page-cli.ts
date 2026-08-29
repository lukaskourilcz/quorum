import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeFinanceLedger } from "./ledger.js";
import {
  renderFinanceBlock,
  replaceGeneratedBlock,
  type BudgetLedgerEntry
} from "./finance-page.js";

/**
 * Rewrites the generated block in `state/FINANCE.md` from the ledgers.
 *
 * Runs beside the queue-health check, for the same reason that one does: it has to happen on days
 * the council decided nothing, because a day with no meeting still spent money on the phases that
 * ran. Exits non-zero only when it cannot honestly produce the page — an unreadable ledger or a
 * damaged marker — because a wrong finance table is worse than a missing step.
 */

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

/**
 * `state/budget/ledger.json` is append-only and enormous, and this only ever sums it. A row whose
 * `usd` is not a number is skipped by the summariser and never guessed at.
 */
function budgetEntries(value: unknown): BudgetLedgerEntry[] {
  const ledger = value as { entries?: unknown };
  if (!Array.isArray(ledger.entries)) {
    throw new Error("state/budget/ledger.json has no entries array.");
  }
  return ledger.entries as BudgetLedgerEntry[];
}

export async function writeFinancePage(root = repositoryRoot(), now = new Date()): Promise<string> {
  const pagePath = path.join(root, "state", "FINANCE.md");
  const [page, budget, finance] = await Promise.all([
    readFile(pagePath, "utf8"),
    readJson(path.join(root, "state", "budget", "ledger.json")),
    readJson(path.join(root, "state", "finance", "ledger.json"))
  ]);

  const block = renderFinanceBlock({
    // Minute precision, in UTC, matching the stamp the page has carried since it was hand-written.
    asOf: `${now.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    budget: budgetEntries(budget),
    finance: normalizeFinanceLedger(finance).entries,
    // No payment source exists. When one does, this becomes a check against the connected source
    // rather than a constant, and revenue stops reading `unavailable`.
    revenueSourceConnected: false
  });

  const next = replaceGeneratedBlock(page, block);
  if (next !== page) await writeFile(pagePath, next);
  return next;
}

async function main(): Promise<void> {
  const page = await writeFinancePage();
  const stamp = /^As of (.+)\.$/mu.exec(page)?.[1] ?? "unknown";
  const spend = /\| Total verified operating cost \| (.+) \|$/mu.exec(page)?.[1] ?? "unknown";
  console.log(`state/FINANCE.md regenerated as of ${stamp}; total verified operating cost ${spend}.`);
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
