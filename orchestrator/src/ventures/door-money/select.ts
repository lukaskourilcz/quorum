import { createHash } from "node:crypto";
import { DateSchema } from "../../contracts/common.js";
import {
  PERFORMANCE_PRIOR_MAX,
  PERFORMANCE_PRIOR_MIN,
  type PerformanceHookStyle
} from "../../contracts/performance-weights.js";
import type { BookKbChunk } from "../../contracts/book-kb-index.js";
import type { VentureRecommendation } from "../../contracts/venture-recommendation.js";

export type DoorMoneyFormat = VentureRecommendation["formats"][number];
export type BookScoreAxis = keyof BookKbChunk["scores"];

export interface FormatSelectionRule {
  threshold: number;
  axisWeights: Readonly<Partial<Record<BookScoreAxis, number>>>;
}

export type DoorMoneyFormatRules = Readonly<Record<DoorMoneyFormat, FormatSelectionRule>>;

export const DEFAULT_DOOR_MONEY_FORMAT_RULES: DoorMoneyFormatRules = {
  carousel: {
    threshold: 3.4,
    axisWeights: {
      carouselPotential: 4,
      storytellingStrength: 2,
      shareability: 2,
      bookCuriosityPotential: 1
    }
  },
  "single-image": {
    threshold: 3.4,
    axisWeights: {
      quotePotential: 4,
      shareability: 3,
      emotionalImpact: 1,
      bookCuriosityPotential: 1
    }
  },
  thread: {
    threshold: 3.4,
    axisWeights: {
      threadPotential: 4,
      storytellingStrength: 2,
      educationalValue: 2,
      bookCuriosityPotential: 1
    }
  },
  caption: {
    threshold: 3.4,
    axisWeights: {
      relatability: 3,
      quotePotential: 2,
      emotionalImpact: 2,
      bookCuriosityPotential: 2
    }
  },
  "short-video-script": {
    threshold: 3.4,
    axisWeights: {
      shortVideoPotential: 4,
      entertainment: 2,
      storytellingStrength: 2,
      bookCuriosityPotential: 1
    }
  }
};

/** Selection refuses unbounded feedback even before the DM-20 weight contract is loaded. */
export const MIN_SELECTION_PRIOR = PERFORMANCE_PRIOR_MIN;
export const MAX_SELECTION_PRIOR = PERFORMANCE_PRIOR_MAX;

export interface SelectionPerformanceWeights {
  formatPriors?: Readonly<Partial<Record<DoorMoneyFormat, number>>>;
  themePriors?: Readonly<Record<string, number>>;
  hookStylePriors?: Readonly<Partial<Record<PerformanceHookStyle, number>>>;
}

export interface SelectionTrendBrief {
  tactics: ReadonlyArray<{ description: string }>;
}

/** Trend context is a tiebreaker, never a substitute for the recorded passage score. */
export const DOOR_MONEY_TREND_MULTIPLIER = 1.05;

export interface PassageFormatScore {
  format: DoorMoneyFormat;
  baseScore: number;
  performanceMultiplier: number;
  trendMultiplier: number;
  weightedScore: number;
  threshold: number;
}

export interface SelectedPassage {
  chunkId: BookKbChunk["id"];
  chapterId: BookKbChunk["chapterId"];
  sceneId: BookKbChunk["sceneId"];
  arc: BookKbChunk["arc"];
  themes: BookKbChunk["themes"];
  hookStyle: PerformanceHookStyle;
  scoresAtSelection: BookKbChunk["scores"];
  primaryFormat: DoorMoneyFormat;
  formatScores: PassageFormatScore[];
  rotationKey: number;
}

export interface SelectionDiagnostics {
  considered: number;
  eligible: number;
  excluded: {
    scoreThreshold: number;
    chapterCooldown: number;
    themeCooldown: number;
    arcRepeat: number;
  };
}

export type PassageSelectionOutcome = {
  kind: "selected";
  seed: string;
  passages: SelectedPassage[];
  diagnostics: SelectionDiagnostics;
} | {
  kind: "quiet-day";
  seed: string;
  reason: "no-eligible-passages";
  passages: [];
  diagnostics: SelectionDiagnostics;
};

export interface SelectDoorMoneyPassagesInput {
  ventureId: "door-money";
  date: string;
  chunks: readonly BookKbChunk[];
  performanceWeights?: SelectionPerformanceWeights;
  trendBrief?: SelectionTrendBrief | null;
  formatRules?: DoorMoneyFormatRules;
  maxPassages?: 1 | 2;
}

const DAY_MS = 86_400_000;
const MIN_COOLDOWN_DAYS = 21;
const ARC_GUARD_DAYS = 7;

function dateNumber(value: string): number {
  return Date.parse(`${DateSchema.parse(value)}T00:00:00.000Z`);
}

function elapsedDays(earlier: string, later: string): number {
  return Math.round((dateNumber(later) - dateNumber(earlier)) / DAY_MS);
}

