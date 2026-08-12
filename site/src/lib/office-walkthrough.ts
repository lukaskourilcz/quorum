import "server-only";
import ventureRegistry from "../../../config/ventures.json";
import { publicAgentMandate, publicAgentTitle } from "@/components/agent-language";
import { agents } from "@/data/agents";
import { CURRENT_MONTHLY_OPERATING_LIMIT_USD } from "@/data/operating-policy";
import { deliveredArticlePackage, deliveredEditionPackage } from "@/lib/delivered-packages";
import {
  addCalendarDays,
  buildPublicCalendarFeed,
  mondayOfCalendarWeek,
  pragueCalendarDate,
  type CalendarStatus
} from "@/lib/calendar-feed-model";
import { getDailyResults, getVentureKpiStatuses } from "@/lib/daily-results";
import { getPublicIdeas } from "@/lib/idea-ledger";
import { readOperationsReports } from "@/lib/operations-reports";
import {
  WORKSPACE_CHANNELS,
  buildMeetingFeed,
  channelForKind,
  type FeedMessage,
  type WorkspaceChannelId
} from "@/lib/meeting-feed";
import { getPublicMeetingRecords } from "@/lib/meeting-records";
import { getPublicMeetingSkips } from "@/lib/meeting-skips";
import { getPublicMoneySnapshot } from "@/lib/money-records";
import { resolveOfficeWorkflows } from "@/lib/office-workflows";
import type { OfficeWorkflows } from "@/lib/office-workflows-model";
import { getPublicArticleSlots } from "@/lib/article-slots";
import { publicKindLabel, readableSlotReason } from "@/lib/slot-labels";
import { getPublicStandups } from "@/lib/standup-records";
import { VENTURE_BRAND } from "@/lib/venture-brand";
import { getPublicCalendarSchedule } from "@/lib/venture-registry";
import { readFooterFacts } from "@/lib/footer-facts";
import type { FooterFacts } from "@/components/footer-dialogs";

/**
 * Everything the office walkthrough renders, resolved on the server.
 *
 * The page is one long client component — wheel locking, parallax, playback and the wallboard all
 * need the browser — so every read happens here and crosses once, as plain JSON. That boundary is
 * also the sanitising boundary: nothing below carries a repository path, a package hash outside a
 * disclosure, or a number the state files do not contain. Where a figure cannot be computed
 * honestly it is `null` and the wallboard prints an unavailable state rather than a zero.
 */

/** How many past weeks the calendar arrows can reach. Matches `/calendar`'s own built range. */
const CALENDAR_PAST_WEEKS = 8;
const CALENDAR_FUTURE_WEEKS = 1;

/** How far back the workspace player carries a transcript. Older days stay on `/meetings`. */
const TRANSCRIPT_DAYS = 21;

const weekdayFormatter = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
const weekdayLongFormatter = new Intl.DateTimeFormat("en", { weekday: "long", timeZone: "UTC" });
const dayMonthFormatter = new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", timeZone: "UTC" });
const longDateFormatter = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", timeZone: "UTC" });

export type OfficeProjectKey =
  | "company"
  | "caught-up"
  | "mma-files"
  | "fightaiq"
  | "goviral"
  | "marketingshark"
  | "titty-tuesdays"
  | "carousel-studio";

/** The venture hue the public calendar already uses, shared with the admin rail. */
export const PROJECT_COLOR = VENTURE_BRAND as Record<OfficeProjectKey, string>;

export function projectForKind(kind: string): OfficeProjectKey {
  if (kind === "cu-edition" || kind === "cu-product") return "caught-up";
  if (kind === "tt-marketing") return "titty-tuesdays";
  if (kind === "gv-brief") return "goviral";
  if (kind === "ms-daily") return "marketingshark";
  if (kind === "mma-intake" || kind === "mma-analysis") return "fightaiq";
  if (kind === "mag-editorial" || kind === "mag-desk" || kind === "article-am" || kind === "article-pm") return "mma-files";
  if (kind === "studio") return "carousel-studio";
  return "company";
}

