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
  CircleSlash,
  Clock3,
  FileText,
  FlaskConical,
  Hourglass,
  Newspaper,
  PanelsTopLeft,
  Radio,
  Shirt,
  Swords,
  type LucideIcon
} from "lucide-react";
import ventureRegistrySource from "../../../config/ventures.json";
import {
  agentById,
  type AgentId
} from "@/data/agents";
import { calendarCostContexts } from "@/lib/calendar-cost";
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

type ProjectKey = "company" | "caught-up" | "titty-tuesdays" | "incubator" | "fightaiq" | "mma-files" | "carousel-studio";
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

function calendarParticipants(kind: CalendarKind): readonly AgentId[] {
  if (kind === "venture-morning") return morningDecisionRoom;
  if (kind === "venture-afternoon" || kind === "venture-night") return [];
  if (kind === "article-am" || kind === "article-pm") return articleAuthors;
  return configuredMeetingCast.get(kind) ?? [];
}

/**
 * A slot costs the sum of one priced call per participant. `calendarCostContexts` names which
 * call each participant makes; an agent with no entry there, or an entry whose `context` no
 * longer exists, falls back to that agent's cheapest priced call. Picking the cheapest by price
 * rather than by position is what makes the fallback safe: `apiModels[0]` is authoring order,
 * not price order, and for JAB it is the $0.047 article call — an unnamed JAB slot would have
 * printed twelve times the $0.0038 editorial-room call it really makes.
 */
function calendarCostUsd(kind: CalendarKind): number {
  const contexts = calendarCostContexts[kind];
  return Number(calendarParticipants(kind).reduce((sum, agentId) => {
    const apiModels = agentById.get(agentId)?.apiModels ?? [];
    const apiModel =
      (contexts?.[agentId]
        ? apiModels.find((model) => model.context === contexts[agentId])
        : undefined) ??
      (apiModels.length > 0
        ? apiModels.reduce((cheapest, model) => model.estimatedCostUsd < cheapest.estimatedCostUsd ? model : cheapest)
        : undefined);
    return sum + (apiModel?.estimatedCostUsd ?? 0);
  }, 0).toFixed(8));
}

function calendarCostLabel(kind: CalendarKind): string {
  return `~$${calendarCostUsd(kind).toFixed(3)}`;
}

const projectDetails: Record<ProjectKey, { icon: LucideIcon; label: string; tone: string; slotColor: string }> = {
  company: { icon: Building2, label: "Company", tone: "text-[var(--accent)]", slotColor: "var(--accent)" },
  "caught-up": { icon: Newspaper, label: "DNESKAi", tone: "text-[var(--magenta-spark)]", slotColor: "var(--magenta-spark)" },
  "titty-tuesdays": { icon: Shirt, label: "Titty Tuesdays", tone: "text-[var(--warning-soft)]", slotColor: "var(--warning-soft)" },
  incubator: { icon: FlaskConical, label: "Magazine Incubator", tone: "text-[var(--success-soft)]", slotColor: "var(--success-soft)" },
  fightaiq: { icon: Swords, label: "FightAIQ", tone: "text-[var(--destructive-soft)]", slotColor: "var(--destructive-soft)" },
  "mma-files": {
    icon: FileText,
    label: "MMA Files",
    tone: "text-[color-mix(in_srgb,var(--magenta-spark)_58%,var(--paper))]",
    slotColor: "color-mix(in srgb, var(--magenta-spark) 58%, var(--paper))"
  },
  "carousel-studio": { icon: PanelsTopLeft, label: "Carousel Studio", tone: "text-[var(--accent)]", slotColor: "var(--accent)" }
};

