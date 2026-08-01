import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { WeekBoard } from "@/components/week-board";
import { getPublicCalendarFeed } from "@/lib/calendar-feed";
import {
  addCalendarDays,
  calendarStaticWeeks,
  mondayOfCalendarWeek,
  pragueCalendarDate
} from "@/lib/calendar-feed-model";

export const metadata: Metadata = {
  description: "A five-day view of BoardlessAI project meetings and article slots.",
  title: "Five-day schedule"
};

export function generateStaticParams() {
  return calendarStaticWeeks(new Date()).map((week) => ({ week }));
}

export default async function CalendarWeekPage({
  params
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  const now = new Date();
  const availableWeeks = calendarStaticWeeks(now);
  if (!availableWeeks.includes(week)) notFound();
  const today = pragueCalendarDate(now);
  const currentWeek = mondayOfCalendarWeek(today);
  const anchorDate = week === currentWeek ? today : addCalendarDays(week, 2);
  const visibleWeekStarts = Array.from(new Set([
    week,
    mondayOfCalendarWeek(addCalendarDays(anchorDate, -1)),
    mondayOfCalendarWeek(addCalendarDays(anchorDate, 3))
  ]));
  const calendarFeeds = await Promise.all(
    visibleWeekStarts.map((visibleWeek) => getPublicCalendarFeed(visibleWeek, now))
  );
  const feed = calendarFeeds.find((entry) => entry.weekOf === week)!;
  const adjacentFeeds = calendarFeeds.filter((entry) => entry.weekOf !== week);
  return (
    <PageShell>
      <PageIntro
        eyebrow="Five-day schedule / Prague time"
        title={week === currentWeek ? "Five days around today" : "Five days from this week"}
        description={week === currentWeek
          ? "The calendar shows yesterday, today and the next three days. Saved meeting notes open from completed slots."
          : "This saved window keeps the same compact five-day layout. Completed slots open their meeting notes."}
      />
      <section className="mx-auto w-full min-w-0 max-w-[var(--container)] overflow-x-clip px-5 py-18 md:px-10 md:py-24">
        <WeekBoard adjacentFeeds={adjacentFeeds} anchorDate={anchorDate} availableWeeks={availableWeeks} feed={feed} headingLevel="page" today={today} />
      </section>
    </PageShell>
  );
}
