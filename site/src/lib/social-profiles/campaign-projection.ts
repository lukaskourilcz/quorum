import "server-only";
import { createHash } from "node:crypto";
import type { SocialCampaignEventRecord, SocialCampaignItemRecord, SocialCampaignRecord } from "./campaign-model";

export function canonicalCampaignJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalCampaignJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalCampaignJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function campaignHash(value: unknown): string { return createHash("sha256").update(canonicalCampaignJson(value)).digest("hex"); }

export function campaignTargetApprovalHash(items: readonly Pick<SocialCampaignItemRecord, "approval">[]): string {
  return campaignHash(items.map((item) => item.approval.bindingHash).sort());
}

export function campaignItemBindingHash(item: Pick<SocialCampaignItemRecord, "targetHash" | "copy" | "window" | "policyHash">): string {
  return campaignHash({ targetHash: item.targetHash, contentHash: campaignHash(item.copy), windowHash: campaignHash(item.window), policyHash: item.policyHash });
}

export interface AdminCampaignProjection {
  campaign: SocialCampaignRecord;
  appliedEventIds: string[];
  rejectedEventIds: string[];
}

function corrected(item: SocialCampaignItemRecord, event: SocialCampaignEventRecord): SocialCampaignItemRecord {
  const replacement = event.replacement!;
  const copy = {
    ...item.copy,
    text: replacement.text ?? item.copy.text,
    destination: replacement.destination ?? item.copy.destination,
    assets: replacement.altText === null ? item.copy.assets : item.copy.assets.map((asset, index) => index === 0 ? { ...asset, altText: replacement.altText! } : asset)
  };
  const window = replacement.notBefore && replacement.notAfter ? { notBefore: replacement.notBefore, notAfter: replacement.notAfter } : item.window;
  const contentHash = campaignHash(copy); const windowHash = campaignHash(window);
  const bindingHash = campaignHash({ targetHash: item.targetHash, contentHash, windowHash, policyHash: item.policyHash });
  if (bindingHash !== replacement.bindingHash) throw new Error("invalid replacement binding");
  return { ...item, copy, contentHash, window, windowHash, approval: { status: "invalidated", bindingHash, approvalRef: null, approvedAt: null, approvedBy: null }, status: item.status === "held" ? "held" : "draft" };
}

/** Applies owner events to an Admin projection while retaining the immutable original record. */
export function projectAdminCampaign(base: SocialCampaignRecord, records: readonly SocialCampaignEventRecord[]): AdminCampaignProjection {
  let campaign = structuredClone(base); const appliedEventIds: string[] = []; const rejectedEventIds: string[] = [];
  const events = records.filter((event) => event.campaignId === base.id).sort((left, right) => left.at.localeCompare(right.at) || left.eventId.localeCompare(right.eventId));
  for (const event of events) {
    try {
      if (event.action === "hold" || event.action === "cancel") {
        campaign = { ...campaign, status: event.action === "hold" ? "held" : "cancelled", holdReasons: event.action === "hold" ? [...new Set([...campaign.holdReasons, "authority"])] : [], updatedAt: event.at };
      } else if (event.action === "approve-target" || event.action === "reject-target") {
        const items = campaign.channelItems.filter((item) => item.targetId === event.targetId);
        if (items.length === 0 || campaignTargetApprovalHash(items) !== event.expectedBindingHash) throw new Error("stale target binding");
        campaign = {
          ...campaign,
          channelItems: campaign.channelItems.map((item) => item.targetId !== event.targetId ? item : event.action === "approve-target"
            ? { ...item, approval: { status: "approved", bindingHash: item.approval.bindingHash, approvalRef: `event:${event.eventId}`, approvedAt: event.at, approvedBy: "owner" }, status: "approved" }
            : { ...item, approval: { status: "rejected", bindingHash: item.approval.bindingHash, approvalRef: null, approvedAt: null, approvedBy: null }, status: "cancelled" }),
          updatedAt: event.at
        };
      } else {
        const item = campaign.channelItems.find((candidate) => candidate.id === event.itemId);
        if (!item || item.approval.bindingHash !== event.expectedBindingHash) throw new Error("stale item binding");
        campaign = { ...campaign, channelItems: campaign.channelItems.map((candidate) => candidate.id === item.id ? corrected(candidate, event) : candidate), updatedAt: event.at };
      }
      const reviewable = campaign.channelItems.filter((item) => !["cancelled", "held"].includes(item.status));
      const approved = reviewable.filter((item) => item.status === "approved").length;
      if (!["held", "cancelled"].includes(campaign.status)) campaign.status = reviewable.length === 0 ? "cancelled" : approved === 0 ? "needs-owner-review" : approved === reviewable.length ? "approved" : "partially-approved";
      appliedEventIds.push(event.eventId);
    } catch { rejectedEventIds.push(event.eventId); }
  }
  return { campaign, appliedEventIds, rejectedEventIds };
}
