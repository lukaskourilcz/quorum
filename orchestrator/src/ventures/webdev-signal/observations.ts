import { createHash } from "node:crypto";
import {
  WebDevBaselineSchema,
  WebDevObservationSchema,
  type WebDevBaseline,
  type WebDevObservation
} from "../../contracts/webdev-signal.js";
import type { WebDevSelectionMetrics } from "./selection/decision.js";
import type { WebDevSourceHealth } from "./sources/collect.js";

/**
 * What WebDev Signal measures about itself, and what it deliberately does not.
 *
 * The shared systems already own metrics, experiments, health, recovery and scheduling, and this
 * module creates none of them. What it adds is the domain layer: which canonical records belong to
 * the same Prague edition day, plus the few editorial measures no shared schema has a place for —
 * whether both locales produced a valid package from the same accepted claims, whether the GoVIRAL
 * overlay changed which record won, how far ahead the winner was.
 *
 * The rule everything here follows is that a missing number stays missing. `NO_EDITION` is the
 * product working, not a failed post; a setup-held day has no audience to reach; a window nobody
 * has measured yet has no value. Averaging any of those into zero would manufacture a decline the
 * venture never had, and the first thing a 28-day baseline would then recommend is narrowing a
 * product that is behaving correctly.
 */

/** A day's outcome windows, in the order a reader would read them. */
const OUTCOME_WINDOWS = ["24h", "72h", "7d", "28d"] as const;

function unavailable(reason: WebDevObservation["decision"]["scoreMargin"]["unavailableReason"]): {
  value: null;
  unavailableReason: NonNullable<typeof reason>;
} {
  return { value: null, unavailableReason: reason! };
}

function measured(value: number): { value: number; unavailableReason: null } {
  return { value, unavailableReason: null };
}

function snapshotHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export interface WebDevEditionObservationInput {
  locale: "cs" | "en";
  state: "valid" | "held" | "absent";
  holdReasons?: readonly string[];
  claimParity?: "pass" | "fail" | "unavailable";
  accessibility?: "pass" | "fail" | "unavailable";
  renderState?: "rendered" | "held" | "absent";
  deliveryState?: "queued" | "held" | "published" | "absent" | "needs-reconciliation";
}

