import "server-only";
import { buildPublicCalendarFeed } from "@/lib/calendar-feed-model";
import { getPublicMeetingRecords } from "@/lib/meeting-records";
import { getPublicStandups } from "@/lib/standup-records";

export async function getPublicCalendarFeed(weekOf: string, now = new Date()) {
  const [standups, meetings] = await Promise.all([
    getPublicStandups(),
    getPublicMeetingRecords()
  ]);
  return buildPublicCalendarFeed({ weekOf, now, standups, meetings });
}
