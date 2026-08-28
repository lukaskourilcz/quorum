import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AmplificationPolicySchema } from "../src/contracts/social-distribution.js";
import { configRoot, repoRoot, stateRoot } from "../src/paths.js";
import {
  AmplifierPortfolioSchema,
  AmplifierProposalSchema,
  evaluateAmplifierPurpose,
  generateAmplifierSetupPacket,
  loadCanonicalAmplifierState,
  resolveAmplifierEligibility,
  resolveEffectiveAmplifierPolicy,
  type AmplifierProposal,
  type AmplifierSupportContext
} from "../src/social/amplifiers.js";
import { loadVentureCapabilityMap } from "../src/ventures/capabilities.js";

async function proposalFixture(): Promise<AmplifierProposal> {
  const source = await readFile(
    path.join(repoRoot, "contracts/fixtures/social-amplifier-proposal.valid.json"),
    "utf8"
  );
  return AmplifierProposalSchema.parse(JSON.parse(source) as unknown);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function identify(proposal: AmplifierProposal, suffix: string): AmplifierProposal {
  return {
    ...proposal,
    id: `amplifier-proposal-${suffix}`,
    profileId: `social-profile-${suffix}`,
    workingName: suffix.split("-").map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`).join(" "),
    publicNameCandidates: [`${suffix} editorial`],
    publicHandleCandidates: [`@${suffix.replace(/-/gu, "_")}`]
  };
}

describe("owned amplifier portfolio and policy", () => {
  it("loads one empty canonical portfolio and one versioned central policy", async () => {
    const canonical = await loadCanonicalAmplifierState({ stateRoot, configRoot });

    expect(AmplifierPortfolioSchema.safeParse(canonical.portfolio).success).toBe(true);
    expect(canonical.portfolio).toMatchObject({
      schemaVersion: "social-amplifier-portfolio/1",
      version: "1.0.0",
      proposals: []
    });
    expect(AmplificationPolicySchema.safeParse(canonical.policy).success).toBe(true);
    expect(canonical.policy.values).toMatchObject({
      minimumOriginalContentRatio: 0.7,
      maximumVentureSupportRatio: 0.3,
      originalContentRunwayPosts: 10,
      sameSourceVentureCooldownDays: 10,
      maximumActiveSupportCampaigns: 2,
      duplicateAssetRejected: true,
      audienceSpecificAngleRequired: true,
      staggerRequired: true
    });
  });

  it("accepts strong topic, language-market and format brand proposals", async () => {
    const [base, map] = await Promise.all([proposalFixture(), loadVentureCapabilityMap(configRoot)]);
    const language = identify(clone(base), "web-craft-cz");
    language.archetype = "language-market";
    language.languages = ["cs"];
    language.markets = ["CZ"];
    language.platformDirection.markets = ["CZ"];
    language.supportedVentures = ["webdev-signal"];
    language.capabilityRefs = [{ ...language.capabilityRefs[0]!, source: "webdev-signal" }];
    language.purpose = "Provide substantively localized Czech web-development explanations, not translated reposts.";
    language.audience = "Czech-speaking working web developers.";
    language.independentReasonToFollow = "Every item adds local examples, terminology and original editorial framing.";
    const format = identify(clone(language), "web-systems-cards");
    format.archetype = "format";
    format.purpose = "Publish original visual system cards for recurring web architecture decisions.";
    format.independentReasonToFollow = "The stable visual decision-card format is useful without a venture release.";

    for (const proposal of [base, language, format]) {
      expect(AmplifierProposalSchema.safeParse(proposal).success).toBe(true);
      expect(evaluateAmplifierPurpose(proposal, map)).toMatchObject({
        verdict: "accept",
        authorityGranted: false,
        publishingAuthorized: false
      });
    }
  });

  it("rejects fake people, repost farms, conversion and denied capability edges", async () => {
    const [base, map] = await Promise.all([proposalFixture(), loadVentureCapabilityMap(configRoot)]);
    const fakePerson = { ...clone(base), profileKind: "owner-personal" };
    const repostFarm = { ...clone(base), identity: { ...base.identity, repostOnly: true } };
    const simulation = { ...clone(base), proposalOrigin: "simulation" };
    const contact = { ...clone(base), proposalOrigin: "contact" };
    const deniedEdge = clone(base);
    deniedEdge.supportedVentures = ["fightaiq"];
    deniedEdge.capabilityRefs = [{ ...deniedEdge.capabilityRefs[0]!, source: "fightaiq" }];

    for (const poison of [fakePerson, repostFarm, simulation, contact, deniedEdge]) {
      const result = evaluateAmplifierPurpose(poison, map);
      expect(result.verdict).toBe("reject");
      expect(result.authorityGranted).toBe(false);
      expect(result.publishingAuthorized).toBe(false);
    }
    expect(evaluateAmplifierPurpose(fakePerson, map).reasons.map(({ code }) => code)).toContain("transparent-brand-required");
    expect(evaluateAmplifierPurpose(repostFarm, map).reasons.map(({ code }) => code)).toContain("forbidden-purpose");
    expect(evaluateAmplifierPurpose(simulation, map).reasons.map(({ code }) => code)).toContain("conversion-forbidden");
    expect(evaluateAmplifierPurpose(deniedEdge, map).reasons.map(({ code }) => code)).toContain("capability-denied");
  });

  it("holds incomplete formats, pending direction and conflicting names", async () => {
    const [base, map] = await Promise.all([proposalFixture(), loadVentureCapabilityMap(configRoot)]);
    const oneFormat = clone(base);
    oneFormat.repeatableFormats = [oneFormat.repeatableFormats[0]!];
    oneFormat.launchRunway.firstOriginalConcepts = oneFormat.launchRunway.firstOriginalConcepts.map((concept) => ({
      ...concept,
      formatRef: oneFormat.repeatableFormats[0]!.id
    }));
    expect(evaluateAmplifierPurpose(oneFormat, map)).toMatchObject({ verdict: "hold" });
    expect(evaluateAmplifierPurpose(oneFormat, map).reasons.map(({ code }) => code)).toContain("two-formats-required");

    const pending = clone(base);
    pending.platformDirection = { ...pending.platformDirection, verdict: "pending", ownerEvidenceRef: null };
    expect(evaluateAmplifierPurpose(pending, map).reasons.map(({ code }) => code)).toContain("direction-not-approved");

    const conflict = evaluateAmplifierPurpose(base, map, { existingNames: ["  FOUNDERS LEDGER "] });
    expect(conflict.verdict).toBe("hold");
    expect(conflict.reasons.map(({ code }) => code)).toContain("name-conflict");
  });

  it("resolves central, platform, profile and proposal rules once, with stricter values winning", async () => {
    const [{ policy }, proposal] = await Promise.all([
      loadCanonicalAmplifierState({ stateRoot, configRoot }),
      proposalFixture()
    ]);
    const effective = resolveEffectiveAmplifierPolicy(policy, proposal, "instagram");

    expect(effective).toMatchObject({
      valid: true,
      minimumOriginalContentRatio: 0.8,
      maximumVentureSupportRatio: 0.2,
      originalContentRunwayPosts: 10,
      sameSourceVentureCooldownDays: 14,
      maximumActiveSupportCampaigns: 1,
      minimumStaggerHours: 8,
      audienceSpecificAngleRequired: true
    });

    const looser = clone(proposal);
    looser.maximumSupportRatio = 0.4;
    looser.policyOverride = {
      minimumOriginalContentRatio: 0.6,
      maximumVentureSupportRatio: 0.4,
      sameSourceVentureCooldownDays: 5,
      maximumActiveSupportCampaigns: 3,
      minimumStaggerHours: 1,
      reason: "Poison loosening."
    };
    expect(resolveEffectiveAmplifierPolicy(policy, looser, "instagram")).toMatchObject({
      valid: false,
      minimumOriginalContentRatio: 0.75,
      maximumVentureSupportRatio: 0.25
    });
  });

  it("exposes setup and support eligibility without granting authority", async () => {
    const [{ policy, capabilityMap }, proposal] = await Promise.all([
      loadCanonicalAmplifierState({ stateRoot, configRoot }),
      proposalFixture()
    ]);
    const proposed = resolveAmplifierEligibility({ proposal, policy, capabilityMap, platform: "instagram" });
    expect(proposed.setupEligibility).toEqual({ eligible: true, reasons: [] });
    expect(proposed.launchRunway).toEqual({ required: 10, completed: 0, held: true });
    expect(proposed.supportEligibility).toMatchObject({ eligible: false });
    expect(proposed.authorityGranted).toBe(false);
    expect(proposed.publishingAuthorized).toBe(false);

    const active = clone(proposal);
    active.lifecycle = "active";
    active.launchRunway.completedOriginalPosts = 10;
    active.launchRunway.evidenceRefs = ["fixture:runway-complete-001"];
    const eligibleContext: AmplifierSupportContext = {
      sourceVentureId: "door-money",
      rollingOriginalPosts: 9,
      rollingSupportPosts: 0,
      activeSupportCampaigns: 0,
      daysSinceSameSourceVenture: null,
      duplicateCaption: false,
      duplicateAsset: false,
      staggerHours: 8,
      hasAudienceSpecificAngle: true
    };
    const eligible = resolveAmplifierEligibility({ proposal: active, policy, capabilityMap, platform: "instagram", supportContext: eligibleContext });
    expect(eligible.supportEligibility).toEqual({ eligible: true, reasons: [] });

    for (const lifecycle of ["paused", "retired"] as const) {
      const inactive = { ...active, lifecycle };
      expect(resolveAmplifierEligibility({ proposal: inactive, policy, capabilityMap, platform: "instagram", supportContext: eligibleContext }).supportEligibility.eligible).toBe(false);
    }
    expect(resolveAmplifierEligibility({
      proposal: active,
      policy,
      capabilityMap,
      platform: "instagram",
      supportContext: { ...eligibleContext, sourceVentureId: "webdev-signal" }
    }).supportEligibility.reasons).toContain("irrelevant-or-denied-source-venture");
    expect(resolveAmplifierEligibility({
      proposal: active,
      policy,
      capabilityMap,
      platform: "instagram",
      supportContext: { ...eligibleContext, daysSinceSameSourceVenture: 2 }
    }).supportEligibility.reasons).toContain("same-source-cooldown-active");
  });

  it("generates a manual owner setup packet with reference names but no secrets or activation", async () => {
    const [{ policy, capabilityMap }, proposal] = await Promise.all([
      loadCanonicalAmplifierState({ stateRoot, configRoot }),
      proposalFixture()
    ]);
    const eligibility = resolveAmplifierEligibility({ proposal, policy, capabilityMap, platform: "instagram" });
    const result = generateAmplifierSetupPacket(eligibility);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.packet.firstTenOriginalConcepts).toHaveLength(10);
    expect(result.packet.platformSetups).toEqual([
      expect.objectContaining({ platform: "instagram", loginMode: "instagram-login", requiredScopes: ["instagram_business_basic", "instagram_business_content_publish"] }),
      expect.objectContaining({ platform: "threads", loginMode: "threads-oauth", requiredScopes: ["threads_basic", "threads_content_publish"] })
    ]);
    expect(result.packet.platformSetups.every((setup) => /^[A-Z][A-Z0-9_]+_CREDENTIAL_REF$/u.test(setup.credentialReferenceName))).toBe(true);
    expect(result.packet).toMatchObject({ authorityGranted: false, publishingAuthorized: false });
    expect(JSON.stringify(result.packet)).not.toMatch(/access[_-]?token|session[_-]?cookie|client[_-]?secret/iu);
  });
});
