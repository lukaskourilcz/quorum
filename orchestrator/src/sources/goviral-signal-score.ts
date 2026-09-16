import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { configRoot as defaultConfigRoot } from "../paths.js";
import type { GoViralTrends } from "./goviral-trends.js";

/**
 * One defensible number per signal, and one word for what it is doing.
 *
 * GoVIRAL rates inventory across five ventures, so "this is rising" has to become something a
 * reader can check and a room can rank. Three rules from the founding decision survive intact
 * here, and each one shapes the arithmetic rather than sitting beside it:
 *
 * - **A silent signal is never negative evidence.** A component nobody could measure is `null`,
 *   not `0`, and the score renormalizes over the components that *were* measured. A source that
 *   was down therefore cannot lower a score, which is the whole difference between a quiet week
 *   and an outage.
 * - **Rank-only data is rank.** A Reddit position never reaches the absolute-volume component.
 *   It can corroborate that a source named the topic — that is breadth — and nothing more.
 * - **Provider results stay separate rather than merged.** Volume is normalized inside its own
 *   source kind, because a search-traffic estimate, an article count and a hashtag's post count
 *   are different units; breadth counts operators rather than adding their figures together; and
 *   every component keeps its raw value and its weight on the scored signal, so the composite is
 *   always decomposable back into the readings it came from.
 *
 * Nothing here reads a clock, calls a model, opens a socket or costs a cent: every function takes
 * `now` as an argument and reads only what the run already collected.
 */

export const SignalProviderSchema = z.enum(["hn", "google-trends", "google-news", "reddit", "apify-social"]);
export const SignalSourceKindSchema = z.enum(["search-spike", "viral-post", "news-volume", "social-tag", "format-shift"]);
export const SignalStatusSchema = z.enum(["exploding", "regular", "peaked"]);
export const SignalWindowSchema = z.enum(["active", "lasted"]);
export const ScoreComponentNameSchema = z.enum(["relative-growth", "absolute-volume", "source-breadth"]);

export type SignalProvider = z.infer<typeof SignalProviderSchema>;
export type SignalSourceKind = z.infer<typeof SignalSourceKindSchema>;
export type SignalStatus = z.infer<typeof SignalStatusSchema>;
export type ScoreComponentName = z.infer<typeof ScoreComponentNameSchema>;

const WindowSchema = z.strictObject({
  halfLifeHours: z.number().int().min(1).max(4_320),
  maximumHours: z.number().int().min(1).max(8_760)
});

export const GoViralSignalScoringConfigSchema = z.strictObject({
  schemaVersion: z.literal("goviral-signal-scoring/1"),
  scoringVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  $comment: z.string().optional(),
  $statusComment: z.string().optional(),
  $providerComment: z.string().optional(),
  $windowComment: z.string().optional(),
  $volumeComment: z.string().optional(),
  weights: z.record(ScoreComponentNameSchema, z.number().min(0).max(1)),
  statusThresholds: z.strictObject({
    explodingScore: z.number().min(0).max(100),
    peakedGrowth: z.number().min(-1).max(0),
    breakoutPercent: z.number().min(100).max(100_000)
  }),
  sourceKinds: z.record(SignalProviderSchema, SignalSourceKindSchema),
  independenceGroups: z.record(SignalProviderSchema, z.string().regex(/^[a-z0-9-]+$/u).max(40)),
  windows: z.record(SignalSourceKindSchema, WindowSchema),
  volumeCeilings: z.record(SignalSourceKindSchema, z.number().positive().max(10_000_000)),
  stormRule: z.strictObject({
    minimumMultiplier: z.number().min(1).max(20),
    lookbackDays: z.number().int().min(1).max(90)
  }),
  registerCap: z.number().int().min(10).max(5_000),
  lastedBucketsHours: z.array(z.number().int().min(1).max(8_760)).min(1).max(8)
// A `z.record` over an enum key already refuses a partial or extended map, so every provider has
// a source kind, an operator and a window by construction. These two checks are the ones the key
// schema cannot make: that the weights are a distribution, and that a ceiling cannot sit below
// the half-life it is supposed to cap.
}).superRefine((config, context) => {
  const total = ScoreComponentNameSchema.options.reduce((sum, name) => sum + config.weights[name], 0);
  if (Math.abs(total - 1) > 1e-9) {
    context.addIssue({ code: "custom", path: ["weights"], message: "component weights must sum to exactly 1" });
  }
  for (const kind of SignalSourceKindSchema.options) {
    if (config.windows[kind].maximumHours < config.windows[kind].halfLifeHours) {
      context.addIssue({ code: "custom", path: ["windows", kind], message: "a ceiling below the half-life would retire a signal before its first window closed" });
    }
  }
});

