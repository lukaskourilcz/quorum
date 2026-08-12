import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { remainingScheduledCycles } from "../../../cycle/ledger.js";
import { loadFixedMonthlyUsd } from "../../../money/fixed-costs.js";
import { configRoot, stateRoot } from "../../../paths.js";
import { loadRuntimeBudgetLimits } from "../../../portfolio/limits.js";
import type { Stage } from "../../../types.js";
import {
  MemoryBookIngestPrivateStore,
  runBookIngest
} from "./run.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function optionalText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function checkedApproval(inbox: string, id: string): boolean {
  return new RegExp(`^- \\[[xX]\\] HUMAN_APPROVAL ${id}\\b`, "mu").test(inbox);
}

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const now = new Date(valueAfter(args, "--at") ?? Date.now());
if (Number.isNaN(now.getTime())) throw new Error("--at must be an ISO date-time");
const manuscriptPath = valueAfter(args, "--manuscript") ?? (dry
  ? path.join(process.cwd(), "tests", "fixtures", "door-money", "synthetic-diary.md")
  : path.join(stateRoot, "ventures", "door-money", "manuscript", "manuscript.md"));
const temporaryPrivateRoot = dry ? await mkdtemp(path.join(tmpdir(), "door-money-ingest-")) : null;
const privateRoot = valueAfter(args, "--private-root") ?? temporaryPrivateRoot ?? "";

try {
  const [source, inbox, limits, fixedMonthlyUsd, stages] = await Promise.all([
    optionalText(manuscriptPath),
    optionalText(path.join(stateRoot, "INBOX.md")).then((value) => value ?? ""),
    loadRuntimeBudgetLimits(),
    loadFixedMonthlyUsd(configRoot, now),
    readFile(path.join(configRoot, "stages.json"), "utf8")
      .then((raw) => JSON.parse(raw) as { current: Stage })
  ]);
  const approved = checkedApproval(inbox, "BOOK-SOURCE-001") &&
    checkedApproval(inbox, "BOOK-INGEST-002");
  const report = await runBookIngest({
    source,
    stateRoot,
    privateRoot,
    privateStore: dry ? new MemoryBookIngestPrivateStore() : undefined,
    approved,
    dry,
    now,
    reserveContext: async (entries, cycleId) => ({
      now,
      cycleId,
      stage: stages.current,
      ledger: entries,
      allInNonApiSpentUsd: fixedMonthlyUsd,
      allInCommittedUsd: 0,
      knownMonthlyForecastUsd: 0,
      remainingScheduledCycles: remainingScheduledCycles(now),
      limits
    })
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "refused") process.exitCode = 2;
} finally {
  if (temporaryPrivateRoot) await rm(temporaryPrivateRoot, { recursive: true, force: true });
}
