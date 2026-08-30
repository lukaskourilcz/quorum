import { z } from "zod";
import { DateTimeSchema, EvidenceRefSchema, HttpsUrlSchema, Sha256Schema, VentureIdSchema } from "./common.js";

/**
 * The optional bridge from a verified contest to a transparent contest alert, and its refusals.
 *
 * The whole extension rests on one asymmetry. A contest's rules can permit public promotion, and
 * when they do, saying so on an owned profile is ordinary transparent publishing. Everything else
 * about a contest — entering it, referring people into it, counting a click as a bonus — is the
 * thing this venture exists not to do, and no amount of permission in a rules page changes that.
 *
 * So this contract is arranged around a default. **Silence is held.** A candidate whose rules do
 * not explicitly permit public promotion cannot reach any eligible state, and the same is true of
 * ambiguity, of a missing referral owner, of an unstated bonus cap and of an expiry that has
 * passed. That is the same rule the venture already applies to prizes and deadlines: an unstated
 * fact is unavailable, never assumed, and here the assumption would be about somebody else's terms.
 *
 * The disposition names four outcomes and only two of them go anywhere:
 *
 * - `social-campaign-eligible` — the rules permit it and a real profile could carry it. Still not a
 *   campaign: `generateSocialCampaign` refuses every Contest Radar release independently, and the
 *   capability edge is registered `held`.
 * - `relationship-kit-eligible` — permitted, and better suited to an optional manual kit.
 * - `manual-owner-only` — the opportunity is real and the promotion is not; the owner works it
 *   privately, which is what the private core is for.
 * - `held` — anything unestablished. The default and the common case.
 */

const StableId = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(160);

/**
 * A rules verdict, and the reason there are three values rather than a boolean.
 *
 * `permitted` requires the rules to say so. `prohibited` is the rules saying no. `silent` is
 * everything else — no promotion clause, an ambiguous one, or a rules page nobody has read. A
 * boolean would collapse `silent` into `prohibited`, which sounds safe and is not: it would let a
 * later reader "correct" the false to true on the grounds that nothing actually forbade it.
 */
export const ContestPromotionPermissionSchema = z.enum(["permitted", "prohibited", "silent"]);

export const ContestPromotionDispositionSchema = z.enum([
  "social-campaign-eligible",
  "relationship-kit-eligible",
  "manual-owner-only",
  "held"
]);

/**
 * The sanitized Social Profiles projection: everything the gate may see, and nothing else.
 *
 * A connected account is not a distinct human. `beneficialOwnerAlias` exists so the entry-capacity
 * rules can tell that two profiles are the same person without this venture learning who that
 * person is, and `simulation` is rejected rather than filtered so the refusal is a value somebody
 * has to look at rather than an absence they can miss.
 */
export const ContestPromotionProfileSchema = z.strictObject({
  schemaVersion: z.literal("contest-promotion-profile/1"),
  profileId: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  role: z.enum(["venture-primary", "company-umbrella", "owned-amplifier", "owner-personal", "simulation"]),
  accountType: z.enum(["owned-brand", "owner-personal", "simulation"]),
  /** The public handle. Public by definition; no token, credential ref, cookie or contact. */
  publicHandle: z.string().trim().min(1).max(120).nullable(),
  platform: z.string().trim().min(1).max(40).nullable(),
  state: z.enum(["active", "paused", "held", "setup-needed", "rejected"]),
  /**
   * An opaque grouping alias, never an identity.
   *
   * Two profiles sharing it are one legal entrant. Nothing here says who they are, and the alias is
   * derived rather than carried so the projection cannot leak an owner reference by accident.
   */
  beneficialOwnerAlias: z.string().regex(/^entrant-[a-f0-9]{16}$/u),
  ventureRef: VentureIdSchema.nullable(),
  topics: z.array(StableId).max(24),
  /**
   * The profile's own locales, which are Czech or English.
   *
   * Narrower than the candidate's `cs | en | sk` on purpose: a Slovak contest is still a Slovak
   * contest, and no owned profile publishes in Slovak. Widening this to match the candidate would
   * be inventing a publishing language to make a join tidier.
   */
  languages: z.array(z.enum(["cs", "en"])).max(2),
  markets: z.array(z.string().regex(/^[A-Z]{2}$/u)).max(12),
  /** The exact capability edge that would carry an alert here, and its recorded decision. */
  capabilityEdge: z.strictObject({
    capability: z.literal("approved-publish-package"),
    dataSchemaVersion: z.literal("contest-promotion-candidate/1"),
    decision: z.enum(["allowed", "held", "denied", "unregistered"])
  }),
  provenanceRef: EvidenceRefSchema,
  /** Set for anything that is not a real profile. A simulation never becomes a target. */
  rejectedReason: z.string().trim().min(1).max(300).nullable()
}).superRefine((profile, context) => {
  const simulated = profile.role === "simulation" || profile.accountType === "simulation";
  if (simulated && (profile.state !== "rejected" || profile.rejectedReason === null)) {
    context.addIssue({
      code: "custom",
      message: "A simulation is rejected with a reason, never a target",
      path: ["state"]
    });
  }
  if (!simulated && profile.rejectedReason !== null && profile.state !== "rejected") {
    context.addIssue({ code: "custom", message: "A rejected reason belongs to a rejected profile", path: ["state"] });
  }
  // Publishing authority is Social Distribution's, and the projection is read-only. Anything but a
  // recorded decision here would be this venture deciding what it may not decide.
  if (profile.capabilityEdge.decision === "allowed" && profile.state !== "active") {
    context.addIssue({ code: "custom", message: "An inactive profile cannot carry an allowed edge", path: ["capabilityEdge"] });
  }
});

