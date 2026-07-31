import "server-only";
import { buildPublicCalendarFeed } from "@/lib/calendar-feed-model";
import { getPublicMeetingRecords } from "@/lib/meeting-records";
import { getPublicStandups } from "@/lib/standup-records";
import { getPublicCalendarSchedule } from "@/lib/venture-registry";

export async function getPublicCalendarFeed(weekOf: string, now = new Date()) {
  const [standups, meetings, definitions] = await Promise.all([
    getPublicStandups(),
    getPublicMeetingRecords(),
    getPublicCalendarSchedule()
  ]);
  return buildPublicCalendarFeed({ weekOf, now, standups, meetings, definitions });
}
