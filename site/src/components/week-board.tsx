import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Beaker,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  CircleMinus,
  Clock3,
  FileText,
  FlaskConical,
  Newspaper,
  Shirt,
  Swords,
  type LucideIcon
} from "lucide-react";
import ventureRegistrySource from "../../../config/ventures.json";
import {
  agentById,
  type AgentApiModel,
  type AgentId
} from "@/data/agents";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  addCalendarDays,
  type CalendarKind,
  type CalendarSlot,
  type CalendarStatus,
  type PublicCalendarFeed
} from "@/lib/calendar-feed-model";

const weekdayFormatter = new Intl.DateTimeFormat("en", {
  weekday: "short",
  timeZone: "UTC"
});

const dateFormatter = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC"
});

function isCaughtUp(kind: CalendarKind) {
  return kind === "cu-edition" || kind === "cu-product";
}

type ProjectKey = "company" | "caught-up" | "titty-tuesdays" | "incubator" | "fightaiq" | "mma-files";
type DisplayStatus = CalendarStatus | "test";

const companyCouncil: readonly AgentId[] = ["VIZE", "FORGE", "PULSE", "AUDIT"];
const morningDecisionRoom: readonly AgentId[] = [...companyCouncil, "SPARK", "VAULT"];
const articleAuthors: readonly AgentId[] = ["JAB", "HACEK"];
const configuredMeetingCast = new Map<string, readonly AgentId[]>(
  ventureRegistrySource.ventures.flatMap((venture) =>
    venture.meetings.map((meeting) => [
      meeting.kind,
      meeting.cast as readonly AgentId[]
    ] as const)
  )
);

const calendarCostContexts: Partial<
  Record<CalendarKind, Partial<Record<AgentId, AgentApiModel["context"]>>>
> = {
  "venture-morning": {
    VIZE: "Company council meetings",
    FORGE: "Company council meetings",
    PULSE: "Company and portfolio meetings",
    AUDIT: "Company and portfolio meetings",
    SPARK: "Caught Up idea and portfolio rooms",
    VAULT: "Caught Up idea checks"
  },
  "venture-afternoon": {
    VIZE: "Company council meetings",
    FORGE: "Company council meetings",
    PULSE: "Company and portfolio meetings",
    AUDIT: "Company and portfolio meetings"
  },
  "venture-night": {
    VIZE: "Company council meetings",
    FORGE: "Company council meetings",
    PULSE: "Company and portfolio meetings",
    AUDIT: "Company and portfolio meetings"
  },
  "cu-edition": {
    HERALD: "Caught Up daily edition curation",
    STET: "Caught Up English edition",
    HACEK: "Caught Up Czech edition",
    SPARK: "Caught Up idea and portfolio rooms",
    AUDIT: "Company and portfolio meetings"
  },
  "cu-product": {
    HERALD: "Caught Up product room",
    SPARK: "Caught Up idea and portfolio rooms",
    VAULT: "Caught Up idea checks",
    AUDIT: "Company and portfolio meetings"
  },
  "mag-editorial": {
    JAB: "MMA Files editorial rooms"
  },
  "mag-desk": {
    JAB: "MMA Files editorial rooms"
  },
  "article-am": {
    JAB: "MMA Files English articles",
    HACEK: "MMA Files Czech edition"
  },
  "article-pm": {
    JAB: "MMA Files English articles",
    HACEK: "MMA Files Czech edition"
  }
};

function calendarParticipants(kind: CalendarKind): readonly AgentId[] {
  if (kind === "venture-morning") return morningDecisionRoom;
  if (kind === "venture-afternoon" || kind === "venture-night") return [];
  if (kind === "article-am" || kind === "article-pm") return articleAuthors;
  return configuredMeetingCast.get(kind) ?? [];
}

function calendarCostUsd(kind: CalendarKind): number {
  const contexts = calendarCostContexts[kind];
  return Number(calendarParticipants(kind).reduce((sum, agentId) => {
    const apiModels = agentById.get(agentId)?.apiModels ?? [];
    const apiModel =
      (contexts?.[agentId]
        ? apiModels.find((model) => model.context === contexts[agentId])
        : undefined) ??
      apiModels.find((model) => model.context === "Portfolio rooms when selected") ??
      apiModels.find((model) => model.context === "Text calls when this role is selected") ??
      apiModels[0];
    return sum + (apiModel?.estimatedCostUsd ?? 0);
  }, 0).toFixed(8));
}

function calendarCostLabel(kind: CalendarKind): string {
  return `~$${calendarCostUsd(kind).toFixed(3)}`;
}