export function buildWebDevObservation(input: {
  date: string;
  now: string;
  provenance: "fixture" | "live";
  metrics: WebDevSelectionMetrics | null;
  health: readonly WebDevSourceHealth[];
  editions: readonly WebDevEditionObservationInput[];
  refs?: Partial<WebDevObservation["refs"]>;
  selectedRecordId?: string | null;
  scoreMargin?: number | null;
  confidence?: number | null;
  ownerOverride?: boolean;
  goviralChangedWinner?: boolean;
  corrections?: Partial<WebDevObservation["corrections"]>;
  outcomes?: ReadonlyArray<{
    window: (typeof OUTCOME_WINDOWS)[number];
    observationRef?: string | null;
    reach?: number | null;
    nonFollowerReach?: number | null;
    profileActions?: number | null;
  }>;
}): WebDevObservation {
  const attempted = input.health.filter((entry) => entry.lastAttemptAt !== null);
  const noEdition = input.metrics?.outcome === "NO_EDITION";
  // A day with no edition has no margin and no confidence to report, and saying so is different
  // from reporting them as zero — a zero margin would read as a coin-flip selection.
  const marginReason = noEdition ? "no-edition-day" : "not-measured-yet";

  const draft = {
    schemaVersion: "webdev-observation/1" as const,
    date: input.date,
    recordedAt: input.now,
    provenance: input.provenance,
    refs: {
      runRef: input.refs?.runRef ?? null,
      selectionRef: input.refs?.selectionRef ?? null,
      evidenceBriefRef: input.refs?.evidenceBriefRef ?? null,
      packageRefs: [...(input.refs?.packageRefs ?? [])],
      renderReceiptRefs: [...(input.refs?.renderReceiptRefs ?? [])],
      profileRefs: [...(input.refs?.profileRefs ?? [])],
      sourceHealthRefs: [...(input.refs?.sourceHealthRefs ?? [])]
    },
    sources: {
      configured: input.health.length,
      attempted: attempted.length,
      healthy: input.health.filter((entry) => entry.runtimeState === "healthy").length,
      failed: input.health.filter((entry) => entry.runtimeState === "failed" || entry.runtimeState === "malformed").length,
      authorityClassesCovered: new Set(
        input.health.filter((entry) => entry.itemsKept > 0).map((entry) => entry.configuredState)
      ).size,
      layoutChanges: input.health.filter((entry) => entry.layoutChanged).length
    },
    candidates: {
      fetched: input.metrics?.fetchedCandidates ?? 0,
      afterPrefilter: Math.max(0, (input.metrics?.fetchedCandidates ?? 0) - (input.metrics?.prefilterDrops ?? 0)),
      duplicatesCollapsed: (input.metrics?.exactClusters ?? 0) + (input.metrics?.fuzzyClusters ?? 0),
      held: Math.max(0, (input.metrics?.canonicalRecords ?? 0) - (input.metrics?.eligible ?? 0)),
      eligible: input.metrics?.eligible ?? 0
    },
    decision: {
      outcome: input.metrics ? input.metrics.outcome : ("not-run" as const),
      reason: input.metrics?.reason ?? "The daily scan did not run for this Prague day.",
      selectedRecordId: input.selectedRecordId ?? null,
      scoreMargin: typeof input.scoreMargin === "number" && Number.isFinite(input.scoreMargin)
        ? measured(input.scoreMargin)
        : unavailable(marginReason),
      confidence: typeof input.confidence === "number" && Number.isFinite(input.confidence)
        ? measured(input.confidence)
        : unavailable(marginReason),
      ownerOverride: input.ownerOverride ?? false
    },
    goviral: {
      status: input.metrics?.goviralStatus ?? ("unavailable" as const),
      changedWinner: input.goviralChangedWinner ?? false
    },
    editions: input.editions.map((edition) => ({
      locale: edition.locale,
      state: edition.state,
      holdReasons: [...(edition.holdReasons ?? [])],
      claimParity: edition.claimParity ?? "unavailable",
      accessibility: edition.accessibility ?? "unavailable",
      renderState: edition.renderState ?? "absent",
      deliveryState: edition.deliveryState ?? "absent"
    })),
    corrections: {
      opened: input.corrections?.opened ?? 0,
      resolved: input.corrections?.resolved ?? 0,
      factualIncidents: input.corrections?.factualIncidents ?? 0,
      securityVersionIncidents: input.corrections?.securityVersionIncidents ?? 0
    },
    cost: {
      modelCalls: input.metrics?.modelCalls ?? 0,
      providerCostUsd: input.metrics?.providerCostUsd ?? 0,
      cacheReused: input.metrics?.cacheReused ?? 0,
      callsAvoided: input.metrics?.callsAvoided ?? 0
    },
    outcomes: OUTCOME_WINDOWS.map((window) => {
      const supplied = input.outcomes?.find((entry) => entry.window === window);
      // No edition means no post, so there is no audience window to be missing. Anything else
      // that has not been collected yet is simply not measured.
      const reason = noEdition ? "no-edition-day" : "not-measured-yet";
      return {
        window,
        observationRef: supplied?.observationRef ?? null,
        reach: typeof supplied?.reach === "number" ? measured(supplied.reach) : unavailable(reason),
        nonFollowerReach: typeof supplied?.nonFollowerReach === "number" ? measured(supplied.nonFollowerReach) : unavailable(reason),
        profileActions: typeof supplied?.profileActions === "number" ? measured(supplied.profileActions) : unavailable(reason)
      };
    })
  };

  return WebDevObservationSchema.parse({ ...draft, snapshotHash: snapshotHash(draft) });
}

