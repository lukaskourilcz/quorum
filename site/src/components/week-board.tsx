import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Beaker,
  Building2,
  CheckCircle2,
  CircleMinus,
  Clock3,
  FileText,
  FlaskConical,
  Newspaper,
  Shirt,
  Swords,
  type LucideIcon
} from "lucide-react";
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

function isCaughtUp(kind: CalendarKind) {
  return kind === "cu-edition" || kind === "cu-product";
}

type ProjectKey = "company" | "caught-up" | "titty-tuesdays" | "incubator" | "fightaiq" | "mma-files";
type DisplayStatus = CalendarStatus | "test";

const projectDetails: Record<ProjectKey, { icon: LucideIcon; label: string; tone: string; slotTone: string }> = {
  company: { icon: Building2, label: "Company", tone: "text-[var(--accent)]", slotTone: "border-t-[var(--accent)]" },
  "caught-up": { icon: Newspaper, label: "Caught Up", tone: "text-[var(--magenta-spark)]", slotTone: "border-t-[var(--magenta-spark)]" },
  "titty-tuesdays": { icon: Shirt, label: "Titty Tuesdays", tone: "text-[var(--warning-soft)]", slotTone: "border-t-[var(--warning-soft)]" },
  incubator: { icon: FlaskConical, label: "Magazine Incubator", tone: "text-[var(--success-soft)]", slotTone: "border-t-[var(--success-soft)]" },
  fightaiq: { icon: Swords, label: "FightAIQ", tone: "text-[var(--destructive-soft)]", slotTone: "border-t-[var(--destructive-soft)]" },
  "mma-files": {
    icon: FileText,
    label: "MMA Files",
    tone: "text-[color-mix(in_srgb,var(--magenta-spark)_58%,var(--paper))]",
    slotTone: "border-t-[color-mix(in_srgb,var(--magenta-spark)_58%,var(--paper))]"
  }
};

function projectForKind(kind: CalendarKind): ProjectKey {
  if (isCaughtUp(kind)) return "caught-up";
  if (kind === "tt-marketing") return "titty-tuesdays";
  if (isIncubator(kind)) return "incubator";
  if (kind === "mma-intake" || kind === "mma-analysis") return "fightaiq";
  if (kind === "mag-editorial" || kind === "mag-desk" || kind === "article-am" || kind === "article-pm") return "mma-files";
  return "company";
}

function displayStatus(status: CalendarStatus, fixture: boolean | undefined): DisplayStatus {
  return fixture ? "test" : status;
}

function statusDetails(status: DisplayStatus): { icon: LucideIcon; label: string; tone: string; surface: CSSProperties } {
  if (status === "test") {
    return {
      icon: Beaker,
      label: "Test meeting",
      tone: "text-[var(--warning)]",
      surface: {
        backgroundColor: "var(--warning-soft)",
        backgroundImage: "repeating-linear-gradient(45deg, color-mix(in srgb, var(--warning) 34%, transparent) 0 2px, transparent 2px 8px), repeating-linear-gradient(-45deg, color-mix(in srgb, var(--warning) 24%, transparent) 0 2px, transparent 2px 8px)"
      }
    };
  }
  if (status === "held") {
    return {
      icon: CheckCircle2,
      label: "Happened",
      tone: "text-[var(--success)]",
      surface: {
        backgroundColor: "var(--success-soft)",
        backgroundImage: "repeating-linear-gradient(0deg, color-mix(in srgb, var(--success) 34%, transparent) 0 2px, transparent 2px 8px)"
      }
    };
  }
  if (status === "missed") {
    return {
      icon: CircleMinus,
      label: "Did not happen",
      tone: "text-[var(--destructive)]",
      surface: {
        backgroundColor: "var(--destructive-soft)",
        backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--destructive) 36%, transparent) 0 3px, transparent 3px 10px)"
      }
    };
  }
  return {
    icon: Clock3,
    label: "Planned",
    tone: "text-[var(--fog)]",
    surface: { backgroundColor: "var(--surface)" }
  };
}

function isIncubator(kind: CalendarKind) {
  return kind === "incubator-scan" || kind === "incubator-synthesis";
}

function publicKindLabel(kind: CalendarKind): string {
  const labels: Record<CalendarKind, string> = {
    "cu-edition": "Caught Up edition meeting",
    "venture-morning": "Morning company meeting",
    "incubator-scan": "Magazine idea research",
    "tt-marketing": "Titty Tuesdays marketing meeting",
    "venture-afternoon": "Afternoon company meeting",
    "cu-product": "Caught Up product meeting",
    "incubator-synthesis": "Magazine idea review",
    "venture-night": "Night company meeting",
    "mma-intake": "Fight data check",
    "mma-analysis": "Fight analysis review",
    "mag-editorial": "MMA Files story meeting",
    "mag-desk": "MMA Files desk review",
    "article-am": "Morning MMA Files article",
    "article-pm": "Evening MMA Files article"
  };
  return labels[kind];
}

