import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot, stateRoot } from "../paths.js";
import { loadSourceRegistry } from "../sources/registry.js";
import { atomicWriteText } from "../state.js";
import type { EditionRunReport } from "./report.js";

/**
 * Why DNESKAi's days publish nothing, read from the run records and nothing else (quorum#564).
 *
 * Every production run already writes `state/edition/runs/<date>-<hash>.json` with its stages,
 * warnings, cost and source summary. This reads them back, names the one thing that stopped each
 * run, and totals the days. It changes nothing, calls nothing and costs nothing, so its numbers
 * can back a proposal the owner countersigns without anyone re-deriving them by hand.
 */

type RunRecord = Pick<EditionRunReport, "date" | "status" | "stages" | "warnings" | "measuredCostUsd" | "startedAt"> & {
  mode?: string;
  stetBlocks?: number;
  hacekBlocks?: number;
  sourceSummary?: { successfulSources?: number; candidateItems?: number };
};

export type BlockerKind =
  | "published"
  | "write-output-invalid"
  | "curation-output-invalid"
  | "curation-gate"
  | "provider-error"
  | "budget-spent"
  | "stet-block"
  | "hacek-block"
  | "source-gate"
  | "quality-gate"
  | "other";

export interface RunVerdict {
  date: string;
  kind: BlockerKind;
  /** One line a reader can act on: the gate, the fields, the provider message. */
  detail: string;
  costUsd: number;
  successfulSources: number | null;
  /** Tool-output fields that failed the contract on the run's last write attempt. */
  invalidFields: string[];
  /** Every rejected write attempt's fields, one entry per attempt. */
  invalidFieldsByAttempt: string[][];
}

export interface DayYield {
  date: string;
  published: boolean;
  runs: RunVerdict[];
  costUsd: number;
  /** Money spent on runs that published nothing. */
  lostUsd: number;
}

export interface YieldReport {
  since: string;
  until: string;
  /** The registry's enabled sources, the denominator for "reached". */
  enabledSources: number;
  days: DayYield[];
  /** Calendar days in the range with no production run record at all. */
  daysWithoutRun: string[];
  /** Why those days never ran, from the room's own skip record, grouped by the stated reason. */
  skipReasons: Array<{ reason: string; dates: string[] }>;
  /** Days with no published run, by what stopped the first run of the day. */
  lostDaysByCause: Array<{ kind: BlockerKind; days: number }>;
  /** How often each field broke the write contract, across every failed write attempt. */
  invalidFieldCounts: Array<{ field: string; attempts: number }>;
}

