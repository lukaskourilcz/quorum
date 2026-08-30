import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema } from "../../contracts/common.js";
import type { ContestRecord } from "../../contracts/contest-radar.js";

/**
 * How many times the owner may lawfully enter, and the refusal that makes the number safe.
 *
 * The entrant unit is the whole question. A contest that says "one entry per person" and one that
 * says "one entry per account" are different rules, and the difference is exactly where a
 * discovery tool becomes a cheating tool: an account limit is not permission to make more
 * accounts, and a household limit is not permission to enter as a relative who did not agree.
 *
 * So the default is one entry, once, by the owner, and every larger number needs rule evidence
 * that says so in the contest's own words. **No evidence, no capacity.** An unread rules page
 * yields capacity 1 rather than an optimistic guess, because a guess here costs a disqualification
 * or worse — and the system that guessed would have no way to know it had.
 *
 * Two things this module will not do at any confidence:
 *
 * - **It never counts a person who has not agreed.** A household or family allowance is capacity
 *   only for people the owner has recorded as consenting, and this repository holds no such
 *   record, so that capacity is always zero here.
 * - **It never treats an account limit as a multiplier.** One entry per account, with one account,
 *   is one entry. Reading it any other way is instructions for making sock puppets.
 */

export const ContestEntrantUnitSchema = z.enum([
  "person",
  "account",
  "household",
  "entity",
  "team",
  "submission",
  "unknown"
]);

export type ContestEntrantUnit = z.infer<typeof ContestEntrantUnitSchema>;

export const ContestEntryPolicySchema = z.strictObject({
  schemaVersion: z.literal("contest-entry-policy/1"),
  contestId: z.string().trim().min(1).max(160),
  entrantUnit: ContestEntrantUnitSchema,
  /** How the unit was established. `unknown` means the rules page has not been read. */
  unitConfidence: z.enum(["stated", "derived", "inferred", "unknown"]),
  /** Entries permitted per unit per period, as the rules state it. */
  entriesPerUnit: z.number().int().min(1).max(1_000).nullable(),
  period: z.enum(["total", "daily", "weekly", "monthly", "per-submission"]).nullable(),
  referralAllowed: z.boolean(),
  referralCap: z.number().int().min(0).max(1_000).nullable(),
  evidenceRefs: z.array(EvidenceRefSchema).max(10),
  /** Why the resolved capacity is what it is, in words the owner can check against the rules. */
  reason: z.string().trim().min(1).max(500)
});

export type ContestEntryPolicy = z.infer<typeof ContestEntryPolicySchema>;

export const ContestCapacitySchema = z.strictObject({
  schemaVersion: z.literal("contest-capacity/1"),
  contestId: z.string().trim().min(1).max(160),
  /** Entries the owner may lawfully make, themselves, right now. */
  baseCapacity: z.number().int().min(0).max(1_000),
  /** Further entries a stated repeat rule permits over the contest's life. */
  repeatCapacity: z.number().int().min(0).max(1_000),
  /** Referral entries, only where the rules state a referral mechanic and a cap. */
  referralCapacity: z.number().int().min(0).max(1_000),
  /**
   * Always zero here, and the field exists to say so out loud.
   *
   * A household allowance is capacity for people who agreed to enter. This repository records no
   * such consent for anybody, so the honest number is zero rather than an allowance nobody granted.
   */
  householdCapacity: z.literal(0),
  totalCapacity: z.number().int().min(0).max(1_000),
  resolvedAt: DateTimeSchema,
  policyRef: EvidenceRefSchema.nullable(),
  reason: z.string().trim().min(1).max(500),
  /** Anything the owner must check themselves before using this capacity. */
  ownerChecks: z.array(z.string().trim().min(1).max(300)).max(10)
});

export type ContestCapacity = z.infer<typeof ContestCapacitySchema>;

/**
 * Rule phrases that state an entrant unit outright, in Czech, Slovak and English.
 *
 * Matched against the contest's own recorded rule text only. A phrase found in a listing's
 * marketing copy is not a rule, which is why the caller passes rule evidence rather than the
 * record's snippet.
 */
const UNIT_PHRASES: ReadonlyArray<readonly [RegExp, ContestEntrantUnit]> = [
  [/jedn\w*\s+(?:soutěžní\s+)?příspěv\w+|one\s+submission|per\s+submission/iu, "submission"],
  [/na\s+(?:jednu\s+)?domácnost|per\s+household|na\s+domácnosť/iu, "household"],
  [/na\s+(?:jeden\s+)?tým|per\s+team|na\s+tím/iu, "team"],
  [/právnick\w+\s+osob|per\s+(?:company|organisation|organization|entity)/iu, "entity"],
  [/na\s+(?:jeden\s+)?účet|per\s+account|na\s+(?:jeden\s+)?účet/iu, "account"],
  [/na\s+(?:jednu\s+)?osobu|per\s+person|jeden\s+soutěžící|na\s+osobu/iu, "person"]
];

const PERIOD_PHRASES: ReadonlyArray<readonly [RegExp, NonNullable<ContestEntryPolicy["period"]>]> = [
  [/(?:každý|kazdy)\s+den|denně|denne|per\s+day|daily/iu, "daily"],
  [/(?:každý|kazdy)\s+týden|týdně|tyzdenne|per\s+week|weekly/iu, "weekly"],
  [/(?:každý|kazdy)\s+měsíc|měsíčně|mesacne|per\s+month|monthly/iu, "monthly"]
];

/**
 * Read an entry policy out of the contest's own rule text.
 *
 * Returns `unknown` for anything it cannot establish, and `unknown` resolves to capacity 1. That
 * is the whole safety property: the failure mode of this parser is "the owner enters once", never
 * "the owner enters eleven times against a rule nobody read".
 */
