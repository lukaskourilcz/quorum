import matrix from "../../../../contracts/fixtures/social-profile-simulation-matrix.json";
import { parseSocialProfile, type SocialProfileRecord } from "./model";

export interface SocialProfileSimulationView {
  profile: SocialProfileRecord;
  preview: {
    platform: "instagram" | "threads";
    setupState: "not-configured" | "setup-needed" | "held" | "paused" | "unavailable";
    tokenHealth: "not-configured" | "expired-simulation" | "review-required-simulation" | "healthy-simulation";
    metricState: "unavailable" | "missing-denominator" | "manual-only" | "healthy-simulation";
    error: string | null;
  };
}

export function createAdminSocialProfileSimulations(): SocialProfileSimulationView[] {
  return Array.from({ length: matrix.count }, (_, offset) => {
    const index = offset + 1;
    const serial = String(index).padStart(2, "0");
    const setupState = matrix.setupStates[offset % matrix.setupStates.length]! as SocialProfileSimulationView["preview"]["setupState"];
    const raw = {
      schemaVersion: "social-profile/1",
      id: `social-profile-simulation-${serial}`,
      displayLabel: index % 10 === 0 ? `Simulation ${serial} — deliberately extended multilingual visual-overflow label` : `Simulation ${serial}`,
      kind: "simulation",
      role: "simulation",
      ownerRef: "boardlessai-fixture",
      ventureRef: null,
      brandRef: null,
      purpose: `Deterministic visual QA state ${serial}; never a public identity.`,
      audience: "Visual regression fixtures only.",
      languages: index % 3 === 0 ? ["cs", "en"] : index % 2 === 0 ? ["cs"] : ["en"],
      markets: index % 2 === 0 ? ["CZ"] : ["US"],
      supportedTopics: [matrix.topics[offset % matrix.topics.length]],
      supportedVentures: [],
      capabilityRefs: [],
      amplifierArchetype: null,
      amplifierEligibility: null,
      originalContentPromise: null,
      recurringFormatRefs: [],
      avatar: { kind: "identicon", descriptor: `abstract-identicon-social-simulation-${serial}`, reference: null },
      lifecycle: "simulation",
      liveEligible: false,
      createdAt: matrix.fixtureTime,
      updatedAt: matrix.fixtureTime,
      provenance: { source: "fixture", recordedBy: "system", evidenceRefs: [`fixture:social-profile-simulation-${serial}`], fixtureKey: `social-profile-simulation-${serial}` },
      notes: "SYNTHETIC · no person, account, handle, credential, native id or provider state."
    };
    const profile = parseSocialProfile(raw);
    if (!profile) throw new Error(`Shared Social Profile simulation ${serial} is malformed.`);
    return {
      profile,
      preview: {
        platform: index % 2 === 0 ? "instagram" : "threads",
        setupState,
        tokenHealth: matrix.tokenStates[offset % matrix.tokenStates.length]! as SocialProfileSimulationView["preview"]["tokenHealth"],
        metricState: matrix.metricStates[offset % matrix.metricStates.length]! as SocialProfileSimulationView["preview"]["metricState"],
        error: setupState === "unavailable" ? `Synthetic provider error ${serial}` : null
      }
    };
  });
}
