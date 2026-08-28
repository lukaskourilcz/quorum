import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { AmplificationPolicySchema, SocialProfileSchema, type SocialConnection, type SocialProfile } from "../src/contracts/social-distribution.js";
import { VentureCapabilityMapSchema } from "../src/contracts/venture-capability.js";
import { canonicalJson, sha256 } from "../src/hashing.js";
import { repoRoot } from "../src/paths.js";
import { AmplifierProposalSchema, type AmplifierProposal } from "../src/social/amplifiers.js";
import { createSocialProfileSimulationFixtures } from "../src/social/fixtures/profile-simulations.js";
import {
  campaignTargetApprovalHash,
  campaignInventoryCandidates,
  createVerifiedReleaseCampaign,
  projectSocialCampaign,
  type VerifiedReleaseCampaignInput
} from "../src/social/campaigns.js";

let baseInput: VerifiedReleaseCampaignInput;

function fit(value = 90) {
  const signal = (name: string) => ({ value, reason: `${name} is supported by bounded fixture evidence.`, evidenceRef: `fixture:${name}` });
  return {
    audience: signal("audience-fit"), topic: signal("topic-fit"), languageMarket: signal("language-market"),
    format: signal("format-fit"), freshness: signal("freshness"), capacity: signal("capacity"), priorOutcome: { value: null, reason: "No attributable baseline exists yet.", evidenceRef: null },
    collision: false, distinctAngle: true
  };
}

function connection(profileId: string, id: string): SocialConnection {
  return {
    schemaVersion: "social-connection/1",
    id,
    profileId,
    platform: "threads",
    publicHandle: "@fixture_owned_brand",
    nativeAccountId: null,
    connector: { id: "meta-threads", version: "1.0.0", providerId: "direct-meta", apiVersion: "v26.0", loginMode: "threads-oauth" },
    credentialRef: "FIXTURE_THREADS_ACCESS_TOKEN",
    nativeAccountIdRef: "FIXTURE_THREADS_USER_ID",
    approvedScopes: ["threads_basic", "threads_content_publish"],
    supportedCapabilities: ["publish-original"],
    mode: "autopublish",
    health: { status: "healthy", unavailableReason: null },
    tokenExpiresAt: "2027-08-27T00:00:00.000Z",
    appReviewExpiresAt: null,
    enabledByHumanAt: "2026-08-27T00:00:00.000Z",
    cadence: { maxOrganicPostsPerDay: 1, minHoursBetweenPosts: 12, timezone: "Europe/Prague" },
    lastVerified: { at: "2026-08-27T00:00:00.000Z", evidenceRefs: ["fixture:connection-verification"] }
  };
}

function prepared<T extends "primary-pack" | "company-angle" | "profile-native-commentary">(text: string, commentaryType: T) {
  return {
    channel: "threads" as const,
    locale: "en" as const,
    text,
    commentaryType,
    destination: "https://example.com/door-money/release-001",
    factualClaimRefs: ["fixture:verified-release"],
    evidenceRefs: ["state/ventures/door-money/packages/release-001.json"],
    rendererRef: "fixture:renderer-v1",
    assets: []
  };
}

function clone<T>(value: T): T { return structuredClone(value); }