const CURATION_GATE = /curation gate: ([a-z_]+)/u;
const FIELD_PATH = /"path":\s*\[\s*"([a-z_]+)"/gu;

function fieldsIn(message: string): string[] {
  return [...new Set([...message.matchAll(FIELD_PATH)].map((match) => match[1]!))].sort();
}

function firstLine(value: string, limit = 140): string {
  const line = value.replaceAll(/\s+/gu, " ").trim();
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
}

/** The single thing that stopped a run, or `published`. Order matters: the earliest gate wins. */
export function classifyRun(run: RunRecord): RunVerdict {
  const failed = run.stages.filter((stage) => stage.status === "failed");
  const base = {
    date: run.date,
    costUsd: Number((run.measuredCostUsd ?? 0).toFixed(4)),
    successfulSources: run.sourceSummary?.successfulSources ?? null,
    invalidFields: [] as string[],
    invalidFieldsByAttempt: [] as string[][]
  };
  const writeFailures = failed.filter((stage) => /^(write|rewrite_\d+)$/u.test(stage.name) && stage.errorCode === "InvalidModelOutputError");
  const lastWrite = writeFailures.at(-1);
  base.invalidFieldsByAttempt = writeFailures.map((stage) => fieldsIn(stage.errorMessage ?? ""));
  if (lastWrite) base.invalidFields = base.invalidFieldsByAttempt.at(-1) ?? [];
  if (run.status === "edition") {
    return {
      ...base,
      kind: "published",
      detail: writeFailures.length > 0
        ? `published after ${writeFailures.length} rejected write attempt${writeFailures.length === 1 ? "" : "s"}`
        : "published"
    };
  }
  if (run.warnings.includes("budget_exhausted")) {
    return { ...base, kind: "budget-spent", detail: "the day's writing budget was already spent by an earlier run" };
  }
  const curate = failed.find((stage) => stage.name === "curate");
  if (curate) {
    const message = curate.errorMessage ?? "";
    const gate = CURATION_GATE.exec(message)?.[1];
    if (curate.errorCode === "CurationGateError" && gate) return { ...base, kind: "curation-gate", detail: gate };
    if (curate.errorCode === "InvalidModelOutputError") return { ...base, kind: "curation-output-invalid", detail: firstLine(message) };
    if (/credit balance/iu.test(message)) return { ...base, kind: "provider-error", detail: "provider refused: credit balance too low" };
    return { ...base, kind: "provider-error", detail: firstLine(message || curate.errorCode || "curation failed") };
  }
  if (run.warnings.some((warning) => warning.startsWith("source_gate"))) {
    return { ...base, kind: "source-gate", detail: "too few sources reached" };
  }
  if (lastWrite && writeFailures.length === failed.filter((stage) => /^(write|rewrite_\d+)$/u.test(stage.name)).length) {
    return {
      ...base,
      kind: "write-output-invalid",
      detail: `${writeFailures.length} write attempt${writeFailures.length === 1 ? "" : "s"} rejected; last on ${base.invalidFields.join(", ") || "an unnamed field"}`
    };
  }
  if ((run.stetBlocks ?? 0) > 0) return { ...base, kind: "stet-block", detail: `${run.stetBlocks} STET block(s)` };
  if ((run.hacekBlocks ?? 0) > 0) return { ...base, kind: "hacek-block", detail: `${run.hacekBlocks} HACEK block(s)` };
  const quality = run.warnings.find((warning) => warning.startsWith("quality:"));
  if (quality) return { ...base, kind: "quality-gate", detail: firstLine(quality.slice("quality:".length)) };
  return { ...base, kind: "other", detail: firstLine(run.warnings[0] ?? failed[0]?.errorMessage ?? "no reason recorded") };
}

export function summarizeEditionYield(input: {
  runs: readonly RunRecord[];
  enabledSources: number;
  since: string;
  until: string;
  /** `state/meetings/skips/<date>-cu-edition.json` reasons, keyed by date. */
  skips?: Readonly<Record<string, string>>;
}): YieldReport {
  const inRange = input.runs
    .filter((run) => run.mode !== "dry_run" && run.date >= input.since && run.date <= input.until)
    .sort((left, right) => left.date.localeCompare(right.date) || (left.startedAt ?? "").localeCompare(right.startedAt ?? ""));
  const byDate = new Map<string, RunVerdict[]>();
  for (const run of inRange) {
    byDate.set(run.date, [...(byDate.get(run.date) ?? []), classifyRun(run)]);
  }
  const days = [...byDate.entries()].map(([date, runs]): DayYield => {
    const published = runs.some((run) => run.kind === "published");
    const costUsd = runs.reduce((sum, run) => sum + run.costUsd, 0);
    const lostUsd = runs.filter((run) => run.kind !== "published").reduce((sum, run) => sum + run.costUsd, 0);
    return { date, published, runs, costUsd: Number(costUsd.toFixed(4)), lostUsd: Number(lostUsd.toFixed(4)) };
  });
  const daysWithoutRun: string[] = [];
  for (let at = Date.parse(`${input.since}T12:00:00Z`); at <= Date.parse(`${input.until}T12:00:00Z`); at += 86_400_000) {
    const date = new Date(at).toISOString().slice(0, 10);
    if (!byDate.has(date)) daysWithoutRun.push(date);
  }
  const causes = new Map<BlockerKind, number>();
  for (const day of days.filter((candidate) => !candidate.published)) {
    // The run that did the work names the day: a budget-spent retry only restates that an
    // earlier run of the same day already failed and spent the envelope.
    const deciding = day.runs.find((run) => run.kind !== "budget-spent") ?? day.runs[0]!;
    causes.set(deciding.kind, (causes.get(deciding.kind) ?? 0) + 1);
  }
  const fields = new Map<string, number>();
  for (const run of days.flatMap((day) => day.runs)) {
    for (const field of run.invalidFieldsByAttempt.flat()) fields.set(field, (fields.get(field) ?? 0) + 1);
  }
  return {
    since: input.since,
    until: input.until,
    enabledSources: input.enabledSources,
    days,
    daysWithoutRun,
    skipReasons: [...daysWithoutRun.reduce((groups, date) => {
      const reason = input.skips?.[date] ?? "no run record and no skip record";
      groups.set(reason, [...(groups.get(reason) ?? []), date]);
      return groups;
    }, new Map<string, string[]>()).entries()]
      .map(([reason, dates]) => ({ reason, dates }))
      .sort((left, right) => right.dates.length - left.dates.length || left.reason.localeCompare(right.reason)),
    lostDaysByCause: [...causes.entries()]
      .map(([kind, count]) => ({ kind, days: count }))
      .sort((left, right) => right.days - left.days || left.kind.localeCompare(right.kind)),
    invalidFieldCounts: [...fields.entries()]
      .map(([field, attempts]) => ({ field, attempts }))
      .sort((left, right) => right.attempts - left.attempts || left.field.localeCompare(right.field))
  };
}

const usd = (value: number) => `$${value.toFixed(2)}`;
const cell = (value: string) => value.replaceAll("|", "\\|");

export function renderYieldMarkdown(report: YieldReport, command: string): string {
  const published = report.days.filter((day) => day.published).length;
  const lost = report.days.length - published;
  const spent = report.days.reduce((sum, day) => sum + day.costUsd, 0);
  const lostUsd = report.days.reduce((sum, day) => sum + day.lostUsd, 0);
  const lines = [
    `# DNESKAi yield, ${report.since} to ${report.until}`,
    "",
    `Generated by \`${command}\` from \`state/edition/runs/\`. It reads the run records and changes nothing.`,
    "",
    `- Days with a run: ${report.days.length}. Published: ${published}. No edition: ${lost}.`,
    `- Days with no production run recorded: ${report.daysWithoutRun.length}. The edition room did not meet, so no gate below explains them:`,
    ...report.skipReasons.map(({ reason, dates }) => `  - ${dates.length} day${dates.length === 1 ? "" : "s"}: "${reason}" (${dates.join(", ")})`),
    `- Measured model cost: ${usd(spent)}, of which ${usd(lostUsd)} went to runs that published nothing.`,
    "",
    "## Days without an edition, by cause",
    "",
    "| Cause | Days |",
    "| --- | --- |",
    ...report.lostDaysByCause.map(({ kind, days }) => `| ${kind} | ${days} |`),
    "",
    "## Fields that broke the write contract",
    "",
    "Counted per rejected write attempt, published runs included.",
    "",
    "| Field | Attempts |",
    "| --- | --- |",
    ...(report.invalidFieldCounts.length
      ? report.invalidFieldCounts.map(({ field, attempts }) => `| \`${field}\` | ${attempts} |`)
      : ["| none | 0 |"]),
    "",
    "## Every run",
    "",
    `Sources reached is out of the ${report.enabledSources} the registry enables. A run record keeps that count and at most`,
    "twelve evidence refs, not the names of the sources that failed, so this table cannot say which were down.",
    "",
    "| Date | Day | Run outcome | What stopped it | Cost | Sources reached |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.days.flatMap((day) => day.runs.map((run) => [
      day.date,
      day.published ? "edition" : "no edition",
      run.kind,
      cell(run.detail),
      usd(run.costUsd),
      run.successfulSources === null ? "n/a" : String(run.successfulSources)
    ].join(" | ")).map((row) => `| ${row} |`)),
    ""
  ];
  return lines.join("\n");
}

