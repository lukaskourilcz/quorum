import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ContestPromotionCandidateSchema,
  type ContestPromotionEvidence,
  type ContestPromotionProfile
} from "../src/contracts/contest-promotion.js";
import { SocialProfileSchema, type SocialProfile } from "../src/contracts/social-distribution.js";
import { configRoot, repoRoot } from "../src/paths.js";
import { loadVentureCapabilityMap, resolveVentureCapability } from "../src/ventures/capabilities.js";
import {
  beneficialOwnerAlias,
  deriveContestPromotionCandidate,
  projectPromotionProfile,
  promotionCandidateIsCurrent
} from "../src/ventures/contest-radar/promotion.js";
import { readEntryPolicy } from "../src/ventures/contest-radar/capacity.js";
import { createVerifiedReleaseCampaign } from "../src/social/campaigns.js";

const now = new Date("2026-08-30T12:00:00.000Z");

function evidence(over: Partial<ContestPromotionEvidence> = {}): ContestPromotionEvidence {
  return {
    publicPromotion: "permitted",
    referralSharing: "silent",
    referralOwnerStated: "silent",
    restrictionsStated: "permitted",
    eligibleAccountType: "permitted",
    bonusCapStated: "silent",
    expiryStated: "permitted",
    disclosureRequired: "permitted",
    businessPromotionEffect: "permitted",
    evidenceRefs: ["state/ventures/contest-radar/records/example.json"],
    ...over
  };
}

function profile(over: Partial<ContestPromotionProfile> = {}): ContestPromotionProfile {
  return {
    schemaVersion: "contest-promotion-profile/1",
    profileId: "social-profile-mma-files",
    role: "venture-primary",
    accountType: "owned-brand",
    publicHandle: "mmafiles",
    platform: "instagram",
    state: "active",
    beneficialOwnerAlias: beneficialOwnerAlias("lukas"),
    ventureRef: "mma-files",
    topics: ["mma"],
    languages: ["cs"],
    markets: ["CZ"],
    capabilityEdge: {
      capability: "approved-publish-package",
      dataSchemaVersion: "contest-promotion-candidate/1",
      decision: "held"
    },
    provenanceRef: "state/social/profiles.json",
    rejectedReason: null,
    ...over
  };
}

function derive(over: Partial<Parameters<typeof deriveContestPromotionCandidate>[0]> = {}) {
  return deriveContestPromotionCandidate({
    contestId: "example-contest",
    officialUrl: "https://priklad.cz/soutez",
    rulesUrl: "https://priklad.cz/soutez/pravidla",
    evidence: evidence(),
    profiles: [profile()],
    disclosureRequirement: "Označte příspěvek jako spolupráci.",
    now,
    ...over
  });
}

describe("contest promotion — the capability posture", () => {
  it("registers exactly one held outbound edge and isolates every other publish target", async () => {
    const map = await loadVentureCapabilityMap(configRoot);
    const outbound = map.edges.filter((edge) => edge.source === "contest-radar");
    expect(outbound).toHaveLength(1);
    expect(outbound[0]).toMatchObject({
      target: "social-distribution",
      capability: "approved-publish-package",
      dataSchemaVersion: "contest-promotion-candidate/1",
      decision: "held"
    });

    const permitted = await resolveVentureCapability({
      source: "contest-radar",
      target: "social-distribution",
      capability: "approved-publish-package",
      schemaVersion: "contest-promotion-candidate/1"
    });
    expect(permitted.decision).toBe("held");

    // Everything else this venture might reach stays denied by an isolation rule.
    for (const capability of ["intelligence-read", "bounded-render-summary", "owner-manual-reference-read"] as const) {
      const resolution = await resolveVentureCapability({
        source: "contest-radar",
        target: "social-distribution",
        capability,
        schemaVersion: "contest-promotion-candidate/1"
      });
      expect(resolution.decision).toBe("denied");
    }
    for (const target of ["caught-up", "mma-files", "kvorum", "door-money", "personal-growth", "design-lab"] as const) {
      const resolution = await resolveVentureCapability({
        source: "contest-radar",
        target,
        capability: "approved-publish-package",
        schemaVersion: "contest-promotion-candidate/1"
      });
      expect(resolution.decision).toBe("denied");
    }
  });

  it("keeps campaign generation's two unconditional contest refusals, held edge or not", async () => {
    // The behaviour is covered in social-campaigns.test.ts, which builds a whole valid campaign
    // input. What this asserts is the regression the held edge makes possible for the first time:
    // that adding the edge did not come with quietly deleting the gate that ignores it.
    const body = await readFile(path.join(repoRoot, "orchestrator/src/social/campaigns.ts"), "utf8");
    expect(body).toContain('if (release.sourceType === "contest-opportunity") return skipped("contest-source-excluded");');
    expect(body).toContain('if (release.sourceVentureId === "contest-radar") return skipped("contest-source-excluded");');
    expect(typeof createVerifiedReleaseCampaign).toBe("function");

    const map = await loadVentureCapabilityMap(configRoot);
    expect(map.edges.filter((edge) => edge.source === "contest-radar" && edge.decision === "allowed")).toEqual([]);
  });
});

