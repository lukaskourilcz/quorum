import type { TehdejsiFact } from "../../contracts/tehdejsi-facts.js";
import { classifyTier } from "./gates.js";
import {
  TehdejsiShortlistSchema,
  type TehdejsiShortlist,
  type TehdejsiShortlistEntry
} from "../../contracts/tehdejsi-shortlist.js";

/**
 * Rank facts by one question: would a reader send this to someone, and what would they ask?
 *
 * Every factor is deterministic and costs nothing, which is the point — the room pays a model
 * to write, never to choose. The editorial judgement lives in the weights and is reviewable
 * here rather than hidden inside a prompt.
 */
const ASKABILITY: Readonly<Record<TehdejsiFact["kind"], number>> = {
  // Things a person lived through and can be asked about directly.
  everyday: 10,
  price: 9,
  media: 8,
  culture: 7,
  city: 5,
  // An event is the weakest send: the reader already knows it happened, and asking "were you
  // there" invites a yes or no rather than a story.
  event: 3
};

/** How close `date` sits to a five-year anniversary of the fact's own years. */
export function anniversaryScore(fact: TehdejsiFact, date: string): number {
  const year = Number(date.slice(0, 4));
  let best = 0;
  for (let subject = fact.yearFrom; subject <= fact.yearTo; subject += 1) {
    const elapsed = year - subject;
    if (elapsed <= 0) continue;
    if (elapsed % 50 === 0) best = Math.max(best, 8);
    else if (elapsed % 25 === 0) best = Math.max(best, 6);
    else if (elapsed % 10 === 0) best = Math.max(best, 4);
    else if (elapsed % 5 === 0) best = Math.max(best, 2);
  }
  return best;
}

function sourceConfidence(fact: TehdejsiFact): number {
  // A verified date is worth more than a second source: it means a human checked, and this
  // venture's whole promise is that the world it describes is the one that existed.
  return (fact.verified === null ? 0 : 4) + Math.min(fact.sources.length - 1, 2) * 2;
}

export interface ShortlistInput {
  facts: readonly TehdejsiFact[];
  factsHash: string;
  date: string;
  /** Fact ids already used, newest first. Keeps the feed from repeating itself. */
  recentlyUsedFactIds?: readonly string[];
  /** The country of the last published feature, so the feed alternates rather than drifts. */
  lastCountry?: TehdejsiFact["country"] | null;
}

export function scoreFact(fact: TehdejsiFact, input: ShortlistInput): TehdejsiShortlistEntry {
  const recent = input.recentlyUsedFactIds ?? [];
  // The tier the gate believes, not the tier the file declared. A fact typed as everyday that is
  // in fact about 1968 must not become selectable by being typed wrongly.
  const tier = classifyTier(fact).tier;
  const factors = {
    askability: ASKABILITY[fact.kind],
    anniversary: anniversaryScore(fact, input.date),
    sourceConfidence: sourceConfidence(fact),
    // Alternating is a nudge, not a rule: a strong Czech fact still beats a weak Ukrainian one.
    countryBalance: input.lastCountry && fact.country !== input.lastCountry ? 3 : 0,
    // Tier 2 is not forbidden here — it is expensive, because it costs a blocking human review.
    tierCost: tier === 2 ? -6 : tier === 1 ? -1 : 0
  };
  const score = Number(Object.values(factors).reduce((sum, value) => sum + value, 0).toFixed(4));
  const veto = tier === 2
    ? "tier-2-review-required" as const
    : recent.includes(fact.id) ? "recently-used" as const : null;
  return { rank: 1, factId: fact.id, score, factors, veto };
}

export function buildShortlist(input: ShortlistInput): TehdejsiShortlist {
  const scored = input.facts.map((fact) => scoreFact(fact, input));
  // Ties break on fact id so the same facts always produce the same order. An unstable order
  // would make a recorded shortlist unreproducible and the whole record pointless.
  scored.sort((left, right) => right.score - left.score || (left.factId < right.factId ? -1 : 1));
  return TehdejsiShortlistSchema.parse({
    schemaVersion: "tehdejsi-shortlist/1",
    date: input.date,
    factsHash: input.factsHash,
    entries: scored.map((entry, index) => ({ ...entry, rank: index + 1 }))
  });
}

/**
 * The facts a planning day may take, in rank order.
 *
 * A vetoed entry is never selected, however high it scored. Tier 2 needs a human first, and a
 * recently used fact would repeat the feed — both are correct reasons to take fewer than the
 * limit, and taking none is a correct outcome rather than a failure.
 */
export function selectableFactIds(shortlist: TehdejsiShortlist, limit = 1): string[] {
  return shortlist.entries
    .filter((entry) => entry.veto === null)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.factId);
}
