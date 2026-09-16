import { z } from "zod";
import { atomicWriteJson, readJson } from "../state.js";
import {
  SignalSourceKindSchema,
  SignalStatusSchema,
  SignalWindowSchema,
  buildRawSignals,
  hoursSinceFlag,
  lastedBucket,
  expiryFor,
  loadGoViralSignalScoringConfig,
  scoreSignals,
  stormRetrigger,
  type GoViralSignalScoringConfig,
  type ScoredSignal
} from "./goviral-signal-score.js";
import type { GoViralTrends } from "./goviral-trends.js";

/**
 * When each signal was first flagged, and when PULSE let it go.
 *
 * The register is the only place a "first flagged on" date exists, and the only reason the keyless
 * free signals have a prior reading at all — unlike the paid hashtag signals, they carry no
 * week-over-week delta of their own, so without this file the relative-growth component would
 * never have a baseline to measure against.
 *
 * Two rules govern it. **A first-flagged date is written once and never rewritten**, because the
 * whole point of the field is to say how long something has been running, and a date that moves
 * with every sighting says nothing. And **a retirement is named with its reason**, never a silent
 * disappearance — a signal that dropped off the register with no line explaining why is
 * indistinguishable from a signal nobody looked at.
 *
 * One writer: `refreshGoViralTrends`. Everything else reads.
 */
export const SIGNAL_REGISTER_PATH = "goviral/signals/register.json";

const RegisterEntrySchema = z.strictObject({
  key: z.string().min(1).max(160),
  topic: z.string().min(1).max(160),
  topicSet: z.string().max(80).nullable(),
  sourceKind: SignalSourceKindSchema,
  /** Written on the first sighting and never rewritten. A storm re-trigger does not move it. */
  firstFlaggedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  /** Where the ceiling is measured from: the first flag, or the last storm that restarted it. */
  windowAnchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  lastSeenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  lastValue: z.number().finite(),
  lastScore: z.number().min(0).max(100),
  lastStatus: SignalStatusSchema,
  expiresAt: z.string(),
  stormRetriggeredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable()
});

const RetiredSignalSchema = z.strictObject({
  key: z.string().min(1).max(160),
  topic: z.string().min(1).max(160),
  sourceKind: SignalSourceKindSchema,
  reason: z.string().min(1).max(240),
  retiredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  firstFlaggedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  lastScore: z.number().min(0).max(100),
  lastStatus: SignalStatusSchema,
  window: SignalWindowSchema,
  lastedHours: z.number().int().nonnegative()
});

export const GoViralSignalRegisterSchema = z.strictObject({
  schemaVersion: z.literal("goviral-signal-register/1"),
  updatedAt: z.string(),
  entries: z.array(RegisterEntrySchema).max(5_000),
  /** The last retirements, kept so the weekly brief can name what was dropped and why. */
  recentlyRetired: z.array(RetiredSignalSchema).max(20)
});

export type GoViralSignalRegister = z.infer<typeof GoViralSignalRegisterSchema>;
export type SignalRegisterEntry = z.infer<typeof RegisterEntrySchema>;
export type RetiredSignal = z.infer<typeof RetiredSignalSchema>;

export function emptySignalRegister(now: Date): GoViralSignalRegister {
  return {
    schemaVersion: "goviral-signal-register/1",
    updatedAt: now.toISOString(),
    entries: [],
    recentlyRetired: []
  };
}

/**
 * Parse-or-empty. A register that will not parse costs the week's baseline, never the run.
 *
 * The `try` covers unreadable bytes as well as an unexpected shape, because `readJson` throws on
 * malformed JSON and a half-written file is exactly the case this has to survive. An empty
 * register means every signal is flagged fresh this week — a loss of history, not a failure.
 */
export async function readSignalRegister(root: string, now: Date): Promise<GoViralSignalRegister> {
  let stored: unknown = null;
  try {
    stored = await readJson<unknown>(root, SIGNAL_REGISTER_PATH, null);
  } catch {
    return emptySignalRegister(now);
  }
  const parsed = GoViralSignalRegisterSchema.safeParse(stored);
  return parsed.success ? parsed.data : emptySignalRegister(now);
}

