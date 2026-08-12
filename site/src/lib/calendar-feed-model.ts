import { publicAgentText } from "@/components/agent-language";
import type { PublicStandup } from "@/data/fixtures";
import type { PublicMeetingRecord } from "@/lib/meeting-record-model";

export type CalendarKind =
  | "cu-edition"
  | "venture-morning"
  | "venture-afternoon"
  | "cu-product"
  | "tt-marketing"
  | "gv-brief"
  | "ms-daily"
  | "bh-desk"
  | "dm-desk"
  | "dm-growth"
  | "ts-desk"
  | "incubator-scan"
  | "incubator-synthesis"
  | "mma-intake"
  | "mma-analysis"
  | "mag-editorial"
  | "mag-desk"
  | "article-am"
  | "article-pm"
  | "studio"
  | "venture-night";
export type CalendarStatus = "scheduled" | "ongoing" | "late" | "held" | "missed" | "not-needed" | "skipped";

export interface CalendarDefinition {
  hour: number;
  kind: CalendarKind;
  label: string;
}

export interface CalendarSlot {
  at: string;
  tz: "Europe/Prague";
  kind: CalendarKind;
  status: CalendarStatus;
  meetingHref?: string;
  decisionOneLiner?: string;
  fixture?: boolean;
}

/** A slot a gate turned off before any room opened, with the reason it gives the reader. */
export interface PublicMeetingSkip {
  date: string;
  phase: string;
  reason: string;
}

/** What an MMA Files article slot did. Those two slots have no meeting record. */
export interface PublicArticleSlotOutcome {
  date: string;
  slot: "am" | "pm";
  status: string;
  reason?: string;
}

export interface PublicCalendarFeed {
  schemaVersion: "calendar/1";
  weekOf: string;
  definitions: readonly CalendarDefinition[];
  slots: CalendarSlot[];
}

/**
 * The default room list, used when no caller supplies one.
 *
 * `getPublicCalendarFeed` always passes definitions derived from `config/ventures.json`, which
 * is the authority; this list exists so the model can be exercised without a registry read. It
 * mirrors the live clock — a default that promises rooms nobody holds is the kind of thing a
 * reader believes. The kinds it no longer lists stay in `CalendarKind` above, because committed
 * records from those rooms still have to render.
 */
export const CALENDAR_SLOTS: readonly CalendarDefinition[] = [
  { hour: 5, kind: "cu-edition", label: "Edition production" },
  { hour: 6, kind: "venture-morning", label: "Morning shift" },
  { hour: 7, kind: "ms-daily", label: "marketingShark daily carousel room" },
  { hour: 8, kind: "mma-intake", label: "FightAIQ morning data check" },
  { hour: 9, kind: "mag-editorial", label: "MMA Files morning story meeting" },
  { hour: 10, kind: "article-am", label: "MMA Files daily article" },
  { hour: 11, kind: "tt-marketing", label: "Titty Tuesdays marketing" },
  { hour: 12, kind: "bh-desk", label: "BOOKSOFHISTORY editorial desk" },
  { hour: 13, kind: "gv-brief", label: "GoVIRAL trend and marketing room" },
  { hour: 14, kind: "venture-afternoon", label: "Afternoon shift" },
  { hour: 15, kind: "dm-desk", label: "Door Money recommendation desk" },
  { hour: 16, kind: "dm-growth", label: "Door Money growth room" },
  { hour: 17, kind: "cu-product", label: "Product room" },
  { hour: 19, kind: "mma-analysis", label: "FightAIQ evening model check" },
  { hour: 20, kind: "mag-desk", label: "MMA Files evening desk review" },
  { hour: 22, kind: "venture-night", label: "Night shift" }
] as const;

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function mondayOfCalendarWeek(date: string): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(value.getTime())) throw new Error(`Invalid calendar date: ${date}`);
  const weekday = value.getUTCDay() || 7;
  return addCalendarDays(date, 1 - weekday);
}

export function pragueCalendarDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Prague"
  }).format(now);
}

