import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PersonalGrowthDailyBriefSchema,
  PersonalGrowthHistoryEventSchema,
  PersonalGrowthPlannerConfigSchema,
  PersonalGrowthRollingPlanSchema,
  type PersonalGrowthDailyBrief,
  type PersonalGrowthHistoryEvent,
  type PersonalGrowthPlannerConfig,
  type PersonalGrowthRollingPlan
} from "../../contracts/personal-growth.js";
import { configRoot } from "../../paths.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function personalGrowthHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function dateValue(date: string): Date {
  if (!DATE_PATTERN.test(date)) throw new Error(`Invalid Personal Growth date: ${date}`);
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid Personal Growth calendar date: ${date}`);
  }
  return parsed;
}

export function addPersonalGrowthDays(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error("Personal Growth day offsets must be integers");
  const value = dateValue(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dayDifference(left: string, right: string): number {
  return Math.round((dateValue(left).getTime() - dateValue(right).getTime()) / 86_400_000);
}

export function nextPragueCalendarDate(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new Error("Personal Growth clock must be valid");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  return addPersonalGrowthDays(today, 1);
}

export async function loadPersonalGrowthPlannerConfig(
  filePath = path.join(configRoot, "personal-growth-planner.json")
): Promise<PersonalGrowthPlannerConfig> {
  return PersonalGrowthPlannerConfigSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

function recurrenceDates(anchorDate: string, intervalDays: number, from: string, through: string): string[] {
  const effectiveFrom = from < anchorDate ? anchorDate : from;
  const firstOffset = Math.ceil(dayDifference(effectiveFrom, anchorDate) / intervalDays) * intervalDays;
  const dates: string[] = [];
  for (let offset = firstOffset; ; offset += intervalDays) {
    const date = addPersonalGrowthDays(anchorDate, offset);
    if (date > through) break;
    if (date >= from) dates.push(date);
  }
  return dates;
}

function latestHistory(
  history: readonly PersonalGrowthHistoryEvent[],
  lane: "okraj" | "bbarak",
  occurrenceDate: string
): PersonalGrowthHistoryEvent | null {
  return history
    .filter((event) => event.lane === lane && event.occurrenceDate === occurrenceDate)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
    .at(-1) ?? null;
}

function occurrenceStatus(input: {
  target: string;
  scheduledDate: string;
  event: PersonalGrowthHistoryEvent | null;
}): "due" | "upcoming" | "overdue" | "completed" | "skipped" | "rescheduled" {
  if (input.event?.action === "completed") return "completed";
  if (input.event?.action === "skipped") return "skipped";
  if (input.event?.action === "rescheduled" && input.scheduledDate > input.target) return "rescheduled";
  if (input.scheduledDate < input.target) return "overdue";
  if (input.scheduledDate === input.target) return "due";
  return "upcoming";
}

function warnedOverpromotion(dates: readonly string[]): boolean {
  const sorted = [...dates].sort();
  return sorted.some((date, index) => {
    const end = addPersonalGrowthDays(date, 2);
    return sorted.slice(index).filter((candidate) => candidate <= end).length > 2;
  });
}

export function buildPersonalGrowthRollingPlan(input: {
  config: PersonalGrowthPlannerConfig;
  targetPragueDate: string;
  history?: readonly PersonalGrowthHistoryEvent[];
}): PersonalGrowthRollingPlan {
  const config = PersonalGrowthPlannerConfigSchema.parse(input.config);
  dateValue(input.targetPragueDate);
  const history = (input.history ?? []).map((event) => PersonalGrowthHistoryEventSchema.parse(event));
  const rangeStart = input.targetPragueDate;
  const rangeEnd = addPersonalGrowthDays(rangeStart, config.planningWindowDays - 1);
  const lookbackStart = addPersonalGrowthDays(rangeStart, -config.planningWindowDays);
  const occurrences = config.lanes.flatMap((lane) =>
    recurrenceDates(lane.recurrenceAnchorDate, lane.intervalDays, lookbackStart, rangeEnd)
      .map((originalDate) => {
        const event = latestHistory(history, lane.lane, originalDate);
        const scheduledDate = event?.action === "rescheduled" && event.rescheduledTo
          ? event.rescheduledTo
          : originalDate;
        return {
          occurrenceId: `pg-${lane.lane}-${originalDate}`,
          lane: lane.lane,
          originalDate,
          scheduledDate,
          status: occurrenceStatus({ target: input.targetPragueDate, scheduledDate, event }),
          source: event?.action === "rescheduled" ? "reschedule" as const : "recurrence" as const,
          finalUrl: event?.finalUrl ?? lane.finalUrl,
          articleUrl: event?.articleUrl ?? lane.articleUrl,
          collaborationUrl: event?.collaborationUrl ?? lane.collaborationUrl
        };
      })
      .filter((occurrence) => occurrence.scheduledDate >= rangeStart || occurrence.status === "overdue")
  ).sort((left, right) =>
    left.scheduledDate.localeCompare(right.scheduledDate)
    || left.lane.localeCompare(right.lane)
    || left.originalDate.localeCompare(right.originalDate));

  const active = occurrences.filter(({ status }) => status === "due" || status === "upcoming" || status === "overdue");
  const counts = new Map<string, number>();
  for (const occurrence of active) counts.set(occurrence.scheduledDate, (counts.get(occurrence.scheduledDate) ?? 0) + 1);
  const warnings = [
    ...(Array.from(counts.values()).some((count) => count > 1) ? ["collision" as const] : []),
    ...(active.some(({ status }) => status === "overdue") ? ["overdue" as const] : []),
    ...(warnedOverpromotion(active.map(({ scheduledDate }) => scheduledDate)) ? ["overpromotion" as const] : [])
  ];
  const strategicAnchor = config.lanes.find(({ lane }) => lane === "okraj")!.recurrenceAnchorDate;
  const strategicOffset = Math.floor(dayDifference(input.targetPragueDate, strategicAnchor) / config.strategicRhythmDays) * config.strategicRhythmDays;

  return PersonalGrowthRollingPlanSchema.parse({
    schemaVersion: "personal-growth-rolling-plan/1",
    targetPragueDate: input.targetPragueDate,
    rangeStart,
    rangeEnd,
    strategicCycleStart: addPersonalGrowthDays(strategicAnchor, strategicOffset),
    inputHash: personalGrowthHash({ config, targetPragueDate: input.targetPragueDate, history }),
    occurrences,
    warnings,
    history
  });
}

export function buildPersonalGrowthDailyBrief(input: {
  plan: PersonalGrowthRollingPlan;
  generatedAt: Date;
  dry: boolean;
  runResult?: "automatic" | "quiet" | "not-needed" | "held" | "failed" | "unavailable";
  goviralAvailability?: "available" | "unavailable" | "held" | "not-needed";
  goviralInputHash?: string | null;
  ownerManualReferenceAvailability?: "available" | "unavailable" | "held" | "not-needed";
  mainSyntheses?: 0 | 1;
  repairs?: 0 | 1;
  estimatedUsd?: number;
  existing?: PersonalGrowthDailyBrief | null;
}): PersonalGrowthDailyBrief {
  const plan = PersonalGrowthRollingPlanSchema.parse(input.plan);
  if (Number.isNaN(input.generatedAt.getTime())) throw new Error("Personal Growth generation time must be valid");
  const optionalInputs = {
    goviral: input.goviralAvailability ?? "unavailable",
    ownerManualReference: input.ownerManualReferenceAvailability ?? "unavailable"
  } as const;
  const inputHash = personalGrowthHash({
    planInputHash: plan.inputHash,
    optionalInputs,
    goviralInputHash: input.goviralInputHash ?? null,
    dry: input.dry
  });
  if (input.existing && input.existing.targetPragueDate === plan.targetPragueDate && input.existing.inputHash === inputHash) {
    return PersonalGrowthDailyBriefSchema.parse(input.existing);
  }
  const actionable = plan.occurrences.filter(({ status }) => status === "due" || status === "overdue");
  const candidate = actionable.sort((left, right) =>
    (left.status === "overdue" ? -1 : 0) - (right.status === "overdue" ? -1 : 0)
    || left.scheduledDate.localeCompare(right.scheduledDate)
    || left.lane.localeCompare(right.lane))[0] ?? null;
  const forced = input.runResult ?? "automatic";
  const roomResult = forced === "automatic"
    ? (candidate ? "planned" : "not-needed")
    : forced;
  const primary = roomResult === "planned" ? candidate : null;
  const estimatedUsd = input.dry ? 0 : input.estimatedUsd ?? 0;
  const mainSyntheses = input.dry ? 0 : input.mainSyntheses ?? 0;
  const repairs = input.dry ? 0 : input.repairs ?? 0;
  if (estimatedUsd > 0.15 || estimatedUsd < 0 || mainSyntheses > 1 || repairs > 1) {
    throw new Error("Personal Growth run exceeds its per-run authority");
  }
  const unavailable = [
    ...(optionalInputs.goviral === "unavailable" ? ["goviral" as const] : []),
    ...(optionalInputs.ownerManualReference === "unavailable" ? ["owner-manual-reference" as const] : [])
  ];
  const warnings = [
    ...plan.warnings,
    ...(unavailable.length > 0 ? ["optional-input-unavailable" as const] : [])
  ];
  const noActionReason = primary
    ? null
    : roomResult === "held"
      ? "held" as const
      : roomResult === "unavailable" || roomResult === "failed"
        ? "unavailable" as const
        : "none-due" as const;
  const timelines = plan.occurrences
    .filter(({ status }) => status === "due" || status === "overdue" || status === "upcoming")
    .slice(0, 12);
  return PersonalGrowthDailyBriefSchema.parse({
    schemaVersion: "personal-growth-daily-brief/1",
    targetPragueDate: plan.targetPragueDate,
    generatedAt: input.generatedAt.toISOString(),
    room: { kind: "pg-desk", result: roomResult },
    inputHash,
    authority: { publishingAuthorized: false, ownerWritesAllContent: true },
    budget: { dry: input.dry, mainSyntheses, deterministicValidations: 1, repairs, estimatedUsd, hardMaximumUsd: 0.15 },
    timelines,
    deadlines: Array.from(new Set(timelines.map(({ scheduledDate }) => scheduledDate))),
    primaryAction: {
      occurrenceId: primary?.occurrenceId ?? null,
      decision: primary ? "ACTION" : "NO_ACTION",
      noActionReason
    },
    platformPlaceholders: {
      threads: primary ? "owner-only-draft-placeholder" : "NO_POST",
      instagram: primary ? "owner-only-draft-placeholder" : "NO_POST",
      reel: primary ? "owner-only-draft-placeholder" : "NO_POST",
      noPostReason: primary
        ? "owner-only"
        : roomResult === "held" || roomResult === "failed" || roomResult === "unavailable"
          ? "publishing-not-authorized"
          : "none-due"
    },
    optionalInputs,
    contentMix: {
      okrajDue: actionable.filter(({ lane }) => lane === "okraj").length,
      bbarakDue: actionable.filter(({ lane }) => lane === "bbarak").length,
      collision: plan.warnings.includes("collision"),
      overpromotion: plan.warnings.includes("overpromotion")
    },
    experiment: { id: null, status: "placeholder" },
    kpi: { id: null, status: "placeholder" },
    warnings: Array.from(new Set(warnings)),
    unavailable,
    ownerOnlyActions: ["write", "edit", "approve", "publish", "record-outcome"],
    correction: input.existing?.correction ?? { revision: 0, correctedAt: null }
  });
}
