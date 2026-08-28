import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SocialCampaign } from "../src/contracts/social-distribution.js";
import { resolveSocialAttributionEvent, socialCampaignAttributionKey } from "../src/social/attribution.js";
import { appendSocialAttributionEvent, readSocialAttributionEvents } from "../src/social/results.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))));

async function campaign(): Promise<SocialCampaign> {
  const fixture = JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/social-distribution-contracts.valid.json"), "utf8")) as { campaign: SocialCampaign };
  return fixture.campaign;
}

function event(destination: string, overrides: Record<string, unknown> = {}) {
  return {
    sourceEventId: "destination-event-123",
    analyticsContractRef: "destination-analytics/1:event-aggregate",
    eventType: "qualified-action",
    eventCount: 1,
    occurredAt: "2026-08-27T09:00:00.000Z",
    observedAt: "2026-08-27T09:05:00.000Z",
    destination,
    destinationEventValidated: true,
    evidenceRefs: ["destination-analytics:bounded-event"],
    ...overrides
  };
}

describe("privacy-safe Social Distribution attribution", () => {
  it("matches one exact #410 UTM to its target role and profile", async () => {
    const source = await campaign();
    const item = source.channelItems[0]!;
    const destination = new URL(item.copy.destination);
    destination.searchParams.set("utm_source", item.utm.source);
    destination.searchParams.set("utm_medium", item.utm.medium);
    destination.searchParams.set("utm_campaign", item.utm.campaign);
    destination.searchParams.set("utm_content", item.utm.content);
    const attributed = resolveSocialAttributionEvent({ event: event(destination.toString()), campaigns: [source] });
    expect(attributed).toMatchObject({ eventType: "qualified-action", eventCount: 1, attribution: { state: "attributed", campaignItemId: item.id, targetRole: "primary" }, identityExcluded: true, fingerprintingExcluded: true, consentInferred: false, sharingInferred: false });
    expect(attributed.attribution.profileId).toBe(source.sourcePrimaryProfileId);
    expect(socialCampaignAttributionKey(source, item.id)).toBe(`${item.utm.source}:${item.utm.medium}:${item.utm.campaign}:${item.utm.content}`);
  });

  it("keeps absent or unmatched UTMs unattributed and marks partial tuples invalid", async () => {
    const source = await campaign();
    expect(resolveSocialAttributionEvent({ event: event("https://example.com/release"), campaigns: [source] }).attribution.state).toBe("unattributed");
    expect(resolveSocialAttributionEvent({ event: event("https://example.com/release?utm_source=threads"), campaigns: [source] }).attribution.state).toBe("invalid");
    expect(resolveSocialAttributionEvent({ event: event("https://example.com/release?utm_source=threads&utm_medium=organic_social&utm_campaign=unknown&utm_content=unknown"), campaigns: [source] }).attribution.state).toBe("unattributed");
  });

  it("requires a validated destination event and rejects identity/fingerprinting fields", async () => {
    const source = await campaign();
    expect(() => resolveSocialAttributionEvent({ event: event("https://example.com", { destinationEventValidated: false }), campaigns: [source] })).toThrow();
    expect(() => resolveSocialAttributionEvent({ event: event("https://example.com", { visitorId: "person-1" }), campaigns: [source] })).toThrow();
    expect(() => resolveSocialAttributionEvent({ event: event("https://example.com", { fingerprint: "device-1" }), campaigns: [source] })).toThrow();
  });

  it("deduplicates retries by the canonical destination event and appends later events", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "social-attribution-")); roots.push(root);
    const source = await campaign();
    const first = resolveSocialAttributionEvent({ event: event("https://example.com/release"), campaigns: [source] });
    expect(await appendSocialAttributionEvent(root, first)).toMatchObject({ appended: true });
    expect(await appendSocialAttributionEvent(root, first)).toMatchObject({ appended: false });
    const later = resolveSocialAttributionEvent({ event: event("https://example.com/release", { sourceEventId: "destination-event-124", occurredAt: "2026-08-27T10:00:00.000Z", observedAt: "2026-08-27T10:01:00.000Z" }), campaigns: [source] });
    expect(await appendSocialAttributionEvent(root, later)).toMatchObject({ appended: true });
    expect(await readSocialAttributionEvents(root)).toMatchObject({ accepted: [expect.any(Object), expect.any(Object)], dropped: 0 });
  });
});