export async function writeSignalRegister(root: string, register: GoViralSignalRegister): Promise<string> {
  await atomicWriteJson(root, SIGNAL_REGISTER_PATH, GoViralSignalRegisterSchema.parse(register));
  return SIGNAL_REGISTER_PATH;
}

export function priorValueLookup(register: GoViralSignalRegister): (key: string) => number | null {
  const byKey = new Map(register.entries.map((entry) => [entry.key, entry]));
  return (key) => byKey.get(key)?.lastValue ?? null;
}

export function firstFlaggedLookup(register: GoViralSignalRegister): (key: string) => string | null {
  const byKey = new Map(register.entries.map((entry) => [entry.key, entry]));
  return (key) => byKey.get(key)?.firstFlaggedOn ?? null;
}

function retire(
  entry: SignalRegisterEntry,
  reason: string,
  window: RetiredSignal["window"],
  input: { date: string; now: Date; config: GoViralSignalScoringConfig }
): RetiredSignal {
  return {
    key: entry.key,
    topic: entry.topic,
    sourceKind: entry.sourceKind,
    reason,
    retiredOn: input.date,
    firstFlaggedOn: entry.firstFlaggedOn,
    lastScore: entry.lastScore,
    lastStatus: entry.lastStatus,
    window,
    lastedHours: lastedBucket(hoursSinceFlag(entry.firstFlaggedOn, input.now), input.config)
  };
}

/**
 * Fold this week's scored signals into the register, and retire what PULSE should let go.
 *
 * Three outcomes, and the difference between them is the expiry rule working:
 *
 * - A signal measured this run and still inside its window keeps its first-flagged date and gets a
 *   fresh expiry.
 * - A signal measured this run but already past its window is retired anyway, **unless** it came
 *   back at least `stormRule.minimumMultiplier` times its previous score. Something that keeps
 *   reappearing weakly past its window is noise, and letting it live forever would make the window
 *   mean nothing.
 * - A signal nobody measured this run is `lasted` rather than active, and is retired once its
 *   stored expiry passes.
 *
 * A storm restarts the ceiling but never the first-flagged date: how long a subject has been
 * running and how long this surge may last are two different facts.
 */