function retarget(sourceVentureId: string, primaryId: string, amplifierSlug: string, includeUmbrella: boolean): VerifiedReleaseCampaignInput {
  const input = clone(baseInput); const edge = input.capabilityMap.edges.find((candidate) => candidate.source === "door-money" && candidate.target === "social-distribution" && candidate.capability === "approved-publish-package")!;
  const capabilityRef = { mapVersion: input.capabilityMap.mapVersion, source: sourceVentureId, target: "social-distribution" as const, capability: "approved-publish-package" as const, dataSchemaVersion: "approved-publish-package/1" as const, decisionReference: "GitHub #424" };
  input.capabilityMap.edges.push({ ...edge, source: sourceVentureId, governingReference: "GitHub #424", runtimeEnforcementPoint: "orchestrator/src/social/campaigns.ts", testProbeReference: "orchestrator/tests/social-campaigns.test.ts" });
  input.release = { ...input.release, releaseId: `${sourceVentureId}-release-001`, sourceVentureId, verificationRef: `fixture:${sourceVentureId}-verified-release`, sourcePackage: { ...input.release.sourcePackage, artifactRef: `state/ventures/${sourceVentureId}/packages/release-001.json` }, primaryItems: [prepared(`${sourceVentureId} published a distinct verified release for its own official audience.`, "primary-pack")] };
  input.sourcePrimaryProfile = { ...input.sourcePrimaryProfile, id: primaryId, displayLabel: sourceVentureId, ventureRef: sourceVentureId, brandRef: sourceVentureId, supportedVentures: [sourceVentureId], capabilityRefs: [] };
  const candidate = input.amplifiers[0]!; const amplifierId = `social-profile-${amplifierSlug}`;
  candidate.profile = { ...candidate.profile, id: amplifierId, displayLabel: amplifierSlug, supportedVentures: [sourceVentureId], capabilityRefs: [capabilityRef] };
  candidate.connection = { ...candidate.connection!, id: `social-connection-${amplifierSlug}-threads`, profileId: amplifierId };
  candidate.proposal = { ...candidate.proposal, id: `amplifier-proposal-${amplifierSlug}`, profileId: amplifierId, workingName: amplifierSlug, publicNameCandidates: [amplifierSlug], publicHandleCandidates: [`@${amplifierSlug.replaceAll("-", "_")}`], supportedVentures: [sourceVentureId], capabilityRefs: [capabilityRef] };
  candidate.supportContext.sourceVentureId = sourceVentureId;
  candidate.items = [prepared(`The independent ${amplifierSlug} angle adds topic-specific context that is useful without repeating the source caption.`, "profile-native-commentary")];
  if (!includeUmbrella) input.umbrella = null;
  else if (input.umbrella) { input.umbrella.profile = { ...input.umbrella.profile, supportedVentures: [sourceVentureId], capabilityRefs: [capabilityRef] }; input.umbrella.items = [prepared(`BoardlessAI explains the bounded company-building system behind this ${sourceVentureId} release.`, "company-angle")]; }
  return input;
}