describe("contest promotion — the sanitized profile projection", () => {
  function socialProfile(over: Partial<SocialProfile> = {}): SocialProfile {
    return SocialProfileSchema.parse({
      schemaVersion: "social-profile/1",
      id: "social-profile-mma-files",
      displayLabel: "MMA Files",
      kind: "owned-brand",
      role: "venture-primary",
      ownerRef: "lukas",
      ventureRef: "mma-files",
      brandRef: null,
      purpose: "Publikuje původní MMA obsah.",
      audience: "Čeští fanoušci MMA.",
      languages: ["cs"],
      markets: ["CZ"],
      supportedTopics: ["mma"],
      supportedVentures: [],
      capabilityRefs: [],
      amplifierArchetype: null,
      amplifierEligibility: null,
      originalContentPromise: null,
      recurringFormatRefs: [],
      avatar: { kind: "none", descriptor: null, reference: null },
      lifecycle: "active",
      liveEligible: true,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
      provenance: { source: "owner", recordedBy: "owner", evidenceRefs: ["state/social/profiles.json"], fixtureKey: null },
      notes: "",
      ...over
    });
  }

  it("carries no token, connection, scope or contact, and records the edge as held", async () => {
    const projected = await projectPromotionProfile({
      profile: socialProfile(),
      platform: "instagram",
      publicHandle: "mmafiles"
    });
    expect(projected.capabilityEdge.decision).toBe("held");
    expect(projected.state).toBe("active");

    const keys = JSON.stringify(projected).toLowerCase();
    for (const forbidden of ["token", "credential", "cookie", "session", "accesstoken", "scope", "contact", "email"]) {
      expect(keys.includes(forbidden)).toBe(false);
    }
  });

  it("rejects a simulation with a reason rather than filtering it away", async () => {
    const projected = await projectPromotionProfile({
      profile: socialProfile({
        id: "social-profile-simulation-one",
        kind: "simulation",
        role: "simulation",
        lifecycle: "simulation",
        liveEligible: false,
        ventureRef: null,
        updatedAt: "2026-08-01T00:00:00.000Z",
        provenance: { source: "fixture", recordedBy: "system", evidenceRefs: ["state/social/simulations.json"], fixtureKey: "sim-one" }
      })
    });
    expect(projected.state).toBe("rejected");
    expect(projected.rejectedReason).toContain("never a participant");
  });

  it("gives two profiles of one owner the same alias and reveals nothing about them", () => {
    const first = beneficialOwnerAlias("lukas");
    const second = beneficialOwnerAlias("lukas");
    expect(first).toBe(second);
    expect(first).not.toContain("lukas");
    expect(beneficialOwnerAlias("someone-else")).not.toBe(first);
  });
});