export function readEntryPolicy(input: {
  contestId: string;
  ruleText: string | null;
  evidenceRefs?: readonly string[];
}): ContestEntryPolicy {
  const text = input.ruleText ?? "";
  const evidenceRefs = [...(input.evidenceRefs ?? [])];

  if (text.trim().length === 0) {
    return ContestEntryPolicySchema.parse({
      schemaVersion: "contest-entry-policy/1",
      contestId: input.contestId,
      entrantUnit: "unknown",
      unitConfidence: "unknown",
      entriesPerUnit: null,
      period: null,
      referralAllowed: false,
      referralCap: null,
      evidenceRefs,
      reason: "No rule text has been read, so nothing beyond a single entry is established."
    });
  }

  const unit = UNIT_PHRASES.find(([pattern]) => pattern.test(text))?.[1] ?? "unknown";
  const period = PERIOD_PHRASES.find(([pattern]) => pattern.test(text))?.[1] ?? (unit === "unknown" ? null : "total");
  const countMatch = /(\d{1,3})\s*(?:×|x|krát|entries|entry|příspěvk\w*|vstup\w*)/iu.exec(text);
  const entriesPerUnit = countMatch ? Math.min(1_000, Math.max(1, Number(countMatch[1]))) : (unit === "unknown" ? null : 1);

  // A referral mechanic counts only when the rules name both the mechanic and its cap. A stated
  // mechanic with no stated ceiling is not an unlimited allowance.
  const referralMentioned = /doporuč|referral|invite|pozvi|odporúč/iu.test(text);
  const referralCapMatch = /(\d{1,3})\s*(?:doporuč\w*|referral\w*|invit\w*)/iu.exec(text);
  const referralCap = referralMentioned && referralCapMatch ? Number(referralCapMatch[1]) : null;

  return ContestEntryPolicySchema.parse({
    schemaVersion: "contest-entry-policy/1",
    contestId: input.contestId,
    entrantUnit: unit,
    unitConfidence: unit === "unknown" ? "unknown" : "stated",
    entriesPerUnit,
    period,
    referralAllowed: referralMentioned && referralCap !== null,
    referralCap,
    evidenceRefs,
    reason: unit === "unknown"
      ? "The rule text does not state an entrant unit, so a single entry is all that is established."
      : `The rules state entries per ${unit}${period && period !== "total" ? ` ${period}` : ""}.`
  });
}

/**
 * Turn a policy into the number of entries the owner may actually make.
 *
 * The arithmetic is small; the refusals are the substance. An account unit does not multiply,
 * a household allowance is zero, and an unknown unit is one.
 */
export function resolveContestCapacity(input: {
  record: Pick<ContestRecord, "id" | "lifecycle">;
  policy: ContestEntryPolicy;
  now: string;
  /** Entries the owner has already recorded against this contest. */
  alreadyEntered?: number;
  policyRef?: string | null;
}): ContestCapacity {
  const ownerChecks: string[] = [];
  const already = input.alreadyEntered ?? 0;

  if (input.record.lifecycle === "closed" || input.record.lifecycle === "rejected" || input.record.lifecycle === "archived") {
    return ContestCapacitySchema.parse({
      schemaVersion: "contest-capacity/1",
      contestId: input.record.id,
      baseCapacity: 0,
      repeatCapacity: 0,
      referralCapacity: 0,
      householdCapacity: 0,
      totalCapacity: 0,
      resolvedAt: input.now,
      policyRef: input.policyRef ?? null,
      reason: `A ${input.record.lifecycle} contest has no remaining capacity.`,
      ownerChecks: []
    });
  }

  const perUnit = input.policy.entriesPerUnit ?? 1;
  let baseCapacity = 1;
  let repeatCapacity = 0;

  switch (input.policy.entrantUnit) {
    case "person":
    case "submission":
    case "entity":
      baseCapacity = Math.max(1, perUnit);
      break;
    case "account":
      // One entry per account, with one account, is one entry. Multiplying here would be
      // instructions for making sock puppets.
      baseCapacity = 1;
      ownerChecks.push("The rules limit entries per account; this counts the owner's one existing account only.");
      break;
    case "team":
      baseCapacity = 1;
      ownerChecks.push("A team entry needs real teammates who agreed; no team membership is recorded here.");
      break;
    case "household":
      baseCapacity = 1;
      ownerChecks.push("A household allowance covers people who agreed to enter; only the owner's own entry is counted.");
      break;
    case "unknown":
    default:
      baseCapacity = 1;
      ownerChecks.push("The rules have not been read; only one entry is assumed until they are.");
      break;
  }

  if (input.policy.period && input.policy.period !== "total" && input.policy.entrantUnit !== "unknown") {
    // A recurring allowance is real capacity, and it is the reason the repeat scheduler exists.
    repeatCapacity = Math.max(0, perUnit);
  }

  const referralCapacity = input.policy.referralAllowed ? input.policy.referralCap ?? 0 : 0;
  if (referralCapacity > 0) {
    ownerChecks.push("Referral entries need real people who chose to use the link; none is generated here.");
  }

  const remainingBase = Math.max(0, baseCapacity - already);
  const totalCapacity = remainingBase + repeatCapacity + referralCapacity;

  return ContestCapacitySchema.parse({
    schemaVersion: "contest-capacity/1",
    contestId: input.record.id,
    baseCapacity: remainingBase,
    repeatCapacity,
    referralCapacity,
    householdCapacity: 0,
    totalCapacity,
    resolvedAt: input.now,
    policyRef: input.policyRef ?? null,
    reason: input.policy.reason,
    ownerChecks
  });
}
