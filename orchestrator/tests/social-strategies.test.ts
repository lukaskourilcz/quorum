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
    // Eight: six brands plus WebDev Signal's two locale editions, which are separate profiles
    // rather than one mixed-language feed. The coverage check below is the assertion with teeth —
    // every profile has exactly one constitution and no strategy exists without a profile.
    expect(strategies.strategies).toHaveLength(8);
    expect(validateStrategyCoverage({ profiles: publisher.profiles, registry: strategies })).toEqual({
      covered: publisher.profiles.map(({ id }) => id), missing: [], forbidden: []
    });
    for (const profile of publisher.profiles) {
      expect(resolveEffectiveSocialProfileStrategy({ profile, registry: strategies, capabilityMap, now: new Date("2026-08-28T00:00:00.000Z") })).toMatchObject({
        decision: "eligible", strategy: { profileId: profile.id }, authorityGranted: false, queueAuthorized: false, publishingAuthorized: false
      });
    }
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
