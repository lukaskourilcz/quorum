import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  SocialProfileStrategyRegistrySchema,
  type SocialProfileStrategy,
  type SocialProfileStrategyRegistry
} from "../contracts/social-inventory.js";
import type { SocialProfile } from "../contracts/social-distribution.js";
import type { VentureCapabilityMap } from "../contracts/venture-capability.js";
import { configRoot as defaultConfigRoot } from "../paths.js";
import { resolveVentureCapabilityInMap } from "../ventures/capabilities.js";

export interface SocialProfileStrategyResolution {
  decision: "eligible" | "held" | "denied";
  reasons: string[];
  strategy: SocialProfileStrategy | null;
  authorityGranted: false;
  queueAuthorized: false;
  publishingAuthorized: false;
}

function resolution(
  decision: SocialProfileStrategyResolution["decision"],
  reasons: string[],
  strategy: SocialProfileStrategy | null = null
): SocialProfileStrategyResolution {
  return { decision, reasons: [...new Set(reasons)], strategy, authorityGranted: false, queueAuthorized: false, publishingAuthorized: false };
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

export function resolveEffectiveSocialProfileStrategy(input: {
  profile: unknown;
  registry: unknown;
  capabilityMap: VentureCapabilityMap;
  now?: Date;
}): SocialProfileStrategyResolution {
  const registry = SocialProfileStrategyRegistrySchema.safeParse(input.registry);
  const profile = input.profile as Partial<SocialProfile> | null;
  if (!registry.success || !profile || typeof profile !== "object" || typeof profile.id !== "string") {
    return resolution("denied", ["malformed-profile-or-strategy-registry"]);
  }
  const strategy = registry.data.strategies.find(({ profileId }) => profileId === profile.id) ?? null;
  if (!strategy) return resolution("held", ["profile-strategy-missing"]);
  if (profile.kind !== "owned-brand" || !["venture-primary", "company-umbrella", "owned-amplifier"].includes(profile.role ?? "")) {
    return resolution("denied", ["simulation-contact-or-owner-personal-strategy-forbidden"], strategy);
  }
  if (["personal-growth", "kvorum", "goviral", "contest-radar"].includes(profile.ventureRef ?? "")) {
    return resolution("denied", ["permanently-isolated-profile-strategy"] , strategy);
  }
  if (strategy.profileRole !== profile.role || strategy.purpose !== profile.purpose || strategy.audience !== profile.audience
    || !sameValues(strategy.languages, profile.languages ?? []) || !sameValues(strategy.markets, profile.markets ?? [])) {
    return resolution("denied", ["strategy-profile-constitution-mismatch"], strategy);
  }
  const profileCapabilities = profile.capabilityRefs ?? [];
  if (profileCapabilities.some((reference) => !strategy.allowedCapabilities.some((candidate) => JSON.stringify(candidate) === JSON.stringify(reference)))) {
    return resolution("denied", ["strategy-capability-set-mismatch"], strategy);
  }
  for (const reference of strategy.allowedCapabilities) {
    const resolved = resolveVentureCapabilityInMap(input.capabilityMap, {
      source: reference.source,
      target: "social-distribution",
      capability: reference.capability,
      schemaVersion: reference.dataSchemaVersion
    });
    if (resolved.decision !== "allowed" || !resolved.edge || input.capabilityMap.mapVersion !== reference.mapVersion
      || resolved.edge.governingReference !== reference.decisionReference || resolved.edge.dataSchemaVersion !== reference.dataSchemaVersion) {
      return resolution("denied", ["missing-stale-held-or-denied-strategy-capability"], strategy);
    }
  }
  if (profile.role === "owned-amplifier" && (profile.amplifierEligibility?.verdict !== "accept" || profile.amplifierEligibility.canonicalPolicyRef !== "GitHub #415")) {
    return resolution("held", ["amplifier-purpose-or-policy-not-accepted"], strategy);
  }
  if (new Date(`${strategy.reviewDate}T23:59:59.999Z`) < (input.now ?? new Date())) {
    return resolution("held", ["strategy-review-overdue"], strategy);
  }
  return resolution("eligible", ["canonical-strategy-current"], strategy);
}

export function validateStrategyCoverage(input: {
  profiles: readonly SocialProfile[];
  registry: unknown;
}): { covered: string[]; missing: string[]; forbidden: string[] } {
  const registry = SocialProfileStrategyRegistrySchema.parse(input.registry);
  const realProfiles = input.profiles.filter((profile) => profile.kind === "owned-brand" && ["venture-primary", "company-umbrella", "owned-amplifier"].includes(profile.role));
  const realIds = new Set(realProfiles.map(({ id }) => id));
  return {
    covered: realProfiles.filter((profile) => registry.strategies.some(({ profileId }) => profileId === profile.id)).map(({ id }) => id),
    missing: realProfiles.filter((profile) => !registry.strategies.some(({ profileId }) => profileId === profile.id)).map(({ id }) => id),
    forbidden: registry.strategies.filter(({ profileId }) => !realIds.has(profileId)).map(({ profileId }) => profileId)
  };
}

export async function loadSocialProfileStrategies(root: string = defaultConfigRoot): Promise<SocialProfileStrategyRegistry> {
  const source = await readFile(path.join(root, "social-profile-strategies.json"), "utf8");
  return SocialProfileStrategyRegistrySchema.parse(JSON.parse(source) as unknown);
}
