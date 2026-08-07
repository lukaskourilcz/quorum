import { createHash } from "node:crypto";
import { z } from "zod";
import {
  patternIsTruthful,
  type Brand,
  type HookPattern
} from "./config.js";
import { truthSubjectOf, type NormalizedQuestion } from "./bank.js";

export const ServedEntrySchema = z.object({
  date: z.iso.date(),
  epoch: z.number().int().positive(),
  questionId: z.string().min(1),
  hookA: z.string().min(1),
  hookB: z.string().min(1),
  /** True when the cooldown had to be relaxed to find two eligible patterns that day. */
  relaxed: z.boolean().default(false),
  package: z.string().min(1)
});
export type ServedEntry = z.infer<typeof ServedEntrySchema>;

export const BrandLedgerSchema = z.object({
  epoch: z.number().int().positive(),
  orderSeed: z.string().regex(/^[a-f0-9]{64}$/),
  /** The bank hash the current order was seeded from, recorded beside the epoch. */
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  served: z.array(ServedEntrySchema),
  reshuffles: z.array(z.object({
    epoch: z.number().int().positive(),
    date: z.iso.date(),
    reason: z.string().min(1)
  }))
});
export type BrandLedger = z.infer<typeof BrandLedgerSchema>;

export const MarketingSharkLedgerSchema = z.object({
  schemaVersion: z.literal("marketingshark-ledger/1"),
  brands: z.record(z.string(), BrandLedgerSchema)
});
export type MarketingSharkLedger = z.infer<typeof MarketingSharkLedgerSchema>;

export const EMPTY_LEDGER: MarketingSharkLedger = {
  schemaVersion: "marketingshark-ledger/1",
  brands: {}
};

export function orderSeedFor(epoch: number, contentHash: string): string {
  return createHash("sha256").update(`${epoch}:${contentHash}`).digest("hex");
}

/**
 * The epoch's serving order: every id keyed by the seed, then sorted by that key.
 *
 * A global Fisher-Yates over the id list would also be deterministic, and it is what the founding
 * brief described. It is not what this does, for one reason: a shuffle is a property of the whole
 * list, so importing thirty new questions renumbers every draw after the first insertion point and
 * silently reorders the entire remaining queue. Keying each id independently makes the order a
 * property of the id, so a re-import leaves the relative order of every existing question exactly
 * as it was and the new ones take their own places in it.
 *
 * The deviation is visible in one behaviour: new questions interleave rather than landing at the
 * tail. That is the better of the two -- a tail rule would park a question imported today behind
 * three thousand others for the better part of a decade -- and it costs nothing the brief asked
 * for, because every guarantee it named still holds: same epoch and same bank hash give the same
 * order forever, served history survives a re-import untouched, and no question repeats before the
 * epoch is exhausted.
 */
export function epochOrder(questionIds: readonly string[], orderSeed: string): string[] {
  const keyed = questionIds.map((id) => ({
    id,
    key: createHash("sha256").update(`${orderSeed}:${id}`).digest("hex")
  }));
  keyed.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : left.id < right.id ? -1 : 1));
  return keyed.map((entry) => entry.id);
}

export function brandLedgerFor(
  ledger: MarketingSharkLedger,
  brandId: string,
  contentHash: string
): BrandLedger {
  const existing = ledger.brands[brandId];
  if (existing) return existing;
  return {
    epoch: 1,
    orderSeed: orderSeedFor(1, contentHash),
    contentHash,
    served: [],
    reshuffles: []
  };
}

export interface QuestionSelection {
  questionId: string;
  epoch: number;
  /** Set when this date already had an entry: the room is a no-op and must not double-serve. */
  alreadyServed: ServedEntry | null;
  reshuffle: { epoch: number; date: string; reason: string } | null;
  /** The brand node as it must be persisted, including any epoch or hash change. */
  brandLedger: BrandLedger;
}

/**
 * Today's question for one brand, idempotently.
 *
 * Reruns, backstop sweeps and a manual dispatch on a morning that already ran all reach step 3,
 * and all three have to reach the same answer without serving a second question. The date is the
 * key, not the invocation.
 */
export function selectQuestion(input: {
  ledger: MarketingSharkLedger;
  brandId: string;
  date: string;
  questionIds: readonly string[];
  contentHash: string;
}): QuestionSelection {
  const { brandId, date, questionIds, contentHash } = input;
  if (questionIds.length === 0) throw new Error(`${brandId} has an empty question bank`);

  let brand = brandLedgerFor(input.ledger, brandId, contentHash);

  const today = brand.served.find((entry) => entry.date === date);
  if (today) {
    return { questionId: today.questionId, epoch: today.epoch, alreadyServed: today, reshuffle: null, brandLedger: brand };
  }

  // A re-import changes the hash. The epoch, its seed and the served history all stand: only the
  // record of which hash the order was last derived from moves, so the change is visible without
  // disturbing the rotation.
  if (brand.contentHash !== contentHash) {
    brand = { ...brand, contentHash };
  }

  const servedThisEpoch = new Set(
    brand.served.filter((entry) => entry.epoch === brand.epoch).map((entry) => entry.questionId)
  );
  const order = epochOrder(questionIds, brand.orderSeed);
  const next = order.find((id) => !servedThisEpoch.has(id));
  if (next) {
    return { questionId: next, epoch: brand.epoch, alreadyServed: null, reshuffle: null, brandLedger: brand };
  }

  // Every question in the bank has been served once. Increment, reseed, and start again -- which
  // is the only way a question repeats at all.
  const epoch = brand.epoch + 1;
  const orderSeed = orderSeedFor(epoch, contentHash);
  const reshuffle = { epoch, date, reason: "bank exhausted" };
  const reshuffled: BrandLedger = {
    ...brand,
    epoch,
    orderSeed,
    reshuffles: [...brand.reshuffles, reshuffle]
  };
  const first = epochOrder(questionIds, orderSeed)[0]!;
  return { questionId: first, epoch, alreadyServed: null, reshuffle, brandLedger: reshuffled };
}