function rate(numerator: number, denominator: number): { numerator: number; denominator: number; rate: number | null } {
  // A zero denominator has no rate. Reporting 0 would say the thing failed every time it was
  // tried, when in fact it was never tried.
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function tally(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

/**
 * The 28-day baseline, with a verdict that refuses to be confident early.
 *
 * `INSUFFICIENT_DATA` until the window is actually full is the point of running a baseline at all:
 * a venture that has published four editions has no evidence for CONTINUE and no evidence for
 * RETIRE, and a system that produces one anyway teaches its reader to ignore the next one.
 */
export function buildWebDevBaseline(input: {
  observations: readonly WebDevObservation[];
  startsOn: string;
  endsOn: string;
}): WebDevBaseline {
  const days = input.observations.filter((entry) => entry.date >= input.startsOn && entry.date <= input.endsOn);
  const scanned = days.filter((entry) => entry.decision.outcome !== "not-run");
  const selected = scanned.filter((entry) => entry.decision.outcome === "selected");
  const noEdition = scanned.filter((entry) => entry.decision.outcome === "NO_EDITION");

  const bothValid = selected.filter((entry) =>
    entry.editions.length === 2 && entry.editions.every((edition) => edition.state === "valid"));
  const oneHeld = selected.filter((entry) =>
    entry.editions.some((edition) => edition.state === "valid") &&
    entry.editions.some((edition) => edition.state !== "valid"));
  const parityJudged = selected.flatMap((entry) => entry.editions).filter((edition) => edition.claimParity !== "unavailable");
  const accessibilityJudged = selected.flatMap((entry) => entry.editions).filter((edition) => edition.accessibility !== "unavailable");
  const publishedEditions = selected.flatMap((entry) => entry.editions).filter((edition) => edition.state === "valid");

  const margins = selected
    .map((entry) => entry.decision.scoreMargin.value)
    .filter((value): value is number => value !== null);
  const providerCostUsd = days.reduce((sum, entry) => sum + entry.cost.providerCostUsd, 0);
  const cacheReused = days.reduce((sum, entry) => sum + entry.cost.cacheReused, 0);
  const callsAvoided = days.reduce((sum, entry) => sum + entry.cost.callsAvoided, 0);

  const complete = scanned.length >= 28;
  const factualIncidents = days.reduce((sum, entry) => sum + entry.corrections.factualIncidents, 0);
  const securityVersionIncidents = days.reduce((sum, entry) => sum + entry.corrections.securityVersionIncidents, 0);

  const verdict = !complete
    ? "INSUFFICIENT_DATA" as const
    : securityVersionIncidents > 0 || factualIncidents > 0
      ? "NARROW" as const
      : selected.length === 0
        ? "PAUSE" as const
        : "CONTINUE" as const;
  const verdictReason = !complete
    ? `The window holds ${scanned.length} scanned days of 28; a verdict before it fills would not be evidence.`
    : securityVersionIncidents > 0 || factualIncidents > 0
      ? `The window is complete and carries ${factualIncidents} factual and ${securityVersionIncidents} security-version incidents, which is a scope question rather than a volume one.`
      : selected.length === 0
        ? "The window is complete and no day produced an edition, so there is nothing to continue."
        : `The window is complete: ${selected.length} of ${scanned.length} scanned days produced an edition with no factual or security-version incident.`;

  return WebDevBaselineSchema.parse({
    schemaVersion: "webdev-baseline/1",
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    observedDays: days.length,
    windowDays: 28,
    editorial: {
      daysWithValidScan: scanned.length,
      eligibleStoryRate: rate(selected.length, scanned.length),
      noEditionRate: rate(noEdition.length, scanned.length),
      noEditionReasons: tally(noEdition.map((entry) => entry.decision.reason)),
      factualIncidents,
      securityVersionIncidents,
      duplicatesCollapsed: days.reduce((sum, entry) => sum + entry.candidates.duplicatesCollapsed, 0),
      selectionMargin: {
        minimum: margins.length > 0 ? Math.min(...margins) : null,
        median: median(margins),
        maximum: margins.length > 0 ? Math.max(...margins) : null
      }
    },
    editionQuality: {
      // Denominator is days that selected a story: a NO_EDITION day had no package to hold.
      bothLocalesValidRate: rate(bothValid.length, selected.length),
      oneLocaleHeldRate: rate(oneHeld.length, selected.length),
      holdReasons: tally(selected.flatMap((entry) => entry.editions.flatMap((edition) => edition.holdReasons))),
      claimParityRate: rate(parityJudged.filter((edition) => edition.claimParity === "pass").length, parityJudged.length),
      accessibilityRate: rate(accessibilityJudged.filter((edition) => edition.accessibility === "pass").length, accessibilityJudged.length)
    },
    publishing: {
      // Denominator is editions that were actually valid, not days. Nothing held or absent was
      // ever offered to a platform, so counting it as a publish failure would be false.
      verifiedPublishRate: rate(
        publishedEditions.filter((edition) => edition.deliveryState === "published").length,
        publishedEditions.length
      ),
      reach: unavailable("provider-unavailable"),
      nonFollowerReach: unavailable("provider-unavailable"),
      costPerAcceptedEditionUsd: selected.length === 0
        ? unavailable("denominator-empty")
        : measured(Number((providerCostUsd / selected.length).toFixed(6)))
    },
    cost: {
      modelCalls: days.reduce((sum, entry) => sum + entry.cost.modelCalls, 0),
      providerCostUsd: Number(providerCostUsd.toFixed(6)),
      cacheReuseRate: rate(cacheReused, cacheReused + callsAvoided)
    },
    verdict,
    verdictReason
  });
}

/**
 * The knobs a weekly evaluator may turn, and the wall it cannot climb.
 *
 * Everything on this list is a preference between things already permitted. Nothing on it can make
 * a secondary source into factual authority, lower a gate, widen a budget or grant a scope — those
 * are owner decisions and stay owner decisions however much evidence accumulates, because the
 * evidence a learning loop collects is exactly the evidence that would argue for loosening them.
 */
export const WEBDEV_LEARNABLE_KNOBS = [
  "source-priority-within-authority-class",
  "duplicate-cooldown-weight",
  "topic-cooldown-weight",
  "project-cooldown-weight",
  "presentation-prior",
  "timing-prior",
  "reserve-template-preference",
  "goviral-momentum-cap-downward",
  "source-reaudit-recommendation",
  "cache-reuse-opportunity"
] as const;

export type WebDevLearnableKnob = (typeof WEBDEV_LEARNABLE_KNOBS)[number];

export interface WebDevLearningProposal {
  knob: WebDevLearnableKnob;
  /** What the evidence says, in one sentence a reader can check against the baseline. */
  rationale: string;
  evidenceRefs: string[];
  /** Applied only where the change is strictly narrowing; everything else waits for the owner. */
  disposition: "proposed" | "applied";
}

export interface WebDevLearningRun {
  schemaVersion: "webdev-learning-run/1";
  date: string;
  baselineRef: string | null;
  proposals: WebDevLearningProposal[];
  /** Why nothing was proposed, when nothing was. Silence with no reason reads as a broken step. */
  reason: string;
}

/**
 * One deterministic pass over the baseline. No model call, no new schedule, no new store.
 *
 * It proposes rather than applies by default, and the one thing it may apply on its own is a
 * downward GoVIRAL cap — narrowing an optional input that the evidence says is not helping is the
 * only change that cannot make the product louder, wider or more expensive.
 */
export function evaluateWebDevLearning(input: {
  baseline: WebDevBaseline;
  date: string;
  baselineRef?: string | null;
  observations: readonly WebDevObservation[];
}): WebDevLearningRun {
  const proposals: WebDevLearningProposal[] = [];

  if (input.baseline.verdict === "INSUFFICIENT_DATA") {
    return {
      schemaVersion: "webdev-learning-run/1",
      date: input.date,
      baselineRef: input.baselineRef ?? null,
      proposals: [],
      reason: input.baseline.verdictReason
    };
  }

  const overlayDays = input.observations.filter((entry) => entry.goviral.status === "used");
  if (overlayDays.length >= 7 && overlayDays.every((entry) => !entry.goviral.changedWinner)) {
    proposals.push({
      knob: "goviral-momentum-cap-downward",
      rationale: `The overlay was used on ${overlayDays.length} days and changed the winner on none of them.`,
      evidenceRefs: overlayDays.map((entry) => `state/ventures/webdev-signal/observations/${entry.date}.json`),
      // Narrowing an optional input is the one move that needs no owner decision: it can only
      // reduce what the desk reads, never widen it.
      disposition: "applied"
    });
  }

  const parity = input.baseline.editionQuality.claimParityRate;
  if (parity.rate !== null && parity.rate < 1) {
    proposals.push({
      knob: "reserve-template-preference",
      rationale: `Claim parity passed on ${parity.numerator} of ${parity.denominator} judged editions, so a locale is losing claims the other keeps.`,
      evidenceRefs: input.baselineRef ? [input.baselineRef] : [],
      disposition: "proposed"
    });
  }

  const duplicates = input.baseline.editorial.duplicatesCollapsed;
  if (duplicates === 0 && input.baseline.editorial.daysWithValidScan >= 14) {
    proposals.push({
      knob: "duplicate-cooldown-weight",
      rationale: "Two weeks of scans collapsed no duplicates, which usually means the window is too narrow rather than that the sources never repeat.",
      evidenceRefs: input.baselineRef ? [input.baselineRef] : [],
      disposition: "proposed"
    });
  }

  return {
    schemaVersion: "webdev-learning-run/1",
    date: input.date,
    baselineRef: input.baselineRef ?? null,
    proposals,
    reason: proposals.length > 0
      ? `${proposals.length} bounded ${proposals.length === 1 ? "proposal" : "proposals"} from a complete window.`
      : "A complete window produced no bounded change worth making."
  };
}