/**
 * The evidence a promotion candidate must carry, one field per question the gate asks.
 *
 * Each is a `ContestPromotionPermissionSchema` rather than a boolean for the reason above, and each
 * has to be `permitted` before anything becomes eligible. Nothing here is derived from another
 * field: an organizer permitting promotion says nothing about whether employees may enter, and
 * treating one as evidence for the other is the mistake this shape prevents.
 */
export const ContestPromotionEvidenceSchema = z.strictObject({
  publicPromotion: ContestPromotionPermissionSchema,
  referralSharing: ContestPromotionPermissionSchema,
  /** Whether the rules say who owns the referral link. An unowned link is an invented link. */
  referralOwnerStated: ContestPromotionPermissionSchema,
  /** Self, household, employee and affiliate restrictions, as the rules state them. */
  restrictionsStated: ContestPromotionPermissionSchema,
  eligibleAccountType: ContestPromotionPermissionSchema,
  bonusCapStated: ContestPromotionPermissionSchema,
  expiryStated: ContestPromotionPermissionSchema,
  disclosureRequired: ContestPromotionPermissionSchema,
  /** Whether promoting as a brand or business changes eligibility. Silence holds this too. */
  businessPromotionEffect: ContestPromotionPermissionSchema,
  evidenceRefs: z.array(EvidenceRefSchema).max(12)
});