/** Calendar-only ventures can keep their own hue without acquiring a public project room. */
export function projectColorForKind(kind: string): string {
  if (kind === "bh-desk") return VENTURE_BRAND.booksofhistory!;
  if (kind === "ts-desk") return VENTURE_BRAND["tehdejsi-svet"]!;
  return PROJECT_COLOR[projectForKind(kind)];
}

/* ------------------------------------------------------------------ calendar */

export interface OfficeCell {
  /** `held` and `ongoing` are the two a visitor can open. */
  state: CalendarStatus;
  /** What the cell prints: short enough that every cell is exactly one line. */
  text: string;
  /** The tooltip's heading: hour, room and outcome. Empty for a slot whose hour has not come. */
  title: string;
  /** The recorded sentence, under the heading. `null` when there is nothing recorded to show. */
  detail: string | null;
  /** The channel a click opens, when there is a record to open. */
  channel: WorkspaceChannelId | null;
  date: string;
}

export interface OfficeRow {
  kind: string;
  time: string;
  label: string;
  color: string;
  cells: OfficeCell[];
}

export interface OfficeDayHeader {
  date: string;
  short: string;
  dayMonth: string;
  isToday: boolean;
}

export interface OfficeWeek {
  weekOf: string;
  label: string;
  days: OfficeDayHeader[];
  rows: OfficeRow[];
}

const STATUS_WORD: Record<CalendarStatus, string> = {
  held: "Happened",
  ongoing: "In progress",
  late: "Waiting on the run",
  missed: "Did not happen",
  skipped: "Did not happen",
  "not-needed": "Not needed",
  scheduled: "Planned"
};

/**
 * What one cell says, in at most twenty characters.
 *
 * The cell used to print the recorded decision sentence, which wrapped to two lines, clamped, and
 * turned the week into a wall of prose nobody reads across. It says the outcome instead — two or
 * three words, one line, the same width in every cell — and the sentence it replaced moves to the
 * cell's own `title`, where a reader who wants it can ask for it.
 *
 * The wording is derived from the recorded status and the slot's kind, never from the sentence:
 * summarising committed prose is not something this file can do honestly, and a keyword that says
 * only what the status already says cannot drift from it.
 */
function cellText(status: CalendarStatus, kind: string, delivered: boolean): string {
  const article = kind === "article-am" || kind === "article-pm";
  if (status === "held") {
    if (article) return "Article shipped";
    if (kind === "cu-edition") return delivered ? "Edition sent" : "Edition held";
    if (kind === "mag-editorial") return "Subject chosen";
    return "Decision made";
  }
  if (status === "ongoing") return "In progress";
  if (status === "late") return "Waiting on run";
  if (status === "missed") return "No one showed up";
  if (status === "skipped") return article ? "No article" : "Decided not to meet";
  if (status === "not-needed") return "Nothing needed";
  return "Scheduled";
}

/* ------------------------------------------------------------------ workspace */

export interface OfficeMessage {
  id: string;
  kind: FeedMessage["kind"];
  /** Agent id, or `system`. */
  author: string;
  /** The role's plain-English title, already public-safe. */
  role: string;
  time: string;
  text: string;
  /** Two letters for the avatar tile. Absent on system rows, which draw no avatar. */
  initials: string | null;
  /** The role has an approved portrait, so it gets an initials tile rather than the silhouette. */
  known: boolean;
  /** The delivered package, pretty-printed. The one machine artifact shown on purpose. */
  json?: string;
  jsonNote?: string;
}

export interface OfficeChannelDay {
  date: string;
  /** `Monday, August 3` — the day divider's pill. */
  label: string;
  messages: OfficeMessage[];
  /** True when the only thing recorded is why the room did not sit. */
  quiet: boolean;
}

export interface OfficeChannel {
  id: WorkspaceChannelId;
  /** The English handle the sidebar prints after `#`. */
  handle: string;
  room: string;
  time: string;
  topic: string;
  project: OfficeProjectKey;
  days: OfficeChannelDay[];
}

