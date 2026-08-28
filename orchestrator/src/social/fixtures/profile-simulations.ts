import { SocialProfileSchema, type SocialProfile } from "../../contracts/social-distribution.js";
import fixtureMatrix from "../../../../contracts/fixtures/social-profile-simulation-matrix.json" with { type: "json" };

export interface SocialProfileSimulationFixture {
  profile: SocialProfile;
  preview: {
    platform: "instagram" | "threads";
    setupState: "not-configured" | "setup-needed" | "held" | "paused" | "unavailable";
    tokenHealth: "not-configured" | "expired-simulation" | "review-required-simulation" | "healthy-simulation";
    metricState: "unavailable" | "missing-denominator" | "manual-only" | "healthy-simulation";
    error: string | null;
  };
}

const topics = fixtureMatrix.topics;
const setupStates = fixtureMatrix.setupStates;
const tokenStates = fixtureMatrix.tokenStates;
const metricStates = fixtureMatrix.metricStates;

/**
 * Explicit visual-QA boundary. These records are generated only when a test/dev caller asks for
 * them, carry no handle/native id/credential/connection and fail production target resolution.
 */
export function createSocialProfileSimulationFixtures(): SocialProfileSimulationFixture[] {
  return Array.from({ length: fixtureMatrix.count }, (_, offset) => {
    const index = offset + 1;
    const serial = String(index).padStart(2, "0");
    const longLabel = index % 10 === 0
      ? `Simulation ${serial} — deliberately extended multilingual visual-overflow label`
      : `Simulation ${serial}`;
    const setupState = setupStates[offset % setupStates.length]!;
    const profile = SocialProfileSchema.parse({
      schemaVersion: "social-profile/1",
      id: `social-profile-simulation-${serial}`,
      displayLabel: longLabel,
      kind: "simulation",
      role: "simulation",
      ownerRef: "boardlessai-fixture",
      ventureRef: null,
      brandRef: null,
      purpose: `Deterministic visual QA state ${serial}; never a public identity.`,
      audience: "Visual regression fixtures only.",
      languages: index % 3 === 0 ? ["cs", "en"] : index % 2 === 0 ? ["cs"] : ["en"],
      markets: index % 2 === 0 ? ["CZ"] : ["US"],
      supportedTopics: [topics[offset % topics.length]],
      supportedVentures: [],
      capabilityRefs: [],
      amplifierArchetype: null,
      amplifierEligibility: null,
      originalContentPromise: null,
      recurringFormatRefs: [],
      avatar: {
        kind: "identicon",
        descriptor: `abstract-identicon-social-simulation-${serial}`,
        reference: null
      },
      lifecycle: "simulation",
      liveEligible: false,
      createdAt: fixtureMatrix.fixtureTime,
      updatedAt: fixtureMatrix.fixtureTime,
      provenance: {
        source: "fixture",
        recordedBy: "system",
        evidenceRefs: [`fixture:social-profile-simulation-${serial}`],
        fixtureKey: `social-profile-simulation-${serial}`
      },
      notes: "SYNTHETIC · no person, account, handle, credential, native id or provider state."
    });
    return {
      profile,
      preview: {
        platform: index % 2 === 0 ? "instagram" : "threads",
        setupState: setupState as SocialProfileSimulationFixture["preview"]["setupState"],
        tokenHealth: tokenStates[offset % tokenStates.length]! as SocialProfileSimulationFixture["preview"]["tokenHealth"],
        metricState: metricStates[offset % metricStates.length]! as SocialProfileSimulationFixture["preview"]["metricState"],
        error: setupState === "unavailable" ? `Synthetic provider error ${serial}` : null
      }
    };
  });
}
