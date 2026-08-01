import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AdjustmentEntrySchema, ModelRunSchema, MmaOrgSchema, type ModelRun } from "../contracts/mma.js";
import { configRoot } from "../paths.js";

const ModelConfigSchema = z.object({
  schemaVersion: z.literal("mma-model/1"),
  release: z.string().regex(/^\d+\.\d+\.\d+$/),
  baseRating: z.number().finite(),
  baseDeviation: z.number().finite().positive(),
  marketBlendWeight: z.number().finite().min(0).max(0.5),
  splitLegBand: z.number().finite().gt(0).lte(0.1),
  divergenceTolerance: z.number().finite().gt(0).lte(0.15),
  features: z.object({
    agePeakStart: z.number().int().min(18).max(40),
    agePeakEnd: z.number().int().min(18).max(45),
    ageDeclinePerYearPct: z.number().finite().min(0).max(1),
    layoffThresholdDays: z.number().int().positive(),
    layoffPenaltyPct: z.number().finite().min(0).max(3),
    reachPerFiveCmPct: z.number().finite().min(0).max(1),
    shortNoticePenaltyPct: z.number().finite().min(0).max(3),
    missedWeightPenaltyPct: z.number().finite().min(0).max(3),
    recentKoLossPenaltyPct: z.number().finite().min(0).max(3),
    homeRegionPct: z.number().finite().min(0).max(2),
    featureTotalCapPct: z.number().finite().gt(0).max(8)
  }),
  methodPrior: z.number().finite().positive().max(10),
  isotonicMinimumResolvedBouts: z.number().int().min(150),
  notes: z.record(z.string(), z.string().min(1))
}).superRefine((config, context) => {
  if (config.features.agePeakEnd < config.features.agePeakStart) {
    context.addIssue({ code: "custom", message: "Age peak end must not precede the start", path: ["features", "agePeakEnd"] });
  }
});

export type MmaModelConfig = z.infer<typeof ModelConfigSchema>;

export interface FighterModelInput {
  ref: string;
  org: z.infer<typeof MmaOrgSchema>;
  rating: number;
  deviation: number;
  age: number;
  reachCm: number | null;
  layoffDays: number;
  shortNotice: boolean;
  missedWeight: boolean;
  recentKoLoss: boolean;
  homeRegion: boolean;
  methodWins: { koTko: number; submission: number; decision: number };
  modelEligible: boolean;
}