beforeAll(async () => {
  const [registryRaw, mapRaw, policyRaw, proposalRaw] = await Promise.all([
    readFile(path.join(repoRoot, "config/social-publisher-registry.json"), "utf8"),
    readFile(path.join(repoRoot, "config/venture-capabilities.json"), "utf8"),
    readFile(path.join(repoRoot, "config/social-amplification-policy.json"), "utf8"),
    readFile(path.join(repoRoot, "contracts/fixtures/social-amplifier-proposal.valid.json"), "utf8")
  ]);
  const registry = JSON.parse(registryRaw) as { profiles: unknown[] };
  const primary = SocialProfileSchema.parse(registry.profiles.find((profile) => (profile as { id?: string }).id === "social-profile-door-money"));
  const capabilityMap = VentureCapabilityMapSchema.parse(JSON.parse(mapRaw) as unknown);
  const policy = AmplificationPolicySchema.parse(JSON.parse(policyRaw) as unknown);
  const proposal = AmplifierProposalSchema.parse(JSON.parse(proposalRaw) as unknown);
  const activeProposal: AmplifierProposal = {
    ...proposal,
    lifecycle: "active",
    launchRunway: { ...proposal.launchRunway, completedOriginalPosts: 10, evidenceRefs: ["fixture:ten-original-posts"] }
  };
  const amplifier: SocialProfile = SocialProfileSchema.parse({
    schemaVersion: "social-profile/1",
    id: activeProposal.profileId,
    displayLabel: activeProposal.workingName,
    kind: "owned-brand",
    role: "owned-amplifier",
    ownerRef: "boardlessai",
    ventureRef: null,
    brandRef: "founders-ledger",
    purpose: activeProposal.purpose,
    audience: activeProposal.audience,
    languages: activeProposal.languages,
    markets: activeProposal.markets,
    supportedTopics: activeProposal.supportedTopics,
    supportedVentures: activeProposal.supportedVentures,
    capabilityRefs: activeProposal.capabilityRefs,
    amplifierArchetype: activeProposal.archetype,
    amplifierEligibility: { verdict: "accept", evaluatedAt: "2026-08-27T00:00:00.000Z", purposeGateRef: activeProposal.ownerDecision!.evidenceRef, canonicalPolicyRef: policy.ownerDecisionRef },
    originalContentPromise: activeProposal.originalContentPromise,
    recurringFormatRefs: activeProposal.repeatableFormats.map(({ id }) => id),
    avatar: { kind: "descriptor", descriptor: "Fixture abstract ledger mark", reference: null },
    lifecycle: "active",
    liveEligible: true,
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    provenance: { source: "owner", recordedBy: "owner", evidenceRefs: ["fixture:owner-amplifier-decision-001"], fixtureKey: null },
    notes: "Transparent owned-brand test profile."
  });
  const umbrella: SocialProfile = SocialProfileSchema.parse({
    ...primary,
    id: "social-profile-boardlessai-umbrella",
    displayLabel: "BoardlessAI",
    role: "company-umbrella",
    ventureRef: null,
    brandRef: "boardlessai",
    purpose: "Explain bounded company-building lessons from approved public releases.",
    audience: "Builders interested in transparent agent-operated company systems.",
    supportedTopics: ["company-building", "founder-finance"],
    capabilityRefs: activeProposal.capabilityRefs,
    lifecycle: "active",
    liveEligible: true,
    provenance: { source: "owner", recordedBy: "owner", evidenceRefs: ["fixture:owner-umbrella-profile"], fixtureKey: null }
  });
  baseInput = {
    schemaVersion: "verified-release-campaign-input/1",
    campaignVersion: "1.0.0",
    release: {
      sourceType: "verified-venture-release",
      verificationStatus: "verified",
      verificationRef: "fixture:owner-verified-release",
      verifiedAt: "2026-08-27T08:00:00.000Z",
      releaseId: "door-money-release-001",
      sourceVentureId: "door-money",
      contentIds: ["lesson-001"],
      sourcePackage: { schemaVersion: "approved-publish-package/1", artifactRef: "state/ventures/door-money/packages/release-001.json", packageHash: "a".repeat(64) },
      objective: "qualified-visit",
      audience: "Founders seeking one bounded operating-finance lesson.",
      topics: ["founder-finance"],
      languages: ["en"],
      markets: ["US"],
      primaryItems: [prepared("Door Money published one owner-approved lesson about cash timing and operating decisions.", "primary-pack")]
    },
    openingAt: "2026-08-28T06:00:00.000Z",
    sourcePrimaryProfile: primary,
    sourceConnections: [],
    umbrella: {
      profile: umbrella,
      connection: connection(umbrella.id, "social-connection-boardlessai-umbrella-threads"),
      genuineCompanyAngle: true,
      angleEvidenceRef: "fixture:genuine-company-angle",
      fit: fit(86),
      items: [prepared("Building a release pipeline means publishing the verified boundary, not the private source behind it.", "company-angle")]
    },
    amplifiers: [{
      profile: amplifier,
      connection: connection(amplifier.id, "social-connection-founders-ledger-threads"),
      proposal: activeProposal,
      supportContext: { sourceVentureId: "door-money", rollingOriginalPosts: 10, rollingSupportPosts: 0, activeSupportCampaigns: 0, daysSinceSameSourceVenture: null, duplicateCaption: false, duplicateAsset: false, staggerHours: 24, hasAudienceSpecificAngle: true },
      fit: fit(92),
      items: [prepared("Cash timing is not profit: map the invoice date, payment date, and the obligation due between them.", "profile-native-commentary")]
    }],
    capabilityMap,
    amplificationPolicy: policy,
    existingCampaigns: [],
    posture: { globalKillSwitch: "released", repositoryPause: false, pausedProfileIds: [], pausedConnectionIds: [] }
  };
});