/**
 * The English handle, room name, hour and topic for each of the eight channels.
 *
 * `meeting-feed.ts` owns the channel ids and the kinds that route into them; it deliberately makes
 * no language decision. This is that decision. The ids stay as the data layer named them so the
 * two never drift, and only what a reader sees is written here.
 */
const CHANNEL_COPY: Record<WorkspaceChannelId, {
  handle: string;
  room: string;
  time: string;
  topic: string;
  project: OfficeProjectKey;
}> = {
  "marketingshark-carousel-room": {
    handle: "marketingshark-daily",
    room: "marketingShark carousel room",
    time: "07:00",
    topic: "One quiz question, drawn as a Czech and an English carousel and left as a draft.",
    project: "marketingshark"
  },
  "vydani-dneskai": {
    handle: "dneskai-edition",
    room: "DNESKAi edition",
    time: "05:00",
    topic: "One story of the day, or nothing goes out and the reason is recorded.",
    project: "caught-up"
  },
  "ranni-porada": {
    handle: "company-board",
    room: "Company board",
    time: "06:00 · 14:00 · 22:00",
    topic: "Three shifts, one conversation: what the company spends its day on.",
    project: "company"
  },
  "kontrola-mma-dat": {
    handle: "fight-data-check",
    room: "Fight data checks",
    time: "08:00 · 19:00",
    topic: "Cards, gaps in fighter files and source health. A value needs two sources that agree.",
    project: "fightaiq"
  },
  "redakcni-porada-mma": {
    handle: "mma-story-desk",
    room: "MMA Files story desk",
    time: "09:00",
    topic: "The day's article slot is assigned from verified files, or left empty.",
    project: "mma-files"
  },
  "vecerni-redakce": {
    handle: "mma-evening-desk",
    room: "MMA Files evening desk",
    time: "20:00",
    topic: "What actually went out, what failed, and which sourced lead stays for tomorrow.",
    project: "mma-files"
  },
  "titty-tuesdays-marketing": {
    handle: "titty-tuesdays-marketing",
    room: "Titty Tuesdays marketing",
    time: "11:00",
    topic: "Concrete marketing ideas for a shop that does not exist yet. No prices, no availability.",
    project: "titty-tuesdays"
  },
  "goviral-trend-room": {
    handle: "goviral-trend-room",
    room: "GoVIRAL trend room",
    time: "13:00 · Mondays",
    topic: "What is rising this week, and at most one trend handed to another desk.",
    project: "goviral"
  }
};

/** Roles with an approved portrait get an initials tile; the rest keep the anonymous silhouette. */
const portraitRoles = new Set(agents.filter((agent) => agent.visual.avatar).map((agent) => agent.id));

/**
 * The short role label beside a name in the message list — "Safety reviewer", not the mandate.
 *
 * A chat row gives this about eight words of horizontal room next to a 13px name and a timestamp.
 * `publicAgentMandate` is a full sentence and wrapped onto a second line above every message,
 * which pushed the message itself down and made the list read as headings rather than as people
 * talking.
 */
const roleTitle = new Map(agents.map((agent) => [agent.id as string, publicAgentTitle(agent)]));

function clockOf(at: string): string {
  const parsed = new Date(at);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Prague"
  }).format(parsed);
}

/* ------------------------------------------------------------------ projects */

export interface OfficeProject {
  id: string;
  name: string;
  status: string;
  description: string;
  /** Rendered only when the owner has supplied a live URL. A card without one renders nothing. */
  url: string | null;
  /** True for the two that publish every day, which is what the accent status marks. */
  daily: boolean;
  color: string;
}

