import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  EditionRubricReceiptSchema,
  type EditionRubricReceipt,
  type EditionRubricRunGrade
} from "../contracts/edition-rubric-receipt.js";
import { atomicWriteJson, resolveStatePath } from "../state.js";
import type { EditionQualityConfig } from "./config.js";
import { evaluateEditionQuality, type QualityMetrics } from "./quality.js";

export const EDITION_RUN_DIRECTORY = "edition/runs";
export const EDITION_RUBRIC_DIRECTORY = "quality/edition-rubric";

/** The one reason a committed run report cannot be graded. */
const NO_METRICS =
  "This run ended before the quality gate was reached, so it recorded no metrics to grade.";

/**
 * The part of a run report the rubric reads.
 *
 * Parse-or-drop, per engineering rule 1: a report whose shape this cannot read becomes an
 * ungraded run with a stated reason, never a thrown error and never a pass.
 */
interface ReadableRunReport {
  runId?: unknown;
  status?: unknown;
  regenerationAttempts?: unknown;
  quality?: { metrics?: unknown; result?: { violations?: unknown } } | undefined;
}

function sortedCodes(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string"))].sort()
    : [];
}

/**
 * Whether a recorded metrics object carries every metric the evaluator reads.
 *
 * `costPerRun` is the one metric that is legitimately absent — a run that measured no spend — and
 * its absence is itself a violation the evaluator emits, so it is not required here.
 */
function readableMetrics(value: unknown): QualityMetrics | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const numbers = [
    "successfulSources",
    "candidateItems",
    "citedSources",
    "signalStrength",
    "maximumSingleSourceShare",
    "sourceDiversity",
    "duplicateStorySimilarity",
    "repeatedTopicFrequency",
    "unsupportedWatchlistItems"
  ] as const;
  for (const key of numbers) {
    if (typeof record[key] !== "number" || !Number.isFinite(record[key])) return null;
  }
  if (typeof record.primarySourceRelevant !== "boolean") return null;
  if (typeof record.primarySourcePresent !== "boolean") return null;
  if (record.costPerRun !== undefined && typeof record.costPerRun !== "number") return null;
  return record as unknown as QualityMetrics;
}

function runStatus(value: unknown): EditionRubricRunGrade["status"] {
  return value === "edition" || value === "no_edition" ? value : "failed";
}

/**
 * Grade one committed run report against the rubric.
 *
 * The regrade calls `evaluateEditionQuality` rather than re-deriving the comparisons from the
 * rubric's `metrics` and `thresholdKey`, so there is exactly one implementation of these rules
 * and the rubric cannot drift into being a second gate. `regenerationAttempt` is passed as `0`
 * because only `action` reads it, and `action` is not graded — see the contract's header for why
 * it cannot be reproduced from a run report.
 */
export function gradeEditionRun(input: {
  report: unknown;
  reportRef: string;
  config: EditionQualityConfig;
}): EditionRubricRunGrade {
  const report = (input.report ?? {}) as ReadableRunReport;
  const runId = typeof report.runId === "string" && report.runId.length > 0
    ? report.runId
    : input.reportRef;
  const base = { runId, reportRef: input.reportRef, status: runStatus(report.status) };
  const metrics = readableMetrics(report.quality?.metrics);
  if (!metrics) {
    return {
      ...base,
      grade: null,
      ungraded: report.quality
        ? "This run's recorded metrics could not be read, so no criterion could be graded."
        : NO_METRICS
    };
  }
  const regraded = sortedCodes(evaluateEditionQuality(metrics, input.config, 0).violations);
  const recorded = sortedCodes(report.quality?.result?.violations);
  const failed = new Set(regraded);
  return {
    ...base,
    grade: {
      criteria: input.config.rubric.criteria.map((criterion) => ({
        code: criterion.code,
        category: criterion.category,
        outcome: failed.has(criterion.code) ? "failed" as const : "met" as const
      })),
      recorded,
      regraded,
      divergence: [...new Set([
        ...recorded.filter((code) => !failed.has(code)),
        ...regraded.filter((code) => !recorded.includes(code))
      ])].sort()
    },
    ungraded: null
  };
}

