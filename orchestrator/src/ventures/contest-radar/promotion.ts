import { createHash } from "node:crypto";
import {
  ContestPromotionCandidateSchema,
  ContestPromotionProfileSchema,
  type ContestPromotionCandidate,
  type ContestPromotionEvidence,
  type ContestPromotionPermission,
  type ContestPromotionProfile
} from "../../contracts/contest-promotion.js";
import type { SocialProfile } from "../../contracts/social-distribution.js";
import { resolveVentureCapability } from "../capabilities.js";
import type { ContestEntryPolicy } from "./capacity.js";

/**
 * Deriving a promotion candidate, and the four separate things that have to be true before one is
 * anything other than held.
 *
 * The gate is written as an accumulation of refusals rather than a chain of conditions, because a
 * chain returns the first blocker and then somebody fixes it and finds the next. All of them are
 * reported at once:
 *
 * 1. **The rules permit it, in their own words.** Nine questions, each answered `permitted`,
 *    `prohibited` or `silent`. Silence holds. So does ambiguity, which arrives here as silence
 *    because nothing in this system is willing to read an ambiguous clause as a yes.
 * 2. **A real, active, capability-permitted profile could carry it.** A simulation is rejected with
 *    a reason rather than filtered out, so the refusal is a value somebody has to look at.
 * 3. **Several owned profiles are one entrant.** The projection carries an opaque beneficial-owner
 *    alias; an eligible candidate may name exactly one. This is the rule that stops a portfolio of
 *    owned accounts from becoming a fake crowd, and it is enforced in the contract as well as here.
 * 4. **The capability edge is not denied.** It is registered `held`, so today every candidate that
 *    passes the first three still carries the held edge as a risk line rather than an eligibility.
 *
 * **Nothing here constructs a referral link.** There is no code path that assembles one from a
 * pattern, because a well-guessed pattern is still a fabrication. A candidate carries a referral URL
 * the owner pasted in, or it carries none.
 *
 * **Nothing here publishes.** `generateSocialCampaign` refuses every Contest Radar release with
 * `contest-source-excluded`, independently of anything decided in this file, and a candidate
 * reaching `social-campaign-eligible` still produces no campaign.
 */

export const CONTEST_PROMOTION_DECISION_REF =
  "state/decisions/2026-08-30-contest-radar-promotion-posture.md";

/**
 * The opaque grouping alias. Two profiles sharing one owner share it and nothing else.
 *
 * Hashed rather than carried so the projection cannot leak an owner reference by accident: the
 * input is a name this repository already stores, and the output is a token that answers "same
 * person?" and no other question.
 */
export function beneficialOwnerAlias(ownerRef: string): string {
  return `entrant-${createHash("sha256").update(`contest-entrant|${ownerRef}`).digest("hex").slice(0, 16)}`;
}

/**
 * Project a Social Profile down to what the gate may see.
 *
 * Deliberately lossy and deliberately server-only. Everything that could authorise a post — a
 * connection, a token reference, a scope, a provider payload — is absent by construction, so a
 * caller holding a projection cannot publish with it even by mistake.
 */
