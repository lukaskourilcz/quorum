import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PersonalGrowthManualVentureReferenceSchema,
  PersonalGrowthReelSuggestionSchema,
  type PersonalGrowthManualVentureReference,
  type PersonalGrowthReelSuggestion
} from "../src/contracts/personal-growth-recommendations.js";
import {
  assertPersonalGrowthContentPolicyUpdate,
  buildPersonalGrowthInstagramRecommendation,
  evaluatePersonalGrowthManualReference,
  loadPersonalGrowthContentConfig
} from "../src/ventures/personal-growth/recommendations.js";
import { repoRoot } from "../src/paths.js";

const now = new Date("2026-08-27T21:00:00.000Z");

function manualReference(overrides: Partial<PersonalGrowthManualVentureReference> = {}) {
  return {
    schemaVersion: "owner-manual-reference/1" as const,
    referenceId: "pg-manual-ref-0123456789abcdef",
    sourceProject: "caught-up",
    publicItemId: "public-123",
    publicUrl: "https://example.com/public-123",
    ownerAuthored: true,
    personalConnection: null,
    ownerCommentaryNote: "Napsal jsem tenhle text a doplním, proč pro mě vznikl.",
    publicationVerifiedByOwner: true as const,
    ownerManuallySupplied: true as const,
    personalItemsInRollingWindow: 6,
    ventureItemsInRollingWindow: 0,
    requestedAction: "RESHARE_WITH_PERSONAL_NOTE" as const,
    recordedAt: "2026-08-27T20:00:00.000Z",
    expiresAt: "2026-08-29T20:00:00.000Z",
    ownerProvenanceRef: "owner-entry:manual-123",
    ...overrides
  };
}

function reel(overrides: Partial<PersonalGrowthReelSuggestion> = {}) {
  return PersonalGrowthReelSuggestionSchema.parse({
    suggestionId: "pg-reel-0123456789abcdef",
    series: "life-between-projects",
    concept: "Krátký záběr z cesty mezi psaním a tréninkem.",
    purpose: "Ukázat obyčejný den bez inscenace.",
    durationBandSeconds: [15, 30],
    assetChecklist: ["Vlastní dnešní záběr"],
    shotChecklist: ["Cesta", "Detail zápisníku"],
    language: "cs",
    subtitleLanguages: [],
    collaborator: null,
    trendExpiresAt: null,
    ownerMemoryEvidenceRefs: ["owner-note:2026-08-27"],
    considerTrialReel: false,
    experimentId: null,
    ...overrides
  });
}

