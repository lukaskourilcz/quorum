import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseDistributionContact,
  parseDistributionContactEvent,
  parseSocialShareKit,
  parseSocialShareKitOutcomeEvent,
  projectAdminDistributionContact,
  projectAdminSocialShareKit
} from "./network-model";

const root = path.resolve(process.cwd(), "..");

describe("Social Profiles Network model", () => {
  it("parses bounded relationship and manual share-kit fixtures", async () => {
    const fixture = JSON.parse(await readFile(path.join(root, "contracts/fixtures/social-distribution-contracts.valid.json"), "utf8")) as { contact: unknown; shareKit: unknown };
    const contact = parseDistributionContact(fixture.contact);
    const kit = parseSocialShareKit(fixture.shareKit);
    expect(contact).toMatchObject({ relationshipStatus: "opted-in", doNotContact: false });
    expect(kit).toMatchObject({ status: "assigned", deliveryMode: "copy", outcome: { identityInferred: false, consentInferred: false } });
  });

  it("reduces consent and outcomes without accepting aggregate identity claims", async () => {
    const fixture = JSON.parse(await readFile(path.join(root, "contracts/fixtures/social-distribution-contracts.valid.json"), "utf8")) as { contact: unknown; shareKit: unknown };
    const contact = parseDistributionContact(fixture.contact)!;
    const contactEvent = parseDistributionContactEvent({ schemaVersion: "distribution-contact-event/1", eventId: "distribution-contact-event-paused-001", contactId: contact.id, at: "2026-08-28T10:00:00.000Z", action: "paused", actor: "owner", reason: "Owner paused recurring share-kit assignments.", consentEvidenceRef: null, supersededEventRef: null });
    expect(projectAdminDistributionContact(contact, [contactEvent!]).relationshipStatus).toBe("paused");
    const kit = parseSocialShareKit(fixture.shareKit)!;
    const aggregate = parseSocialShareKitOutcomeEvent({ schemaVersion: "social-share-kit-outcome-event/1", eventId: "social-share-kit-outcome-aggregate-001", kitId: kit.id, at: "2026-08-28T12:00:00.000Z", actor: "owner", outcome: "unknown", attribution: "aggregate", evidenceRef: "metrics:aggregate-001", reason: "Aggregate activity cannot identify a relationship.", identityInferred: false, consentInferred: false });
    expect(projectAdminSocialShareKit(kit, [aggregate!], new Date("2026-08-28T13:00:00.000Z"))).toMatchObject({ status: "unknown", outcome: { attribution: "aggregate", identityInferred: false } });
    expect(parseSocialShareKitOutcomeEvent({ ...aggregate, outcome: "shared" })).toBeNull();
  });
});
