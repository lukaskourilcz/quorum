import { describe, expect, it } from "vitest";
import { SocialProfileStrategyRegistrySchema } from "../src/contracts/social-inventory.js";
import { configRoot } from "../src/paths.js";
import { loadSocialPublisherRegistry } from "../src/social/publisher-targets.js";
import {
  loadSocialProfileStrategies,
  resolveEffectiveSocialProfileStrategy,
  validateStrategyCoverage
} from "../src/social/strategies.js";
import { loadVentureCapabilityMap } from "../src/ventures/capabilities.js";

describe("Social Distribution profile strategies", () => {
  it("gives every real profile one canonical versioned constitution", async () => {
    const [strategies, publisher, capabilityMap] = await Promise.all([
      loadSocialProfileStrategies(),
      loadSocialPublisherRegistry(),
      loadVentureCapabilityMap(configRoot)
    ]);
    expect(SocialProfileStrategyRegistrySchema.safeParse(strategies).success).toBe(true);
    // Eleven: six brands, WebDev Signal's two locale editions and devShark's three platforms
    // (quorum#569), each a separate profile. The coverage check below is the assertion with teeth —
    // every profile has exactly one constitution and no strategy exists without a profile.
    expect(strategies.strategies).toHaveLength(11);
    expect(validateStrategyCoverage({ profiles: publisher.profiles, registry: strategies })).toEqual({
      covered: publisher.profiles.map(({ id }) => id), missing: [], forbidden: []
    });
    for (const profile of publisher.profiles) {
      const stale = profile.capabilityRefs.some(ref => ref.mapVersion !== capabilityMap.mapVersion);
      expect(resolveEffectiveSocialProfileStrategy({ profile, registry: strategies, capabilityMap, now: new Date("2026-08-28T00:00:00.000Z") })).toMatchObject({
        decision: stale ? "denied" : "eligible", strategy: { profileId: profile.id }, authorityGranted: false, queueAuthorized: false, publishingAuthorized: false
      });
    }
  });

  it("does not renew committed profile or strategy pins when an unrelated source edge is added", async () => {
    const [strategies, publisher, capabilityMap] = await Promise.all([loadSocialProfileStrategies(), loadSocialPublisherRegistry(), loadVentureCapabilityMap(configRoot)]);
    const profile = publisher.profiles.find(({ id }) => id === "social-profile-door-money")!;
    const strategy = strategies.strategies.find(({ profileId }) => profileId === profile.id)!;
    expect(capabilityMap.mapVersion).toBe("1.6.0");
    expect(profile.capabilityRefs[0]?.mapVersion).toBe("1.5.0");
    expect(strategy.allowedCapabilities[0]?.mapVersion).toBe("1.5.0");
    expect(resolveEffectiveSocialProfileStrategy({ profile, registry: strategies, capabilityMap })).toMatchObject({ decision: "denied", reasons: ["missing-stale-held-or-denied-strategy-capability"], queueAuthorized: false, publishingAuthorized: false });
    const fixtureRegistry = structuredClone(strategies);
    const fixtureProfile = structuredClone(profile);
    fixtureProfile.capabilityRefs = fixtureProfile.capabilityRefs.map(ref => ({ ...ref, mapVersion: capabilityMap.mapVersion }));
    fixtureRegistry.strategies.find(({ profileId }) => profileId === profile.id)!.allowedCapabilities = fixtureProfile.capabilityRefs;
    expect(resolveEffectiveSocialProfileStrategy({ profile: fixtureProfile, registry: fixtureRegistry, capabilityMap, now: new Date("2026-10-13T00:00:00Z") })).toMatchObject({ decision: "eligible", authorityGranted: false, queueAuthorized: false, publishingAuthorized: false });
  });

  it("denies stale capabilities, simulations and strategy drift", async () => {
    const [strategies, publisher, capabilityMap] = await Promise.all([loadSocialProfileStrategies(), loadSocialPublisherRegistry(), loadVentureCapabilityMap(configRoot)]);
    const doorMoney = publisher.profiles.find(({ id }) => id === "social-profile-door-money")!;
    const staleRegistry = structuredClone(strategies);
    staleRegistry.strategies.find(({ profileId }) => profileId === doorMoney.id)!.allowedCapabilities[0]!.mapVersion = "1.0.0";
    expect(resolveEffectiveSocialProfileStrategy({ profile: doorMoney, registry: staleRegistry, capabilityMap })).toMatchObject({ decision: "denied" });
    expect(resolveEffectiveSocialProfileStrategy({ profile: { ...doorMoney, kind: "simulation", role: "simulation" }, registry: strategies, capabilityMap })).toMatchObject({
      decision: "denied", reasons: ["simulation-contact-or-owner-personal-strategy-forbidden"]
    });
    expect(resolveEffectiveSocialProfileStrategy({ profile: { ...doorMoney, purpose: "Changed without a strategy version." }, registry: strategies, capabilityMap })).toMatchObject({
      decision: "denied", reasons: ["strategy-profile-constitution-mismatch"]
    });
  });

  it("keeps model use, queueing and publishing disabled in committed strategies", async () => {
    const registry = await loadSocialProfileStrategies();
    expect(registry.strategies.every((strategy) =>
      strategy.generationPolicy.deterministicFirst
      && strategy.generationPolicy.maximumModelCallsPerBuild === 0
      && strategy.generationPolicy.maximumCostUsdPerBuild === 0
      && !strategy.authorityGranted
      && !strategy.queueAuthorized
      && !strategy.publishingAuthorized
      && strategy.assets.rendererRef === "Design Lab"
    )).toBe(true);
    expect(JSON.stringify(registry)).not.toMatch(/personal experience is allowed|wildcard portfolio|automatic publish/iu);
  });
});