describe("Personal Growth Instagram and Reels planning", () => {
  it("seeds the 85/15 owner-centred policy, pillars and five recurring Reel formats", async () => {
    const config = await loadPersonalGrowthContentConfig();
    expect(config.policy.revisions.at(-1)).toMatchObject({
      personalFeedMinimum: 0.85,
      ventureLedMaximum: 0.15,
      ventureStoriesPerSevenDaysMaximum: 2,
      sameVentureCooldownDays: 10
    });
    expect(config.policy).toMatchObject({
      automaticVentureDiscovery: false,
      automaticVentureNomination: false,
      automaticReshare: false,
      kvorumEligible: false
    });
    expect(config.pillars).toHaveLength(11);
    expect(config.reelFormats).toEqual([
      "rapovej-moment", "behind-the-page", "life-between-projects", "trend-met-memory", "english-rapovej-denik"
    ]);
  });

  it("accepts only an owner-manual published reference inside ratio and cooldown caps", async () => {
    const { policy } = await loadPersonalGrowthContentConfig();
    const accepted = evaluatePersonalGrowthManualReference({ reference: manualReference(), policy, history: [], now });
    expect(accepted).toMatchObject({ accepted: true, projectedPersonalRatio: 6 / 7 });
    expect(buildPersonalGrowthInstagramRecommendation({
      recommendationDate: "2026-08-28",
      generatedAt: now,
      actionType: "owner-manual-venture-reshare",
      pillar: "writing-publishing",
      goal: "Contextualise owner-authored work.",
      dueWindow: "evening",
      ownerSourceRefs: ["owner-entry:manual-123"],
      reason: "The bounded owner reference clears current policy.",
      manualReferenceEvaluation: accepted
    })).toMatchObject({
      actionType: "owner-manual-venture-reshare",
      manualVentureReferenceId: "pg-manual-ref-0123456789abcdef",
      ownerWritesArtifact: true,
      publishingAuthorized: false
    });
  });

  it("rejects missing commentary, automatic nomination, Kvórum and MMA Files without a personal connection", () => {
    expect(PersonalGrowthManualVentureReferenceSchema.safeParse(manualReference({ ownerCommentaryNote: "" })).success).toBe(false);
    expect(PersonalGrowthManualVentureReferenceSchema.safeParse({ ...manualReference(), automaticNominationId: "portfolio-auto-1" }).success).toBe(false);
    expect(PersonalGrowthManualVentureReferenceSchema.safeParse(manualReference({ sourceProject: "kvorum" })).success).toBe(false);
    expect(PersonalGrowthManualVentureReferenceSchema.safeParse(manualReference({
      sourceProject: "mma-files", ownerAuthored: false, personalConnection: null
    })).success).toBe(false);
    expect(PersonalGrowthManualVentureReferenceSchema.safeParse(manualReference({
      sourceProject: "mma-files", ownerAuthored: false, personalConnection: "Osobně jsem byl u natáčení rozhovoru."
    })).success).toBe(true);
  });

  it("turns ratio and same-venture cooldown violations into first-class NO_POST", async () => {
    const { policy } = await loadPersonalGrowthContentConfig();
    const ratioBlocked = evaluatePersonalGrowthManualReference({
      reference: manualReference({ personalItemsInRollingWindow: 5 }), policy, history: [], now
    });
    expect(ratioBlocked).toMatchObject({ accepted: false, reasons: ["85-15-policy"] });
    const cooldownBlocked = evaluatePersonalGrowthManualReference({
      reference: manualReference(), policy,
      history: [{ date: "2026-08-24", action: "story-reshare", classification: "owner-manual-venture-led", sourceProject: "caught-up" }],
      now
    });
    expect(cooldownBlocked.reasons).toContain("same-venture-cooldown");
    expect(buildPersonalGrowthInstagramRecommendation({
      recommendationDate: "2026-08-28", generatedAt: now,
      actionType: "owner-manual-venture-reshare", pillar: "writing-publishing",
      goal: "Share", dueWindow: "today", ownerSourceRefs: ["owner-entry:manual-123"],
      reason: "Candidate evaluated.", manualReferenceEvaluation: cooldownBlocked
    })).toMatchObject({ actionType: "no-post", noPostReason: "policy-blocked", publishingAuthorized: false });
  });

  it("keeps OKRAJ and BBARAK as distribution checklists instead of ghostwritten artifacts", () => {
    for (const actionType of ["okraj-distribution", "bbarak-distribution"] as const) {
      const plan = buildPersonalGrowthInstagramRecommendation({
        recommendationDate: "2026-08-28", generatedAt: now, actionType,
        pillar: "writing-publishing", goal: "Distribute the finished owner-authored publication.", dueWindow: "after owner publication",
        ownerSourceRefs: [`owner-publication:${actionType}`],
        assetChecklist: ["Owner-confirmed final URL"],
        distributionChecklist: ["Confirm the artifact is already published"],
        reason: "The recurrence is due."
      });
      expect(plan).toMatchObject({ format: "distribution-checklist", ownerWritesArtifact: true, publishingAuthorized: false });
      expect(JSON.stringify(plan)).not.toMatch(/caption|draft|rewrite/iu);
    }
  });

  it("supports all Reel series while holding English and ungrounded trend memories", async () => {
    const config = await loadPersonalGrowthContentConfig();
    for (const series of config.reelFormats.filter((value) => value !== "trend-met-memory" && value !== "english-rapovej-denik")) {
      expect(PersonalGrowthReelSuggestionSchema.safeParse(reel({ series })).success).toBe(true);
    }
    expect(() => reel({ series: "trend-met-memory", trendExpiresAt: null, ownerMemoryEvidenceRefs: [] })).toThrow();
    const english = reel({ series: "english-rapovej-denik", language: "en", subtitleLanguages: ["cs"] });
    expect(buildPersonalGrowthInstagramRecommendation({
      recommendationDate: "2026-08-28", generatedAt: now, actionType: "reel", pillar: "rapovej-denik",
      goal: "Test the English lane.", dueWindow: "this week", ownerSourceRefs: ["owner-note:english"],
      reason: "Bounded language test.", reel: english, englishProfileAvailable: false
    })).toMatchObject({ actionType: "no-post", noPostReason: "english-profile-unavailable" });
  });

  it("requires an append-only decision reference before any safe-default loosening", async () => {
    const { policy } = await loadPersonalGrowthContentConfig();
    const stricter = structuredClone(policy);
    stricter.currentRevision = 1;
    stricter.revisions.push({ ...stricter.revisions[0]!, revision: 1, effectiveFrom: "2026-08-27", personalFeedMinimum: 0.9, ventureLedMaximum: 0.1 });
    expect(assertPersonalGrowthContentPolicyUpdate(policy, stricter).currentRevision).toBe(1);
    const looser = structuredClone(policy);
    looser.currentRevision = 1;
    looser.revisions.push({ ...looser.revisions[0]!, revision: 1, effectiveFrom: "2026-08-27", personalFeedMinimum: 0.84, ventureLedMaximum: 0.16 });
    expect(() => assertPersonalGrowthContentPolicyUpdate(policy, looser)).toThrow();
  });

  it("contains no automatic portfolio, venture-store or Social Distribution loader", async () => {
    const sources = await Promise.all([
      "recommendations.ts", "providers.ts", "results.ts", "analytics.ts"
    ].map((name) => readFile(path.join(repoRoot, "orchestrator/src/ventures/personal-growth", name), "utf8")));
    const imports = sources.flatMap((source) => source.match(/^import[^;]+;/gmu) ?? []);
    expect(imports.join("\n")).not.toMatch(/ventures\/(?:kvorum|door-money|booksofhistory|tehdejsi-svet|mma-files)|social-distribution|ventures\/registry|portfolio\//iu);
  });
});