export async function projectPromotionProfile(input: {
  profile: SocialProfile;
  platform?: string | null;
  publicHandle?: string | null;
  configRoot?: string;
}): Promise<ContestPromotionProfile> {
  const { profile } = input;
  const simulated = profile.kind === "simulation" || profile.role === "simulation";

  const resolution = await resolveVentureCapability({
    source: "contest-radar",
    target: "social-distribution",
    capability: "approved-publish-package",
    schemaVersion: "contest-promotion-candidate/1"
  }, input.configRoot === undefined ? {} : { configRoot: input.configRoot });

  const state: ContestPromotionProfile["state"] = simulated
    ? "rejected"
    : profile.lifecycle === "active" ? "active"
      : profile.lifecycle === "paused" ? "paused"
        : profile.lifecycle === "setup-needed" ? "setup-needed"
          : ["retired", "rejected"].includes(profile.lifecycle) ? "rejected"
            : "held";

  return ContestPromotionProfileSchema.parse({
    schemaVersion: "contest-promotion-profile/1",
    profileId: profile.id,
    role: simulated ? "simulation" : profile.role,
    accountType: simulated ? "simulation" : profile.kind === "owner-personal" ? "owner-personal" : "owned-brand",
    publicHandle: input.publicHandle ?? null,
    platform: input.platform ?? null,
    state,
    beneficialOwnerAlias: beneficialOwnerAlias(profile.ownerRef),
    ventureRef: profile.ventureRef,
    topics: [...profile.supportedTopics],
    languages: [...profile.languages],
    markets: [...profile.markets],
    capabilityEdge: {
      capability: "approved-publish-package",
      dataSchemaVersion: "contest-promotion-candidate/1",
      decision: ["allowed", "held", "denied"].includes(resolution.decision)
        ? resolution.decision
        : "unregistered"
    },
    provenanceRef: profile.provenance.evidenceRefs[0] ?? CONTEST_PROMOTION_DECISION_REF,
    rejectedReason: simulated
      ? "A simulation is fixture evidence, never a participant and never a publishing target."
      : ["retired", "rejected"].includes(profile.lifecycle)
        ? `The profile is ${profile.lifecycle}.`
        : null
  });
}

/* ------------------------------------------------------------------------------------------- */

/**
 * The nine rule questions, each with the sentence that goes in `heldReasons` when it is not
 * answered `permitted`.
 *
 * Written as data rather than as nine `if` statements so that adding a tenth question means adding
 * a row, and so that no question can be quietly skipped by a branch that returns early.
 */
const RULE_QUESTIONS: ReadonlyArray<readonly [keyof ContestPromotionEvidence, string]> = [
  ["publicPromotion", "The rules do not explicitly permit public promotion."],
  ["referralSharing", "The rules do not explicitly permit referral sharing."],
  ["referralOwnerStated", "The rules do not name who owns the referral mechanic."],
  ["restrictionsStated", "The rules do not state the self, household, employee and affiliate restrictions."],
  ["eligibleAccountType", "The rules do not state which account type may enter or promote."],
  ["bonusCapStated", "The rules do not state a maximum bonus."],
  ["expiryStated", "The rules do not state when the promotion window closes."],
  ["disclosureRequired", "The rules do not state whether a disclosure is required."],
  ["businessPromotionEffect", "The rules do not say whether promoting as a business affects eligibility."]
];

/**
 * Which rule questions must be answered before a candidate may promote at all.
 *
 * Referral questions are separate: a contest can permit talking about it publicly while saying
 * nothing about referrals, and that combination is a legitimate alert with no referral link rather
 * than a blocked one.
 */
const PROMOTION_REQUIRED: ReadonlyArray<keyof ContestPromotionEvidence> = [
  "publicPromotion",
  "restrictionsStated",
  "eligibleAccountType",
  "expiryStated",
  "disclosureRequired",
  "businessPromotionEffect"
];

const REFERRAL_REQUIRED: ReadonlyArray<keyof ContestPromotionEvidence> = [
  "referralSharing",
  "referralOwnerStated",
  "bonusCapStated"
];

function permission(evidence: ContestPromotionEvidence, key: keyof ContestPromotionEvidence): ContestPromotionPermission {
  const value = evidence[key];
  return value === "permitted" || value === "prohibited" ? value : "silent";
}

export interface PromotionDerivationInput {
  contestId: string;
  officialUrl: string;
  rulesUrl?: string | null;
  policyRef?: string | null;
  capacityRef?: string | null;
  entryPolicy?: ContestEntryPolicy | null;
  evidence: ContestPromotionEvidence;
  profiles: readonly ContestPromotionProfile[];
  ownerProvidedReferralUrl?: string | null;
  ownerProvidedReferralCode?: string | null;
  statedPrize?: string | null;
  statedDeadline?: string | null;
  statedMechanics?: readonly string[];
  eligiblePlatforms?: readonly string[];
  eligibleAccountTypes?: readonly ("owned-brand" | "owner-personal")[];
  topics?: readonly string[];
  languages?: readonly ("cs" | "en" | "sk")[];
  markets?: readonly string[];
  disclosureRequirement?: string | null;
  bonusCap?: number | null;
  ownerConfirmedBonuses?: number;
  earliestUsefulAt?: string | null;
  latestUsefulAt?: string | null;
  now: Date;
  /** Whether an optional relationship kit exists to route a permitted referral into. */
  relationshipKitAvailable?: boolean;
}

