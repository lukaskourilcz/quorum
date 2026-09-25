import type { z } from "zod";
import type { GoViralIntelligencePacketSchema, VentureCapabilityMap } from "../../contracts/venture-capability.js";
import { newestTrendSnapshot } from "../../portfolio/evidence.js";
import { TREND_SNAPSHOT_MAX_AGE_DAYS, trendsPath, type GoViralTrends } from "../../sources/goviral-trends.js";
import { loadVentureCapabilityMap, resolveVentureCapabilityInMap, validateVentureCapabilityPayload } from "../capabilities.js";

export type GoViralIntelligencePacket = z.infer<typeof GoViralIntelligencePacketSchema>;

/** The exact edge the Friday note reads through (quorum#576). */
export const TREND_HOOK_EDGE = {
  source: "goviral",
  target: "marketingshark",
  capability: "intelligence-read",
  schemaVersion: "goviral-intelligence-packet/1"
} as const;

export interface TrendHookRead {
  packet: GoViralIntelligencePacket | null;
  /** Why there is no packet, or where the one there is came from. Recorded with the package. */
  reason: string;
}

const DAY_MS = 86_400_000;

/**
 * Week-over-week change in engagement per hour, as a percentage of last week's figure, within the
 * packet's ±100. Null when there was nothing to compare against: "new this week" is not a rate.
 */
export function trendVelocity(engagementPerHour: number, weekOverWeekDelta: number | null): number | null {
  if (weekOverWeekDelta === null) return null;
  const previous = engagementPerHour - weekOverWeekDelta;
  const percent = previous > 0 ? (weekOverWeekDelta / previous) * 100 : weekOverWeekDelta > 0 ? 100 : 0;
  return Math.max(-100, Math.min(100, Math.round(percent)));
}

function measuredAtOf(trends: GoViralTrends): string {
  const parsed = Date.parse(trends.generatedAt);
  return Number.isNaN(parsed) ? `${trends.date}T00:00:00.000Z` : new Date(parsed).toISOString();
}

/**
 * The one trend hook a snapshot offers a brand: its topic set's strongest tag that is rising or new.
 *
 * The snapshot ranks tags by engagement per hour, so the first one that is not cooling is the hook.
 * A week where every tag cools offers none: a hook that is losing attention is no hook. The packet
 * expires the day after the snapshot leaves the trends window, the same window the carousel's
 * hashtag signals obey, so the two reads of one snapshot never disagree about whether it is current.
 */
export function trendPacketFrom(trends: GoViralTrends, topicSet: string): GoViralIntelligencePacket | null {
  const signal = trends.signals.topHashtags
    .filter((candidate) => candidate.topicSet === topicSet)
    .find((candidate) => candidate.weekOverWeekDelta === null || candidate.weekOverWeekDelta > 0);
  if (!signal) return null;
  const expires = Date.parse(`${trends.date}T00:00:00.000Z`) + (TREND_SNAPSHOT_MAX_AGE_DAYS + 1) * DAY_MS;
  return {
    schemaVersion: "goviral-intelligence-packet/1",
    topic: signal.hashtag.slice(0, 160),
    measuredAt: measuredAtOf(trends),
    expiresAt: new Date(expires).toISOString(),
    velocity: trendVelocity(signal.engagementPerHour, signal.weekOverWeekDelta),
    evidenceRefs: [`state/${trendsPath(trends.date)}`]
  };
}

/**
 * The Friday note's trend hook, read through `goviral -> marketingshark` on
 * `goviral-intelligence-packet/1`, the runtime enforcement point the capability map names.
 *
 * Two edges have to be open. The snapshot is GoVIRAL's `goviral-trends/1` artifact, so
 * `newestTrendSnapshot` resolves that edge before it reads a file; the packet is what crosses into
 * the room, so it resolves its own edge and passes the map's payload check before it is returned.
 * Anything short of that — no map, a closed edge, no snapshot, no rising tag, an expired or
 * malformed packet — is no hook and a reason. The note never depends on a trend to be written.
 */
export async function readTrendHook(input: {
  stateRoot: string;
  configRoot: string;
  brandId: string;
  date: string;
  /** A map already loaded by the caller; read from `configRoot` otherwise. */
  capabilityMap?: VentureCapabilityMap;
}): Promise<TrendHookRead> {
  const map = input.capabilityMap ?? await loadVentureCapabilityMap(input.configRoot).catch(() => null);
  if (!map) return { packet: null, reason: "The capability map could not be read, so no trend hook was taken." };
  const edge = resolveVentureCapabilityInMap(map, TREND_HOOK_EDGE);
  if (edge.decision !== "allowed") {
    return { packet: null, reason: `The goviral -> marketingshark intelligence packet edge is ${edge.decision}, so no trend hook was taken.` };
  }
  const trends = await newestTrendSnapshot(input.stateRoot, input.date, { venture: "marketingshark", capabilityMap: map }).catch(() => null);
  if (!trends) return { packet: null, reason: "GoVIRAL has no readable trend snapshot for this date, or its trends edge is closed." };
  const packet = trendPacketFrom(trends, input.brandId);
  if (!packet) return { packet: null, reason: `The ${trends.date} snapshot has no rising or new ${input.brandId} tag.` };
  if (!validateVentureCapabilityPayload(TREND_HOOK_EDGE.schemaVersion, packet).valid) {
    return { packet: null, reason: `The trend hook from the ${trends.date} snapshot does not satisfy goviral-intelligence-packet/1.` };
  }
  if (Date.parse(packet.expiresAt) <= Date.parse(`${input.date}T00:00:00.000Z`)) {
    return { packet: null, reason: `The trend hook from the ${trends.date} snapshot expired on ${packet.expiresAt.slice(0, 10)}.` };
  }
  return { packet, reason: `GoVIRAL's ${trends.date} snapshot, expiring ${packet.expiresAt.slice(0, 10)}.` };
}

/**
 * devShark's own category for a trend topic, or null when the topic names none of them.
 *
 * This is the whole of what a trend hook may do to a post: pick which of the brand's own labels
 * leads. The topic is a stranger's hashtag, so it is matched against the categories the bank
 * carries and never printed; a tag that matches nothing leaves the week's own theme in place.
 */
export function categoryForTopic(topic: string, categories: readonly string[]): string | null {
  const key = topic.toLowerCase().replace(/^#/u, "").replace(/[^a-z0-9]/gu, "");
  if (!key) return null;
  const known = new Set(categories);
  for (const [category, aliases] of Object.entries(TOPIC_ALIASES)) {
    if (known.has(category) && aliases.includes(key)) return category;
  }
  return categories.find((category) => category.replace(/[^a-z0-9]/gu, "") === key) ?? null;
}

/** Tag spellings that name a bank category, beyond the category's own slug without its dashes. */
const TOPIC_ALIASES: Readonly<Record<string, readonly string[]>> = {
  javascript: ["js"],
  typescript: ["ts"],
  react: ["reactjs"],
  nodejs: ["node"],
  css: ["css3"],
  html: ["html5"],
  dsa: ["datastructures"],
  algorithms: ["algorithm"],
  databases: ["database", "sql"],
  security: ["websecurity"]
};