/**
 * Every registered venture on the wall.
 *
 * Names, order and colours come from `config/ventures.json`; the sentence under each is site copy,
 * because the registry's own `growth_objective.label` is an internal objective rather than a
 * description a visitor can read.
 *
 * marketingShark and the Design Lab are here by owner decision. The Design Lab in particular is
 * not a venture with an audience — it is the workshop the others hand their work to, and the
 * Workflows plan draws it as machinery rather than as a room. On the wall it is still one of the
 * things this company runs, and leaving it off made the wall disagree with the registry.
 *
 * TODO(owner): FightAIQ, GoVIRAL, Titty Tuesdays, marketingShark and the Design Lab have no
 * public URL yet. The card renders nothing in that slot until one is supplied — no "coming soon",
 * no disabled link.
 */
const PROJECT_COPY: Record<string, { status: string; description: string; url: string | null; daily: boolean }> = {
  "caught-up": {
    status: "Publishes daily",
    description: "Czech news about AI. One subject a day, and when none passes verification, no edition goes out.",
    url: "https://caughtup-ai.vercel.app/",
    daily: true
  },
  "mma-files": {
    status: "Publishes daily",
    description: "A Czech magazine about combat sports. One article slot a day, written only from verified fighter files.",
    url: "https://mma-files.vercel.app/cs",
    daily: true
  },
  fightaiq: {
    status: "Data and analysis",
    description: "Fighter cards from two independent sources, and a model that publishes its version with every probability.",
    url: null,
    daily: false
  },
  goviral: {
    status: "Weekly brief",
    description: "Trend scouting. The week's data becomes one brief and an inventory of marketing plays for the whole portfolio.",
    url: null,
    daily: false
  },
  "titty-tuesdays": {
    status: "Before commerce",
    description: "Brand and season concepts. So far only an inventory of ideas: no prices, no stock, no availability.",
    url: null,
    daily: false
  },
  marketingshark: {
    status: "Publishes daily",
    description: "One quiz question a day, drawn as a Czech and an English carousel and left as a draft for review.",
    url: null,
    daily: true
  },
  "carousel-studio": {
    status: "The workshop",
    description: "The renderer every other project hands its work to. Same input, same bytes: it holds no meeting and decides nothing.",
    url: null,
    daily: false
  }
};

const PROJECT_ORDER = [
  "caught-up", "mma-files", "fightaiq", "goviral", "titty-tuesdays", "marketingshark", "carousel-studio"
];

/* ------------------------------------------------------------------ team */

export interface OfficeRole {
  id: string;
  line: string;
  portrait: string | null;
  portraitAlt: string;
  /** What the role's title is, which the roster prints beside the name. */
  title: string;
  /** As the registry records it. A paused or retired role is labelled, never hidden. */
  status: "active" | "paused" | "retired";
}

export interface OfficeTeam {
  council: OfficeRole[];
  specialists: OfficeRole[];
  /** How many of the roster are active, of a roster that now shows all of it. */
  activeCount: number;
}

/* ------------------------------------------------------------------ results */

export interface OfficeMeasure {
  label: string;
  value: string;
  state: "On track" | "At risk" | "Off track" | "Not measurable yet";
}

export interface OfficeProjectScreen {
  id: string;
  name: string;
  stage: string;
  objective: string;
  measures: OfficeMeasure[];
  standing: { onTrack: number; atRisk: number; offTrack: number; unavailable: number };
}

export interface OfficeResults {
  /** Every figure is nullable: an unavailable measure prints as unavailable, never as zero. */
  articles: number | null;
  reliability: number | null;
  costPerArticle: number | null;
  monthlySpend: number | null;
  ideas: number | null;
  limit: number;
  projects: OfficeProjectScreen[];
}

/**
 * The compact operating summary the TV can show instead of the wallboard.
 *
 * Every figure is `number | null` for the same reason the wallboard's are: this screen prints an
 * em dash where a record is missing, and a zero here would be a claim the ledger does not make.
 * It crosses to the client as plain JSON, like everything else in this file — that boundary is
 * where the sanitising happens, so nothing below it reads a file.
 */
export interface OfficeReports {
  daily: {
    date: string | null;
    roomsHeld: number | null;
    roomsMissed: number | null;
    spendUsd: number | null;
    monthToDateUsd: number | null;
    /** One incident, in plain words. Null when the day recorded none. */
    incident: string | null;
  };
  weekly: {
    periodKey: string | null;
    verdict: string | null;
    published: number | null;
    averageScore: number | null;
  };
}