export function pragueSlotInstant(date: string, hour: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid Prague slot: ${date} ${hour}`);
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour);
  let candidate = desiredAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZone: "Europe/Prague"
    }).formatToParts(new Date(candidate));
    const number = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const observedAsUtc = Date.UTC(
      number("year"),
      number("month") - 1,
      number("day"),
      number("hour"),
      number("minute"),
      number("second")
    );
    candidate = desiredAsUtc - (observedAsUtc - candidate);
  }
  return new Date(candidate);
}

/**
 * The calendar kind a skipped orchestrator phase belongs to.
 *
 * A skip is recorded under the phase name the workflow resolved, which for the three company
 * shifts is "morning", "afternoon" or "night" while the calendar calls them venture-morning
 * and so on. Every other phase name is already the calendar kind.
 */
function skipKind(phase: string): string {
  if (phase === "morning" || phase === "afternoon" || phase === "night") return `venture-${phase}`;
  return phase;
}

function ventureKind(phase: PublicStandup["phase"]): CalendarKind | null {
  if (phase === "morning") return "venture-morning";
  if (phase === "afternoon") return "venture-afternoon";
  if (phase === "night") return "venture-night";
  return null;
}

/**
 * How long a slot with no record may keep reading as in progress.
 *
 * This is a ceiling, not the mechanism. A run commits its own record and that push is what
 * redeploys the site, so on the healthy path a slot stops reading "ongoing" because the page was
 * rebuilt with the record present and an earlier branch of the chain below claimed it — the clock
 * is never consulted. The ceiling only decides the slot that never gets a record at all: a run
 * killed before it could commit, or a cron that never fired. Without it such a slot would keep
 * claiming to be in progress until some unrelated push happened to rebuild the site.
 *
 * Fifteen minutes is far shorter than a scheduled run usually takes to land, because GitHub queues
 * these workflows for hours: see SLOT_DELIVERY_GRACE_MINUTES below for the delivery lag actually
 * observed. That is why expiry hands over to "late" rather than to "missed" — the short ceiling
 * only stops the board claiming a run is *working* when nobody knows that, and costs nothing on
 * the healthy path, where the record ends the state whenever it arrives. Widen it with
 * `ongoingCeilingMinutes`, or remove the guess entirely by feeding a live run signal into
 * `slotWithoutRecordStatus`.
 */
export const ONGOING_CEILING_MINUTES = 15;

/**
 * How long past its slot a run can still arrive and open the room.
 *
 * The cron for a slot fires CRON_LEAD_HOURS (1) before it, and the orchestrator's
 * resolveCronDelivery will still name the meeting for a firing delivered up to
 * CRON_DELIVERY_WINDOW_HOURS (6) after that cron. So the last instant a delivered run can still
 * be recorded against this slot is five hours past it, and before that instant the slot is
 * waiting, not lost.
 *
 * This is not a comfort margin. On 4 August GitHub delivered the day's crons 2h23m to 2h55m
 * late; every meeting ran and committed, and every one of them was red here for between 1h23m
 * and 1h55m first. The slot audited that morning as "the run succeeded and wrote nothing" was
 * article-am, whose cron had simply not been delivered: it arrived 2h41m late and published at
 * 09:49 UTC, 1h49m past its slot. Beyond the five hours the claim changes in kind: a cron
 * delivered then resolves to no meeting at all, so the room genuinely cannot be opened any more
 * and "missed" is true.
 *
 * Mirrors CRON_DELIVERY_WINDOW_HOURS - CRON_LEAD_HOURS in the orchestrator
 * (orchestrator/src/meetings/clock.ts, orchestrator/src/ventures/registry.ts). The site does not
 * import from that package; orchestrator/tests/architecture.test.ts fails if the two drift.
 */
export const SLOT_DELIVERY_GRACE_MINUTES = (6 - 1) * 60;

/** What the board tells a reader about a slot whose run has not arrived but still can. */
export const LATE_SLOT_REASON = "The run for this slot has not arrived yet.";

/**
 * What the board tells a reader about a slot whose run can no longer arrive.
 *
 * "Did not happen" alone was the whole of what a missed cell said, which reads as a decision the
 * company took rather than the absence of any record of one. This is the same sentence the
 * reconciler writes into a missed slot's record.
 */
export const MISSED_SLOT_REASON = "No run arrived for this slot.";

/**
 * The status of a slot that has neither a record nor a skip reason.
 *
 * Everything the page can answer here comes from two facts it holds without asking anyone: the
 * slot's start instant, and the absence of anything committed for it. Those two cannot separate a
 * run that is still working from a run that never started — from the repository the two are the
 * same slot. The ceiling is how long that ambiguity is resolved in the run's favour.
 *
 * Past the ceiling the slot does not become missed, it becomes late: a run for it can still be
 * delivered and still name it, for SLOT_DELIVERY_GRACE_MINUTES past the slot. Only when that
 * window closes is the meeting genuinely unrecoverable. The two states differ in what they claim
 * — "ongoing" says a run is working, "late" says only that nothing has arrived yet — and neither
 * of them says the meeting did not happen, because at that point nobody knows.
 *
 * This is the seam for a live signal. A source that knows which runs are actually in flight would
 * be consulted first, right here, and the elapsed-time bands would become the fallback for when
 * that source is unavailable. `getPublicCalendarFeed` in `calendar-feed.ts` is where such a source
 * would be fetched and threaded in, alongside the record, skip and article-slot sources.
 */
function slotWithoutRecordStatus(at: Date, now: Date, ceilingMinutes: number): CalendarStatus {
  const elapsedMs = now.getTime() - at.getTime();
  if (elapsedMs <= 0) return "scheduled";
  if (elapsedMs <= ceilingMinutes * 60_000) return "ongoing";
  return elapsedMs <= SLOT_DELIVERY_GRACE_MINUTES * 60_000 ? "late" : "missed";
}

export function buildPublicCalendarFeed(input: {
  weekOf: string;
  now: Date;
  standups: readonly PublicStandup[];
  meetings: readonly PublicMeetingRecord[];
  skips?: readonly PublicMeetingSkip[];
  articleSlots?: readonly PublicArticleSlotOutcome[];
  definitions?: readonly CalendarDefinition[];
  ongoingCeilingMinutes?: number;
}): PublicCalendarFeed {
  const weekOf = mondayOfCalendarWeek(input.weekOf);
  const definitions = input.definitions ?? CALENDAR_SLOTS;
  const ongoingCeilingMinutes = input.ongoingCeilingMinutes ?? ONGOING_CEILING_MINUTES;
  const skipReasons = new Map((input.skips ?? []).map((skip) => [`${skip.date}:${skipKind(skip.phase)}`, skip.reason]));
  const articleOutcomes = new Map((input.articleSlots ?? []).map((run) => [`${run.date}:article-${run.slot}`, run]));
  const records = new Map<string, { href: string; summary: string; fixture: boolean; status?: PublicMeetingRecord["status"] }>();
  // Cells, their tooltips and their accessible names all read this one string, and it was the
  // only public rendering of a decision summary that skipped the plain-language pass entirely.
  const oneLiner = (summary: string) => publicAgentText(summary).slice(0, 180);
  for (const standup of input.standups) {
    const kind = ventureKind(standup.phase);
    if (kind) records.set(`${standup.date}:${kind}`, {
      href: `/standups/${standup.id}/room`,
      summary: oneLiner(standup.decision.summary),
      fixture: standup.fixture
    });
  }
  for (const meeting of input.meetings) {
    records.set(`${meeting.date}:${meeting.kind}`, {
      href: `/meetings/${meeting.id}`,
      summary: oneLiner(meeting.decision.summary),
      fixture: meeting.fixture,
      status: meeting.status
    });
  }
  const slots: CalendarSlot[] = [];
  for (let day = 0; day < 7; day += 1) {
    const date = addCalendarDays(weekOf, day);
    for (const definition of definitions) {
      const at = pragueSlotInstant(date, definition.hour);
      // The article slots keep their outcome in a run file rather than a meeting record, so
      // both fell through to "missed" every day — including the day one of them published.
      const article = articleOutcomes.get(`${date}:${definition.kind}`);
      if (article) {
        // A published article slot was a dead cell: it said an article existed and gave the
        // reader nowhere to go. The story meeting that chose the subject holds the package that
        // was delivered, so that is where the cell leads.
        const storyMeeting = records.get(`${date}:mag-editorial`);
        slots.push({
          at: at.toISOString(),
          tz: "Europe/Prague",
          kind: definition.kind,
          status: article.status === "published" ? "held" : "skipped",
          ...(article.status === "published" && storyMeeting && storyMeeting.status !== "PAUSED"
            ? { meetingHref: storyMeeting.href }
            : {}),
          decisionOneLiner: article.status === "published"
            ? "The desk published this slot's article."
            : oneLiner(article.reason ?? `The desk did not publish this slot: ${article.status}.`)
        });
        continue;
      }
      const record = records.get(`${date}:${definition.kind}`);
      // A slot a gate turned off reads "skipped" and carries the reason, so it is no longer
      // indistinguishable from one nobody reached. Eleven slots on 2 August showed as plain
      // "Did not happen" with nothing anywhere explaining any of them.
      //
      // Order matters for the "ongoing" and "late" states that `slotWithoutRecordStatus` can
      // return: every branch that means the run produced something is tested before it, so a
      // record or a skip ends either state on the next rebuild no matter how little of the
      // window has run down. That ordering is what makes the record, not the clock, the finish
      // signal.
      // A room with no agenda due writes a PAUSED record: it never convened, so there is no
      // discussion to open and the cell links nowhere. All it owes the reader is the sentence
      // saying why nothing was needed, which is exactly what a skipped cell shows.
      const paused = record?.status === "PAUSED";
      const status = paused
        ? "not-needed"
        : record
          ? "held"
          : skipReasons.has(`${date}:${definition.kind}`)
            ? "skipped"
            : slotWithoutRecordStatus(at, input.now, ongoingCeilingMinutes);
      slots.push({
        at: at.toISOString(),
        tz: "Europe/Prague",
        kind: definition.kind,
        status,
        ...(record ? (paused ? {
          decisionOneLiner: record.summary
        } : {
          meetingHref: record.href,
          decisionOneLiner: record.summary,
          fixture: record.fixture
        }) : skipReasons.has(`${date}:${definition.kind}`) ? {
          decisionOneLiner: oneLiner(skipReasons.get(`${date}:${definition.kind}`)!)
        } : status === "late" ? {
          decisionOneLiner: LATE_SLOT_REASON
        } : status === "missed" ? {
          decisionOneLiner: MISSED_SLOT_REASON
        } : {})
      });
    }
  }
  return { schemaVersion: "calendar/1", weekOf, definitions, slots };
}

export function calendarStaticWeeks(now: Date, pastWeeks = 8): string[] {
  const current = mondayOfCalendarWeek(pragueCalendarDate(now));
  return Array.from({ length: pastWeeks + 2 }, (_, index) =>
    addCalendarDays(current, (index - pastWeeks) * 7)
  );
}