/** Days between two ISO dates, positive when `later` is after `earlier`. */
export function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}

export interface HookAssignment {
  a: HookPattern;
  b: HookPattern;
  /** True when the cooldown was relaxed to reach two eligible patterns. */
  relaxed: boolean;
  eligibleIds: string[];
}

/**
 * Which patterns may front this question today, and which two are picked.
 *
 * Truth first: a pattern whose `truthRequires` does not hold for this question is not eligible at
 * any price, and relaxation never reaches it. Only the cooldown is relaxable, and only far enough
 * to reach two -- because the alternative is a day with no hook at all, and a ten-day-old repeat
 * is a smaller cost than a missing carousel.
 *
 * The cooldown counts slot A only. B is recorded as the alternate and never fronts anything, so
 * counting it would burn two patterns a day against a sixteen-pattern library and put the room in
 * permanent relaxation -- a cooldown that always yields is not a cooldown.
 */
export function assignHooks(input: {
  library: readonly HookPattern[];
  brand: Pick<Brand, "tone" | "categoryLists">;
  brandId: string;
  question: NormalizedQuestion;
  date: string;
  served: readonly ServedEntry[];
  minEligibleBeforeRelax: number;
}): HookAssignment {
  const subject = truthSubjectOf(input.question);
  const truthful = input.library.filter((pattern) =>
    patternIsTruthful(pattern, input.brand.tone, subject, input.brand.categoryLists));
  if (truthful.length === 0) {
    throw new Error(`No hook pattern is truthful for ${input.question.id}`);
  }

  const lastUsed = new Map<string, string>();
  for (const entry of input.served) {
    const previous = lastUsed.get(entry.hookA);
    if (!previous || entry.date > previous) lastUsed.set(entry.hookA, entry.date);
  }

  const withinCooldown = (pattern: HookPattern): boolean => {
    const used = lastUsed.get(pattern.id);
    return used !== undefined && daysBetween(used, input.date) < pattern.cooldownDays;
  };

  let eligible = truthful.filter((pattern) => !withinCooldown(pattern));
  let relaxed = false;

  if (eligible.length < input.minEligibleBeforeRelax) {
    // Oldest use first, ties broken by id, so the relaxation order is a fact about the ledger
    // rather than about the order the library happens to be written in.
    const blocked = truthful
      .filter((pattern) => withinCooldown(pattern))
      .sort((left, right) => {
        const leftUsed = lastUsed.get(left.id) ?? "";
        const rightUsed = lastUsed.get(right.id) ?? "";
        if (leftUsed !== rightUsed) return leftUsed < rightUsed ? -1 : 1;
        return left.id < right.id ? -1 : 1;
      });
    for (const pattern of blocked) {
      if (eligible.length >= input.minEligibleBeforeRelax) break;
      eligible = [...eligible, pattern];
      relaxed = true;
    }
  }

  // Library order, so the index the hash picks means the same thing on every run.
  const ordered = input.library.filter((pattern) => eligible.some((candidate) => candidate.id === pattern.id));
  const digest = createHash("sha256").update(`${input.date}${input.brandId}${input.question.id}`).digest("hex");
  const indexA = Number(BigInt(`0x${digest.slice(0, 12)}`) % BigInt(ordered.length));
  const indexB = (indexA + 1) % ordered.length;

  return {
    a: ordered[indexA]!,
    b: ordered[indexB]!,
    relaxed,
    eligibleIds: ordered.map((pattern) => pattern.id)
  };
}

export function recordServed(
  ledger: MarketingSharkLedger,
  brandId: string,
  brandLedger: BrandLedger,
  entry: ServedEntry
): MarketingSharkLedger {
  const existing = brandLedger.served.filter((served) => served.date !== entry.date);
  return {
    ...ledger,
    brands: {
      ...ledger.brands,
      [brandId]: {
        ...brandLedger,
        served: [...existing, entry].sort((left, right) => (left.date < right.date ? -1 : 1))
      }
    }
  };
}

/** Distinct slot-A patterns a brand used in the trailing window. Feeds the rotation KPI. */
export function rotationCoverage(served: readonly ServedEntry[], date: string, windowDays = 30): number {
  return new Set(
    served
      .filter((entry) => daysBetween(entry.date, date) < windowDays && daysBetween(entry.date, date) >= 0)
      .map((entry) => entry.hookA)
  ).size;
}

export function parseLedger(value: unknown): MarketingSharkLedger {
  return MarketingSharkLedgerSchema.parse(value);
}