export interface OfficeWalkthroughData {
  weeks: OfficeWeek[];
  /** Index into `weeks` of the current Prague week. */
  currentWeek: number;
  channels: OfficeChannel[];
  projects: OfficeProject[];
  team: OfficeTeam;
  results: OfficeResults;
  reports: OfficeReports;
  workflows: OfficeWorkflows;
  meetingCount: number;
  /** The handful of numbers the footer's dialogs state, resolved here rather than in a component. */
  footerFacts: FooterFacts;
}

const KPI_STATE: Record<string, OfficeMeasure["state"]> = {
  "on-track": "On track",
  "at-risk": "At risk",
  "off-track": "Off track",
  unavailable: "Not measurable yet"
};

/** A KPI reading in the unit it was measured in. `null` stays unavailable rather than becoming 0. */
function measureValue(unit: string, actual: number | null): string {
  if (actual === null) return "—";
  if (unit === "ratio") return `${Math.round(actual * 100)}%`;
  if (unit === "usd") return `$${actual.toFixed(2)}`;
  if (unit === "boolean") return actual >= 1 ? "Yes" : "No";
  return Number.isInteger(actual) ? String(actual) : actual.toFixed(2);
}

interface RawKpi {
  id: string;
  venture: string;
  name: string;
  unit: string;
  actual: number | null;
  status: string;
}

