import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { BudgetLedgerEntry } from "../budget.js";
import { OpsReportSchema, opsReportPath, type OpsReport } from "../contracts/ops-report.js";
import { atomicWriteJson } from "../state.js";

/**
 * The weekly and monthly operating reports, assembled from records and nothing else.
 *
 * Zero model calls. Every figure here is read off a file the runtime already wrote, which is what
 * puts this outside the $25 model share entirely — the same footing as the dataset appends and the
 * stream syncs. The judgement layer is the Monday retro room, and it writes exactly one field.
 *
 * The rule that shapes the whole file: a missing input is recorded as missing. A week with no
 * calendar file did not hold zero meetings; it has no schedule on record, and `missingDays` names
 * the days rather than letting them average into a number that looks measured.
 */

export interface ReportInputs {
  stateRoot: string;
  /** Every day in the period, in order. */
  days: string[];
  periodKey: string;
  period: OpsReport["period"];
  now: Date;
  capUsd: number;
}

async function readJsonFile(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function listFiles(directory: string, suffix: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((name) => name.endsWith(suffix)).sort();
  } catch {
    return [];
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** The ISO week key a date belongs to, and the Monday that starts it. */
export function isoWeek(date: string): { key: string; monday: string } {
  const at = new Date(`${date}T12:00:00Z`);
  const weekday = (at.getUTCDay() + 6) % 7;
  const monday = new Date(at);
  monday.setUTCDate(monday.getUTCDate() - weekday);

  // The ISO week number is the Thursday of that week's week-of-year.
  const thursday = new Date(monday);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));

  return {
    key: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`,
    monday: monday.toISOString().slice(0, 10)
  };
}

export function daysOfWeek(monday: string): string[] {
  return Array.from({ length: 7 }, (unused, index) => {
    void unused;
    const day = new Date(`${monday}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export function daysOfMonth(month: string): string[] {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: count }, (unused, index) => {
    void unused;
    return `${month}-${String(index + 1).padStart(2, "0")}`;
  });
}

async function meetingsOverPeriod(input: ReportInputs): Promise<OpsReport["meetings"]> {
  const skipped: OpsReport["meetings"]["skipped"] = [];
  const skipDirectory = path.join(input.stateRoot, "meetings", "skips");
  const skipFiles = await listFiles(skipDirectory, ".json");
  for (const name of skipFiles) {
    const day = name.slice(0, 10);
    if (!input.days.includes(day)) continue;
    const skip = record(await readJsonFile(path.join(skipDirectory, name)));
    const phase = typeof skip?.phase === "string" ? skip.phase : null;
    const reason = typeof skip?.reason === "string" ? skip.reason : null;
    if (phase && reason) skipped.push({ date: day, phase, reason: reason.slice(0, 400) });
  }

  // Calendars are weekly files keyed by their Monday, so one period touches one or five of them.
  const mondays = [...new Set(input.days.map((day) => isoWeek(day).monday))];
  const slotsByDay = new Map<string, Array<{ kind: string; status: string }>>();
  const seenWeeks = new Set<string>();
  for (const monday of mondays) {
    const calendar = record(await readJsonFile(path.join(input.stateRoot, "calendar", `${monday}.json`)));
    if (!calendar || !Array.isArray(calendar.slots)) continue;
    seenWeeks.add(monday);
    for (const value of calendar.slots) {
      const slot = record(value);
      const at = typeof slot?.at === "string" ? slot.at.slice(0, 10) : null;
      const kind = typeof slot?.kind === "string" ? slot.kind : null;
      const status = typeof slot?.status === "string" ? slot.status : null;
      if (!at || !kind || !status || !input.days.includes(at)) continue;
      slotsByDay.set(at, [...(slotsByDay.get(at) ?? []), { kind, status }]);
    }
  }

  const slots = [...slotsByDay.values()].flat();
  return {
    scheduled: slots.length,
    held: slots.filter((slot) => slot.status === "held").length,
    skipped: skipped.sort((left, right) => left.date.localeCompare(right.date) || left.phase.localeCompare(right.phase)),
    // A day whose week has no calendar file is a gap, not an empty day.
    missingDays: input.days.filter((day) => !seenWeeks.has(isoWeek(day).monday))
  };
}

