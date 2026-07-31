import Link from "next/link";
import { CheckCircle2, CircleMinus, Clock3, ArrowLeft, ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { addCalendarDays, type CalendarKind, type CalendarStatus, type PublicCalendarFeed } from "@/lib/calendar-feed-model";

const dayFormatter = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "UTC"
});

const timeFormatter = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Prague"
});

function statusIcon(status: CalendarStatus) {
  if (status === "held") return <CheckCircle2 aria-hidden="true" className="size-3.5" />;
  if (status === "missed") return <CircleMinus aria-hidden="true" className="size-3.5" />;
  return <Clock3 aria-hidden="true" className="size-3.5" />;
}

function isCaughtUp(kind: CalendarKind) {
  return kind === "cu-edition" || kind === "cu-product";
}

export function WeekBoard({
  feed,
  availableWeeks,
  headingLevel = "section"
}: {
  feed: PublicCalendarFeed;
  availableWeeks: readonly string[];
  headingLevel?: "section" | "page";
}) {
  const kindLabel = (kind: CalendarKind) =>
    feed.definitions.find((slot) => slot.kind === kind)?.label ?? kind;
  const days = Array.from({ length: 7 }, (_, index) => addCalendarDays(feed.weekOf, index));
  const weekIndex = availableWeeks.indexOf(feed.weekOf);
  const previous = weekIndex > 0 ? availableWeeks[weekIndex - 1] : null;
  const next = weekIndex >= 0 && weekIndex < availableWeeks.length - 1 ? availableWeeks[weekIndex + 1] : null;
  const navigation = (
    <div className="flex gap-2">
      {previous ? <Link aria-label="Previous calendar week" className={buttonVariants({ size: "small", variant: "secondary" })} href={`/calendar/${previous}`} scroll={false}><ArrowLeft aria-hidden="true" className="size-4" /> Previous</Link> : null}
      {next ? <Link aria-label="Next calendar week" className={buttonVariants({ size: "small", variant: "secondary" })} href={`/calendar/${next}`} scroll={false}>Next <ArrowRight aria-hidden="true" className="size-4" /></Link> : null}
    </div>
  );
  const board = (
    <>
      {headingLevel === "section" ? (
        <SectionHeading
          eyebrow="WeekBoard / Europe/Prague"
          title="Five rooms, one public clock"
          description="Built from committed meeting records. A missed slot stays visible; a held slot opens its public room."
          action={navigation}
        />
      ) : null}
      {headingLevel === "page" ? <div className="mb-6 flex justify-end">{navigation}</div> : null}
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]" data-testid="week-board">
        <div className="grid min-w-[70rem] grid-cols-[10rem_repeat(7,minmax(8.5rem,1fr))]">
          <div className="border-b border-r border-[var(--border)] p-4">
            <Badge tone="accent">{feed.weekOf}</Badge>
          </div>
          {days.map((day) => (
            <div className="border-b border-r border-[var(--border)] p-4 last:border-r-0" key={day}>
              <time className="font-mono text-xs uppercase tracking-[0.1em] text-[var(--mist)]" dateTime={day}>
                {dayFormatter.format(new Date(`${day}T12:00:00Z`))}
              </time>
            </div>
          ))}
          {feed.definitions.map((definition, row) => (
            <div className="contents" key={definition.kind}>
              <div className="border-b border-r border-[var(--border)] p-4 last:border-b-0">
                <p className={isCaughtUp(definition.kind) ? "font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[var(--magenta-spark)]" : "font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent)]"}>
                  {String(definition.hour).padStart(2, "0")}:00
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--fog)]">{definition.label}</p>
              </div>
              {days.map((day, column) => {
                const slot = feed.slots[column * feed.definitions.length + row]!;
                const content = (
                  <>
                    <span className="flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-[0.08em]">
                      {statusIcon(slot.status)} {slot.status}
                    </span>
                    <span className="mt-2 block text-xs font-semibold leading-5">{kindLabel(slot.kind)}</span>
                    <time className="mt-1 block font-mono text-[0.625rem] text-[var(--fog)]" dateTime={slot.at}>{timeFormatter.format(new Date(slot.at))} Prague</time>
                    {slot.fixture ? <span className="mt-2 block text-[0.625rem] uppercase tracking-[0.08em] text-[var(--fog)]">Offline fixture</span> : null}
                  </>
                );
                const className = `min-h-31 border-b border-r border-[var(--border)] p-4 last:border-r-0 ${
                  isCaughtUp(slot.kind)
                    ? "bg-[color-mix(in_srgb,var(--magenta-spark)_6%,var(--surface))] text-[var(--mist)]"
                    : "bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface))] text-[var(--mist)]"
                } ${slot.meetingHref ? "transition-colors hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]" : ""}`;
                return slot.meetingHref ? (
                  <Link aria-label={`${day} ${kindLabel(slot.kind)}, ${slot.status}`} className={className} href={slot.meetingHref} key={`${day}-${slot.kind}`} title={slot.decisionOneLiner}>
                    {content}
                  </Link>
                ) : (
                  <div aria-label={`${day} ${kindLabel(slot.kind)}, ${slot.status}`} className={className} key={`${day}-${slot.kind}`}>{content}</div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-4 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
        <span className="text-[var(--accent)]">Venture council</span>
        <span className="text-[var(--magenta-spark)]">Caught Up board</span>
        <span>✓ held</span><span>− missed</span><span>◷ scheduled</span>
      </div>
    </>
  );
  return headingLevel === "section" ? (
    <section className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10 md:py-30" id="week-board">{board}</section>
  ) : board;
}