function definitionTone(kind: CalendarKind): string {
  return projectDetails[projectForKind(kind)].tone;
}

function projectSlotTone(kind: CalendarKind): string {
  return projectDetails[projectForKind(kind)].slotTone;
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
  const kindLabel = (kind: CalendarKind) => publicKindLabel(kind);
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
          eyebrow="Weekly schedule / Prague time"
          title="Fourteen daily rooms and article slots"
          description="Company, project, marketing and research meetings share one schedule. Missed meetings stay visible, and finished meetings link to their notes."
          action={navigation}
        />
      ) : null}
      {headingLevel === "page" ? <div className="mb-6 flex justify-end">{navigation}</div> : null}
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]" data-horizontal-scroll data-testid="week-board">
        <div className="grid min-w-[62rem] grid-cols-[12rem_repeat(7,minmax(7rem,1fr))]">
          <div className="border-b border-r border-[var(--border)] p-3">
            <Badge tone="accent">{feed.weekOf}</Badge>
          </div>
          {days.map((day) => (
            <div className="border-b border-r border-[var(--border)] p-3 last:border-r-0" key={day}>
              <time className="font-mono text-xs uppercase tracking-[0.1em] text-[var(--mist)]" dateTime={day}>
                {dayFormatter.format(new Date(`${day}T12:00:00Z`))}
              </time>
            </div>
          ))}
          {feed.definitions.map((definition, row) => (
            <div className="contents" key={definition.kind}>
              <div className="flex items-start gap-3 border-b border-r border-[var(--border)] p-3 last:border-b-0">
                {(() => {
                  const ProjectIcon = projectDetails[projectForKind(definition.kind)].icon;
                  return <ProjectIcon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${definitionTone(definition.kind)}`} data-project-icon />;
                })()}
                <div>
                  <p className={`font-mono text-xs font-semibold uppercase tracking-[0.08em] ${definitionTone(definition.kind)}`}>
                    {String(definition.hour).padStart(2, "0")}:00
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-[var(--fog)]">{publicKindLabel(definition.kind)}</p>
                </div>
              </div>
              {days.map((day, column) => {
                const slot = feed.slots[column * feed.definitions.length + row]!;
                const visibleStatus = displayStatus(slot.status, slot.fixture);
                const status = statusDetails(visibleStatus);
                const StatusIcon = status.icon;
                const content = (
                  <>
                    <StatusIcon aria-hidden="true" className="size-4" />
                    <span className="sr-only">{status.label}</span>
                  </>
                );
                const project = projectForKind(slot.kind);
                const className = `grid min-h-16 place-items-center border-b border-r border-t-4 border-[var(--border)] p-2 last:border-r-0 ${projectSlotTone(slot.kind)} ${status.tone} ${slot.meetingHref ? "transition-[filter] hover:brightness-95 hover:saturate-125 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]" : ""}`;
                return slot.meetingHref ? (
                  <Link aria-label={`${day} ${kindLabel(slot.kind)}, ${status.label}`} className={className} data-calendar-slot data-calendar-state={visibleStatus} data-project={project} href={slot.meetingHref} key={`${day}-${slot.kind}`} style={status.surface} title={slot.decisionOneLiner}>
                    {content}
                  </Link>
                ) : (
                  <div aria-label={`${day} ${kindLabel(slot.kind)}, ${status.label}`} className={className} data-calendar-slot data-calendar-state={visibleStatus} data-project={project} key={`${day}-${slot.kind}`} style={status.surface}>{content}</div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-between gap-x-8 gap-y-4 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
        <div aria-label="Projects" className="flex flex-wrap gap-x-4 gap-y-3">
          {(Object.entries(projectDetails) as [ProjectKey, (typeof projectDetails)[ProjectKey]][]).map(([project, details]) => {
            const ProjectIcon = details.icon;
            return (
              <span className={`flex items-center gap-1.5 ${details.tone}`} data-project-legend key={project}>
                <ProjectIcon aria-hidden="true" className="size-3.5" />
                {details.label}
              </span>
            );
          })}
        </div>
        <div aria-label="Meeting status" className="flex flex-wrap gap-x-4 gap-y-3">
          {(["held", "missed", "test", "scheduled"] as DisplayStatus[]).map((value) => {
            const details = statusDetails(value);
            const StatusIcon = details.icon;
            return (
              <span className="flex items-center gap-1.5" key={value}>
                <span className={`grid size-5 place-items-center rounded-sm ${details.tone}`} style={details.surface}><StatusIcon aria-hidden="true" className="size-3" /></span>
                {details.label}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
  return headingLevel === "section" ? (
    <section className="mx-auto max-w-[var(--container)] px-5 py-24 md:px-10 md:py-30" id="week-board">{board}</section>
  ) : board;
}