function prior(value: number | undefined, label: string): number {
  const resolved = value ?? 1;
  if (!Number.isFinite(resolved) || resolved < MIN_SELECTION_PRIOR || resolved > MAX_SELECTION_PRIOR) {
    throw new Error(`${label} must stay between ${MIN_SELECTION_PRIOR} and ${MAX_SELECTION_PRIOR}`);
  }
  return resolved;
}

function themePrior(chunk: BookKbChunk, weights: SelectionPerformanceWeights): number {
  if (chunk.themes.length === 0) return 1;
  const values = chunk.themes.map((theme) => prior(weights.themePriors?.[theme], `Theme prior ${theme}`));
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function comparable(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ").replace(/\s+/gu, " ").trim();
}

export function doorMoneyTrendingThemes(
  brief: SelectionTrendBrief | null | undefined,
  themes: readonly string[]
): string[] {
  if (!brief) return [];
  const haystack = comparable(brief.tactics
    .filter(({ description }) => description.startsWith("Trend call:"))
    .map(({ description }) => description.slice("Trend call:".length))
    .join(" "));
  return [...new Set(themes)]
    .filter((theme) => {
      const needle = comparable(theme);
      return needle.length >= 3 && ` ${haystack} `.includes(` ${needle} `);
    })
    .sort();
}

/** A passage's prospective hook style is derived only from its recorded selection scores. */
export function doorMoneyHookStyle(scores: BookKbChunk["scores"]): PerformanceHookStyle {
  const candidates: Array<{ style: PerformanceHookStyle; score: number }> = [
    { style: "narrative-led", score: scores.storytellingStrength.score },
    { style: "quote-led", score: scores.quotePotential.score },
    { style: "lesson-led", score: scores.educationalValue.score },
    { style: "tension-led", score: Math.max(scores.emotionalImpact.score, scores.shock.score, scores.controversy.score) },
    { style: "humor-led", score: scores.humor.score }
  ];
  return candidates.reduce((best, candidate) => candidate.score > best.score ? candidate : best).style;
}

export function scorePassageForFormat(input: {
  chunk: BookKbChunk;
  format: DoorMoneyFormat;
  rule?: FormatSelectionRule;
  performanceWeights?: SelectionPerformanceWeights;
  trendThemes?: ReadonlySet<string>;
}): PassageFormatScore {
  const rule = input.rule ?? DEFAULT_DOOR_MONEY_FORMAT_RULES[input.format];
  if (!Number.isFinite(rule.threshold) || rule.threshold < 0 || rule.threshold > 5) {
    throw new Error(`Format threshold for ${input.format} must be between 0 and 5`);
  }
  const weightedAxes = Object.entries(rule.axisWeights) as Array<[BookScoreAxis, number]>;
  if (weightedAxes.length === 0 || weightedAxes.some(([, weight]) => !Number.isFinite(weight) || weight <= 0)) {
    throw new Error(`Format ${input.format} needs positive finite axis weights`);
  }
  const weightTotal = weightedAxes.reduce((sum, [, weight]) => sum + weight, 0);
  const baseScore = weightedAxes.reduce((sum, [axis, weight]) =>
    sum + input.chunk.scores[axis].score * weight, 0) / weightTotal;
  const performanceWeights = input.performanceWeights ?? {};
  const hookStyle = doorMoneyHookStyle(input.chunk.scores);
  const combinedMultiplier = prior(
    performanceWeights.formatPriors?.[input.format],
    `Format prior ${input.format}`
  ) * themePrior(input.chunk, performanceWeights) * prior(
    performanceWeights.hookStylePriors?.[hookStyle],
    `Hook-style prior ${hookStyle}`
  );
  const performanceMultiplier = Math.min(MAX_SELECTION_PRIOR, Math.max(MIN_SELECTION_PRIOR, combinedMultiplier));
  const trendMultiplier = input.chunk.themes.some((theme) => input.trendThemes?.has(theme))
    ? DOOR_MONEY_TREND_MULTIPLIER
    : 1;
  return {
    format: input.format,
    baseScore,
    performanceMultiplier,
    trendMultiplier,
    weightedScore: baseScore * performanceMultiplier * trendMultiplier,
    threshold: rule.threshold
  };
}

interface DimensionHistory {
  chapters: Map<string, string[]>;
  themes: Map<string, string[]>;
  arcs: Map<string, string[]>;
}

function addHistory(target: Map<string, Set<string>>, key: string | null, date: string): void {
  if (key === null) return;
  const dates = target.get(key) ?? new Set<string>();
  dates.add(date);
  target.set(key, dates);
}

function selectionHistory(chunks: readonly BookKbChunk[], targetDate: string): DimensionHistory {
  const chapters = new Map<string, Set<string>>();
  const themes = new Map<string, Set<string>>();
  const arcs = new Map<string, Set<string>>();
  for (const chunk of chunks) {
    for (const usage of chunk.usageHistory) {
      DateSchema.parse(usage.recommendedOn);
      // Today's record is ignored so an idempotent rebuild reaches the same selection.
      if (usage.recommendedOn >= targetDate) continue;
      addHistory(chapters, chunk.chapterId, usage.recommendedOn);
      chunk.themes.forEach((theme) => addHistory(themes, theme, usage.recommendedOn));
      addHistory(arcs, chunk.arc, usage.recommendedOn);
    }
  }
  const sort = (source: Map<string, Set<string>>): Map<string, string[]> => new Map(
    [...source].map(([key, dates]) => [key, [...dates].sort()])
  );
  return { chapters: sort(chapters), themes: sort(themes), arcs: sort(arcs) };
}

export function adaptiveCooldownDays(useDates: readonly string[]): number {
  const ordered = [...new Set(useDates.map((date) => DateSchema.parse(date)))].sort();
  if (ordered.length < 2) return MIN_COOLDOWN_DAYS;
  const interval = elapsedDays(ordered.at(-2)!, ordered.at(-1)!);
  return Math.max(interval * 2, MIN_COOLDOWN_DAYS);
}

function cooldownActive(useDates: readonly string[] | undefined, targetDate: string): boolean {
  if (!useDates?.length) return false;
  const lastUsed = useDates.at(-1)!;
  return elapsedDays(lastUsed, targetDate) < adaptiveCooldownDays(useDates);
}

function arcRecentlyUsed(useDates: readonly string[] | undefined, targetDate: string): boolean {
  if (!useDates?.length) return false;
  const elapsed = elapsedDays(useDates.at(-1)!, targetDate);
  return elapsed > 0 && elapsed <= ARC_GUARD_DAYS;
}

function seededUnit(seed: string, candidate: string): number {
  const digest = createHash("sha256").update(`${seed}\n${candidate}`).digest("hex");
  const integer = Number.parseInt(digest.slice(0, 13), 16);
  return (integer + 1) / (0x1_0000_0000_0000 + 1);
}

function rotationKey(seed: string, chunkId: string, score: number): number {
  // A deterministic weighted lottery rotates survivors while preserving the score signal.
  return -Math.log(seededUnit(seed, chunkId)) / Math.max(score, Number.EPSILON);
}

const FORMATS = Object.keys(DEFAULT_DOOR_MONEY_FORMAT_RULES) as DoorMoneyFormat[];

export function selectDoorMoneyPassages(input: SelectDoorMoneyPassagesInput): PassageSelectionOutcome {
  const date = DateSchema.parse(input.date);
  const seed = `${date}:${input.ventureId}`;
  const rules = input.formatRules ?? DEFAULT_DOOR_MONEY_FORMAT_RULES;
  const history = selectionHistory(input.chunks, date);
  const trendThemes = new Set(doorMoneyTrendingThemes(
    input.trendBrief,
    input.chunks.flatMap(({ themes }) => themes)
  ));
  const diagnostics: SelectionDiagnostics = {
    considered: input.chunks.length,
    eligible: 0,
    excluded: { scoreThreshold: 0, chapterCooldown: 0, themeCooldown: 0, arcRepeat: 0 }
  };
  const candidates: SelectedPassage[] = [];

  for (const chunk of input.chunks) {
    const formatScores = FORMATS.map((format) => scorePassageForFormat({
      chunk,
      format,
      rule: rules[format],
      performanceWeights: input.performanceWeights,
      trendThemes
    }))
      .filter(({ baseScore, threshold }) => baseScore >= threshold)
      .sort((left, right) => right.weightedScore - left.weightedScore || left.format.localeCompare(right.format));
    if (formatScores.length === 0) {
      diagnostics.excluded.scoreThreshold += 1;
      continue;
    }
    if (cooldownActive(history.chapters.get(chunk.chapterId), date)) {
      diagnostics.excluded.chapterCooldown += 1;
      continue;
    }
    if (chunk.themes.some((theme) => cooldownActive(history.themes.get(theme), date))) {
      diagnostics.excluded.themeCooldown += 1;
      continue;
    }
    if (chunk.arc && arcRecentlyUsed(history.arcs.get(chunk.arc), date)) {
      diagnostics.excluded.arcRepeat += 1;
      continue;
    }
    const primary = formatScores[0]!;
    candidates.push({
      chunkId: chunk.id,
      chapterId: chunk.chapterId,
      sceneId: chunk.sceneId,
      arc: chunk.arc,
      themes: [...chunk.themes],
      hookStyle: doorMoneyHookStyle(chunk.scores),
      scoresAtSelection: chunk.scores,
      primaryFormat: primary.format,
      formatScores,
      rotationKey: rotationKey(seed, chunk.id, primary.weightedScore)
    });
  }

  candidates.sort((left, right) =>
    left.rotationKey - right.rotationKey || left.chunkId.localeCompare(right.chunkId));
  diagnostics.eligible = candidates.length;
  const passages: SelectedPassage[] = [];
  for (const candidate of candidates) {
    if (passages.some((selected) =>
      selected.chapterId === candidate.chapterId ||
      (selected.arc !== null && selected.arc === candidate.arc) ||
      selected.themes.some((theme) => candidate.themes.includes(theme)))) {
      continue;
    }
    passages.push(candidate);
    if (passages.length === (input.maxPassages ?? 2)) break;
  }

  return passages.length === 0
    ? { kind: "quiet-day", seed, reason: "no-eligible-passages", passages: [], diagnostics }
    : { kind: "selected", seed, passages, diagnostics };
}