describe("verified-release Social Distribution campaigns", () => {
  it("creates one deterministic primary, amplifier and exact-edge umbrella campaign", () => {
    const first = createVerifiedReleaseCampaign(baseInput);
    const second = createVerifiedReleaseCampaign(baseInput);
    expect(first).toEqual(second);
    expect(first.decision).toMatchObject({ decision: "created", authorityGranted: false, publishingAuthorized: false });
    expect(first.campaign).not.toBeNull();
    expect(first.campaign).toMatchObject({
      sourceVentureId: "door-money",
      selectionOutcome: "selected",
      status: "needs-owner-review",
      contactAssignments: [],
      schedulePolicy: { timezone: "Europe/Prague", primaryOffsetHours: 0, umbrellaOffsetHours: 6, amplifierOffsetHours: [24, 48] }
    });
    const campaign = first.campaign!;
    expect(campaign.targets.map(({ role }) => role)).toEqual(["primary", "amplifier", "umbrella"]);
    expect(campaign.targets.find(({ role }) => role === "amplifier")?.selection).toMatchObject({ score: { total: expect.any(Number) } });
    expect(campaign.targets.every(({ role, selection }) => role === "primary" || selection.hardGates.length >= 12)).toBe(true);
    expect(new Set(campaign.channelItems.map(({ contentHash }) => contentHash)).size).toBe(3);
    expect(campaign.channelItems.map(({ window }) => window.notBefore)).toEqual([
      "2026-08-28T06:00:00.000Z", "2026-08-28T12:00:00.000Z", "2026-08-29T06:00:00.000Z"
    ]);
    expect(campaign.channelItems.every(({ approval, status }) => approval.status === "needs-owner-review" && status === "draft")).toBe(true);
    expect(JSON.stringify(campaign)).not.toMatch(/manuscript|embedding|private chunk|contest/iu);
  });

  it("covers the configured DNESKAi, MMA Files and BOOKSOFHISTORY target fixtures without sister routing", () => {
    const caughtUp = createVerifiedReleaseCampaign(retarget("caught-up", "social-profile-caught-up", "ai-context", true)).campaign!;
    expect(caughtUp.targets.map(({ role }) => role)).toEqual(["primary", "amplifier", "umbrella"]);
    expect(caughtUp.targets.find(({ role }) => role === "amplifier")?.profileId).toBe("social-profile-ai-context");

    const mma = createVerifiedReleaseCampaign(retarget("mma-files", "social-profile-mma-files", "combat-context", false)).campaign!;
    expect(mma.targets.filter(({ fit }) => fit === "eligible").map(({ profileId }) => profileId)).toEqual(["social-profile-mma-files", "social-profile-combat-context"]);

    const booksInput = retarget("booksofhistory", "social-profile-booksofhistory", "book-context", false);
    const deniedSister = clone(booksInput.amplifiers[0]!);
    deniedSister.profile = { ...booksInput.sourcePrimaryProfile, id: "social-profile-tehdejsi-svet", displayLabel: "Tehdejší svět", ventureRef: "tehdejsi-svet", brandRef: "tehdejsi-svet", supportedVentures: ["booksofhistory"], capabilityRefs: booksInput.amplifiers[0]!.profile.capabilityRefs };
    deniedSister.connection = { ...deniedSister.connection!, id: "social-connection-tehdejsi-svet-threads", profileId: deniedSister.profile.id };
    deniedSister.items = [prepared("A prohibited sister-venture adaptation must remain rejected.", "profile-native-commentary")];
    booksInput.amplifiers.push(deniedSister);
    const books = createVerifiedReleaseCampaign(booksInput).campaign!;
    expect(books.targets.find(({ profileId }) => profileId === "social-profile-book-context")?.fit).toBe("eligible");
    expect(books.targets.find(({ profileId }) => profileId === "social-profile-tehdejsi-svet")).toMatchObject({ fit: "rejected", selection: { score: { total: null } } });
    expect(books.targets.find(({ profileId }) => profileId === "social-profile-tehdejsi-svet")?.selection.hardGates).toContainEqual(expect.objectContaining({ gate: "real-owned-profile", status: "reject" }));
    expect(books.targets.every(({ ventureRef, role }) => role !== "amplifier" || ventureRef === null)).toBe(true);
  });

  it("treats hard-gate failure as an explained primary-only campaign before scoring", () => {
    const held = clone(baseInput);
    held.amplifiers[0]!.supportContext.daysSinceSameSourceVenture = 2;
    held.amplifiers[0]!.supportContext.duplicateCaption = true;
    held.amplifiers[0]!.fit.collision = true;
    held.umbrella!.genuineCompanyAngle = false;
    const result = createVerifiedReleaseCampaign(held).campaign!;
    expect(result.selectionOutcome).toBe("primary-only");
    expect(result.channelItems).toHaveLength(1);
    expect(result.targets.find(({ role }) => role === "amplifier")).toMatchObject({ fit: "held", selection: { score: { total: null } } });
    expect(result.targets.find(({ role }) => role === "amplifier")?.reasons).toEqual(expect.arrayContaining(["cooldown", "collision", "duplicate"]));
    expect(result.targets.find(({ role }) => role === "umbrella")?.fit).toBe("held");
  });

  it("holds runway, ratio, capacity, provider and pause failures before selection", () => {
    const cases: Array<[string, (input: VerifiedReleaseCampaignInput) => void, string]> = [
      ["runway", (input) => { input.amplifiers[0]!.proposal.launchRunway.completedOriginalPosts = 0; }, "runway"],
      ["ratio", (input) => { input.amplifiers[0]!.supportContext.rollingOriginalPosts = 0; input.amplifiers[0]!.supportContext.rollingSupportPosts = 1; }, "ratio"],
      ["capacity", (input) => { input.amplifiers[0]!.supportContext.activeSupportCampaigns = 2; }, "capacity"],
      ["provider", (input) => { input.amplifiers[0]!.connection = { ...input.amplifiers[0]!.connection!, mode: "held", health: { status: "unverified", unavailableReason: "human-activation-required" } }; }, "provider"],
      ["paused", (input) => { input.posture.pausedProfileIds = [input.amplifiers[0]!.profile.id]; }, "paused"]
    ];
    for (const [label, mutate, reason] of cases) {
      const input = clone(baseInput); input.umbrella = null; mutate(input);
      const target = createVerifiedReleaseCampaign(input).campaign!.targets.find(({ role }) => role === "amplifier")!;
      expect(target.fit, label).toBe("held"); expect(target.reasons, label).toContain(reason); expect(target.selection.score.total, label).toBeNull();
    }
  });

  it("records denied capability and simulation candidates as rejected and refuses contact conversion", () => {
    const denied = clone(baseInput); denied.amplifiers[0]!.profile = { ...denied.amplifiers[0]!.profile, supportedVentures: [], capabilityRefs: [] };
    const deniedCampaign = createVerifiedReleaseCampaign(denied).campaign!;
    expect(deniedCampaign.selectionOutcome).toBe("selected");
    expect(deniedCampaign.targets.find(({ role }) => role === "amplifier")).toMatchObject({ fit: "rejected", capabilityRef: null, selection: { score: { total: null } } });
    expect(deniedCampaign.targets.find(({ role }) => role === "amplifier")?.reasons).toContain("capability");

    const simulation = clone(baseInput); simulation.umbrella = null; simulation.amplifiers[0]!.profile = createSocialProfileSimulationFixtures()[0]!.profile;
    simulation.amplifiers[0]!.connection = null;
    const simulationCampaign = createVerifiedReleaseCampaign(simulation).campaign!;
    expect(simulationCampaign.selectionOutcome).toBe("primary-only");
    expect(simulationCampaign.targets.find(({ profileId }) => profileId === simulation.amplifiers[0]!.profile.id)).toMatchObject({ fit: "rejected", capabilityRef: null });

    const contact = clone(baseInput) as unknown as { amplifiers: Array<{ proposal: Record<string, unknown> }> };
    contact.amplifiers[0]!.proposal.proposalOrigin = "contact";
    expect(() => createVerifiedReleaseCampaign(contact)).toThrow();
  });

  it("rejects unverified, failed, fixture, Contest Radar and permanently isolated sources", () => {
    const cases: Array<[Partial<VerifiedReleaseCampaignInput["release"]>, string]> = [
      [{ verificationStatus: "unverified" }, "unverified-release"],
      [{ sourceType: "failed-delivery", verificationStatus: "failed" }, "failed-delivery"],
      [{ sourceType: "fixture" }, "fixture-or-scrape"],
      [{ sourceType: "contest-opportunity" }, "contest-source-excluded"]
    ];
    for (const [change, reason] of cases) {
      const input = clone(baseInput); Object.assign(input.release, change);
      expect(createVerifiedReleaseCampaign(input)).toMatchObject({ campaign: null, decision: { decision: "skip", reasons: [reason] } });
    }
    for (const sourceVentureId of ["personal-growth", "kvorum", "goviral"] as const) {
      const input = clone(baseInput);
      input.release.sourceVentureId = sourceVentureId;
      input.sourcePrimaryProfile = { ...input.sourcePrimaryProfile, id: `social-profile-${sourceVentureId}`, ventureRef: sourceVentureId };
      expect(createVerifiedReleaseCampaign(input)).toMatchObject({ campaign: null, decision: { reasons: ["permanently-ineligible-source"] } });
    }
  });

  it("returns the existing campaign for the same release, content, capability and policy key", () => {
    const first = createVerifiedReleaseCampaign(baseInput).campaign!;
    const duplicate = clone(baseInput); duplicate.existingCampaigns = [first];
    expect(createVerifiedReleaseCampaign(duplicate)).toMatchObject({ campaign: first, decision: { decision: "duplicate", campaignId: first.id, reasons: ["duplicate-release"] } });
  });

  it("lets stop controls hold every immutable item without granting authority", () => {
    const input = clone(baseInput); input.posture.globalKillSwitch = "engaged";
    const result = createVerifiedReleaseCampaign(input);
    expect(result.decision).toMatchObject({ decision: "held", reasons: ["global-kill-switch"], authorityGranted: false, publishingAuthorized: false });
    expect(result.campaign).toMatchObject({ selectionOutcome: "held", status: "held", holdReasons: ["paused"] });
    expect(result.campaign!.channelItems.every(({ status }) => status === "held")).toBe(true);
  });

  it("binds approval to every immutable target item and invalidates it after a material edit", () => {
    const campaign = createVerifiedReleaseCampaign({ ...clone(baseInput), umbrella: null, amplifiers: [] }).campaign!;
    const targetItems = campaign.channelItems.filter(({ targetId }) => targetId === campaign.targets[0]!.id);
    const approved = projectSocialCampaign(campaign, [{
      schemaVersion: "social-campaign-event/1",
      eventId: "social-campaign-event-approve-primary-001",
      campaignId: campaign.id,
      targetId: campaign.targets[0]!.id,
      itemId: null,
      action: "approve-target",
      at: "2026-08-28T07:00:00.000Z",
      actor: "owner",
      reason: "Approve this exact target and immutable content/window binding.",
      expectedBindingHash: campaignTargetApprovalHash(targetItems),
      replacement: null
    }]);
    expect(approved.rejectedEventIds).toEqual([]);
    expect(approved.campaign).toMatchObject({ status: "approved", channelItems: [{ status: "approved", approval: { status: "approved" } }] });
    expect(campaignInventoryCandidates(approved.campaign)).toMatchObject([{ targetRole: "primary", dailySelectionMustRecheck: ["original-content-ratio", "cooldown", "cadence", "provider", "routine-scope", "kill-switch"], authorityGranted: false, publishingAuthorized: false }]);
    const item = approved.campaign.channelItems[0]!;
    const copy = { ...item.copy, text: "Corrected bounded owner-approved copy." };
    const contentHash = sha256(canonicalJson(copy));
    const bindingHash = sha256(canonicalJson({ targetHash: item.targetHash, contentHash, windowHash: item.windowHash, policyHash: item.policyHash }));
    const edited = projectSocialCampaign(approved.campaign, [{
      schemaVersion: "social-campaign-event/1",
      eventId: "social-campaign-event-correct-primary-001",
      campaignId: campaign.id,
      targetId: null,
      itemId: item.id,
      action: "correct-item",
      at: "2026-08-28T08:00:00.000Z",
      actor: "owner",
      reason: "Correct one bounded factual sentence and require a fresh approval.",
      expectedBindingHash: item.approval.bindingHash,
      replacement: { text: copy.text, destination: null, altText: null, notBefore: null, notAfter: null, bindingHash }
    }]);
    expect(edited.campaign).toMatchObject({ status: "needs-owner-review", channelItems: [{ status: "draft", approval: { status: "invalidated", bindingHash } }] });
    const stale = projectSocialCampaign(edited.campaign, [{
      schemaVersion: "social-campaign-event/1",
      eventId: "social-campaign-event-stale-approval-001",
      campaignId: campaign.id,
      targetId: campaign.targets[0]!.id,
      itemId: null,
      action: "approve-target",
      at: "2026-08-28T09:00:00.000Z",
      actor: "owner",
      reason: "This stale binding must not approve the corrected item.",
      expectedBindingHash: campaignTargetApprovalHash(targetItems),
      replacement: null
    }]);
    expect(stale.rejectedEventIds).toEqual(["social-campaign-event-stale-approval-001"]);
    expect(stale.campaign.channelItems[0]!.approval.status).toBe("invalidated");
  });
});
