import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { DistributionContact, SocialCampaign } from "../src/contracts/social-distribution.js";
import { repoRoot } from "../src/paths.js";
import {
  NETWORK_RELATIONSHIP_BENCHMARK,
  assignSocialShareKit,
  persistConfirmedNetworkImport,
  previewDistributionNetworkImport,
  projectDistributionContact,
  projectSocialShareKit,
  recordSocialShareKitOutcome
} from "../src/social/network.js";

let fixture: { contact: DistributionContact; campaign: SocialCampaign; shareKit: unknown };
let capabilityMap: unknown;

const importRow = {
  label: "Founder Finance Club",
  type: "community",
  publicRefKind: "public-url",
  publicRef: "https://community.example/money#contact",
  topics: ["founder-finance"],
  ventures: ["door-money"],
  platforms: ["threads"],
  languages: ["en"],
  markets: ["US"],
  preferredFormats: ["link"],
  preferredCadence: "At most one relevant release per month.",
  relationshipStatus: "qualified",
  notes: "Public, owner-reviewed relationship lead."
};

function approvedCampaign(): SocialCampaign {
  return { ...structuredClone(fixture.campaign), status: "approved", holdReasons: [] };
}

function optedInContact(status: "opted-in" | "active" = "opted-in"): DistributionContact {
  return { ...structuredClone(fixture.contact), relationshipStatus: status };
}

function draft() {
  return {
    channel: "threads",
    locale: "en",
    topics: ["founder-finance"],
    market: "US",
    factualSummary: "One bounded, owner-approved founder-finance lesson is available.",
    relevanceReason: "This relationship explicitly opted into relevant founder-finance releases.",
    talkingPoints: ["Cash timing differs from profit."],
    assets: [],
    link: "https://example.com/door-money/release-001",
    disclosure: "Prepared manually by BoardlessAI from an approved release.",
    attribution: "Source: Door Money.",
    expiresAt: "2026-09-30T23:59:59.000Z",
    deliveryMode: "copy",
    assignmentRef: "owner:network-assignment-001"
  };
}

beforeAll(async () => {
  const [fixtureRaw, mapRaw] = await Promise.all([
    readFile(path.join(repoRoot, "contracts/fixtures/social-distribution-contracts.valid.json"), "utf8"),
    readFile(path.join(repoRoot, "config/venture-capabilities.json"), "utf8")
  ]);
  fixture = JSON.parse(fixtureRaw) as typeof fixture;
  capabilityMap = JSON.parse(mapRaw) as unknown;
});

