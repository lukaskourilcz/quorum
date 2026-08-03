import { z } from "zod";
import {
  KpiSetSchema,
  type KpiDirection,
  type KpiSet,
  type QuarterlyKpi
} from "../contracts/kpi-set.js";
import { DateTimeSchema, openObject } from "../contracts/common.js";
import { ensurePriorityItem } from "../priority/queue.js";
import { atomicWriteJson } from "../state.js";

const DAY_MS = 86_400_000;
export const KPI_AT_RISK_RATIO = 0.8;

export const QuarterlyKpiStatusSchema = z.enum([
  "on-track",
  "at-risk",
  "off-track",
  "unavailable"
]);

export const QuarterlyKpiEvaluationSchema = openObject({
  id: z.string().min(1),
  venture: z.string().min(1),
  name: z.string().min(1),
  unit: z.enum(["count", "ratio", "usd", "score", "boolean"]),
  actual: z.number().finite().nullable(),
  target: z.number().finite().nonnegative(),
  direction: z.enum(["at-least", "at-most"]),
  critical: z.boolean(),
  status: QuarterlyKpiStatusSchema,
  paceTarget: z.number().finite().nonnegative().nullable(),
  attainmentRatio: z.number().finite().nonnegative().nullable(),
  rampActive: z.boolean(),
  reason: z.string().min(1).max(240).nullable()
});

export const QuarterlyKpiSnapshotSchema = openObject({
  schemaVersion: z.literal("kpi-evaluation/1"),
  quarterId: z.string().regex(/^\d{4}-Q[1-4]$/),
  quarterStart: z.iso.date(),
  quarterEnd: z.iso.date(),
  evaluatedAt: DateTimeSchema,
  elapsedDays: z.number().int().min(0).max(90),
  daysRemaining: z.number().int().min(0).max(90),
  complete: z.boolean(),
  statuses: z.array(QuarterlyKpiEvaluationSchema).max(200)
});

export type QuarterlyKpiStatus = z.infer<typeof QuarterlyKpiStatusSchema>;
export type QuarterlyKpiEvaluation = z.infer<typeof QuarterlyKpiEvaluationSchema>;
export type QuarterlyKpiSnapshot = z.infer<typeof QuarterlyKpiSnapshotSchema>;
export type KpiMeasurements = Readonly<Record<string, number | null | undefined>>;

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function quarterTiming(set: KpiSet, now: Date) {
  if (Number.isNaN(now.getTime())) throw new Error("KPI evaluation date is invalid");
  const start = utcDate(set.quarter_start);
  const end = new Date(start.getTime() + ((set.quarter_days - 1) * DAY_MS));
  const closesAt = new Date(start.getTime() + (set.quarter_days * DAY_MS));
  const elapsed = Math.floor((now.getTime() - start.getTime()) / DAY_MS) + 1;
  const elapsedDays = Math.max(0, Math.min(set.quarter_days, elapsed));
  return {
    start,
    end,
    elapsedDays,
    daysRemaining: Math.max(0, set.quarter_days - elapsedDays),
    complete: now.getTime() >= closesAt.getTime()
  };
}

function targetMet(direction: KpiDirection, actual: number, target: number): boolean {
  return direction === "at-least" ? actual >= target : actual <= target;
}

function attainmentRatio(kpi: QuarterlyKpi, actual: number): number {
  if (kpi.direction === "at-least") {
    return kpi.target === 0 ? 1 : Math.max(0, actual / kpi.target);
  }
  if (actual <= kpi.target) return 1;
  return actual === 0 ? 1 : Math.max(0, kpi.target / actual);
}

function paceStatus(kpi: QuarterlyKpi, actual: number, paceTarget: number): QuarterlyKpiStatus {
  if (kpi.direction === "at-least") {
    if (paceTarget === 0 || actual >= paceTarget) return "on-track";
    return actual / paceTarget >= KPI_AT_RISK_RATIO ? "at-risk" : "off-track";
  }
  if (actual <= paceTarget) return "on-track";
  if (paceTarget === 0) return "off-track";
  return actual / paceTarget <= 1 / KPI_AT_RISK_RATIO ? "at-risk" : "off-track";
}