export interface BoutModelInput {
  boutRef: string;
  red: FighterModelInput;
  blue: FighterModelInput;
  marketDecimal?: { red: number; blue: number };
  adjustments?: unknown[];
  eventStartsAt: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export async function loadMmaModelConfig(filePath = path.join(configRoot, "mma-model.json")): Promise<MmaModelConfig> {
  return ModelConfigSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

export function modelVersion(config: MmaModelConfig): string {
  return `mma-${config.release}+${sha256(config).slice(0, 8)}`;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function deVig(redDecimal: number, blueDecimal: number): { red: number; blue: number } {
  if (redDecimal <= 1 || blueDecimal <= 1) throw new Error("Decimal odds must exceed one");
  const red = 1 / redDecimal;
  const blue = 1 / blueDecimal;
  return { red: red / (red + blue), blue: blue / (red + blue) };
}

function glickoExpected(red: FighterModelInput, blue: FighterModelInput): number {
  const scale = 173.7178;
  const redMu = (red.rating - 1500) / scale;
  const blueMu = (blue.rating - 1500) / scale;
  const bluePhi = blue.deviation / scale;
  const g = 1 / Math.sqrt(1 + (3 * bluePhi ** 2) / Math.PI ** 2);
  return 1 / (1 + Math.exp(-g * (redMu - blueMu)));
}

function featureShift(red: FighterModelInput, blue: FighterModelInput, config: MmaModelConfig): number {
  const f = config.features;
  const agePenalty = (fighter: FighterModelInput) => Math.max(0, fighter.age - f.agePeakEnd) * f.ageDeclinePerYearPct;
  let shift = agePenalty(blue) - agePenalty(red);
  if (red.layoffDays > f.layoffThresholdDays) shift -= f.layoffPenaltyPct;
  if (blue.layoffDays > f.layoffThresholdDays) shift += f.layoffPenaltyPct;
  if (red.reachCm !== null && blue.reachCm !== null) shift += ((red.reachCm - blue.reachCm) / 5) * f.reachPerFiveCmPct;
  if (red.shortNotice) shift -= f.shortNoticePenaltyPct;
  if (blue.shortNotice) shift += f.shortNoticePenaltyPct;
  if (red.missedWeight) shift -= f.missedWeightPenaltyPct;
  if (blue.missedWeight) shift += f.missedWeightPenaltyPct;
  if (red.recentKoLoss) shift -= f.recentKoLossPenaltyPct;
  if (blue.recentKoLoss) shift += f.recentKoLossPenaltyPct;
  if (red.homeRegion) shift += f.homeRegionPct;
  if (blue.homeRegion) shift -= f.homeRegionPct;
  return clamp(shift, -f.featureTotalCapPct, f.featureTotalCapPct) / 100;
}

function methodDistribution(red: FighterModelInput, blue: FighterModelInput, prior: number) {
  const values = {
    koTko: red.methodWins.koTko + blue.methodWins.koTko + prior,
    submission: red.methodWins.submission + blue.methodWins.submission + prior,
    decision: red.methodWins.decision + blue.methodWins.decision + prior
  };
  const total = values.koTko + values.submission + values.decision;
  return { koTko: values.koTko / total, submission: values.submission / total, decision: values.decision / total };
}

function round(value: number): number {
  return Number(value.toFixed(8));
}

export function runMmaModel(input: { config: MmaModelConfig; bouts: BoutModelInput[]; createdAt: string }): ModelRun {
  const createdAt = new Date(input.createdAt);
  if (Number.isNaN(createdAt.getTime())) throw new Error("Model run time is invalid");
  const bouts = input.bouts.map((bout) => {
    if (bout.red.org !== bout.blue.org) throw new Error("Cross-organization bouts require an explicit bridge record before model use");
    if (!bout.red.modelEligible || !bout.blue.modelEligible) throw new Error(`${bout.boutRef} has a fighter without corroborated model fields`);
    const eventStart = new Date(bout.eventStartsAt);
    if (Number.isNaN(eventStart.getTime())) throw new Error("Event start is invalid");
    const raw = clamp(glickoExpected(bout.red, bout.blue) + featureShift(bout.red, bout.blue, input.config), 0.02, 0.98);
    const market = bout.marketDecimal ? deVig(bout.marketDecimal.red, bout.marketDecimal.blue) : null;
    const blendedBeforeAdjustment = market ? raw * (1 - input.config.marketBlendWeight) + market.red * input.config.marketBlendWeight : raw;
    const adjustments = (bout.adjustments ?? []).map((adjustment) => AdjustmentEntrySchema.parse(adjustment));
    const active = adjustments.filter((adjustment) => new Date(adjustment.expiresAt).getTime() >= createdAt.getTime() && createdAt.getTime() < eventStart.getTime());
    const adjustment = active.reduce((total, item) => total + (item.direction === "red" ? item.deltaPct : -item.deltaPct), 0) / 100;
    const blended = clamp(blendedBeforeAdjustment + adjustment, 0.02, 0.98);
    const inBand = blended >= 0.5 - input.config.splitLegBand && blended <= 0.5 + input.config.splitLegBand;
    const divergence = market ? Math.abs(raw - market.red) : 0;
    const uncertainty = inBand
      ? market && divergence > input.config.divergenceTolerance ? "divergence" : "coin-flip"
      : Math.abs(blended - 0.5) >= 0.15 ? "clear-lean" : "lean";
    return {
      boutRef: bout.boutRef,
      probabilities: {
        redWin: round(raw),
        blueWin: round(1 - raw),
        method: Object.fromEntries(Object.entries(methodDistribution(bout.red, bout.blue, input.config.methodPrior)).map(([key, value]) => [key, round(value)])) as { koTko: number; submission: number; decision: number },
        uncertainty,
        ...(market ? { marketRedWin: round(market.red) } : {}),
        blendedRedWin: round(blended)
      },
      adjustmentsApplied: active,
      excludedInputs: adjustments.filter((item) => !active.includes(item)).map((item) => `expired:${item.evidenceRef}`)
    };
  });
  const configHash = sha256(input.config);
  return ModelRunSchema.parse({
    schemaVersion: "model-run/1",
    modelVersion: modelVersion(input.config),
    inputsHash: sha256(input.bouts),
    configHash,
    bouts,
    createdAt: createdAt.toISOString()
  });
}

export function calibration(predictions: Array<{ probability: number; outcome: 0 | 1 }>) {
  if (predictions.length === 0) return { sampleSize: 0, brier: null, logLoss: null };
  const brier = predictions.reduce((sum, item) => sum + (item.probability - item.outcome) ** 2, 0) / predictions.length;
  const logLoss = -predictions.reduce((sum, item) => {
    const probability = clamp(item.probability, 0.000001, 0.999999);
    return sum + item.outcome * Math.log(probability) + (1 - item.outcome) * Math.log(1 - probability);
  }, 0) / predictions.length;
  return { sampleSize: predictions.length, brier: round(brier), logLoss: round(logLoss) };
}

export interface HistoricalBout { org: z.infer<typeof MmaOrgSchema>; red: string; blue: string; outcome: "red" | "blue"; happenedAt: string }

export function seedRatings(history: HistoricalBout[], baseRating = 1500): Record<string, { rating: number; deviation: number }> {
  const ratings: Record<string, { rating: number; deviation: number }> = {};
  for (const bout of [...history].sort((left, right) => left.happenedAt.localeCompare(right.happenedAt))) {
    const redKey = `${bout.org}:${bout.red}`;
    const blueKey = `${bout.org}:${bout.blue}`;
    const red = ratings[redKey] ?? { rating: baseRating, deviation: 350 };
    const blue = ratings[blueKey] ?? { rating: baseRating, deviation: 350 };
    const expected = 1 / (1 + 10 ** ((blue.rating - red.rating) / 400));
    const score = bout.outcome === "red" ? 1 : 0;
    const change = 24 * (score - expected);
    ratings[redKey] = { rating: round(red.rating + change), deviation: round(Math.max(60, red.deviation * 0.97)) };
    ratings[blueKey] = { rating: round(blue.rating - change), deviation: round(Math.max(60, blue.deviation * 0.97)) };
  }
  return ratings;
}
