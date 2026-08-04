import "server-only";
import { buildPublicCalendarFeed } from "@/lib/calendar-feed-model";
import { getPublicMeetingRecords } from "@/lib/meeting-records";
import { getPublicArticleSlots } from "@/lib/article-slots";
import { getPublicMeetingSkips } from "@/lib/meeting-skips";
import { getPublicStandups } from "@/lib/standup-records";
import { getPublicCalendarSchedule } from "@/lib/venture-registry";

/**
 * Every source here is a file in this repository, which is why the feed needs no network at build
 * time. It is also the limit of what the feed knows: a run that has started but not yet committed
 * is invisible to all five reads, so `buildPublicCalendarFeed` falls back to elapsed time to decide
 * whether such a slot reads "ongoing", "late" or "missed".
 *
 * A live run signal — the one thing that would replace that guess — would be fetched here as a
 * sixth source and passed through, and `slotWithoutRecordStatus` in `calendar-feed-model.ts` is
 * where it would be consulted. No source here calls the GitHub API, so the feed stays buildable
 * offline and costs no rate limit; adding that sixth source is what would change both.
 */
export async function getPublicCalendarFeed(weekOf: string, now = new Date()) {
  const [standups, meetings, skips, articleSlots, definitions] = await Promise.all([
    getPublicStandups(),
    getPublicMeetingRecords(),
    getPublicMeetingSkips(),
    getPublicArticleSlots(),
    getPublicCalendarSchedule()
  ]);
  return buildPublicCalendarFeed({ weekOf, now, standups, meetings, skips, articleSlots, definitions });
}