export async function readOfficeWalkthrough(now = new Date()): Promise<OfficeWalkthroughData> {
  const [
    standups,
    meetings,
    skips,
    articleSlots,
    definitions,
    money,
    dailyResults,
    kpiStanding,
    ideas,
    periodReports
  ] = await Promise.all([
    getPublicStandups(),
    getPublicMeetingRecords(),
    getPublicMeetingSkips(),
    getPublicArticleSlots(),
    getPublicCalendarSchedule(),
    getPublicMoneySnapshot(),
    getDailyResults(),
    getVentureKpiStatuses(),
    getPublicIdeas(),
    readOperationsReports()
  ]);

  const today = pragueCalendarDate(now);
  const currentWeekOf = mondayOfCalendarWeek(today);

  /** Which edition rooms actually sent something, so a held cell can say which kind of held. */
  const deliveredDates = new Set(
    meetings
      .filter((record) => !record.fixture)
      .filter((record) => record.kind === "cu-edition" || record.kind === "mag-editorial")
      .map((record) => `${record.kind}:${record.date}`)
  );

  /* ---- 01 Calendar ------------------------------------------------------ */

  const weekStarts = Array.from(
    { length: CALENDAR_PAST_WEEKS + CALENDAR_FUTURE_WEEKS + 1 },
    (_, index) => addCalendarDays(currentWeekOf, (index - CALENDAR_PAST_WEEKS) * 7)
  );

  const weeks: OfficeWeek[] = weekStarts.map((weekOf) => {
    // One `buildPublicCalendarFeed` per week over sources read once, rather than
    // `getPublicCalendarFeed` per week, which would re-read every record ten times.
    const feed = buildPublicCalendarFeed({ weekOf, now, standups, meetings, skips, articleSlots, definitions });
    const days: OfficeDayHeader[] = Array.from({ length: 7 }, (_, index) => {
      const date = addCalendarDays(weekOf, index);
      const at = new Date(`${date}T12:00:00Z`);
      return {
        date,
        short: weekdayFormatter.format(at),
        dayMonth: dayMonthFormatter.format(at),
        isToday: date === today
      };
    });
    const rows: OfficeRow[] = feed.definitions.map((definition, rowIndex) => ({
      kind: definition.kind,
      time: `${String(definition.hour).padStart(2, "0")}:00`,
      label: publicKindLabel(definition.kind),
      color: projectColorForKind(definition.kind),
      cells: days.map((day, dayIndex) => {
        const slot = feed.slots[dayIndex * feed.definitions.length + rowIndex]!;
        const openable = slot.status === "held" || slot.status === "ongoing";
        const channel = openable
          ? channelForKind(definition.kind.replace(/^venture-/u, "")) ?? null
          : null;
        const recorded = readableSlotReason(slot.decisionOneLiner);
        const delivered = deliveredDates.has(`${definition.kind}:${day.date}`);
        return {
          state: slot.status,
          text: cellText(slot.status, definition.kind, delivered),
          /*
           * A future slot carries no tooltip. There is nothing recorded for an hour that has not
           * come, and a tooltip repeating the word already printed in the cell is a tooltip that
           * teaches a reader to stop hovering.
           */
          title: slot.status === "scheduled"
            ? ""
            : `${String(definition.hour).padStart(2, "0")}:00 ${publicKindLabel(definition.kind)} · ${STATUS_WORD[slot.status]}`,
          /** The recorded sentence on its own, so the tooltip can set it apart from the heading. */
          detail: slot.status === "scheduled" ? null : recorded ?? STATUS_WORD[slot.status],
          channel,
          date: day.date
        };
      })
    }));
    return {
      weekOf,
      label: `Week ${days[0]!.dayMonth} – ${days[6]!.dayMonth}`,
      days,
      rows
    };
  });

  /* ---- 02 Meetings ------------------------------------------------------ */

  // The delivered package a day sent, resolved only for the days the player can reach.
  const transcriptFloor = addCalendarDays(today, -TRANSCRIPT_DAYS);
  const deliveryDates = new Set(
    meetings
      .filter((record) => !record.fixture && record.date >= transcriptFloor)
      .filter((record) => record.kind === "cu-edition" || record.kind === "mag-editorial")
      .map((record) => `${record.kind}:${record.date}`)
  );
  const deliveredPackages = new Map<string, { json: string; note?: string }>();
  /**
   * The floor plan resolves here rather than in the batch above, and that is deliberate.
   *
   * Its slot table is built from the records that batch returns, so it cannot start any earlier;
   * pairing it with the package reads is what keeps it concurrent with them instead of queued
   * behind them. The records are handed over rather than read a second time — one read of the
   * calendar sources serves both the week grid and the plan.
   */
  const [, workflows] = await Promise.all([
    Promise.all([...deliveryDates].map(async (key) => {
      const [kind, date] = key.split(":") as [string, string];
      const pkg = kind === "cu-edition"
        ? await deliveredEditionPackage(date)
        : await deliveredArticlePackage(date);
      if (pkg) deliveredPackages.set(key, { json: pkg.json, ...(pkg.note ? { note: pkg.note } : {}) });
    })),
    resolveOfficeWorkflows(now, { standups, meetings, skips, articleSlots, definitions })
  ]);

  const feed = buildMeetingFeed({
    meetings,
    standups,
    skips,
    articleSlots,
    deliveries: [...deliveryDates].flatMap((key) => {
      const [kind, date] = key.split(":") as [string, string];
      if (!deliveredPackages.has(key)) return [];
      return [{
        date,
        kind,
        text: kind === "cu-edition"
          ? "The edition passed the check and went to DNESKAi. Delivery confirmed."
          : "The article passed the check and went to MMA Files. Delivery confirmed.",
        ref: key
      }];
    })
  });

  const channels: OfficeChannel[] = WORKSPACE_CHANNELS.map((channel) => {
    const copy = CHANNEL_COPY[channel.id];
    const source = feed.find((entry) => entry.id === channel.id);
    const days: OfficeChannelDay[] = (source?.days ?? [])
      .filter((day) => day.date >= transcriptFloor)
      .map((day) => ({
        date: day.date,
        label: `${weekdayLongFormatter.format(new Date(`${day.date}T12:00:00Z`))}, ${longDateFormatter.format(new Date(`${day.date}T12:00:00Z`))}`,
        quiet: day.messages.every((message) => message.kind === "system"),
        messages: day.messages.map((message): OfficeMessage => {
          const isSystem = message.author.id === "system";
          const attachment = message.attachment ? deliveredPackages.get(message.attachment.ref) : undefined;
          return {
            id: message.id,
            kind: message.kind,
            author: isSystem ? "system" : message.author.id,
            role: isSystem ? "" : roleTitle.get(message.author.id) ?? message.author.title,
            // A delivery carries no recorded instant: `buildMeetingFeed` stamps it at the end of
            // the day purely so it sorts after the room that decided it. Printing that stamp as a
            // clock claimed the package left the building at 01:00, which nothing recorded.
            time: message.kind === "delivery" ? "" : clockOf(message.at),
            text: message.text,
            initials: isSystem ? null : message.author.id.slice(0, 2),
            known: !isSystem && portraitRoles.has(message.author.id as never),
            ...(attachment ? { json: attachment.json, ...(attachment.note ? { jsonNote: attachment.note } : {}) } : {})
          };
        })
      }));
    return { id: channel.id, ...copy, days };
  });

  /* ---- 03 Projects ------------------------------------------------------ */

  const registered = new Map(ventureRegistry.ventures.map((venture) => [venture.id, venture]));
  const projects: OfficeProject[] = PROJECT_ORDER.flatMap((id) => {
    const venture = registered.get(id);
    const copy = PROJECT_COPY[id];
    if (!venture || !copy) return [];
    return [{
      id,
      name: id === "caught-up" ? "DNESKAi" : venture.name,
      status: copy.status,
      description: copy.description,
      url: copy.url,
      daily: copy.daily,
      color: PROJECT_COLOR[id as OfficeProjectKey] ?? PROJECT_COLOR.company
    }];
  });

  /* ---- 04 Team ---------------------------------------------------------- */

  /**
   * The roster line is the curated mandate, not the operating principle.
   *
   * Two reasons, both visible on the wall. The principles are written for the roles themselves and
   * some are Czech — HACEK's is "Nepřekládá se…" — which put Czech in an English UI on the one
   * surface the handoff is explicit about. And running them through the plain-language filter
   * rewrote them mid-sentence: AUDIT's "Evidence first. Fail closed." came out as "sources first.
   * Fail closed.", lower-cased at the start of a sentence. The mandates are already public,
   * already English and already one sentence each.
   */
  const toRole = (agent: (typeof agents)[number]): OfficeRole => ({
    id: agent.id,
    line: publicAgentMandate(agent),
    portrait: agent.visual.avatar,
    portraitAlt: agent.visual.avatarAlt,
    title: agent.title,
    status: agent.status === "paused" || agent.status === "retired" ? agent.status : "active"
  });
  /*
   * Every role in the registry, and every one of them labelled.
   *
   * The roster used to show the council plus whichever specialists were active and put the rest
   * behind a "stood down" count with no way to see them — a footnote saying nine roles exist that
   * you may not read. A paused role is a real part of how the company is arranged and so is a
   * retired one; hiding them made the roster smaller than the company. Council first, then the
   * rest in registry order, with the ones that are not working saying so.
   */
  const team: OfficeTeam = {
    council: agents.filter((agent) => agent.group === "Council").map(toRole),
    specialists: agents.filter((agent) => agent.group !== "Council").map(toRole),
    activeCount: agents.filter((agent) => agent.status === "active").length
  };

  /* ---- 05 Results ------------------------------------------------------- */

  const kpis = (money?.quarter.statuses ?? []) as unknown as RawKpi[];
  const month = money?.costs.api.month ?? now.toISOString().slice(0, 7);

  const producedThisMonth = dailyResults
    .filter((day) => day.date.startsWith(month))
    .flatMap((day) => day.rows)
    .filter((row) => row.status === "produced" && (row.ventureId === "caught-up" || row.ventureId === "mma-files"));

  /**
   * Publishing reliability is the company's own measured KPI, not a ratio computed here.
   *
   * The obvious arithmetic — produced rows over rows that were reached — reads 100% on this
   * archive, because a slot the desk killed with a reason is recorded as not held rather than as
   * a failure. That number would be true of the rows and false about the company. The quarter
   * already measures the thing the board wants to say, against a target, with a reason attached
   * when it cannot be read at all.
   */
  const reliabilityKpi = kpis.find((kpi) => kpi.id === "company.valid-window-rate")
    ?? kpis.find((kpi) => kpi.venture === "company" && kpi.unit === "ratio");

  const monthlySpend = money?.costs.totalMonthlyBurnUsd ?? null;
  const articles = producedThisMonth.length;
  const articleCost = producedThisMonth.reduce((sum, row) => sum + row.costUsd, 0);

  const stageOf = (id: string) => registered.get(id)?.status ?? "operating";

  const projectScreens: OfficeProjectScreen[] = PROJECT_ORDER.flatMap((id) => {
    const venture = registered.get(id);
    if (!venture) return [];
    const standing = kpiStanding.find((entry) => entry.ventureId === id)
      ?? { onTrack: 0, atRisk: 0, offTrack: 0, unavailable: 0 };
    const measures = kpis
      .filter((kpi) => kpi.venture === id)
      .slice(0, 4)
      .map((kpi): OfficeMeasure => ({
        label: kpi.name,
        value: measureValue(kpi.unit, kpi.actual),
        state: KPI_STATE[kpi.status] ?? "Not measurable yet"
      }));
    return [{
      id,
      name: id === "caught-up" ? "DNESKAi" : venture.name,
      stage: stageOf(id) === "operating" ? "Operating" : "Exploration",
      objective: venture.growth_objective.label,
      measures,
      standing: {
        onTrack: standing.onTrack,
        atRisk: standing.atRisk,
        offTrack: standing.offTrack,
        unavailable: standing.unavailable
      }
    }];
  });

  const results: OfficeResults = {
    articles: dailyResults.length > 0 ? articles : null,
    reliability: reliabilityKpi?.actual === null || reliabilityKpi === undefined
      ? null
      : Math.round(reliabilityKpi.actual * 100),
    costPerArticle: articles > 0 ? articleCost / articles : null,
    monthlySpend,
    ideas: ideas.length > 0 ? ideas.length : null,
    limit: CURRENT_MONTHLY_OPERATING_LIMIT_USD,
    projects: projectScreens
  };

  /*
   * The TV's second screen: yesterday in one line and the last finished week in another.
   *
   * Both come from records already read above or from `state/reports/**`. A day the digest never
   * summarised and a week that has not closed both arrive here as nulls, and the screen renders
   * them as dashes rather than inventing a quiet day.
   */
  const latestDay = dailyResults.at(-1) ?? null;
  const latestWeek = periodReports.weekly[0] ?? null;
  const reports: OfficeReports = {
    daily: {
      date: latestDay?.date ?? null,
      roomsHeld: latestDay ? latestDay.rows.filter((row) => row.status === "produced").length : null,
      roomsMissed: latestDay
        ? latestDay.rows.filter((row) => row.status === "failed" || row.status === "not-held").length
        : null,
      spendUsd: latestDay?.totalCostUsd ?? null,
      monthToDateUsd: monthlySpend,
      incident: latestDay?.rows.find((row) => row.failureReason)?.failureReason ?? null
    },
    weekly: {
      periodKey: latestWeek?.periodKey ?? null,
      verdict: latestWeek
        ? `${latestWeek.meetings.held} of ${latestWeek.meetings.scheduled} meetings held`
        : null,
      // Null when nothing was recorded, not zero. An empty `published` list means the week's
      // output was never counted; printing 0 would tell the wall the company shipped nothing.
      published: latestWeek && latestWeek.published.length > 0
        ? latestWeek.published.reduce((sum, entry) => sum + entry.count, 0)
        : null,
      averageScore: latestWeek?.scores?.avg ?? null
    }
  };

  return {
    weeks,
    currentWeek: weekStarts.indexOf(currentWeekOf),
    channels,
    projects,
    team,
    results,
    reports,
    workflows,
    meetingCount: definitions.length,
    footerFacts: await readFooterFacts()
  };
}
