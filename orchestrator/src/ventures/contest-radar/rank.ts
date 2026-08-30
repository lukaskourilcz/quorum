import type { ContestRecord } from "../../contracts/contest-radar.js";

/**
 * Ordering opportunities by what they are worth to a person with a finite evening.
 *
 * Five components, each bounded and each explainable in one sentence, because a ranking the owner
 * cannot argue with is a ranking they stop trusting. The score is never the whole answer: a record
 * carries its components so the Admin can show *why* something is third rather than first.
 *
 * Two rules override the arithmetic outright, and both come from the founding decision rather than
 * from any judgement about value:
 *
 * - **A purchase-required contest ranks below every no-purchase one.** Not down-weighted — below.
 *   The system never buys the required product, so an opportunity that needs one is a different
 *   category of thing rather than a slightly worse version of the same thing.
 * - **A closed or rejected record does not rank at all.** It is not a low score; it is not an
 *   opportunity.
 *
 * Missing facts do not become zeros. A contest with no readable prize scores the neutral value on
 * that component, so an unmeasured contest sits mid-list rather than last — the alternative
 * silently buries every opportunity whose listing happened to be terse.
 */

export const CONTEST_RANKING_VERSION = "1.0.0";

export interface ContestRankComponent {
  id: "urgency" | "value" | "effort" | "legitimacy" | "readiness";
  /** 0 to 1, where 0.5 is "no evidence either way" rather than "bad". */
  score: number;
  weight: number;
  reason: string;
}

export interface ContestRank {
  contestId: string;
  /** Null when the record is not an opportunity at all, which is different from scoring zero. */
  score: number | null;
  components: ContestRankComponent[];
  /** Purchase-required opportunities sort into their own band, below every free one. */
  band: "free" | "purchase-required" | "not-ranked";
  reason: string;
  version: string;
}

const WEIGHTS = { urgency: 0.3, value: 0.25, effort: 0.2, legitimacy: 0.15, readiness: 0.1 } as const;

/** No evidence is 0.5, so a terse listing sits mid-list instead of last. */
const NEUTRAL = 0.5;

function daysUntil(deadline: string, today: string): number {
  const from = Date.parse(`${today}T00:00:00.000Z`);
  const to = Date.parse(`${deadline}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Number.NaN;
  return Math.round((to - from) / 86_400_000);
}

function urgency(record: ContestRecord, today: string): ContestRankComponent {
  const deadline = record.dates.deadline.value;
  if (typeof deadline !== "string") {
    return { id: "urgency", score: NEUTRAL, weight: WEIGHTS.urgency, reason: "No readable deadline." };
  }
  const days = daysUntil(deadline, today);
  if (!Number.isFinite(days)) {
    return { id: "urgency", score: NEUTRAL, weight: WEIGHTS.urgency, reason: "The deadline did not parse." };
  }
  if (days < 0) {
    return { id: "urgency", score: 0, weight: WEIGHTS.urgency, reason: `Closed ${Math.abs(days)} days ago.` };
  }
  // Closing soon is worth doing now. Beyond three weeks the difference stops mattering: it will
  // still be there tomorrow, and ranking it above something closing on Friday helps nobody.
  const score = days <= 1 ? 1 : days <= 3 ? 0.9 : days <= 7 ? 0.75 : days <= 21 ? 0.55 : 0.4;
  return { id: "urgency", score, weight: WEIGHTS.urgency, reason: `Closes in ${days} days.` };
}

/** Rough CZK equivalents, used only to compare prizes with each other. */
const TO_CZK: Record<string, number> = { CZK: 1, EUR: 25, USD: 23 };

function value(record: ContestRecord): ContestRankComponent {
  const amount = record.prize.valueAmount.value;
  const currency = record.prize.currency.value;
  if (typeof amount !== "number" || typeof currency !== "string") {
    return { id: "value", score: NEUTRAL, weight: WEIGHTS.value, reason: "No readable prize value." };
  }
  const czk = amount * (TO_CZK[currency] ?? 1);
  // A log-ish ladder rather than a linear scale: the step from 500 to 5,000 CZK matters far more
  // to an evening's choice than the step from 100,000 to 200,000.
  const score = czk >= 100_000 ? 1 : czk >= 20_000 ? 0.85 : czk >= 5_000 ? 0.7 : czk >= 1_000 ? 0.55 : 0.4;
  return { id: "value", score, weight: WEIGHTS.value, reason: `Prize around ${Math.round(czk)} CZK.` };
}

function effort(record: ContestRecord): ContestRankComponent {
  const tier = record.effort.tier;
  if (tier === "unknown") {
    return { id: "effort", score: NEUTRAL, weight: WEIGHTS.effort, reason: "No readable mechanic." };
  }
  const score = tier === "minutes" ? 1 : tier === "short" ? 0.75 : tier === "medium" ? 0.5 : 0.25;
  return { id: "effort", score, weight: WEIGHTS.effort, reason: `${record.effort.tier} effort: ${record.effort.basis}` };
}

function legitimacy(record: ContestRecord): ContestRankComponent {
  const score = record.legitimacy.state === "trusted" ? 1
    : record.legitimacy.state === "unverified" ? NEUTRAL
      : 0.1;
  return {
    id: "legitimacy",
    score,
    weight: WEIGHTS.legitimacy,
    reason: record.legitimacy.reasons[0] ?? `Legitimacy is ${record.legitimacy.state}.`
  };
}

function readiness(record: ContestRecord): ContestRankComponent {
  const score = record.readiness === "ready" ? 1
    : record.readiness === "needs-detail" ? 0.6
      : record.readiness === "needs-owner-decision" ? 0.4
        : 0.2;
  return {
    id: "readiness",
    score,
    weight: WEIGHTS.readiness,
    reason: record.readinessReasons[0] ?? `Readiness is ${record.readiness}.`
  };
}

export function rankContestRecord(record: ContestRecord, today: string): ContestRank {
  if (record.lifecycle === "closed" || record.lifecycle === "rejected" || record.lifecycle === "archived") {
    return {
      contestId: record.id,
      score: null,
      components: [],
      band: "not-ranked",
      reason: `A ${record.lifecycle} record is not an opportunity.`,
      version: CONTEST_RANKING_VERSION
    };
  }

  const components = [urgency(record, today), value(record), effort(record), legitimacy(record), readiness(record)];
  const score = components.reduce((sum, component) => sum + component.score * component.weight, 0);
  const purchase = record.cost.purchaseRequired.value === true;

  return {
    contestId: record.id,
    score: Number(score.toFixed(6)),
    components,
    band: purchase ? "purchase-required" : "free",
    reason: purchase
      ? "Ranks below every no-purchase opportunity: entering it costs money the system will not spend."
      : components.map((component) => component.reason).join(" "),
    version: CONTEST_RANKING_VERSION
  };
}

/**
 * The order the owner sees: free opportunities first, then purchase-required, then nothing else.
 *
 * The band comparison happens before the score comparison, which is what makes the founding
 * decision's rule structural rather than a heavy weight somebody could tune away.
 */
export function rankContestRecords(records: readonly ContestRecord[], today: string): ContestRank[] {
  const BAND_ORDER = { free: 0, "purchase-required": 1, "not-ranked": 2 } as const;
  return records
    .map((record) => rankContestRecord(record, today))
    .sort((left, right) =>
      BAND_ORDER[left.band] - BAND_ORDER[right.band]
      || (right.score ?? -1) - (left.score ?? -1)
      || left.contestId.localeCompare(right.contestId));
}