function spendOverPeriod(
  ledger: readonly BudgetLedgerEntry[],
  input: ReportInputs
): OpsReport["spend"] {
  const inPeriod = ledger.filter((entry) => input.days.includes(entry.ts.slice(0, 10)));
  const month = input.days.at(-1)?.slice(0, 7) ?? input.periodKey.slice(0, 7);
  const byVenture: Record<string, number> = {};
  for (const entry of inPeriod) {
    const venture = (entry as { ventureId?: string }).ventureId ?? "company";
    byVenture[venture] = Number(((byVenture[venture] ?? 0) + entry.usd).toFixed(8));
  }
  const total = (entries: readonly BudgetLedgerEntry[]) =>
    Number(entries.reduce((sum, entry) => sum + entry.usd, 0).toFixed(8));
  return {
    periodUsd: total(inPeriod),
    mtdUsd: total(ledger.filter((entry) => entry.ts.slice(0, 7) === month)),
    capUsd: input.capUsd,
    byVenture
  };
}

async function contentOverPeriod(input: ReportInputs): Promise<OpsReport["content"]> {
  const venturesRoot = path.join(input.stateRoot, "ventures");
  let ventures: string[];
  try {
    ventures = (await readdir(venturesRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return { published: [], scores: null };
  }

  const published: OpsReport["content"]["published"] = [];
  const fits: number[] = [];
  for (const ventureId of ventures) {
    let count = 0;
    for (const day of input.days) {
      const score = record(await readJsonFile(
        path.join(venturesRoot, ventureId, "content-scores", `${day}.json`)
      ));
      if (!score || !Array.isArray(score.items)) continue;
      count += score.items.length;
      for (const value of score.items) {
        const item = record(value);
        if (typeof item?.fit === "number") fits.push(item.fit);
      }
    }
    if (count > 0) published.push({ ventureId, count });
  }

  return {
    published,
    // Null, not zero. A period the gate never scored has no average, and printing 0 would read as
    // "everything we published was worthless".
    scores: fits.length === 0
      ? null
      : {
        avg: Number((fits.reduce((sum, fit) => sum + fit, 0) / fits.length).toFixed(2)),
        worst: Math.min(...fits),
        best: Math.max(...fits)
      }
  };
}

async function qualityOverPeriod(input: ReportInputs): Promise<OpsReport["quality"]> {
  const snapshot = record(await readJsonFile(path.join(input.stateRoot, "autonomy", "latest.json")));
  const quality = record(snapshot?.quality);
  const denominators = record(quality?.denominators);
  if (!quality) return null;
  const rate = (key: string, over: string) => {
    const denominator = denominators?.[over];
    const value = quality[key];
    return typeof denominator === "number" && denominator > 0 && typeof value === "number" ? value : null;
  };
  return {
    vetoRate: rate("vetoRate", "meetings"),
    firstPassRate: rate("firstPassRate", "proofs"),
    retryRate: rate("retryRate", "proofs")
  };
}

/**
 * Fix tasks opened and closed, counted off the decision files themselves.
 *
 * A task is a `- [ ]` line and a closed one is `- [x]`. The checkbox is the record, so counting
 * the checkboxes is counting the truth rather than maintaining a second tally beside them.
 */
async function fixTasksOverPeriod(input: ReportInputs): Promise<OpsReport["fixTasks"]> {
  let opened = 0;
  let closed = 0;
  const directory = path.join(input.stateRoot, "decisions");
  for (const name of await listFiles(directory, ".md")) {
    if (!input.days.includes(name.slice(0, 10))) continue;
    let body: string;
    try {
      body = await readFile(path.join(directory, name), "utf8");
    } catch {
      continue;
    }
    opened += (body.match(/^- \[ \]/gmu) ?? []).length;
    closed += (body.match(/^- \[[xX]\]/gmu) ?? []).length;
  }
  return { opened, closed };
}

async function incidentsOverPeriod(input: ReportInputs): Promise<OpsReport["incidents"]> {
  const incidents: OpsReport["incidents"] = [];
  const directory = path.join(input.stateRoot, "standups");
  for (const name of await listFiles(directory, ".json")) {
    const day = name.slice(0, 10);
    if (!input.days.includes(day)) continue;
    const standup = record(await readJsonFile(path.join(directory, name)));
    // A lost seat is the incident this system is worst at noticing, so it is the one recorded.
    for (const value of Array.isArray(standup?.droppedSeats) ? standup.droppedSeats : []) {
      const seat = record(value);
      if (typeof seat?.agent === "string" && typeof seat.reason === "string") {
        incidents.push({ kind: "dropped-seat", date: day, note: `${seat.agent}: ${seat.reason}`.slice(0, 400) });
      }
    }
  }
  return incidents;
}

async function perVentureOverPeriod(
  input: ReportInputs,
  spend: OpsReport["spend"],
  content: OpsReport["content"]
): Promise<OpsReport["perVenture"]> {
  const verdicts = new Map<string, string>();
  const directory = path.join(input.stateRoot, "standups");
  for (const name of await listFiles(directory, ".json")) {
    if (!input.days.includes(name.slice(0, 10))) continue;
    const standup = record(await readJsonFile(path.join(directory, name)));
    const review = record(standup?.operationsReview);
    for (const value of Array.isArray(review?.perVentureVerdicts) ? review.perVentureVerdicts : []) {
      const verdict = record(value);
      // The last word of the period wins: the newest board saw the most.
      if (typeof verdict?.ventureId === "string" && typeof verdict.verdict === "string") {
        verdicts.set(verdict.ventureId, verdict.verdict);
      }
    }
  }

  const ventureIds = [...new Set([
    ...verdicts.keys(),
    ...content.published.map((entry) => entry.ventureId),
    ...Object.keys(spend.byVenture).filter((key) => key !== "company")
  ])].sort();

  return ventureIds.map((ventureId) => ({
    ventureId,
    verdictSummary: verdicts.get(ventureId) ?? "no verdict recorded this period",
    outputs: content.published.find((entry) => entry.ventureId === ventureId)?.count ?? 0,
    spendUsd: spend.byVenture[ventureId] ?? 0
  }));
}

export async function buildOpsReport(
  input: ReportInputs & { ledger: readonly BudgetLedgerEntry[] }
): Promise<OpsReport> {
  const [meetings, content, quality, fixTasks, incidents] = await Promise.all([
    meetingsOverPeriod(input),
    contentOverPeriod(input),
    qualityOverPeriod(input),
    fixTasksOverPeriod(input),
    incidentsOverPeriod(input)
  ]);
  const spend = spendOverPeriod(input.ledger, input);
  return OpsReportSchema.parse({
    schemaVersion: "ops-report/1",
    period: input.period,
    periodKey: input.periodKey,
    generatedAt: input.now.toISOString(),
    meetings,
    spend,
    content,
    quality,
    incidents,
    fixTasks,
    perVenture: await perVentureOverPeriod(input, spend, content),
    narrative: null
  });
}

export async function writeOpsReport(stateRoot: string, report: OpsReport): Promise<string> {
  const relative = opsReportPath(report.period, report.periodKey);
  await atomicWriteJson(stateRoot, relative, report);
  return relative;
}

/**
 * The finished week, written on a Monday over the week that just ended.
 *
 * A report over a week still running would be rewritten every day and would never be a record of
 * anything. The same finished-day guard the meeting reconciler applies, one period up.
 */
export async function writeWeeklyReportIfDue(input: {
  stateRoot: string;
  /** The Prague date the night shift is running on. */
  today: string;
  now: Date;
  ledger: readonly BudgetLedgerEntry[];
  capUsd: number;
}): Promise<{ path: string; report: OpsReport } | null> {
  const weekday = new Date(`${input.today}T12:00:00Z`).getUTCDay();
  if (weekday !== 1) return null;

  const lastWeek = new Date(`${input.today}T12:00:00Z`);
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
  const { key, monday } = isoWeek(lastWeek.toISOString().slice(0, 10));
  const report = await buildOpsReport({
    stateRoot: input.stateRoot,
    days: daysOfWeek(monday),
    periodKey: key,
    period: "weekly",
    now: input.now,
    capUsd: input.capUsd,
    ledger: input.ledger
  });
  return { path: await writeOpsReport(input.stateRoot, report), report };
}

/** The finished month, written on the 1st over the month before it. */
export async function writeMonthlyReportIfDue(input: {
  stateRoot: string;
  today: string;
  now: Date;
  ledger: readonly BudgetLedgerEntry[];
  capUsd: number;
}): Promise<{ path: string; report: OpsReport } | null> {
  if (!input.today.endsWith("-01")) return null;

  const previous = new Date(`${input.today}T12:00:00Z`);
  previous.setUTCDate(0);
  const month = previous.toISOString().slice(0, 7);
  const report = await buildOpsReport({
    stateRoot: input.stateRoot,
    days: daysOfMonth(month),
    periodKey: month,
    period: "monthly",
    now: input.now,
    capUsd: input.capUsd,
    ledger: input.ledger
  });
  return { path: await writeOpsReport(input.stateRoot, report), report };
}
