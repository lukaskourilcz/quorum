import "server-only";
import { buildPublicCalendarFeed } from "@/lib/calendar-feed-model";
import { getPublicMeetingRecords } from "@/lib/meeting-records";
import { getPublicArticleSlots } from "@/lib/article-slots";
import { getPublicMeetingSkips } from "@/lib/meeting-skips";
import { getPublicStandups } from "@/lib/standup-records";
import { getPublicCalendarSchedule } from "@/lib/venture-registry";

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