describe("contest promotion — the eligibility gate", () => {
  it("holds on silence and names every unanswered question at once", () => {
    const candidate = derive({
      evidence: evidence({
        publicPromotion: "silent",
        restrictionsStated: "silent",
        expiryStated: "silent"
      })
    });
    expect(candidate.disposition).toBe("held");
    expect(candidate.heldReasons.length).toBeGreaterThanOrEqual(3);
    expect(candidate.heldReasons.some((reason) => reason.includes("public promotion"))).toBe(true);
    expect(candidate.heldReasons.some((reason) => reason.includes("restrictions"))).toBe(true);
  });

  it("holds when the rules prohibit promotion, and records it as a risk", () => {
    const candidate = derive({ evidence: evidence({ publicPromotion: "prohibited" }) });
    expect(candidate.disposition).toBe("held");
    expect(candidate.riskReasons.some((reason) => reason.includes("prohibit"))).toBe(true);
  });

  it("becomes eligible only when every promotion question is answered, and never publishes", () => {
    const candidate = derive();
    expect(candidate.disposition).toBe("social-campaign-eligible");
    expect(candidate.heldReasons).toEqual([]);
    expect(candidate.authorityGranted).toBe(false);
    expect(candidate.publishingAuthorized).toBe(false);
    // The edge is held, so eligibility is a verdict about the contest and never a permission.
    expect(candidate.riskReasons.some((reason) => reason.includes("publish edge is held"))).toBe(true);
  });

  it("holds a referral link whose sharing, owner or cap the rules never stated", () => {
    const candidate = derive({ ownerProvidedReferralUrl: "https://priklad.cz/soutez?ref=abc" });
    expect(candidate.disposition).toBe("held");
    expect(candidate.heldReasons.some((reason) => reason.includes("referral sharing"))).toBe(true);
    expect(candidate.heldReasons.some((reason) => reason.includes("owns the referral"))).toBe(true);
    // The link comes off the record, not just out of use: a held candidate carrying it is a URL
    // somebody could copy out of a table.
    expect(candidate.ownerProvidedReferralUrl).toBeNull();
    expect(candidate.heldReasons.some((reason) => reason.includes("was dropped"))).toBe(true);
  });

  it("refuses a referral link the contract itself would not accept", () => {
    const candidate = derive();
    const forged = {
      ...candidate,
      ownerProvidedReferralUrl: "https://priklad.cz/soutez?ref=invented",
      disposition: "social-campaign-eligible" as const
    };
    expect(ContestPromotionCandidateSchema.safeParse(forged).success).toBe(false);
  });

  it("disagrees with itself safely when the rules parser found no referral mechanic", () => {
    const policy = readEntryPolicy({
      contestId: "example-contest",
      ruleText: "Jeden soutěžní příspěvek na osobu.",
      evidenceRefs: []
    });
    expect(policy.referralAllowed).toBe(false);
    const candidate = derive({
      ownerProvidedReferralUrl: "https://priklad.cz/soutez?ref=abc",
      entryPolicy: policy,
      evidence: evidence({ referralSharing: "permitted", referralOwnerStated: "permitted", bonusCapStated: "permitted" })
    });
    expect(candidate.disposition).toBe("held");
    expect(candidate.heldReasons.some((reason) => reason.includes("no referral mechanic"))).toBe(true);
  });

  it("counts several owner-controlled profiles as one entrant, not several people", () => {
    const candidate = derive({
      profiles: [
        profile(),
        profile({ profileId: "social-profile-fightaiq", ventureRef: "fightaiq" })
      ]
    });
    // Same owner, same alias: this is fine, it is one entrant with a choice of surface.
    expect(candidate.disposition).toBe("social-campaign-eligible");

    const twoPeople = derive({
      profiles: [
        profile(),
        profile({ profileId: "social-profile-partner", beneficialOwnerAlias: beneficialOwnerAlias("partner") })
      ]
    });
    expect(twoPeople.disposition).toBe("held");
    expect(twoPeople.heldReasons.some((reason) => reason.includes("one entrant"))).toBe(true);
  });

  it("holds when a simulation appears as a target", () => {
    const candidate = derive({
      profiles: [profile({
        profileId: "social-profile-simulation-two",
        accountType: "simulation",
        role: "simulation",
        state: "active",
        rejectedReason: null
      })]
    });
    expect(candidate.disposition).toBe("held");
    expect(candidate.heldReasons.some((reason) => reason.includes("simulated profile"))).toBe(true);
  });

  it("holds when no real profile is active, and when the window has closed", () => {
    expect(derive({ profiles: [profile({ state: "paused" })] }).disposition).toBe("held");
    expect(derive({ latestUsefulAt: "2026-08-01T00:00:00.000Z" }).heldReasons
      .some((reason) => reason.includes("window has already closed"))).toBe(true);
  });

  it("holds when the publish edge is unregistered or denied", () => {
    for (const decision of ["unregistered", "denied"] as const) {
      const candidate = derive({
        profiles: [profile({ capabilityEdge: {
          capability: "approved-publish-package",
          dataSchemaVersion: "contest-promotion-candidate/1",
          decision
        } })]
      });
      expect(candidate.disposition).toBe("held");
      expect(candidate.heldReasons.some((reason) => reason.includes(decision))).toBe(true);
    }
  });

  it("never records a click, a view or a share as a bonus, and caps what the owner confirmed", () => {
    const candidate = derive({ bonusCap: 3, ownerConfirmedBonuses: 3 });
    expect(candidate.riskReasons.some((reason) => reason.includes("reached the stated cap"))).toBe(true);
    expect(ContestPromotionCandidateSchema.safeParse({ ...candidate, ownerConfirmedBonuses: 4 }).success).toBe(false);
  });

  it("expires a candidate whose rules changed rather than updating it in place", () => {
    const original = derive();
    const changed = derive({ evidence: evidence({ bonusCapStated: "permitted" }) });
    expect(promotionCandidateIsCurrent({ candidate: original, recomputed: changed, now }))
      .toMatchObject({ current: false });
    expect(promotionCandidateIsCurrent({ candidate: original, recomputed: derive(), now }))
      .toMatchObject({ current: true });
  });

  it("routes a permitted referral to the manual kit when one exists", () => {
    const candidate = derive({
      ownerProvidedReferralUrl: "https://priklad.cz/soutez?ref=owner-supplied",
      evidence: evidence({ referralSharing: "permitted", referralOwnerStated: "permitted", bonusCapStated: "permitted" }),
      bonusCap: 5,
      relationshipKitAvailable: true
    });
    expect(candidate.disposition).toBe("relationship-kit-eligible");
    expect(candidate.publishingAuthorized).toBe(false);
  });
});