function unavailableReason(metricSource: string): string {
  return metricSource.startsWith("state/metrics/phase-3/")
    ? "Phase 3 measurement is not available yet."
    : "No verified measurement is connected."
}

export function evaluateQuarterlyKpis(input: {
  kpiSet: KpiSet;
  measurements: KpiMeasurements;
  now: Date;
}): QuarterlyKpiSnapshot {
  const set = KpiSetSchema.parse(input.kpiSet);
  const timing = quarterTiming(set, input.now);
  const statuses = set.kpis.map((kpi): QuarterlyKpiEvaluation => {
    const measurement = input.measurements[kpi.metric_source];
    if (measurement === null || measurement === undefined) {
      return QuarterlyKpiEvaluationSchema.parse({
        id: kpi.id,
        venture: kpi.venture,
        name: kpi.name,
        unit: kpi.unit,
        actual: null,
        target: kpi.target,
        direction: kpi.direction,
        critical: kpi.critical,
        status: "unavailable",
        paceTarget: null,
        attainmentRatio: null,
        rampActive: timing.elapsedDays > 0 && timing.elapsedDays <= kpi.ramp_days,
        reason: unavailableReason(kpi.metric_source)
      });
    }
    if (!Number.isFinite(measurement) || measurement < 0) {
      throw new Error(`Invalid KPI measurement for ${kpi.id}`);
    }
    const activeDays = Math.max(0, timing.elapsedDays - kpi.ramp_days);
    const availableDays = set.quarter_days - kpi.ramp_days;
    const paceTarget = Number((kpi.target * (activeDays / availableDays)).toFixed(8));
    const rampActive = timing.elapsedDays > 0 && activeDays === 0;
    return QuarterlyKpiEvaluationSchema.parse({
      id: kpi.id,
      venture: kpi.venture,
      name: kpi.name,
      unit: kpi.unit,
      actual: measurement,
      target: kpi.target,
      direction: kpi.direction,
      critical: kpi.critical,
      status: rampActive ? "on-track" : paceStatus(kpi, measurement, paceTarget),
      paceTarget,
      attainmentRatio: Number(attainmentRatio(kpi, measurement).toFixed(8)),
      rampActive,
      reason: rampActive ? `Pace starts after the ${kpi.ramp_days}-day Q1 ramp.` : null
    });
  });
  return QuarterlyKpiSnapshotSchema.parse({
    schemaVersion: "kpi-evaluation/1",
    quarterId: set.quarter_id,
    quarterStart: set.quarter_start,
    quarterEnd: isoDate(timing.end),
    evaluatedAt: input.now.toISOString(),
    elapsedDays: timing.elapsedDays,
    daysRemaining: timing.daysRemaining,
    complete: timing.complete,
    statuses
  });
}

export async function writeQuarterlyKpiSnapshot(
  root: string,
  snapshot: QuarterlyKpiSnapshot
): Promise<string> {
  const parsed = QuarterlyKpiSnapshotSchema.parse(snapshot);
  const relative = "kpis/latest.json";
  await atomicWriteJson(root, relative, parsed);
  return relative;
}

interface ScopeResult {
  venture: string;
  passed: number;
  total: number;
  completionRate: number;
  missedKpiIds: string[];
  criticalMisses: string[];
  reassessmentRequired: boolean;
}

function scopeResult(venture: string, statuses: readonly QuarterlyKpiEvaluation[]): ScopeResult {
  const scoped = statuses.filter((status) => status.venture === venture);
  const passed = scoped.filter((status) =>
    status.actual !== null && targetMet(status.direction, status.actual, status.target)
  ).length;
  const missed = scoped.filter((status) =>
    status.actual === null || !targetMet(status.direction, status.actual, status.target)
  );
  const completionRate = scoped.length === 0 ? 0 : passed / scoped.length;
  const criticalMisses = missed.filter((status) => status.critical).map((status) => status.id);
  return {
    venture,
    passed,
    total: scoped.length,
    completionRate: Number(completionRate.toFixed(8)),
    missedKpiIds: missed.map((status) => status.id),
    criticalMisses,
    reassessmentRequired: completionRate < 0.7 || criticalMisses.length > 0
  };
}