export type GoViralSignalScoringConfig = z.infer<typeof GoViralSignalScoringConfigSchema>;

export async function loadGoViralSignalScoringConfig(configRoot = defaultConfigRoot): Promise<GoViralSignalScoringConfig> {
  return GoViralSignalScoringConfigSchema.parse(
    JSON.parse(await readFile(path.join(configRoot, "goviral-signal-scoring.json"), "utf8"))
  );
}

export const ScoreComponentSchema = z.strictObject({
  name: ScoreComponentNameSchema,
  /** `null` when nothing measured it. An unmeasured component is renormalized away, never scored 0. */
  rawValue: z.number().finite().nullable(),
  weight: z.number().min(0).max(1),
  contribution: z.number().finite().nullable(),
  note: z.string().max(160)
});

export const ScoredSignalSchema = z.strictObject({
  key: z.string().min(1).max(160),
  topic: z.string().min(1).max(160),
  topicSet: z.string().max(80).nullable(),
  provider: SignalProviderSchema,
  sourceKind: SignalSourceKindSchema,
  /** What the provider measured. Carried through so a consumer can still refuse a rank. */
  measurement: z.enum(["velocity", "volume", "rank", "count"]),
  value: z.number().finite(),
  components: z.array(ScoreComponentSchema).length(3),
  score: z.number().min(0).max(100),
  status: SignalStatusSchema,
  window: SignalWindowSchema,
  /** Google Trends' own Breakout marker, applied to our arithmetic — never parsed from Google. */
  breakout: z.boolean(),
  firstFlaggedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  measuredAt: z.string(),
  expiresAt: z.string(),
  lastedHours: z.number().int().nonnegative(),
  breadthProviders: z.array(z.string().max(40)).max(8),
  evidenceRefs: z.array(z.string().max(160)).max(6)
});

export type ScoreComponent = z.infer<typeof ScoreComponentSchema>;
export type ScoredSignal = z.infer<typeof ScoredSignalSchema>;

/** One measured reading, before the register and the config have had their say. */
export interface RawSignal {
  provider: SignalProvider;
  sourceKind: SignalSourceKind;
  measurement: ScoredSignal["measurement"];
  topic: string;
  topicSet: string | null;
  value: number;
  /** The same reading from the previous snapshot, when there was one. `null` is "we do not know". */
  priorValue: number | null;
  evidenceRefs: string[];
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Case-folded and punctuation-free, so the same topic from two providers collapses to one key. */
export function normalizeTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/^#/u, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function signalKey(signal: Pick<RawSignal, "sourceKind" | "topic">): string {
  return `${signal.sourceKind}:${normalizeTopic(signal.topic)}`.slice(0, 160);
}

/**
 * Whether two readings name the same subject.
 *
 * Substring containment on the normalized text, the same blunt rule `matchDictionary` uses and for
 * the same reason: a fuzzy matcher here would manufacture breadth rather than find it. The
 * four-character floor is what stops "ai" from corroborating every headline on the internet.
 */
