import { newestTrendSnapshot } from "../../portfolio/evidence.js";
import { snapshotAgeDays, TREND_SNAPSHOT_MAX_AGE_DAYS, type GoViralTrends } from "../../sources/goviral-trends.js";
import { loadVentureCapabilityMap } from "../capabilities.js";

/** At most this many tags reach CHUM. The packet is bounded like every other GoVIRAL read. */
export const BRAND_TREND_TAGS = 5;

function direction(delta: number | null): string {
  if (delta === null) return "new this week";
  if (delta > 0) return "rising on last week";
  if (delta < 0) return "cooling on last week";
  return "flat on last week";
}

/**
 * The brand's own measured hashtags from a GoVIRAL snapshot, as signals and nothing more.
 *
 * The topic set carries the brand's id (`devshark`), so a brand reads its own set and no other.
 * A snapshot older than the trends window yields nothing: the intelligence expires rather than
 * lingering as advice. No figure crosses over, only a direction word, because the truth gates
 * refuse any number the question does not contain and a count here would invite one.
 */
export function brandTrendLines(trends: GoViralTrends | null, topicSet: string, date: string): string[] {
  if (!trends || snapshotAgeDays(trends.date, date) > TREND_SNAPSHOT_MAX_AGE_DAYS) return [];
  return trends.signals.topHashtags
    .filter((signal) => signal.topicSet === topicSet)
    .slice(0, BRAND_TREND_TAGS)
    .map((signal) => `${signal.hashtag} (${direction(signal.weekOverWeekDelta)})`);
}

/**
 * Reads through the registered `goviral → marketingshark` edge (`operations-2026-09b`).
 *
 * A map that cannot be read, or an edge that is not allowed, reads as no signal at all. The
 * carousel does not depend on trends, so their absence can never cost a draft.
 */
export async function readBrandTrendLines(input: {
  stateRoot: string;
  configRoot: string;
  brandId: string;
  date: string;
}): Promise<string[]> {
  const capabilityMap = await loadVentureCapabilityMap(input.configRoot).catch(() => null);
  if (!capabilityMap) return [];
  const trends = await newestTrendSnapshot(input.stateRoot, input.date, { venture: "marketingshark", capabilityMap })
    .catch(() => null);
  return brandTrendLines(trends, input.brandId, input.date);
}