const projectDetails: Record<ProjectKey, { icon: LucideIcon; label: string; tone: string; slotColor: string }> = {
  company: { icon: Building2, label: "Company", tone: "text-[var(--accent)]", slotColor: "var(--accent)" },
  "caught-up": { icon: Newspaper, label: "Caught Up", tone: "text-[var(--magenta-spark)]", slotColor: "var(--magenta-spark)" },
  "titty-tuesdays": { icon: Shirt, label: "Titty Tuesdays", tone: "text-[var(--warning-soft)]", slotColor: "var(--warning-soft)" },
  incubator: { icon: FlaskConical, label: "Magazine Incubator", tone: "text-[var(--success-soft)]", slotColor: "var(--success-soft)" },
  fightaiq: { icon: Swords, label: "FightAIQ", tone: "text-[var(--destructive-soft)]", slotColor: "var(--destructive-soft)" },
  "mma-files": {
    icon: FileText,
    label: "MMA Files",
    tone: "text-[color-mix(in_srgb,var(--magenta-spark)_58%,var(--paper))]",
    slotColor: "color-mix(in srgb, var(--magenta-spark) 58%, var(--paper))"
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
      tone: "text-[color-mix(in_srgb,var(--warning)_58%,var(--paper))]",
      surface: {
        backgroundColor: "color-mix(in srgb, var(--warning) 15%, var(--surface))",
        backgroundImage: "linear-gradient(135deg, color-mix(in srgb, var(--warning) 9%, transparent), transparent 62%)"
      }
    };
  }
  if (status === "held") {
    return {
      icon: CheckCircle2,
      label: "Happened",
      tone: "text-[color-mix(in_srgb,var(--success)_48%,var(--paper))]",
      surface: {
        backgroundColor: "color-mix(in srgb, var(--success) 18%, var(--surface))",
        backgroundImage: "linear-gradient(135deg, color-mix(in srgb, var(--success) 10%, transparent), transparent 62%)"
      }
    };
  }
  if (status === "missed") {
    return {
      icon: CircleMinus,
      label: "Did not happen",
      tone: "text-[color-mix(in_srgb,var(--destructive)_58%,var(--paper))]",
      surface: {
        backgroundColor: "color-mix(in srgb, var(--destructive) 17%, var(--surface))",
        backgroundImage: "linear-gradient(135deg, color-mix(in srgb, var(--destructive) 10%, transparent), transparent 62%)"
      }
    };
  }
  if (status === "not-needed") {
    return {
      icon: CircleMinus,
      label: "Not needed",
      tone: "text-[var(--fog)]",
      surface: { backgroundColor: "color-mix(in srgb, var(--surface) 86%, var(--page))" }
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

function projectSlotColor(kind: CalendarKind): string {
  return projectDetails[projectForKind(kind)].slotColor;
}

export function WeekBoard({
  feed,
  adjacentFeeds = [],
  anchorDate,
  today,
  availableWeeks,
  headingLevel = "section"
}: {
  feed: PublicCalendarFeed;
  adjacentFeeds?: readonly PublicCalendarFeed[];
  anchorDate: string;
  today: string;
  availableWeeks: readonly string[];
  headingLevel?: "section" | "page";
}) {
  const kindLabel = (kind: CalendarKind) => publicKindLabel(kind);
  const days = Array.from({ length: 5 }, (_, index) => addCalendarDays(anchorDate, index - 1));
  const slotByDateAndKind = new Map<string, CalendarSlot>();
  for (const sourceFeed of [feed, ...adjacentFeeds]) {
    for (let day = 0; day < 7; day += 1) {
      const date = addCalendarDays(sourceFeed.weekOf, day);
      sourceFeed.definitions.forEach((definition, row) => {
        const slot = sourceFeed.slots[day * sourceFeed.definitions.length + row];
        if (slot) slotByDateAndKind.set(`${date}:${definition.kind}`, slot);
      });
    }
  }
  const getSlot = (day: string, kind: CalendarKind) => {
    const slot = slotByDateAndKind.get(`${day}:${kind}`);
    if (!slot) throw new Error(`Missing calendar slot for ${day}:${kind}`);
    return slot;
  };
  const weekIndex = availableWeeks.indexOf(feed.weekOf);
  const previous = weekIndex > 0 ? availableWeeks[weekIndex - 1] : null;
  const next = weekIndex >= 0 && weekIndex < availableWeeks.length - 1 ? availableWeeks[weekIndex + 1] : null;
  const navigation = (
    <div className="flex gap-2">
      {previous ? <Link aria-label="Previous calendar week" className={buttonVariants({ variant: "secondary" })} href={`/calendar/${previous}`} scroll={false}><ArrowLeft aria-hidden="true" className="size-4" /> Previous</Link> : null}
      {next ? <Link aria-label="Next calendar week" className={buttonVariants({ variant: "secondary" })} href={`/calendar/${next}`} scroll={false}>Next <ArrowRight aria-hidden="true" className="size-4" /></Link> : null}
    </div>
  );
  const board = (
    <>
      {headingLevel === "section" ? (
        <SectionHeading
          eyebrow="Five-day schedule / Prague time"
          title="Yesterday, today and the next three days"
          description="See what happened, what was missed and what comes next. Finished meetings link to their notes."
          action={navigation}
        />
      ) : null}
      {headingLevel === "page" ? <div className="mb-6 flex justify-end">{navigation}</div> : null}
      <p className="mb-3 flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[var(--fog)] md:hidden">
        Scroll sideways to see later days <ArrowRight aria-hidden="true" className="size-3.5" />
      </p>
      <div aria-label="Five-day meeting calendar" className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)]" data-horizontal-scroll data-testid="week-board" role="region" tabIndex={0}>
        <div className="grid min-w-[56rem] grid-cols-[13rem_repeat(5,minmax(8.5rem,1fr))]">
          <div className="flex items-center border-b border-r border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-3">
            <Badge tone="accent">5-day view</Badge>
          </div>
          {days.map((day) => (
            <div
              className={`border-b border-r border-[var(--line-strong)] px-4 py-3 last:border-r-0 ${day === today ? "bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-raised))]" : "bg-[var(--surface-raised)]"}`}
              data-calendar-today={day === today ? "true" : undefined}
              key={day}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[var(--fog)]">
                  {weekdayFormatter.format(new Date(`${day}T12:00:00Z`))}
                </span>
                {day === today ? <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-[var(--accent-foreground)]">Today</span> : null}
              </div>
              <time className="mt-1 block text-base font-semibold tabular-nums text-[var(--foreground)]" dateTime={day}>
                {dateFormatter.format(new Date(`${day}T12:00:00Z`))}
              </time>
            </div>
          ))}
          {feed.definitions.map((definition) => (
            <div className="contents" key={definition.kind}>
              <div className="flex items-start gap-3 border-b border-r border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_48%,var(--surface))] px-4 py-3 last:border-b-0">
                {(() => {
                  const ProjectIcon = projectDetails[projectForKind(definition.kind)].icon;
                  return <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface)]"><ProjectIcon aria-hidden="true" className={`size-4 ${definitionTone(definition.kind)}`} data-project-icon /></span>;
                })()}
                <div className="min-w-0">
                  <p className={`font-mono text-xs font-semibold uppercase tracking-[0.08em] ${definitionTone(definition.kind)}`}>
                    {String(definition.hour).padStart(2, "0")}:00
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-[var(--fog)]">{publicKindLabel(definition.kind)}</p>
                  <span
                    aria-label={`Approximate live API cost ${calendarCostLabel(definition.kind)}`}
                    className="mt-1 flex items-center gap-1 font-mono text-[0.625rem] font-medium tracking-[0.04em] text-[var(--ash)]"
                  >
                    <CircleDollarSign aria-hidden="true" className="size-3" />
                    {calendarCostLabel(definition.kind)}
                  </span>
                </div>
              </div>
              {days.map((day) => {
                const slot = getSlot(day, definition.kind);
                const visibleStatus = displayStatus(slot.status, slot.fixture);
                const status = statusDetails(visibleStatus);
                const StatusIcon = status.icon;
                const content = (
                  <>
                    <span className="grid size-8 place-items-center rounded-full border border-current/20 bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]">
                      <StatusIcon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="sr-only">{status.label}</span>
                  </>
                );
                const project = projectForKind(slot.kind);
                const className = `grid min-h-14 place-items-center border-b border-r border-t-2 border-[var(--line-strong)] p-2 last:border-r-0 ${status.tone} ${day === today ? "outline outline-1 -outline-offset-1 outline-[color-mix(in_srgb,var(--accent)_22%,transparent)]" : ""} ${slot.meetingHref ? "transition-[background-color,filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]" : ""}`;
                const slotSurface = { ...status.surface, borderTopColor: projectSlotColor(slot.kind) };
                return slot.meetingHref ? (
                  <Link aria-label={`${day} ${kindLabel(slot.kind)}, ${status.label}`} className={className} data-calendar-slot data-calendar-state={visibleStatus} data-project={project} href={slot.meetingHref} key={`${day}-${slot.kind}`} style={slotSurface} title={slot.decisionOneLiner}>
                    {content}
                  </Link>
                ) : (
                  <div aria-label={`${day} ${kindLabel(slot.kind)}, ${status.label}`} className={className} data-calendar-slot data-calendar-state={visibleStatus} data-project={project} key={`${day}-${slot.kind}`} style={slotSurface}>{content}</div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-between gap-x-8 gap-y-4 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 font-mono text-[0.65625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
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
          {(["held", "missed", "test", "not-needed", "scheduled"] as DisplayStatus[]).map((value) => {
            const details = statusDetails(value);
            const StatusIcon = details.icon;
            return (
              <span className="flex items-center gap-1.5" key={value}>
                <span className={`grid size-5 place-items-center rounded-full border border-current/20 ${details.tone}`} style={details.surface}><StatusIcon aria-hidden="true" className="size-3" /></span>
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