export function sharesTopic(left: string, right: string): boolean {
  const a = normalizeTopic(left);
  const b = normalizeTopic(right);
  if (a.length < 4 || b.length < 4) return a === b && a.length > 0;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Growth against the same reading a week ago, and the Breakout marker.
 *
 * The denominator has a floor of 1: a topic that went from nothing to something would otherwise
 * divide by zero and read as infinite growth, which is a sure way to rank a single article above
 * a real surge. Breakout is our arithmetic reaching Google's published threshold, not a field
 * Google sent — the RSS feed this repository reads carries no such marker.
 */
export function relativeGrowth(
  signal: Pick<RawSignal, "value" | "priorValue">,
  config: GoViralSignalScoringConfig
): { ratio: number | null; breakout: boolean } {
  if (signal.priorValue === null) return { ratio: null, breakout: false };
  const ratio = (signal.value - signal.priorValue) / Math.max(signal.priorValue, 1);
  return { ratio: round(ratio), breakout: ratio * 100 >= config.statusThresholds.breakoutPercent };
}

/**
 * Absolute size, normalized inside its own source kind and never across kinds.
 *
 * Log-scaled because attention is: the step from 10 articles to 100 is the interesting one, and
 * the step from 10,000 to 10,090 is not. A rank has no size at all and returns `null`.
 */
export function absoluteVolume(
  signal: Pick<RawSignal, "measurement" | "sourceKind" | "value">,
  config: GoViralSignalScoringConfig
): number | null {
  if (signal.measurement === "rank") return null;
  if (signal.value <= 0) return 0;
  const ceiling = config.volumeCeilings[signal.sourceKind];
  return round(clamp(Math.log1p(signal.value) / Math.log1p(ceiling), 0, 1));
}

/** The operators that answered this run at all. The denominator breadth is measured against. */
export function answeringGroups(
  signals: readonly RawSignal[],
  config: GoViralSignalScoringConfig
): string[] {
  return [...new Set(signals.map((signal) => config.independenceGroups[signal.provider]))].sort();
}

/**
 * How many independent operators named this subject.
 *
 * Operators, not providers: Google Trends and Google News are one company looking at itself, and
 * Instagram and Threads are another, so neither pair can manufacture breadth alone. The
 * denominator is the operators that answered rather than the operators configured, because a
 * source that was down must not cost a signal its standing.
 */
export function sourceBreadth(
  signal: Pick<RawSignal, "topic">,
  signals: readonly RawSignal[],
  config: GoViralSignalScoringConfig
): { ratio: number | null; groups: string[] } {
  const answering = answeringGroups(signals, config);
  const groups = [...new Set(
    signals
      .filter((candidate) => sharesTopic(candidate.topic, signal.topic))
      .map((candidate) => config.independenceGroups[candidate.provider])
  )].sort();
  // Breadth across a single operator is not a measurement of breadth. It is one source, which we
  // already knew, so the component is absent rather than full.
  if (answering.length < 2) return { ratio: null, groups };
  return { ratio: round(clamp(groups.length / answering.length, 0, 1)), groups };
}

function component(
  name: ScoreComponentName,
  rawValue: number | null,
  note: string,
  config: GoViralSignalScoringConfig
): ScoreComponent {
  const weight = config.weights[name];
  const bounded = rawValue === null ? null : round(clamp(rawValue, -1, 1));
  return {
    name,
    rawValue: bounded,
    weight,
    contribution: bounded === null ? null : round(bounded * weight * 100),
    note
  };
}

/**
 * The composite, renormalized over the components that exist.
 *
 * Dividing by the weight actually measured is what keeps silence neutral: a signal with no prior
 * week is scored on volume and breadth alone rather than carrying a zero it did not earn. The
 * floor at zero is deliberate — a declining signal ranks at the bottom and its *status* says
 * peaked, because the score is a rank and not a verdict.
 */
export function compositeScore(components: readonly ScoreComponent[]): number | null {
  const measured = components.filter((entry) => entry.rawValue !== null);
  const weight = measured.reduce((sum, entry) => sum + entry.weight, 0);
  if (measured.length === 0 || weight <= 0) return null;
  const total = measured.reduce((sum, entry) => sum + (entry.rawValue ?? 0) * entry.weight, 0);
  return round(clamp((total / weight) * 100, 0, 100));
}

/**
 * One word for what a signal is doing, in Exploding Topics' vocabulary.
 *
 * Order is the whole meaning: a clear decline is peaked whatever the composite says, because a
 * large falling trend still scores well on volume and breadth and calling that exploding is the
 * exact mistake the label exists to prevent.
 */
export function signalStatus(input: {
  score: number;
  growth: number | null;
  breakout: boolean;
  config: GoViralSignalScoringConfig;
}): SignalStatus {
  if (input.breakout) return "exploding";
  if (input.growth !== null && input.growth <= input.config.statusThresholds.peakedGrowth) return "peaked";
  if (input.score >= input.config.statusThresholds.explodingScore && (input.growth ?? 0) > 0) return "exploding";
  return "regular";
}

/** Noon on the flag date, the same convention `snapshotAgeDays` uses for date-only arithmetic. */
export function hoursSinceFlag(firstFlaggedOn: string, now: Date): number {
  const from = Date.parse(`${firstFlaggedOn}T12:00:00Z`);
  if (Number.isNaN(from)) return 0;
  return Math.max(Math.floor((now.getTime() - from) / 3_600_000), 0);
}

/** How long it has run, in Google Trends' buckets. Derived here; no feed we read publishes it. */
export function lastedBucket(hours: number, config: GoViralSignalScoringConfig): number {
  return [...config.lastedBucketsHours].sort((left, right) => left - right)
    .reduce((bucket, candidate) => (hours >= candidate ? candidate : bucket), 0);
}

export function expiryFor(input: {
  sourceKind: SignalSourceKind;
  measuredAt: Date;
  config: GoViralSignalScoringConfig;
}): string {
  const hours = input.config.windows[input.sourceKind].halfLifeHours;
  return new Date(input.measuredAt.getTime() + hours * 3_600_000).toISOString();
}

/**
 * Whether a signal that outlived its window came back big enough to count as a new storm.
 *
 * Without this, anything that keeps reappearing weakly past its window would live forever and the
 * expiry would mean nothing. With it, only a genuine re-acceleration survives — and the register's
 * ceiling still stops even a storm from running indefinitely.
 */
export function stormRetrigger(input: {
  previousScore: number | null;
  currentScore: number;
  config: GoViralSignalScoringConfig;
}): boolean {
  if (input.previousScore === null || input.previousScore <= 0) return false;
  return input.currentScore >= input.previousScore * input.config.stormRule.minimumMultiplier;
}

/**
 * Score every measured reading of the week.
 *
 * `firstFlaggedOn` is supplied by the caller from the register, never invented here: the scorer is
 * pure and the register is the one writer of that date.
 */
export function scoreSignals(input: {
  signals: readonly RawSignal[];
  firstFlaggedOn: (key: string) => string | null;
  date: string;
  now: Date;
  config: GoViralSignalScoringConfig;
}): ScoredSignal[] {
  const scored: ScoredSignal[] = [];
  for (const signal of input.signals) {
    const growth = relativeGrowth(signal, input.config);
    const breadth = sourceBreadth(signal, input.signals, input.config);
    const components = [
      component("relative-growth", growth.breakout ? 1 : growth.ratio, growth.ratio === null
        ? "No prior reading to compare against."
        : `Against last week's ${round(signal.priorValue ?? 0)}.`, input.config),
      component("absolute-volume", absoluteVolume(signal, input.config), signal.measurement === "rank"
        ? "A rank carries position and no size; it is never read as volume."
        : `Normalized inside ${signal.sourceKind}.`, input.config),
      component("source-breadth", breadth.ratio, breadth.ratio === null
        ? "Fewer than two independent operators answered; breadth is unmeasured."
        : `${breadth.groups.length} of ${answeringGroups(input.signals, input.config).length} answering operators.`, input.config)
    ];
    const score = compositeScore(components);
    if (score === null) continue;
    const key = signalKey(signal);
    const firstFlaggedOn = input.firstFlaggedOn(key) ?? input.date;
    scored.push(ScoredSignalSchema.parse({
      key,
      topic: signal.topic.slice(0, 160),
      topicSet: signal.topicSet,
      provider: signal.provider,
      sourceKind: signal.sourceKind,
      measurement: signal.measurement,
      value: round(signal.value),
      components,
      score,
      status: signalStatus({ score, growth: growth.ratio, breakout: growth.breakout, config: input.config }),
      // Everything reaching this function was measured in this run, so it is running now. A
      // carried-forward entry nobody re-measured is the `lasted` case, and the register owns it.
      window: "active",
      breakout: growth.breakout,
      firstFlaggedOn,
      measuredAt: input.now.toISOString(),
      expiresAt: expiryFor({ sourceKind: signal.sourceKind, measuredAt: input.now, config: input.config }),
      lastedHours: lastedBucket(hoursSinceFlag(firstFlaggedOn, input.now), input.config),
      breadthProviders: breadth.groups,
      evidenceRefs: signal.evidenceRefs.slice(0, 6)
    }));
  }
  return scored.sort((left, right) => right.score - left.score || left.key.localeCompare(right.key, "en"));
}

/**
 * The week's readings, drawn from what the run already collected and nothing else.
 *
 * Paid hashtag signals carry their own week-over-week delta, so their prior reading is recoverable
 * from the snapshot. The keyless free signals carry no delta at all, which is why the register
 * exists: it is the only place last week's value for those survives.
 */
export function buildRawSignals(input: {
  trends: Pick<GoViralTrends, "signals" | "freeSignals">;
  priorValue: (key: string) => number | null;
  refs: readonly string[];
  config: GoViralSignalScoringConfig;
}): RawSignal[] {
  const refs = [...input.refs].slice(0, 6);
  const raw: RawSignal[] = [];
  for (const hashtag of input.trends.signals.topHashtags) {
    raw.push({
      provider: "apify-social",
      sourceKind: input.config.sourceKinds["apify-social"],
      measurement: "velocity",
      topic: hashtag.hashtag,
      topicSet: hashtag.topicSet,
      value: hashtag.engagementPerHour,
      priorValue: hashtag.weekOverWeekDelta === null
        ? input.priorValue(signalKey({ sourceKind: "social-tag", topic: hashtag.hashtag }))
        : round(hashtag.engagementPerHour - hashtag.weekOverWeekDelta),
      evidenceRefs: refs
    });
  }
  for (const format of input.trends.signals.topFormats) {
    raw.push({
      provider: "apify-social",
      sourceKind: "format-shift",
      measurement: "count",
      topic: format.format,
      topicSet: null,
      value: format.items,
      priorValue: input.priorValue(signalKey({ sourceKind: "format-shift", topic: format.format })),
      evidenceRefs: refs
    });
  }
  for (const result of input.trends.freeSignals) {
    // A failed or empty provider contributes nothing. It does not contribute a zero.
    if (result.status !== "success") continue;
    const sourceKind = input.config.sourceKinds[result.provider];
    for (const signal of result.signals) {
      const topicSet = signal.topicSets[0]
        ?? (signal.scope?.startsWith("topic-set:") ? signal.scope.split(":")[1] ?? null : null);
      raw.push({
        provider: result.provider,
        sourceKind,
        measurement: signal.kind,
        topic: signal.topic,
        topicSet,
        value: signal.value,
        priorValue: input.priorValue(signalKey({ sourceKind, topic: signal.topic })),
        evidenceRefs: [signal.ref]
      });
    }
  }
  return raw;
}