export const ContestPromotionCandidateSchema = z.strictObject({
  schemaVersion: z.literal("contest-promotion-candidate/1"),
  contestId: StableId,
  policyRef: EvidenceRefSchema.nullable(),
  capacityRef: EvidenceRefSchema.nullable(),
  /** The contest's own public page. A social post is not a rules surface. */
  officialUrl: HttpsUrlSchema,
  rulesUrl: HttpsUrlSchema.nullable(),
  /**
   * A referral URL the owner supplied, never one this system built.
   *
   * There is no code path that constructs a referral link. A candidate either carries one the owner
   * pasted in or carries none, because a link this system assembled from a pattern is a fabrication
   * regardless of how well the pattern was guessed.
   */
  ownerProvidedReferralUrl: HttpsUrlSchema.nullable(),
  ownerProvidedReferralCode: z.string().trim().min(1).max(80).nullable(),
  statedPrize: z.string().trim().min(1).max(300).nullable(),
  statedDeadline: z.string().trim().min(1).max(120).nullable(),
  statedMechanics: z.array(z.string().trim().min(1).max(200)).max(20),
  eligiblePlatforms: z.array(z.string().trim().min(1).max(40)).max(12),
  eligibleAccountTypes: z.array(z.enum(["owned-brand", "owner-personal"])).max(2),
  topics: z.array(StableId).max(24),
  languages: z.array(z.enum(["cs", "en", "sk"])).max(3),
  markets: z.array(z.string().regex(/^[A-Z]{2}$/u)).max(12),
  evidence: ContestPromotionEvidenceSchema,
  disclosureRequirement: z.string().trim().min(1).max(300).nullable(),
  bonusCap: z.number().int().min(0).max(1_000).nullable(),
  /** Bonuses the owner confirmed, by hand. Never a click, a view or a share. */
  ownerConfirmedBonuses: z.number().int().min(0).max(1_000),
  earliestUsefulAt: DateTimeSchema.nullable(),
  latestUsefulAt: DateTimeSchema.nullable(),
  disposition: ContestPromotionDispositionSchema,
  /** Every reason it is held, not the first. A single blocker reads as the only one. */
  heldReasons: z.array(z.string().trim().min(1).max(300)).max(20),
  riskReasons: z.array(z.string().trim().min(1).max(300)).max(20),
  candidateProfiles: z.array(ContestPromotionProfileSchema).max(40),
  derivedAt: DateTimeSchema,
  /** Immutable over the inputs, so a rules change produces a different candidate, not an edit. */
  inputHash: Sha256Schema,
  authorityGranted: z.literal(false),
  publishingAuthorized: z.literal(false)
}).superRefine((candidate, context) => {
  const eligible = candidate.disposition === "social-campaign-eligible"
    || candidate.disposition === "relationship-kit-eligible";

  if (candidate.disposition === "held" && candidate.heldReasons.length === 0) {
    context.addIssue({ code: "custom", message: "A held candidate says why it is held", path: ["heldReasons"] });
  }
  if (eligible && candidate.heldReasons.length > 0) {
    context.addIssue({ code: "custom", message: "An eligible candidate has nothing holding it", path: ["disposition"] });
  }
  if (eligible && candidate.evidence.publicPromotion !== "permitted") {
    context.addIssue({
      code: "custom",
      message: "Eligibility requires the rules to permit public promotion outright",
      path: ["evidence", "publicPromotion"]
    });
  }
  // A referral URL without stated permission and a stated owner is the shape of an invented link,
  // whichever way it got here.
  if (candidate.ownerProvidedReferralUrl !== null
    && (candidate.evidence.referralSharing !== "permitted" || candidate.evidence.referralOwnerStated !== "permitted")) {
    context.addIssue({
      code: "custom",
      message: "A referral link needs the rules to permit sharing and to name its owner",
      path: ["ownerProvidedReferralUrl"]
    });
  }
  if (candidate.bonusCap !== null && candidate.ownerConfirmedBonuses > candidate.bonusCap) {
    context.addIssue({ code: "custom", message: "Confirmed bonuses cannot exceed the stated cap", path: ["ownerConfirmedBonuses"] });
  }
  if (candidate.disclosureRequirement === null && candidate.evidence.disclosureRequired === "permitted") {
    context.addIssue({ code: "custom", message: "A required disclosure must say what it is", path: ["disclosureRequirement"] });
  }
  if (eligible && candidate.candidateProfiles.every((profile) => profile.state !== "active")) {
    context.addIssue({ code: "custom", message: "Eligibility needs at least one real, active profile", path: ["candidateProfiles"] });
  }
  if (candidate.candidateProfiles.some((profile) => profile.accountType === "simulation" && profile.state !== "rejected")) {
    context.addIssue({ code: "custom", message: "A simulation is never a target", path: ["candidateProfiles"] });
  }
  // One person with several accounts is one entrant. Counting the accounts is how a portfolio of
  // owned profiles becomes a fake crowd, so an eligible candidate may name only one entrant.
  const aliases = new Set(candidate.candidateProfiles
    .filter((profile) => profile.state === "active")
    .map((profile) => profile.beneficialOwnerAlias));
  if (eligible && aliases.size > 1) {
    context.addIssue({
      code: "custom",
      message: "Several owner-controlled profiles are one entrant, not several people",
      path: ["candidateProfiles"]
    });
  }
  if (candidate.latestUsefulAt !== null && candidate.earliestUsefulAt !== null
    && Date.parse(candidate.latestUsefulAt) <= Date.parse(candidate.earliestUsefulAt)) {
    context.addIssue({ code: "custom", message: "A window closes after it opens", path: ["latestUsefulAt"] });
  }
});

export type ContestPromotionPermission = z.infer<typeof ContestPromotionPermissionSchema>;
export type ContestPromotionDisposition = z.infer<typeof ContestPromotionDispositionSchema>;
export type ContestPromotionProfile = z.infer<typeof ContestPromotionProfileSchema>;
export type ContestPromotionEvidence = z.infer<typeof ContestPromotionEvidenceSchema>;
export type ContestPromotionCandidate = z.infer<typeof ContestPromotionCandidateSchema>;