export function reconcileSignalRegister(input: {
  register: GoViralSignalRegister;
  scored: readonly ScoredSignal[];
  date: string;
  now: Date;
  config: GoViralSignalScoringConfig;
}): { register: GoViralSignalRegister; retired: RetiredSignal[]; kept: ScoredSignal[] } {
  const priorByKey = new Map(input.register.entries.map((entry) => [entry.key, entry]));
  const measured = new Set(input.scored.map((signal) => signal.key));
  const entries: SignalRegisterEntry[] = [];
  const retired: RetiredSignal[] = [];
  const kept: ScoredSignal[] = [];

  for (const signal of input.scored) {
    const prior = priorByKey.get(signal.key);
    const window = input.config.windows[signal.sourceKind];
    const expired = prior !== undefined && input.now.getTime() > Date.parse(prior.expiresAt);
    const storm = expired && stormRetrigger({
      previousScore: prior?.lastScore ?? null,
      currentScore: signal.score,
      config: input.config
    });
    const anchor = storm ? input.date : prior?.windowAnchor ?? signal.firstFlaggedOn;
    const overCeiling = hoursSinceFlag(anchor, input.now) > window.maximumHours;
    if (prior && expired && !storm) {
      retired.push(retire(prior, `Past its ${window.halfLifeHours}h ${signal.sourceKind} window and back at ${signal.score} against ${prior.lastScore}, short of the ${input.config.stormRule.minimumMultiplier}× storm re-trigger.`, "active", input));
      continue;
    }
    if (prior && overCeiling) {
      retired.push(retire(prior, `Ran past the ${window.maximumHours}h ceiling for a ${signal.sourceKind} signal, counted from ${anchor}.`, "active", input));
      continue;
    }
    kept.push(signal);
    entries.push({
      key: signal.key,
      topic: signal.topic,
      topicSet: signal.topicSet,
      sourceKind: signal.sourceKind,
      firstFlaggedOn: prior?.firstFlaggedOn ?? signal.firstFlaggedOn,
      windowAnchor: anchor,
      lastSeenOn: input.date,
      lastValue: signal.value,
      lastScore: signal.score,
      lastStatus: signal.status,
      expiresAt: expiryFor({ sourceKind: signal.sourceKind, measuredAt: input.now, config: input.config }),
      stormRetriggeredOn: storm ? input.date : prior?.stormRetriggeredOn ?? null
    });
  }

  for (const entry of input.register.entries) {
    if (measured.has(entry.key)) continue;
    if (input.now.getTime() > Date.parse(entry.expiresAt)) {
      const window = input.config.windows[entry.sourceKind];
      retired.push(retire(entry, `Nothing measured it this week and its ${window.halfLifeHours}h ${entry.sourceKind} window has closed.`, "lasted", input));
      continue;
    }
    entries.push(entry);
  }

  // The cap drops the least recently seen first, and says so. An entry that leaves because the
  // register is full has not been judged uninteresting, and the reason has to read that way.
  const ordered = entries.sort((left, right) => right.lastSeenOn.localeCompare(left.lastSeenOn) || left.key.localeCompare(right.key, "en"));
  for (const overflow of ordered.slice(input.config.registerCap)) {
    retired.push(retire(overflow, `Dropped by the ${input.config.registerCap}-entry register cap as the least recently seen signal, not by a judgement about it.`, "lasted", input));
  }

  return {
    register: GoViralSignalRegisterSchema.parse({
      schemaVersion: "goviral-signal-register/1",
      updatedAt: input.now.toISOString(),
      entries: ordered.slice(0, input.config.registerCap),
      recentlyRetired: retired.slice(0, 20)
    }),
    retired,
    kept
  };
}

/**
 * Score the week's readings, fold them into the register and hand back both.
 *
 * The one write path, and it is free. Every input is a reading the run already paid for or got for
 * nothing: no model is called, no host is contacted, no Apify credit is touched. A scoring config
 * that will not load costs the scoring and nothing else — the snapshot still ships unrated, which
 * is the failure posture every other source in this file follows.
 */
export async function scoreAndRegisterSignals(input: {
  root: string;
  date: string;
  now: Date;
  trends: Pick<GoViralTrends, "signals" | "freeSignals">;
  refs: readonly string[];
  configRoot?: string;
}): Promise<{ scoredSignals: ScoredSignal[]; retired: RetiredSignal[]; artifactPaths: string[] }> {
  let config: GoViralSignalScoringConfig;
  try {
    config = await loadGoViralSignalScoringConfig(input.configRoot);
  } catch (error) {
    console.warn(JSON.stringify({
      event: "goviral_signal_scoring_unavailable",
      date: input.date,
      reason: error instanceof Error ? error.message : String(error)
    }));
    return { scoredSignals: [], retired: [], artifactPaths: [] };
  }
  const register = await readSignalRegister(input.root, input.now);
  const raw = buildRawSignals({
    trends: input.trends,
    priorValue: priorValueLookup(register),
    refs: input.refs,
    config
  });
  const scored = scoreSignals({
    signals: raw,
    firstFlaggedOn: firstFlaggedLookup(register),
    date: input.date,
    now: input.now,
    config
  });
  const reconciled = reconcileSignalRegister({ register, scored, date: input.date, now: input.now, config });
  const artifactPaths = [await writeSignalRegister(input.root, reconciled.register)];
  // The snapshot's own cap. The register keeps everything; the artifact carries the ranked head.
  return { scoredSignals: reconciled.kept.slice(0, 40), retired: reconciled.retired, artifactPaths };
}