function projectForKind(kind: CalendarKind): ProjectKey {
  if (isCaughtUp(kind)) return "caught-up";
  if (kind === "tt-marketing") return "titty-tuesdays";
  if (isIncubator(kind)) return "incubator";
  if (kind === "mma-intake" || kind === "mma-analysis") return "fightaiq";
  if (kind === "mag-editorial" || kind === "mag-desk" || kind === "article-am" || kind === "article-pm") return "mma-files";
  if (kind === "studio") return "carousel-studio";
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
  if (status === "ongoing") {
    // Ember is the only brand accent no other status uses: held is success, missed is destructive,
    // skipped and test are warning, and not-needed, late and scheduled are fog. It is also what
    // the board already spends on "now" — the Today pill and today's column tint both use it.
    return {
      icon: Radio,
      label: "Happening now",
      tone: "text-[color-mix(in_srgb,var(--accent)_58%,var(--paper))]",
      surface: {
        backgroundColor: "color-mix(in srgb, var(--accent) 18%, var(--surface))",
        backgroundImage: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent), transparent 62%)"
      }
    };
  }
  // Neither red nor amber. Nothing has gone wrong and nothing is owed: the slot's hour has
  // passed and its run has not landed yet, which on 4 August was true of every meeting the
  // council held that day, each for between 1h23m and 1h55m before its run arrived. Quieter
  // than "Skipped" because a skip is a decision somebody made and this is only a wait.
  if (status === "late") {
    return {
      icon: Hourglass,
      label: "Waiting on the run",
      tone: "text-[var(--fog)]",
      surface: { backgroundColor: "color-mix(in srgb, var(--fog) 14%, var(--surface))" }
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
  if (status === "skipped") {
    return {
      icon: CircleSlash,
      label: "Skipped",
      tone: "text-[color-mix(in_srgb,var(--warning)_58%,var(--paper))]",
      surface: {
        backgroundColor: "color-mix(in srgb, var(--warning) 15%, var(--surface))",
        backgroundImage: "linear-gradient(135deg, color-mix(in srgb, var(--warning) 9%, transparent), transparent 62%)"
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
    "cu-edition": "DNESKAi edition production",
    "venture-morning": "Morning company meeting",
    "incubator-scan": "Magazine idea research",
    "tt-marketing": "Titty Tuesdays marketing meeting",
    "venture-afternoon": "Afternoon company meeting",
    "cu-product": "DNESKAi product meeting",
    "incubator-synthesis": "Magazine idea review",
    "venture-night": "Night company meeting",
    "mma-intake": "Fight data check",
    "mma-analysis": "Fight analysis review",
    "mag-editorial": "MMA Files story meeting",
    "mag-desk": "MMA Files desk review",
    "article-am": "Morning MMA Files article",
    "article-pm": "Evening MMA Files article",
    "studio": "Carousel Studio template review"
  };
  return labels[kind];
}

function definitionTone(kind: CalendarKind): string {
  return projectDetails[projectForKind(kind)].tone;
}

function projectSlotColor(kind: CalendarKind): string {
  return projectDetails[projectForKind(kind)].slotColor;
}

/**
 * An article run states why its slot died as a machine token. `buildCalendarFeed` copies that
 * token into `decisionOneLiner` unchanged, and the board is where an owner reads it, so each
 * token gets a sentence here. A reason absent from this map is printed verbatim, not guessed at.
 */
const articleRunReasonCopy: Record<string, string> = {
  missing_editorial_slate: "The story meeting left no slate, so this slot had no subject.",
  missing_sourced_subject: "The slate carried no source-backed subject for this slot.",
  no_sourced_subject_on_file: "No slate, and no source-backed subject left on file.",
  budget_decision_not_countersigned: "The budget decision this slot runs under is not countersigned yet.",
  portfolio_gate_closed: "Portfolio work is switched off, so this slot did not open.",
  mma_files_gate_closed: "MMA Files live publishing is switched off, so this slot did not open."
};

/**
 * Translate the reason once, as the slot enters its row, so the accessible name, the tooltip and
 * the printed cell text cannot disagree about what the cell says.
 */
function readableSlot(slot: CalendarSlot): CalendarSlot {
  const copy = slot.decisionOneLiner ? articleRunReasonCopy[slot.decisionOneLiner] : undefined;
  return copy ? { ...slot, decisionOneLiner: copy } : slot;
}

/**
 * Accessible name for one calendar cell. The one-liner belongs in the name, not in `title`: an
 * element with an aria-label never announces its title, so on a cell that links to its record the
 * decision summary reached nobody using a screen reader. A cell with no record page carried no
 * title at all, so its reason reached no one.
 */
function calendarSlotLabel(day: string, slot: CalendarSlot): string {
  const status = statusDetails(displayStatus(slot.status, slot.fixture));
  const parts = [`${day} ${publicKindLabel(slot.kind)}`, status.label];
  if (slot.decisionOneLiner) parts.push(slot.decisionOneLiner);
  return parts.join(", ");
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
                const slot = readableSlot(getSlot(day, definition.kind));
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
                const label = calendarSlotLabel(day, slot);
                const className = `grid min-h-14 place-items-center border-b border-r border-t-2 border-[var(--line-strong)] p-2 last:border-r-0 ${status.tone} ${day === today ? "outline outline-1 -outline-offset-1 outline-[color-mix(in_srgb,var(--accent)_22%,transparent)]" : ""} ${slot.meetingHref ? "transition-[background-color,filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]" : ""}`;
                const slotSurface = { ...status.surface, borderTopColor: projectSlotColor(slot.kind) };
                return slot.meetingHref ? (
                  <Link aria-label={label} className={className} data-calendar-slot data-calendar-state={visibleStatus} data-project={project} href={slot.meetingHref} key={`${day}-${slot.kind}`} style={slotSurface} title={slot.decisionOneLiner}>
                    {content}
                  </Link>
                ) : (
                  // A skipped slot has no record page to link to, so this branch was the only place
                  // its reason could appear — and it showed nothing at all. The owner got a coloured
                  // square with no explanation. Print the reason in the cell, since there is no page
                  // one click away that carries it. `title` repeats it because the cell clamps to
                  // three lines and the tooltip is where a mouse user reads a long reason in full.
                  <div aria-label={label} className={className} data-calendar-slot data-calendar-state={visibleStatus} data-project={project} key={`${day}-${slot.kind}`} style={slotSurface} title={slot.decisionOneLiner}>
                    {content}
                    {slot.decisionOneLiner ? (
                      <span className="mt-1.5 line-clamp-3 w-full break-words text-center text-[0.625rem] leading-[0.875rem] text-[var(--fog)]" data-calendar-reason>
                        {slot.decisionOneLiner}
                      </span>
                    ) : null}
                  </div>
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
          {(["ongoing", "late", "held", "missed", "skipped", "test", "not-needed", "scheduled"] as DisplayStatus[]).map((value) => {
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
