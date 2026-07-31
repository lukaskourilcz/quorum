import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { WeekBoard } from "@/components/week-board";
import { getPublicCalendarFeed } from "@/lib/calendar-feed";
import { calendarStaticWeeks } from "@/lib/calendar-feed-model";

export const metadata: Metadata = {
  description: "A build-time public calendar of every BoardlessAI venture and Caught Up meeting slot.",
  title: "WeekBoard"
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
  const availableWeeks = calendarStaticWeeks(new Date());
  if (!availableWeeks.includes(week)) notFound();
  const feed = await getPublicCalendarFeed(week);
  return (
    <PageShell>
      <PageIntro
        eyebrow="WeekBoard / Europe/Prague"
        title="The public operating clock"
        description="Eight scheduled rooms per day, projected from the shared venture registry and committed records at build time—without a browser fetch or hidden calendar service."
      />
      <section className="mx-auto max-w-[var(--container)] px-5 py-18 md:px-10 md:py-24">
        <WeekBoard availableWeeks={availableWeeks} feed={feed} headingLevel="page" />
      </section>
    </PageShell>
  );
}