/**
 * Build one date's receipt from the reports of that date.
 *
 * `reports` is sorted by `reportRef` so a date with two runs produces the same bytes on every
 * build. Nothing in this function reads a clock or a random source; the date is an argument.
 */
export function buildEditionRubricReceipt(input: {
  date: string;
  config: EditionQualityConfig;
  reports: readonly { reportRef: string; report: unknown }[];
}): EditionRubricReceipt {
  const runs = [...input.reports]
    .sort((left, right) => left.reportRef.localeCompare(right.reportRef))
    .map((entry) => gradeEditionRun({
      report: entry.report,
      reportRef: entry.reportRef,
      config: input.config
    }));
  const graded = runs.filter((run) => run.grade !== null);
  return EditionRubricReceiptSchema.parse({
    schemaVersion: "edition-rubric-receipt/1",
    date: input.date,
    rubric: { version: input.config.rubric.version, revision: input.config.rubric.revision },
    runs,
    summary: {
      runs: runs.length,
      graded: graded.length,
      ungraded: runs.length - graded.length,
      passed: graded.filter((run) => run.grade!.regraded.length === 0).length,
      failed: graded.filter((run) => run.grade!.regraded.length > 0).length,
      diverged: graded.filter((run) => run.grade!.divergence.length > 0).length
    }
  });
}

const RUN_FILE = /^(\d{4}-\d{2}-\d{2})-[0-9a-f]{8,64}\.json$/u;

/** Every committed run report, grouped by the date in its filename. Dates ascending. */
export async function readEditionRunReportsByDate(
  root: string
): Promise<Map<string, { reportRef: string; report: unknown }[]>> {
  const directory = resolveStatePath(root, EDITION_RUN_DIRECTORY);
  const names = (await readdir(directory).catch(() => [] as string[]))
    .filter((name) => RUN_FILE.test(name))
    .sort();
  const byDate = new Map<string, { reportRef: string; report: unknown }[]>();
  for (const name of names) {
    const date = RUN_FILE.exec(name)![1]!;
    // A report this cannot even parse as JSON costs one report, not the run: it is kept with a
    // null body so gradeEditionRun records it as ungraded rather than leaving it out of the day.
    const report = await readFile(path.join(directory, name), "utf8")
      .then((raw) => JSON.parse(raw) as unknown)
      .catch(() => null);
    byDate.set(date, [
      ...(byDate.get(date) ?? []),
      { reportRef: `${EDITION_RUN_DIRECTORY}/${name}`, report }
    ]);
  }
  return byDate;
}

/** Write one date's receipt beside the reports it graded. */
export async function storeEditionRubricReceipt(
  root: string,
  receipt: EditionRubricReceipt
): Promise<string> {
  const relative = `${EDITION_RUBRIC_DIRECTORY}/${receipt.date}.json`;
  await atomicWriteJson(root, relative, receipt);
  return relative;
}

/**
 * Regrade one date and write its receipt, for the edition run that has just finished.
 *
 * Called from the edition path so the receipt lands in the same commit as the report it grades.
 * Without that, a cycle would leave a report with no receipt and the CI gate would go red on the
 * next unrelated push, for a reason nobody had introduced.
 */
export async function recordEditionRubricReceipt(input: {
  root: string;
  date: string;
  config: EditionQualityConfig;
}): Promise<string | null> {
  const reports = (await readEditionRunReportsByDate(input.root)).get(input.date);
  if (!reports || reports.length === 0) return null;
  return storeEditionRubricReceipt(
    input.root,
    buildEditionRubricReceipt({ date: input.date, config: input.config, reports })
  );
}