const VENTURE_LABELS: Record<string, string> = {
  "caught-up": "DNESKAi",
  "mma-files": "MMA Files",
  fightaiq: "FightAIQ",
  "titty-tuesdays": "Titty Tuesdays",
  incubator: "Incubator",
  board: "Board"
};

export async function runQuarterEndProtocol(input: {
  root: string;
  kpiSet: KpiSet;
  measurements: KpiMeasurements;
  now: Date;
}): Promise<{
  reportPath: string;
  ownerDigestPath: string;
  reassessmentPaths: string[];
  priorityItemIds: string[];
}> {
  const snapshot = evaluateQuarterlyKpis(input);
  if (!snapshot.complete) throw new Error(`Quarter ${snapshot.quarterId} has not ended`);
  const ventures = [...new Set(snapshot.statuses.map((status) => status.venture))];
  const results = ventures.map((venture) => scopeResult(venture, snapshot.statuses));
  const company = results.find((result) => result.venture === "company") ?? null;
  const ventureReassessments = results.filter((result) =>
    result.venture !== "company" && result.reassessmentRequired
  );
  const reportPath = `kpis/reports/${snapshot.quarterId}.json`;
  const ownerDigestPath = `notify/kpi-reassessment/${snapshot.quarterId}.json`;
  const reassessmentPaths: string[] = [];
  const priorityItemIds: string[] = [];
  for (const result of ventureReassessments) {
    const label = VENTURE_LABELS[result.venture] ?? result.venture;
    const question = `Strategy reassessment: ${label}`;
    const ensured = await ensurePriorityItem({
      root: input.root,
      venture: result.venture,
      question,
      decisionAtStake: "continue / pivot / stop",
      evidenceNeeded: [reportPath, ...result.missedKpiIds.map((id) => `kpi:${id}`)].slice(0, 12),
      requestedBy: "AUDIT",
      now: input.now,
      expires: new Date(input.now.getTime() + (90 * DAY_MS))
    });
    priorityItemIds.push(ensured.item.id);
    const path = `kpis/reassessments/${snapshot.quarterId}-${result.venture}.json`;
    reassessmentPaths.push(path);
    await atomicWriteJson(input.root, path, {
      schemaVersion: "strategy-reassessment/1",
      quarterId: snapshot.quarterId,
      venture: result.venture,
      title: question,
      decisionAtStake: "continue / pivot / stop",
      mandatoryBoardSession: true,
      priorityItemId: ensured.item.id,
      missedKpiIds: result.missedKpiIds,
      criticalMisses: result.criticalMisses,
      completionRate: result.completionRate,
      reportRef: reportPath,
      createdAt: input.now.toISOString()
    });
  }
  await Promise.all([
    atomicWriteJson(input.root, reportPath, {
      schemaVersion: "quarter-end-kpi-report/1",
      quarterId: snapshot.quarterId,
      quarterStart: snapshot.quarterStart,
      quarterEnd: snapshot.quarterEnd,
      generatedAt: input.now.toISOString(),
      results,
      statuses: snapshot.statuses
    }),
    atomicWriteJson(input.root, ownerDigestPath, {
      schemaVersion: "quarter-end-owner-packet/1",
      quarterId: snapshot.quarterId,
      generatedAt: input.now.toISOString(),
      companyStrategyReassessment: company?.reassessmentRequired === true,
      companyMissedKpiIds: company?.missedKpiIds ?? [],
      boardStrategyPacket: company?.reassessmentRequired === true
        ? {
            required: true,
            decisionAtStake: "continue / change the board operating pattern",
            reportRef: reportPath
          }
        : null,
      ventureReassessments: ventureReassessments.map((result) => ({
        venture: result.venture,
        decisionAtStake: "continue / pivot / stop",
        packetRef: `kpis/reassessments/${snapshot.quarterId}-${result.venture}.json`
      }))
    }),
    writeQuarterlyKpiSnapshot(input.root, snapshot)
  ]);
  return { reportPath, ownerDigestPath, reassessmentPaths, priorityItemIds };
}