async function readSkips(root: string, dates: readonly string[]): Promise<Record<string, string>> {
  const skips: Record<string, string> = {};
  for (const date of dates) {
    for (const phase of ["cu-edition", "cu-day"]) {
      const raw = await readFile(path.join(root, "meetings", "skips", `${date}-${phase}.json`), "utf8").catch(() => null);
      if (!raw) continue;
      try {
        const reason = (JSON.parse(raw) as { reason?: unknown }).reason;
        if (typeof reason === "string" && reason.trim()) {
          skips[date] = reason.trim();
          break;
        }
      } catch {
        // Unreadable skip record: the day reads as having no stated reason.
      }
    }
  }
  return skips;
}

async function readRuns(root: string): Promise<RunRecord[]> {
  const directory = path.join(root, "edition", "runs");
  const names = (await readdir(directory).catch(() => [] as string[])).filter((name) => name.endsWith(".json")).sort();
  const runs: RunRecord[] = [];
  for (const name of names) {
    try {
      const parsed = JSON.parse(await readFile(path.join(directory, name), "utf8")) as RunRecord;
      if (typeof parsed.date === "string" && Array.isArray(parsed.stages) && Array.isArray(parsed.warnings)) runs.push(parsed);
    } catch {
      // An unreadable record is skipped; the report is a reading aid, not a gate.
    }
  }
  return runs;
}

function argument(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(args: readonly string[]): Promise<void> {
  const runs = await readRuns(stateRoot);
  const dates = runs.map((run) => run.date).sort();
  const until = argument(args, "--until") ?? dates.at(-1);
  const since = argument(args, "--since") ?? dates[0];
  if (!since || !until || !/^\d{4}-\d{2}-\d{2}$/u.test(since) || !/^\d{4}-\d{2}-\d{2}$/u.test(until)) {
    throw new Error("Usage: pnpm edition:yield -- --since YYYY-MM-DD [--until YYYY-MM-DD] [--no-write]");
  }
  const registry = await loadSourceRegistry();
  const calendar: string[] = [];
  for (let at = Date.parse(`${since}T12:00:00Z`); at <= Date.parse(`${until}T12:00:00Z`); at += 86_400_000) {
    calendar.push(new Date(at).toISOString().slice(0, 10));
  }
  const report = summarizeEditionYield({
    skips: await readSkips(stateRoot, calendar),
    runs,
    enabledSources: registry.sources.filter((source) => source.enabled).length,
    since,
    until
  });
  const markdown = renderYieldMarkdown(report, `pnpm edition:yield -- --since ${since}${argument(args, "--until") ? ` --until ${until}` : ""}`);
  process.stdout.write(markdown);
  if (!args.includes("--no-write")) {
    const relative = `docs/reports/dneskai-yield-${until}.md`;
    await atomicWriteText(repoRoot, relative, markdown);
    process.stderr.write(`\nWrote ${relative}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
