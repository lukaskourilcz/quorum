import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AmplificationPolicySchema,
  DistributionContactSchema,
  SocialCampaignSchema,
  SocialConnectionSchema,
  SocialProfileEventSchema,
  SocialProfileSchema,
  SocialShareKitSchema,
  parseSocialDistributionRecords,
  resolveSocialProfileConnection
} from "../src/contracts/social-distribution.js";
import { repoRoot } from "../src/paths.js";
import { createSocialProfileSimulationFixtures } from "../src/social/fixtures/profile-simulations.js";

const contracts = {
  profile: SocialProfileSchema,
  connection: SocialConnectionSchema,
  contact: DistributionContactSchema,
  campaign: SocialCampaignSchema,
  shareKit: SocialShareKitSchema,
  profileEvent: SocialProfileEventSchema,
  policy: AmplificationPolicySchema
} as const;

type ContractKey = keyof typeof contracts;

async function fixture(name: "valid" | "poison"): Promise<Record<ContractKey, unknown>> {
  const source = await readFile(
    path.join(repoRoot, `contracts/fixtures/social-distribution-contracts.${name}.json`),
    "utf8"
  );
  return JSON.parse(source) as Record<ContractKey, unknown>;
}

describe("Social Distribution contracts", () => {
  it("accepts the public fixtures and rejects every poison record", async () => {
    const [valid, poison] = await Promise.all([fixture("valid"), fixture("poison")]);

    for (const key of Object.keys(contracts) as ContractKey[]) {
      expect(contracts[key].safeParse(valid[key]).success, `${key} valid fixture`).toBe(true);
      expect(contracts[key].safeParse(poison[key]).success, `${key} poison fixture`).toBe(false);
    }
  });

  it("drops malformed input without leaking rejected values", async () => {
    const [valid, poison] = await Promise.all([fixture("valid"), fixture("poison")]);
    const result = parseSocialDistributionRecords([valid.profile, poison.profile], SocialProfileSchema);

    expect(result.accepted).toEqual([SocialProfileSchema.parse(valid.profile)]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]).toMatchObject({ index: 1 });
    expect(JSON.stringify(result.dropped)).not.toContain("secret");
  });

  it("keeps publishing authority outside schema validation", async () => {
    const valid = await fixture("valid");
    const held = resolveSocialProfileConnection(valid.profile, valid.connection);

    expect(held).toEqual({
      decision: "held",
      authorityGranted: false,
      publishingAuthorized: false,
      reason: "profile-not-live-eligible"
    });

    const profile = {
      ...(valid.profile as Record<string, unknown>),
      kind: "owner-personal",
      role: "owner-personal",
      ventureRef: null,
      supportedVentures: [],
      capabilityRefs: [],
      liveEligible: false
    };
    expect(SocialProfileSchema.safeParse(profile).success).toBe(true);
    expect(resolveSocialProfileConnection(profile, valid.connection)).toMatchObject({
      decision: "held",
      authorityGranted: false,
      publishingAuthorized: false
    });
  });

  it("requires #415 acceptance before an amplifier can enter setup or live state", async () => {
    const valid = await fixture("valid");
    const amplifier = {
      ...(valid.profile as Record<string, unknown>),
      id: "social-profile-fixture-amplifier",
      role: "owned-amplifier",
      ventureRef: null,
      supportedVentures: [],
      capabilityRefs: [],
      amplifierArchetype: "topic-editorial",
      amplifierEligibility: null,
      originalContentPromise: "Publish original editorial context before any supported release.",
      recurringFormatRefs: ["weekly-context", "source-notes"],
      lifecycle: "setup-needed"
    };

    expect(SocialProfileSchema.safeParse(amplifier).success).toBe(false);
  });

  it("generates exactly 50 deterministic, non-live simulation profiles", async () => {
    const first = createSocialProfileSimulationFixtures();
    const second = createSocialProfileSimulationFixtures();

    expect(first).toEqual(second);
    expect(first).toHaveLength(50);
    expect(new Set(first.map(({ profile }) => profile.id)).size).toBe(50);
    expect(new Set(first.map(({ profile }) => profile.displayLabel)).size).toBe(50);
    expect(first.some(({ profile }) => profile.displayLabel.length > 60)).toBe(true);

    const valid = await fixture("valid");
    for (const { profile } of first) {
      expect(profile).toMatchObject({
        kind: "simulation",
        role: "simulation",
        lifecycle: "simulation",
        liveEligible: false,
        ventureRef: null,
        capabilityRefs: []
      });
      expect(profile).not.toHaveProperty("publicHandle");
      expect(profile).not.toHaveProperty("nativeAccountId");
      expect(profile).not.toHaveProperty("credentialRef");
      const serial = profile.id.slice(-2);
      const connection = {
        ...(valid.connection as Record<string, unknown>),
        id: `social-connection-simulation-${serial}`,
        profileId: profile.id,
        platform: "threads",
        connector: {
          id: "meta-threads",
          version: "1.0.0",
          providerId: "direct-meta",
          apiVersion: "v26.0",
          loginMode: "threads-oauth"
        },
        approvedScopes: ["threads_basic", "threads_content_publish"],
        health: { status: "unverified", unavailableReason: "not-configured" }
      };
      expect(SocialConnectionSchema.safeParse(connection).success).toBe(true);
      expect(resolveSocialProfileConnection(profile, connection)).toEqual({
        decision: "denied",
        authorityGranted: false,
        publishingAuthorized: false,
        reason: "simulation-fixture"
      });
    }
  });

  it("does not import simulations into production Social Distribution runtime", async () => {
    const socialRoot = path.join(repoRoot, "orchestrator/src/social");
    const files = (await readdir(socialRoot, { recursive: true }))
      .filter((entry) => entry.endsWith(".ts") && entry !== "fixtures/profile-simulations.ts");
    const sources = await Promise.all(files.map((entry) => readFile(path.join(socialRoot, entry), "utf8")));

    expect(sources.join("\n")).not.toContain("fixtures/profile-simulations");
  });

  it("has no structural fields or actions for secrets, impersonation or engagement", async () => {
    const valid = await fixture("valid");

    expect(SocialProfileSchema.safeParse({ ...(valid.profile as object), accessToken: "secret" }).success).toBe(false);
    expect(SocialConnectionSchema.safeParse({ ...(valid.connection as object), sessionCookie: "secret" }).success).toBe(false);
    expect(DistributionContactSchema.safeParse({ ...(valid.contact as object), publishAs: true }).success).toBe(false);
    expect(SocialProfileEventSchema.safeParse({ ...(valid.profileEvent as object), action: "liked" }).success).toBe(false);
    expect(SocialShareKitSchema.safeParse({ ...(valid.shareKit as object), deliveryMode: "provider-send" }).success).toBe(false);
    expect(SocialCampaignSchema.safeParse({ ...(valid.campaign as object), sourceVentureId: "personal-growth" }).success).toBe(false);
  });
});