describe("optional Social Distribution Network", () => {
  it("reports the 50-relationship benchmark honestly without inventing progress", () => {
    const preview = previewDistributionNetworkImport({ format: "json", payload: [], now: new Date("2026-08-27T12:00:00.000Z") });
    expect(preview.benchmark).toEqual({ target: NETWORK_RELATIONSHIP_BENCHMARK, actualBefore: 0, projectedAfterConfirmedNew: 0, fabricatedProgress: false });
    expect(preview.counts).toEqual({ new: 0, update: 0, conflict: 0, drop: 0 });
    expect(preview).toMatchObject({ persistenceAuthorized: false, outboundAuthorized: false });
  });

  it("previews bounded JSON and CSV imports with deduplication and row-level dispositions", () => {
    const existing = { ...fixture.contact, publicContactRefs: [{ kind: "public-url", value: "https://existing.example/contact", ownerEnteredAt: "2026-08-27T00:00:00.000Z" }] };
    const preview = previewDistributionNetworkImport({
      format: "json",
      payload: [importRow, { ...importRow }, { ...importRow, publicRef: "https://existing.example/contact" }, { ...importRow, publicRef: "http://unsafe.example" }],
      existingContacts: [existing],
      now: new Date("2026-08-27T12:00:00.000Z")
    });
    expect(preview.rows.map(({ disposition }) => disposition)).toEqual(["new", "conflict", "update", "drop"]);
    expect(preview.rows[0]?.normalizedPublicRef).toBe("https://community.example/money");
    expect(preview.rows[0]?.contact?.relationshipStatus).toBe("qualified");
    expect(preview.benchmark.projectedAfterConfirmedNew).toBe(2);

    const csv = [
      "label,type,publicRefKind,publicRef,topics,ventures,platforms,languages,markets,preferredFormats,preferredCadence,relationshipStatus,notes",
      "Founder Finance Club,community,public-url,https://community.example/money,founder-finance,door-money,threads,en,US,link,Monthly,prospect,Public owner-reviewed lead"
    ].join("\n");
    expect(previewDistributionNetworkImport({ format: "csv", payload: csv }).counts.new).toBe(1);
  });

  it("drops malformed, oversized, sensitive and formula-bearing imports without side effects", () => {
    const malformed = previewDistributionNetworkImport({ format: "json", payload: "not-json" });
    const oversized = previewDistributionNetworkImport({ format: "json", payload: Array.from({ length: 101 }, () => importRow) });
    const sensitive = previewDistributionNetworkImport({ format: "json", payload: [{ ...importRow, notes: "access_token=secret" }] });
    const formula = previewDistributionNetworkImport({ format: "json", payload: [{ ...importRow, label: "=HYPERLINK(unsafe)" }] });
    expect(malformed.rows[0]?.reasons[0]).toMatch(/JSON|Unexpected/iu);
    expect(oversized.rows[0]?.reasons).toContain("import-row-cap-exceeded");
    expect(sensitive.rows[0]?.reasons).toContain("unsafe-or-sensitive-import-field");
    expect(formula.rows[0]?.reasons).toContain("unsafe-or-sensitive-import-field");
    expect([malformed, oversized, sensitive, formula].every(({ outboundAuthorized }) => outboundAuthorized === false)).toBe(true);
  });

  it("persists only explicitly confirmed new prospect/qualified records and remains idempotent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-network-"));
    const preview = previewDistributionNetworkImport({ format: "json", payload: [importRow], now: new Date("2026-08-27T12:00:00.000Z") });
    const first = await persistConfirmedNetworkImport(root, preview, [1]);
    const second = await persistConfirmedNetworkImport(root, preview, [1]);
    expect(first).toEqual({ changed: 1, unchanged: 0, refused: 0 });
    expect(second).toEqual({ changed: 0, unchanged: 1, refused: 0 });
    const saved = JSON.parse(await readFile(path.join(root, "social/network/contacts", `${preview.rows[0]?.contact?.id}.json`), "utf8")) as DistributionContact;
    expect(saved.relationshipStatus).toBe("qualified");
    expect(saved).toMatchObject({ consentEvidenceRef: null, consentRecordedAt: null, doNotContact: false });
  });

  it("projects append-only consent, pause, decline, DNC and correction evidence", () => {
    const prospect = { ...fixture.contact, relationshipStatus: "prospect", consentEvidenceRef: null, consentRecordedAt: null };
    const events = [
      { schemaVersion: "distribution-contact-event/1", eventId: "distribution-contact-event-qualified-001", contactId: prospect.id, at: "2026-08-27T01:00:00.000Z", action: "qualified", actor: "owner", reason: "Owner qualified the public relationship record.", consentEvidenceRef: null, supersededEventRef: null },
      { schemaVersion: "distribution-contact-event/1", eventId: "distribution-contact-event-opted-in-001", contactId: prospect.id, at: "2026-08-27T02:00:00.000Z", action: "opted-in", actor: "owner", reason: "Owner recorded explicit consent.", consentEvidenceRef: "owner:consent-001", supersededEventRef: null },
      { schemaVersion: "distribution-contact-event/1", eventId: "distribution-contact-event-active-001", contactId: prospect.id, at: "2026-08-27T03:00:00.000Z", action: "activated", actor: "owner", reason: "The opted-in relationship is active.", consentEvidenceRef: null, supersededEventRef: null },
      { schemaVersion: "distribution-contact-event/1", eventId: "distribution-contact-event-paused-001", contactId: prospect.id, at: "2026-08-27T04:00:00.000Z", action: "paused", actor: "owner", reason: "Owner paused manual assignments.", consentEvidenceRef: null, supersededEventRef: null },
      { schemaVersion: "distribution-contact-event/1", eventId: "distribution-contact-event-declined-001", contactId: prospect.id, at: "2026-08-27T05:00:00.000Z", action: "declined", actor: "owner", reason: "The relationship declined further kits.", consentEvidenceRef: null, supersededEventRef: null }
    ];
    expect(projectDistributionContact(prospect, events)).toMatchObject({ relationshipStatus: "declined", doNotContact: true, lastDeclinedAt: "2026-08-27T05:00:00.000Z" });
    const corrected = [...events, { schemaVersion: "distribution-contact-event/1", eventId: "distribution-contact-event-corrected-001", contactId: prospect.id, at: "2026-08-27T06:00:00.000Z", action: "corrected", actor: "owner", reason: "The decline was entered against the wrong record.", consentEvidenceRef: null, supersededEventRef: "distribution-contact-event-declined-001" }];
    expect(projectDistributionContact(prospect, corrected)).toMatchObject({ relationshipStatus: "paused", doNotContact: false });
  });

  it("assigns an immutable manual share kit only for an exact opted-in relationship and approved campaign", () => {
    const result = assignSocialShareKit({ campaign: approvedCampaign(), contact: optedInContact("active"), capabilityMap, draft: draft(), now: new Date("2026-08-27T12:00:00.000Z") });
    expect(result).toMatchObject({ decision: "assigned", authorityGranted: false, outboundAuthorized: false });
    expect(result.kit).toMatchObject({ status: "assigned", deliveryMode: "copy", sourceVentureId: "door-money", contactConsentRef: fixture.contact.consentEvidenceRef });
    expect(result.kit?.utm).toEqual({ source: "example-newsletter", medium: "manual_share", campaign: "door-money-release-001", content: expect.stringMatching(/^kit-/u) });
    expect(JSON.stringify(result.kit)).not.toMatch(/send|follow|comment|password|credential/iu);
  });

  it("holds assignments for unapproved campaigns, missing consent, DNC or mismatched exact fit", () => {
    const unapproved = assignSocialShareKit({ campaign: fixture.campaign, contact: optedInContact(), capabilityMap, draft: draft() });
    const unconsented = assignSocialShareKit({ campaign: approvedCampaign(), contact: { ...fixture.contact, relationshipStatus: "qualified", consentEvidenceRef: null, consentRecordedAt: null }, capabilityMap, draft: draft() });
    const dnc = assignSocialShareKit({ campaign: approvedCampaign(), contact: { ...fixture.contact, relationshipStatus: "do-not-contact", doNotContact: true, lastDeclinedAt: "2026-08-27T11:00:00.000Z" }, capabilityMap, draft: draft() });
    const mismatch = assignSocialShareKit({ campaign: approvedCampaign(), contact: optedInContact(), capabilityMap, draft: { ...draft(), topics: ["unrelated-topic"] } });
    expect(unapproved.reasons).toContain("campaign-owner-approval-required");
    expect(unconsented.reasons).toContain("explicit-opt-in-required");
    expect(dnc.reasons).toContain("do-not-contact-block");
    expect(mismatch.reasons).toContain("topic-fit-missing");
    expect([unapproved, unconsented, dnc, mismatch].every(({ kit, outboundAuthorized }) => kit === null && !outboundAuthorized)).toBe(true);
  });

  it("records only owner-manual share evidence while aggregate UTM remains unknown", () => {
    const base = assignSocialShareKit({ campaign: approvedCampaign(), contact: optedInContact(), capabilityMap, draft: draft(), now: new Date("2026-08-27T12:00:00.000Z") }).kit!;
    const aggregate = recordSocialShareKitOutcome({ schemaVersion: "social-share-kit-outcome-event/1", eventId: "social-share-kit-outcome-aggregate-001", kitId: base.id, at: "2026-08-28T12:00:00.000Z", actor: "owner", outcome: "unknown", attribution: "aggregate", evidenceRef: "metrics:aggregate-campaign-001", reason: "Aggregate UTM activity cannot identify a person or prove consent.", identityInferred: false, consentInferred: false });
    expect(projectSocialShareKit(base, [aggregate], new Date("2026-08-29T12:00:00.000Z"))).toMatchObject({ status: "unknown", outcome: { attribution: "aggregate", identityInferred: false, consentInferred: false } });
    expect(() => recordSocialShareKitOutcome({ ...aggregate, eventId: "social-share-kit-outcome-aggregate-002", outcome: "shared" })).toThrow();
    const shared = recordSocialShareKitOutcome({ ...aggregate, eventId: "social-share-kit-outcome-shared-001", outcome: "shared", attribution: "owner-manual", evidenceRef: "owner:manual-share-confirmation-001" });
    expect(projectSocialShareKit(base, [shared], new Date("2026-08-29T12:00:00.000Z"))).toMatchObject({ status: "shared", deliveryEvidenceRef: "owner:manual-share-confirmation-001" });
  });
});
