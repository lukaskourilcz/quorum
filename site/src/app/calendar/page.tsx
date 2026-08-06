import { redirect } from "next/navigation";
import { mondayOfCalendarWeek, pragueCalendarDate } from "@/lib/calendar-feed-model";

/**
 * The calendar's front door.
 *
 * The product is a week, and every week has its own URL, so this page has nothing of its own
 * to show: it sends a reader to the week they are in. Without it the navigation bar had no
 * entry for the calendar at all — the only way in was a card on the home page.
 */
export const dynamic = "force-dynamic";

export default function CalendarPage() {
  redirect(`/calendar/${mondayOfCalendarWeek(pragueCalendarDate(new Date()))}`);
}
