import { createHash } from "node:crypto";
import { z } from "zod";
import { DateTimeSchema, EvidenceRefSchema, HttpsUrlSchema } from "../contracts/common.js";
import {
  SocialAttributionEventSchema,
  type SocialAttributionEvent
} from "../contracts/social-results.js";
import { SocialCampaignSchema, type SocialCampaign } from "../contracts/social-distribution.js";

const RawDestinationEventSchema = z.strictObject({
  sourceEventId: z.string().trim().min(1).max(200),
  analyticsContractRef: EvidenceRefSchema,
  eventType: z.enum(["referral-visit", "qualified-action", "conversion"]),
  eventCount: z.number().int().positive().max(1_000_000),
  occurredAt: DateTimeSchema,
  observedAt: DateTimeSchema,
  destination: HttpsUrlSchema,
  destinationEventValidated: z.literal(true),
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(20)
});

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function utm(url: URL): SocialAttributionEvent["utm"] {
  const source = url.searchParams.get("utm_source");
  const medium = url.searchParams.get("utm_medium");
  const campaign = url.searchParams.get("utm_campaign");
  const content = url.searchParams.get("utm_content");
  return {
    source: source === "instagram" || source === "threads" ? source : null,
    medium: medium === "organic_social" ? medium : null,
    campaign: campaign && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(campaign) ? campaign : null,
    content: content && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(content) ? content : null
  };
}

export function resolveSocialAttributionEvent(input: {
  event: unknown;
  campaigns: readonly unknown[];
}): SocialAttributionEvent {
  const event = RawDestinationEventSchema.parse(input.event);
  if (Date.parse(event.observedAt) < Date.parse(event.occurredAt)) throw new Error("Destination attribution cannot be observed before it occurs");
  const campaigns = input.campaigns.flatMap((candidate) => {
    const parsed = SocialCampaignSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
  const parsedUtm = utm(new URL(event.destination));
  const values = Object.values(parsedUtm);
  const tupleState = values.every((value) => value !== null) ? "complete" : values.every((value) => value === null) ? "absent" : "partial";
  const match = tupleState === "complete" ? campaigns.flatMap((campaign) => campaign.channelItems.flatMap((item) =>
    item.utm.source === parsedUtm.source && item.utm.medium === parsedUtm.medium && item.utm.campaign === parsedUtm.campaign && item.utm.content === parsedUtm.content
      ? [{ campaign, item, target: campaign.targets.find(({ id }) => id === item.targetId) ?? null }]
      : [])).find(({ target }) => target !== null) ?? null : null;
  const attribution: SocialAttributionEvent["attribution"] = match?.target ? {
    state: "attributed",
    campaignRef: `state/social/campaigns/${match.campaign.id}.json`,
    campaignItemId: match.item.id,
    profileId: match.target.profileId,
    targetRole: match.target.role
  } : {
    state: tupleState === "partial" ? "invalid" : "unattributed",
    campaignRef: null,
    campaignItemId: null,
    profileId: null,
    targetRole: null
  };
  const deduplicationKey = sha256({ analyticsContractRef: event.analyticsContractRef, sourceEventId: event.sourceEventId });
  const idempotencyHash = sha256({ deduplicationKey, eventType: event.eventType, occurredAt: event.occurredAt, destination: event.destination });
  return SocialAttributionEventSchema.parse({
    schemaVersion: "social-attribution-event/1",
    id: `social-attribution-event-${idempotencyHash.slice(0, 20)}`,
    idempotencyHash,
    source: "first-party-destination",
    eventType: event.eventType,
    eventCount: event.eventCount,
    occurredAt: event.occurredAt,
    observedAt: event.observedAt,
    destination: event.destination,
    utm: parsedUtm,
    attribution,
    deduplicationKey,
    evidenceRefs: [event.analyticsContractRef, ...event.evidenceRefs],
    identityExcluded: true,
    fingerprintingExcluded: true,
    consentInferred: false,
    sharingInferred: false,
    relationshipKitRef: null,
    contestRef: null,
    authorityGranted: false
  });
}

export function socialCampaignAttributionKey(campaign: SocialCampaign, itemId: string): string | null {
  const item = campaign.channelItems.find(({ id }) => id === itemId);
  return item ? [item.utm.source, item.utm.medium, item.utm.campaign, item.utm.content].join(":") : null;
}
