import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The weekly and monthly operating reports, as the public page reads them.
 *
 * Parse-or-drop and count what was dropped, like every loader that crosses this boundary. The
 * writers already refuse to invent a number, so the only thing left to get wrong here is turning
 * one of their nulls into a zero: a period the content gate never scored has no average score, and
 * `null` has to survive all the way to the "—" on the page.
 */
export interface OperationsReport {
  period: "weekly" | "monthly";
  periodKey: string;
  generatedAt: string;
  meetings: {
    scheduled: number;
    held: number;
    skipped: Array<{ date: string; phase: string; reason: string }>;
    missingDays: string[];
  };
  spend: { periodUsd: number; mtdUsd: number; capUsd: number };
  published: Array<{ ventureId: string; count: number }>;
  scores: { avg: number; worst: number; best: number } | null;
  incidents: Array<{ kind: string; date: string; note: string }>;
  fixTasks: { opened: number; closed: number };
  perVenture: Array<{ ventureId: string; verdictSummary: string; outputs: number; spendUsd: number }>;
  narrative: string | null;
}

export interface OperationsReportIndex {
  weekly: OperationsReport[];
  monthly: OperationsReport[];
  /** Files that exist and could not be read. Named on the page rather than silently skipped. */
  unreadable: number;
}

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

/** Machine text must not reach a public page, so a narrative that reads as one is dropped. */
const READS_AS_MACHINE = /(?:system prompt|developer message|process\.env|api[_ -]?key|\{"|\}\s*$)/iu;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function text(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum
    ? value.trim()
    : null;
}

function parseReport(value: unknown, period: OperationsReport["period"]): OperationsReport | null {
  const file = record(value);
  if (file?.schemaVersion !== "ops-report/1" || file.period !== period) return null;

  const periodKey = text(file.periodKey, 20);
  const generatedAt = text(file.generatedAt, 40);
  const meetings = record(file.meetings);
  const spend = record(file.spend);
  const content = record(file.content);
  const fixTasks = record(file.fixTasks);
  const scheduled = count(meetings?.scheduled);
  const held = count(meetings?.held);
  const periodUsd = count(spend?.periodUsd);
  const mtdUsd = count(spend?.mtdUsd);
  const capUsd = count(spend?.capUsd);
  if (!periodKey || !generatedAt || scheduled === null || held === null
    || periodUsd === null || mtdUsd === null || capUsd === null) return null;

  const list = <T,>(source: unknown, parse: (entry: unknown) => T | null): T[] =>
    (Array.isArray(source) ? source : [])
      .map(parse)
      .filter((entry): entry is T => entry !== null);

  const scores = record(content?.scores);
  const avg = count(scores?.avg);
  const worst = count(scores?.worst);
  const best = count(scores?.best);
  const narrative = text(file.narrative, 2_000);

  return {
    period,
    periodKey,
    generatedAt,
    meetings: {
      scheduled,
      held,
      skipped: list(meetings?.skipped, (entry) => {
        const skip = record(entry);
        const date = text(skip?.date, 10);
        const phase = text(skip?.phase, 80);
        const reason = text(skip?.reason, 400);
        return date && phase && reason ? { date, phase, reason } : null;
      }),
      missingDays: list(meetings?.missingDays, (entry) => text(entry, 10))
    },
    spend: { periodUsd, mtdUsd, capUsd },
    published: list(content?.published, (entry) => {
      const item = record(entry);
      const ventureId = text(item?.ventureId, 80);
      const value = count(item?.count);
      return ventureId && value !== null ? { ventureId, count: value } : null;
    }),
    // All three or none: a partial score block is not a score.
    scores: avg !== null && worst !== null && best !== null ? { avg, worst, best } : null,
    incidents: list(file.incidents, (entry) => {
      const incident = record(entry);
      const kind = text(incident?.kind, 80);
      const date = text(incident?.date, 10);
      const note = text(incident?.note, 400);
      return kind && date && note ? { kind, date, note } : null;
    }),
    fixTasks: { opened: count(fixTasks?.opened) ?? 0, closed: count(fixTasks?.closed) ?? 0 },
    perVenture: list(file.perVenture, (entry) => {
      const item = record(entry);
      const ventureId = text(item?.ventureId, 80);
      const verdictSummary = text(item?.verdictSummary, 280);
      const outputs = count(item?.outputs);
      const spendUsd = count(item?.spendUsd);
      return ventureId && verdictSummary && outputs !== null && spendUsd !== null
        ? { ventureId, verdictSummary, outputs, spendUsd }
        : null;
    }),
    narrative: narrative && !READS_AS_MACHINE.test(narrative) ? narrative : null
  };
}

export async function readOperationsReports(root = repositoryRoot): Promise<OperationsReportIndex> {
  let unreadable = 0;

  const readPeriod = async (period: OperationsReport["period"]): Promise<OperationsReport[]> => {
    const directory = path.join(root, "state", "reports", period);
    let names: string[];
    try {
      names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
    } catch {
      return [];
    }
    const reports: OperationsReport[] = [];
    for (const name of names) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readFile(path.join(directory, name), "utf8"));
      } catch {
        unreadable += 1;
        continue;
      }
      const report = parseReport(parsed, period);
      if (report) reports.push(report);
      else unreadable += 1;
    }
    // Newest first: the period key sorts lexically because both shapes are zero-padded.
    return reports.sort((left, right) => right.periodKey.localeCompare(left.periodKey));
  };

  const [weekly, monthly] = await Promise.all([readPeriod("weekly"), readPeriod("monthly")]);
  return { weekly, monthly, unreadable };
}
