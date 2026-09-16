import { z } from "zod";
import type { TrendItem } from "./goviral-trends.js";

/**
 * The vocabulary every trend signal carries beside its number: how long the source that produced
 * it stays true, whether it is still climbing, how many independent providers show it, and the
 * one-word call the room reads first.
 *
 * All four are arithmetic over readings already in the snapshot. None of them asks a model, and
 * none of them is a target: `label` is null when there is nothing to compare against, because a
 * hashtag with no prior week is not a regular one — it is an unknown one.
 */
export const SIGNAL_WINDOWS = ["24h", "48h", "7d", "30d"] as const;
export const SignalWindowSchema = z.enum(SIGNAL_WINDOWS);
export type SignalWindow = z.infer<typeof SignalWindowSchema>;

export const SignalStatusSchema = z.enum(["active", "lasted"]);
export type SignalStatus = z.infer<typeof SignalStatusSchema>;

export const SignalLabelSchema = z.enum(["exploding", "peaked", "regular"]).nullable();
export type SignalLabel = z.infer<typeof SignalLabelSchema>;

export type FreeSignalProvider = "hn" | "google-trends" | "google-news" | "reddit";

/** The weekly scout reads hashtags off a week of posts; its readings decay on that clock. */
export const HASHTAG_WINDOW: SignalWindow = "7d";

/**
 * The half-life of each keyless source. Hacker News and Reddit front pages turn over in a day;
 * a Google Trends or News reading names a two-day story.
 */
export const FREE_SIGNAL_WINDOW: Readonly<Record<FreeSignalProvider, SignalWindow>> = {
  hn: "24h",
  reddit: "24h",
  "google-trends": "48h",
  "google-news": "48h"
};

/** One topic key for a hashtag and a free-signal topic, so `#aitools` and `AI Tools` match. */
export function normaliseTopic(text: string): string {
  return text.trim().replace(/^#+/u, "").toLowerCase().replace(/\s+/gu, " ");
}

/** Active while the reading holds or climbs; lasted once it fell below the prior one. */
export function signalStatus(delta: number | null): SignalStatus {
  return delta !== null && delta < 0 ? "lasted" : "active";
}

/**
 * The one-word call.
 *
 * `doubled` is the caller's judgement that the reading at least doubled its prior one, because
 * the comparison differs by kind: a velocity doubles, a rank does not. Breadth can promote a
 * modest rise to exploding on its own, since two independent providers agreeing is a stronger
 * signal than one provider's arithmetic.
 */
export function signalLabel(input: { delta: number | null; doubled: boolean; breadth: number }): SignalLabel {
  if (input.delta === null) return null;
  if (input.delta < 0) return "peaked";
  if (input.delta > 0 && (input.doubled || input.breadth >= 2)) return "exploding";
  return "regular";
}

/**
 * Which independent providers show each topic this week.
 *
 * A scraped platform counts once per hashtag it carried, and a free provider counts once per
 * topic it named. The two sets share one key, so a hashtag on Instagram that Hacker News also
 * ranks has breadth 2, and a hashtag seen only on Instagram has breadth 1.
 */
export interface BreadthIndex {
  readonly providersByTopic: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface FreeSignalReading {
  kind: "velocity" | "volume" | "rank";
  topic: string;
  value: number;
  scope?: string;
  topicSets: string[];
  ref: string;
}

export interface FreeSignalReadingResult<Signal extends FreeSignalReading = FreeSignalReading> {
  provider: FreeSignalProvider;
  status: "success" | "empty" | "failed";
  reason: string | null;
  signals: Signal[];
}

export function buildBreadthIndex(input: {
  items: readonly Pick<TrendItem, "platform" | "hashtags">[];
  freeSignals: readonly Pick<FreeSignalReadingResult, "provider" | "status" | "signals">[];
}): BreadthIndex {
  const providersByTopic = new Map<string, Set<string>>();
  const add = (topic: string, provider: string) => {
    const key = normaliseTopic(topic);
    if (!key) return;
    const providers = providersByTopic.get(key) ?? new Set<string>();
    providers.add(provider);
    providersByTopic.set(key, providers);
  };
  for (const item of input.items) {
    for (const hashtag of item.hashtags) add(hashtag, item.platform);
  }
  for (const result of input.freeSignals) {
    if (result.status !== "success") continue;
    for (const signal of result.signals) add(signal.topic, result.provider);
  }
  return { providersByTopic };
}

/** Never below one: the reading exists, so at least the provider that produced it shows it. */
export function breadthOf(index: BreadthIndex, topic: string): number {
  return Math.max(1, index.providersByTopic.get(normaliseTopic(topic))?.size ?? 0);
}

export interface SignalAnnotation {
  window: SignalWindow;
  status: SignalStatus;
  breadth: number;
  label: SignalLabel;
}

/**
 * The free readings, annotated against the previous snapshot's readings from the same provider.
 *
 * A rank reads the other way round — position 3 is better than position 8 — so its delta is the
 * improvement, and "doubled" never applies to it: a rank that went from 8 to 3 is a climb, not a
 * multiplication. It reaches exploding only when a second provider shows the same topic.
 */
export function annotateFreeSignals<Signal extends FreeSignalReading>(input: {
  results: readonly FreeSignalReadingResult<Signal>[];
  previous: readonly Pick<FreeSignalReadingResult<FreeSignalReading>, "provider" | "signals">[];
  index: BreadthIndex;
}): Array<FreeSignalReadingResult<Signal & SignalAnnotation>> {
  const priorByKey = new Map<string, number>();
  for (const result of input.previous) {
    for (const signal of result.signals) {
      const key = `${result.provider}:${signal.kind}:${normaliseTopic(signal.topic)}`;
      if (!priorByKey.has(key)) priorByKey.set(key, signal.value);
    }
  }
  return input.results.map((result) => ({
    ...result,
    signals: result.signals.map((signal) => {
      const prior = priorByKey.get(`${result.provider}:${signal.kind}:${normaliseTopic(signal.topic)}`) ?? null;
      const delta = prior === null ? null : signal.kind === "rank" ? prior - signal.value : signal.value - prior;
      const breadth = breadthOf(input.index, signal.topic);
      return {
        ...signal,
        window: FREE_SIGNAL_WINDOW[result.provider],
        status: signalStatus(delta),
        breadth,
        label: signalLabel({
          delta,
          doubled: signal.kind !== "rank" && prior !== null && signal.value >= 2 * prior,
          breadth
        })
      };
    })
  }));
}

/** The phrase a brief line carries: "active · 7d window · seen on 2 providers · exploding". */
export function signalPhrase(signal: SignalAnnotation): string {
  return [
    signal.status,
    `${signal.window} window`,
    `seen on ${signal.breadth} provider${signal.breadth === 1 ? "" : "s"}`,
    ...(signal.label === null ? [] : [signal.label])
  ].join(" · ");
}