export function deriveContestPromotionCandidate(input: PromotionDerivationInput): ContestPromotionCandidate {
  const heldReasons: string[] = [];
  const riskReasons: string[] = [];

  for (const [key, sentence] of RULE_QUESTIONS) {
    if (!PROMOTION_REQUIRED.includes(key)) continue;
    const value = permission(input.evidence, key);
    if (value === "prohibited") heldReasons.push(sentence.replace("do not explicitly permit", "prohibit").replace("do not state", "do not permit"));
    else if (value !== "permitted") heldReasons.push(sentence);
  }

  const referralAsked = input.ownerProvidedReferralUrl !== undefined && input.ownerProvidedReferralUrl !== null;
  let referralPermitted = referralAsked;
  if (referralAsked) {
    for (const key of REFERRAL_REQUIRED) {
      if (permission(input.evidence, key) === "permitted") continue;
      const sentence = RULE_QUESTIONS.find(([name]) => name === key)?.[1] ?? "A referral rule is unestablished.";
      heldReasons.push(sentence);
      referralPermitted = false;
    }
    // The rules parser already answers this from the contest's own text. Its `referralAllowed`
    // disagreeing with the promotion evidence means two readings of one page, and the safe one wins.
    if (input.entryPolicy && !input.entryPolicy.referralAllowed) {
      heldReasons.push("The contest's own entry policy records no referral mechanic, so a referral link has nothing to attach to.");
      referralPermitted = false;
    }
    if (!referralPermitted) {
      // The link comes off the record, not just out of use. A held candidate carrying an
      // unpermitted referral URL is a link somebody could copy out of an Admin table, and the
      // contract refuses to hold one for exactly that reason.
      heldReasons.push("The owner-provided referral link was dropped, because the rules do not establish that sharing one is permitted.");
    }
  }

  // A simulation that arrives claiming to be a target is normalized rather than trusted. The
  // projection already rejects one; this is the same refusal applied to a profile assembled by
  // hand, and it keeps the candidate representable so the reason survives to be read.
  const profiles = input.profiles.map((entry): ContestPromotionProfile => {
    const simulated = entry.accountType === "simulation" || entry.role === "simulation";
    if (!simulated || (entry.state === "rejected" && entry.rejectedReason !== null)) return entry;
    return {
      ...entry,
      state: "rejected",
      rejectedReason: "A simulation is fixture evidence, never a participant and never a publishing target."
    };
  });
  if (profiles.some((entry, index) => entry !== input.profiles[index])) {
    heldReasons.push("A simulated profile appeared as a target and was rejected.");
  }

  const active = profiles.filter((profile) => profile.state === "active");
  if (active.length === 0) {
    heldReasons.push("No real, active profile has an editorial reason and a permitted capability edge to carry this.");
  }
  const aliases = new Set(active.map((profile) => profile.beneficialOwnerAlias));
  if (aliases.size > 1) {
    heldReasons.push("Several owner-controlled profiles are one entrant, so only one may carry a contest alert.");
  }

  const edge = active[0]?.capabilityEdge.decision ?? profiles[0]?.capabilityEdge.decision ?? "unregistered";
  if (edge === "denied" || edge === "unregistered") {
    heldReasons.push(`The Contest Radar publish edge to Social Distribution is ${edge}.`);
  } else if (edge === "held") {
    // Not a held reason: the edge being held is the posture, and a candidate is allowed to become
    // eligible under it. It is what stops the eligible candidate from ever being published.
    riskReasons.push(`The publish edge is held by ${CONTEST_PROMOTION_DECISION_REF}; nothing may be published until a further countersigned decision moves it.`);
  }

  if (input.latestUsefulAt !== null && input.latestUsefulAt !== undefined
    && Date.parse(input.latestUsefulAt) <= input.now.getTime()) {
    heldReasons.push("The promotion window has already closed.");
  }

  const cap = input.bonusCap ?? null;
  const confirmed = input.ownerConfirmedBonuses ?? 0;
  if (cap !== null && confirmed >= cap) {
    riskReasons.push(`Owner-confirmed bonuses have reached the stated cap of ${cap}.`);
  }
  if (permission(input.evidence, "publicPromotion") === "prohibited") {
    riskReasons.push("The organizer's rules prohibit public promotion outright.");
  }

  const disposition: ContestPromotionCandidate["disposition"] = heldReasons.length > 0
    ? "held"
    : referralAsked && input.relationshipKitAvailable === true
      ? "relationship-kit-eligible"
      : "social-campaign-eligible";

  const body = {
    schemaVersion: "contest-promotion-candidate/1" as const,
    contestId: input.contestId,
    policyRef: input.policyRef ?? null,
    capacityRef: input.capacityRef ?? null,
    officialUrl: input.officialUrl,
    rulesUrl: input.rulesUrl ?? null,
    ownerProvidedReferralUrl: referralPermitted ? input.ownerProvidedReferralUrl ?? null : null,
    ownerProvidedReferralCode: referralPermitted ? input.ownerProvidedReferralCode ?? null : null,
    statedPrize: input.statedPrize ?? null,
    statedDeadline: input.statedDeadline ?? null,
    statedMechanics: [...(input.statedMechanics ?? [])],
    eligiblePlatforms: [...(input.eligiblePlatforms ?? [])],
    eligibleAccountTypes: [...(input.eligibleAccountTypes ?? [])],
    topics: [...(input.topics ?? [])],
    languages: [...(input.languages ?? [])],
    markets: [...(input.markets ?? [])],
    evidence: input.evidence,
    disclosureRequirement: input.disclosureRequirement ?? null,
    bonusCap: cap,
    ownerConfirmedBonuses: confirmed,
    earliestUsefulAt: input.earliestUsefulAt ?? null,
    latestUsefulAt: input.latestUsefulAt ?? null,
    disposition,
    heldReasons: [...new Set(heldReasons)].slice(0, 20),
    riskReasons: [...new Set(riskReasons)].slice(0, 20),
    candidateProfiles: profiles,
    derivedAt: input.now.toISOString(),
    authorityGranted: false as const,
    publishingAuthorized: false as const
  };

  // The hash covers the inputs a rules change would alter, and not the derivation's own output. A
  // contest whose terms move produces a different candidate rather than an edited one, which is the
  // whole reason a stale verdict cannot be carried forward.
  const inputHash = createHash("sha256").update(JSON.stringify({
    contestId: body.contestId,
    officialUrl: body.officialUrl,
    rulesUrl: body.rulesUrl,
    evidence: body.evidence,
    referral: [body.ownerProvidedReferralUrl, body.ownerProvidedReferralCode],
    bonusCap: body.bonusCap,
    window: [body.earliestUsefulAt, body.latestUsefulAt],
    profiles: body.candidateProfiles.map((profile) => [profile.profileId, profile.state, profile.capabilityEdge.decision])
  })).digest("hex");

  return ContestPromotionCandidateSchema.parse({ ...body, inputHash });
}

/**
 * Whether a candidate derived earlier still describes the contest in front of us.
 *
 * A rules change expires the candidate rather than updating it. The alternative — recomputing the
 * verdict in place — means an alert prepared under one set of terms could go out under another, and
 * the record would show only the second.
 */
export function promotionCandidateIsCurrent(input: {
  candidate: ContestPromotionCandidate;
  recomputed: ContestPromotionCandidate;
  now: Date;
}): { current: boolean; reason: string } {
  if (input.candidate.inputHash !== input.recomputed.inputHash) {
    return { current: false, reason: "The contest's rules, referral terms, window or targets changed since this candidate was derived." };
  }
  if (input.candidate.latestUsefulAt !== null && Date.parse(input.candidate.latestUsefulAt) <= input.now.getTime()) {
    return { current: false, reason: "The promotion window closed." };
  }
  return { current: true, reason: "The inputs are unchanged and the window is open." };
}
