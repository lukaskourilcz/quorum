import { safeFetch, type SafeFetchOptions } from "../security/url.js";
import type { SourceFetchContext } from "../sources/types.js";

/**
 * Scheduled cards, read from Wikipedia.
 *
 * FightAIQ discovers events from Cito and then has no card to put in them: the bouts endpoint has
 * returned nothing on every run, and intake drops an event with no card, so state/mma/events has
 * always been empty. Wikipedia does publish schedules, on the same keyless endpoint the roster
 * reader already uses and a host already in the allowlist.
 *
 * The two promotions are not laid out the same way, which is the whole reason this is one module
 * with two readers rather than one clever parser:
 *
 * - "List of UFC events" carries a dedicated "Scheduled events" table. Every row in it is future.
 * - "2026 in Oktagon MMA" carries a single "List of events" table for the whole year, past and
 *   future mixed, so rows have to be filtered by their own date.
 */

const USER_AGENT = "boardlessai-fightaiq/0.1 (https://github.com/lukaskourilcz/quorum)";

const MONTHS: Readonly<Record<string, number>> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

export interface ScheduledEvent {
  org: "ufc" | "oktagon";
  name: string;
  /** Midnight UTC on the published day. Wikipedia gives a date, never a start time. */
  startsAtUtc: string;
  venue: string | null;
  location: string | null;
  sourceTitle: string;
  /**
   * The article the row links to, which is not always what the row displays.
   *
   * The schedule shows "UFC 330: Makhachev vs. Machado Garry" and links [[UFC 330]]. Asking
   * Wikipedia for the display name returned nothing and the card came back empty.
   */
  pageTitle: string | null;
}

/** `{{dts|2026|Oct|24}}` and `{{dts|2026|10|24}}` both appear on these pages. */
export function parseDtsDate(cell: string): string | null {
  const match = /\{\{\s*dts\s*\|(?:[^|}]*\|)*?(\d{4})\|([A-Za-z]+|\d{1,2})\|(\d{1,2})/u.exec(cell);
  if (!match) return null;
  const [, year, rawMonth, day] = match;
  const month = /^\d+$/u.test(rawMonth!) ? Number(rawMonth) - 1 : MONTHS[rawMonth!.slice(0, 3).toLowerCase()];
  if (month === undefined || Number.isNaN(month)) return null;
  const at = Date.UTC(Number(year), month, Number(day));
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}

/**
 * A table cell as a reader would see it.
 *
 * Links are unwrapped in place rather than extracted, because a cell is often a link plus text —
 * `[[Dortmund]], Germany` is a location, and returning just the link would publish the city and
 * throw away the country. Piped links keep their label: readers know the venue by the name on the
 * page, not by the article it points at.
 */
/** The article a cell's first wikilink points at, before the pipe. */
export function parseWikiLinkTarget(cell: string): string | null {
  const link = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/u.exec(cell);
  return link?.[1]?.trim() || null;
}

export function parseWikiLinkLabel(cell: string): string | null {
  const rendered = cell
    .replace(/<ref[\s\S]*?(?:\/>|<\/ref>)/gu, "")
    .replace(/\[\[(?:[^\]|]+)\|([^\]]+)\]\]/gu, "$1")
    .replace(/\[\[([^\]|]+)\]\]/gu, "$1")
    .replace(/\{\{[^{}]*\}\}/gu, "")
    .replace(/<[^>]+>/gu, "")
    .replace(/^\s*align=\w+\|/u, "")
    .replace(/^#/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  return rendered || null;
}

/** Split one wikitable into its data rows, each row into its cells. */
function tableRows(table: string): string[][] {
  return table
    .split(/^\s*\|-\s*$/mu)
    .slice(1)
    .map((row) => row
      .split(/^\s*\|(?!\|)/mu)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0 && !cell.startsWith("!")))
    .filter((cells) => cells.length >= 2);
}

/** The wikitable that follows a heading, or the first one on the page when no heading is given. */
function tableAfter(wikitext: string, heading: string | null): string | null {
  const from = heading === null ? 0 : wikitext.search(new RegExp(`^==+\\s*${heading}\\s*==+`, "mu"));
  if (from < 0) return null;
  const open = wikitext.indexOf("{|", from);
  if (open < 0) return null;
  const close = wikitext.indexOf("\n|}", open);
  return close < 0 ? wikitext.slice(open) : wikitext.slice(open, close);
}

export function projectScheduledEvents(input: {
  wikitext: string;
  org: ScheduledEvent["org"];
  sourceTitle: string;
  heading: string | null;
  now: Date;
  /**
   * Earliest date to keep, when the caller wants events that have already happened. Defaults to
   * `now`, which is the scheduling case; the results reader passes an earlier date so the cards
   * from the last week are still visible.
   */
  since?: Date;
}): ScheduledEvent[] {
  const table = tableAfter(input.wikitext, input.heading);
  if (!table) return [];
  const events: ScheduledEvent[] = [];
  for (const cells of tableRows(table)) {
    // Position, not pattern. Both tables put the event immediately before the date and the venue
    // and location immediately after it — "List of UFC events" as Event|Date|Venue|Location|Ref,
    // and Oktagon's year table as #|Event|Date|Venue|Location. Picking the name by looking for a
    // wikilink instead put a venue in the event column when a row happened to have no link on its
    // name, and the row number in when it had none at all.
    const dateIndex = cells.findIndex((cell) => cell.includes("{{dts"));
    if (dateIndex < 1) continue;
    const startsAtUtc = parseDtsDate(cells[dateIndex]!);
    if (!startsAtUtc) continue;
    // Oktagon's table covers the whole year, so a row is only scheduled if its own date says so.
    // The UFC section is future by construction; filtering both costs nothing and means neither
    // reader depends on a page's section titles staying what they are today.
    if (Date.parse(startsAtUtc) < (input.since ?? input.now).getTime()) continue;
    const nameCell = cells[dateIndex - 1]!;
    const name = parseWikiLinkLabel(nameCell);
    if (!name) continue;
    events.push({
      org: input.org,
      name,
      pageTitle: parseWikiLinkTarget(nameCell),
      startsAtUtc,
      venue: cells[dateIndex + 1] ? parseWikiLinkLabel(cells[dateIndex + 1]!) : null,
      location: cells[dateIndex + 2] ? parseWikiLinkLabel(cells[dateIndex + 2]!) : null,
      sourceTitle: input.sourceTitle
    });
  }
  return events.sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc));
}

/**
 * The article for one event, trying the titles it might have.
 *
 * The UFC gives each event its own article and the schedule links it, so the target is enough.
 * Oktagon links a same-page anchor, which is no article at all, and its displayed name — "Oktagon
 * 92: Szabová vs. Pudilová" — is not a title either. "Oktagon 92" is, as a redirect to the year
 * page that carries the whole season's bouts. So the number alone is the second thing to try.
 *
 * A year page means the reader sees every bout of the season, not just this event's. That is safe
 * because a result is matched to a bout by the pair and the day, and two people do not fight each
 * other twice in a day — but it is why the matching is done that way and not by position.
 */
async function eventWikitext(input: {
  event: Pick<ScheduledEvent, "name" | "pageTitle">;
  context: SourceFetchContext;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<string> {
  const candidates = [...new Set([
    input.event.pageTitle,
    input.event.name,
    input.event.name.includes(":") ? input.event.name.split(":")[0]!.trim() : null
  ].filter((title): title is string => Boolean(title && title.trim())))];
  for (const title of candidates) {
    const wikitext = await wikitextOf({
      title,
      context: input.context,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
    });
    if (wikitext.trim().length > 0) return wikitext;
  }
  return "";
}

async function wikitextOf(input: {
  title: string;
  context: SourceFetchContext;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<string> {
  const endpoint = new URL("https://en.wikipedia.org/w/api.php");
  for (const [key, value] of Object.entries({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    redirects: "1",
    maxlag: "5",
    titles: input.title
  })) endpoint.searchParams.set(key, value);
  const response = await safeFetch(endpoint.toString(), {
    allowHosts: input.context.allowHosts,
    headers: { "User-Agent": USER_AGENT },
    maxBytes: 3_000_000,
    timeoutMs: 20_000,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
  });
  const body = JSON.parse(new TextDecoder().decode(response.body)) as {
    query?: { pages?: Array<{ revisions?: Array<{ slots?: { main?: { content?: string } } }> }> };
  };
  return body.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? "";
}

export interface ScheduledBout {
  division: string;
  red: string;
  blue: string;
  /** Five rounds for a title fight or the main event, three for everything else. */
  scheduledRounds: 5 | 3;
  /** True when the bout template names a championship, which is why the rounds are five. */
  title: boolean;
}

/**
 * The bouts announced for one event, from its own Wikipedia page.
 *
 * The schedule tables give an event, a date and a venue; the card lives on the event's article as
 * `{{MMAevent bout|Division|Red|vs.|Blue|…}}`. That is where "the fighters on those cards" comes
 * from, which is the half of event-first the schedule alone cannot answer.
 *
 * Round counts are not in the template. Five rounds for a championship bout and for the main event,
 * three for the rest, is the standing rule in both promotions rather than a guess about this card,
 * and `title` records which of the two reasons applied so a reader can tell.
 */
/**
 * A template body split into its parameters.
 *
 * Splitting on every `|` counts the one inside `[[Daniel Rodriguez (fighter)|Daniel Rodriguez]]`,
 * which shifts every field after it: the method landed where the loser's name belongs and the
 * round came out null. A pipe inside a link or a nested template belongs to that link, not to the
 * template being read.
 */
export function templateFields(body: string): string[] {
  const fields: string[] = [];
  let current = "";
  let links = 0;
  let braces = 0;
  for (let index = 0; index < body.length; index += 1) {
    const rest = body.slice(index, index + 2);
    if (rest === "[[") { links += 1; current += rest; index += 1; continue; }
    if (rest === "]]") { links -= 1; current += rest; index += 1; continue; }
    if (rest === "{{") { braces += 1; current += rest; index += 1; continue; }
    if (rest === "}}") { braces -= 1; current += rest; index += 1; continue; }
    if (body[index] === "|" && links <= 0 && braces <= 0) { fields.push(current); current = ""; continue; }
    current += body[index];
  }
  fields.push(current);
  return fields.slice(1).map((field) => field.trim());
}

export function projectEventBouts(wikitext: string): ScheduledBout[] {
  const bouts: ScheduledBout[] = [];
  for (const match of wikitext.matchAll(/\{\{\s*MMAevent bout\s*([\s\S]*?)\}\}/gu)) {
    const fields = templateFields(match[1]!);
    const division = parseWikiLinkLabel(fields[0] ?? "");
    const red = parseWikiLinkLabel(fields[1] ?? "");
    const blue = parseWikiLinkLabel(fields[3] ?? "");
    if (!division || !red || !blue) continue;
    const notes = fields.slice(4).join(" ");
    const title = /championship|title/iu.test(notes) || /\(c\)/u.test(fields[1] ?? "") || /\(c\)/u.test(fields[3] ?? "");
    bouts.push({
      division,
      // "(c)" marks the reigning champion and is not part of anyone's name.
      red: red.replace(/\s*\((?:c|ic)\)\s*$/iu, "").trim(),
      blue: blue.replace(/\s*\((?:c|ic)\)\s*$/iu, "").trim(),
      scheduledRounds: title || bouts.length === 0 ? 5 : 3,
      title
    });
  }
  return bouts;
}

export interface EventResult {
  division: string;
  red: string;
  blue: string;
  /** "red" when the left name is the winner, which is what `def.` states. */
  winner: "red" | "blue" | "draw" | "no-contest";
  method: string | null;
  round: number | null;
  elapsedSeconds: number | null;
}

/**
 * The results on an event's page, from the same templates the announced card came from.
 *
 * After the event, `|vs.|` becomes `|def.|` and the trailing fields fill in:
 * `{{MMAevent bout|Light Heavyweight|[[Alex Pereira]] (c)|def.|[[Jamahal Hill]]|KO (punches)|1|3:14|…}}`.
 * A draw or a no contest is written in the separator too. Reading the separator is what tells a
 * finished bout from an announced one — the presence of a method is not enough, because a bout
 * cancelled at the weigh-in can carry a note in the same position.
 */
export function projectEventResults(wikitext: string): EventResult[] {
  const results: EventResult[] = [];
  for (const match of wikitext.matchAll(/\{\{\s*MMAevent bout\s*([\s\S]*?)\}\}/gu)) {
    const fields = templateFields(match[1]!);
    const division = parseWikiLinkLabel(fields[0] ?? "");
    const red = parseWikiLinkLabel(fields[1] ?? "");
    const blue = parseWikiLinkLabel(fields[3] ?? "");
    const separator = (fields[2] ?? "").toLocaleLowerCase("en").replace(/[[\]]/gu, "").trim();
    if (!division || !red || !blue) continue;
    const winner = separator.startsWith("def")
      ? "red" as const
      : /^(?:draw|majority draw|split draw|unanimous draw)/u.test(separator)
        ? "draw" as const
        : /^(?:nc|no contest)/u.test(separator)
          ? "no-contest" as const
          : null;
    if (winner === null) continue;
    const round = Number(fields[5] ?? "");
    const clock = /^(\d{1,2}):(\d{2})$/u.exec(fields[6] ?? "");
    const roundNumber = Number.isInteger(round) && round >= 1 && round <= 5 ? round : null;
    results.push({
      division,
      red: red.replace(/\s*\((?:c|ic)\)\s*$/iu, "").trim(),
      blue: blue.replace(/\s*\((?:c|ic)\)\s*$/iu, "").trim(),
      winner,
      method: fields[4] ? fields[4].replace(/\s*\([^)]*\d+[-–]\d+[^)]*\)\s*$/u, "").trim() || null : null,
      round: roundNumber,
      elapsedSeconds: clock && roundNumber
        ? (roundNumber - 1) * 300 + Number(clock[1]) * 60 + Number(clock[2])
        : null
    });
  }
  return results;
}

/** Where each promotion publishes its schedule, and under which heading. */
export const SCHEDULE_PAGES: ReadonlyArray<{
  org: ScheduledEvent["org"];
  title: string;
  heading: string | null;
}> = [
  { org: "ufc", title: "List of UFC events", heading: "Scheduled events" },
  // Oktagon has no scheduled section; its year page lists everything and the dates decide.
  { org: "oktagon", title: "2026 in Oktagon MMA", heading: null }
];

/**
 * Where to look for a card that has already happened.
 *
 * Not the same tables. An event leaves "Scheduled events" once it is fought and reappears under
 * "Past events", so a results reader pointed at the schedule can only ever catch an event in the
 * hours between the two edits — miss that window and the result is never read at all. Oktagon's
 * year page is one table for the whole season, so it is the same page either way.
 */
export const RESULT_PAGES: typeof SCHEDULE_PAGES = [
  { org: "ufc", title: "List of UFC events", heading: "Past events" },
  { org: "oktagon", title: "2026 in Oktagon MMA", heading: null }
];

export async function fetchScheduledEvents(input: {
  context: SourceFetchContext;
  now: Date;
  since?: Date;
  pages?: typeof SCHEDULE_PAGES;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<ScheduledEvent[]> {
  const pages = input.pages ?? SCHEDULE_PAGES;
  const found: ScheduledEvent[] = [];
  for (const page of pages) {
    try {
      const wikitext = await wikitextOf({
        title: page.title,
        context: input.context,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
        ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
      });
      found.push(...projectScheduledEvents({
        wikitext,
        org: page.org,
        sourceTitle: page.title,
        heading: page.heading,
        now: input.now,
        ...(input.since ? { since: input.since } : {})
      }));
    } catch {
      // One promotion's page being unreadable is not a reason to lose the other's schedule.
    }
  }
  return found.sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc));
}

export interface ScheduledCard extends ScheduledEvent {
  bouts: ScheduledBout[];
}

/**
 * The schedule, and the card for each event close enough to matter.
 *
 * Two page reads for the schedule plus one per event inside the horizon — on 3 August that is two
 * events, so four keyless requests. The horizon is what keeps it that way: without it this would
 * read every announced card twenty deep, every day, for events months out that nobody is writing
 * about yet. That is the owner's complaint in a different costume.
 */
export async function fetchScheduledCards(input: {
  context: SourceFetchContext;
  now: Date;
  withinDays: number;
  pages?: typeof SCHEDULE_PAGES;
  maxEvents?: number;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<ScheduledCard[]> {
  const scheduled = await fetchScheduledEvents({
    context: input.context,
    now: input.now,
    ...(input.pages ? { pages: input.pages } : {}),
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
  });
  const horizon = input.now.getTime() + input.withinDays * 86_400_000;
  const due = scheduled
    .filter((event) => Date.parse(event.startsAtUtc) <= horizon)
    .slice(0, input.maxEvents ?? 6);
  const cards: ScheduledCard[] = [];
  for (const event of due) {
    try {
      const wikitext = await eventWikitext({
        event,
        context: input.context,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
        ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
      });
      cards.push({ ...event, bouts: projectEventBouts(wikitext) });
    } catch {
      // An event whose page will not load is still a scheduled event; it just has no card yet.
      cards.push({ ...event, bouts: [] });
    }
  }
  return cards;
}

export interface ResultCard extends ScheduledEvent {
  results: EventResult[];
}

/**
 * The cards that have already happened, with what happened on them.
 *
 * The same two schedule pages and the same event articles the announced card came from — an event
 * article is not archived after the event, its bout templates simply gain their result fields. So
 * "update the bouts after each event" needs no new source and no new host: it is this reader run
 * over a window that looks backwards instead of forwards.
 *
 * The window is what keeps the cost flat. Seven days back is two or three articles; without it
 * this would re-read every event the schedule has ever listed, every run.
 */
export async function fetchRecentResults(input: {
  context: SourceFetchContext;
  now: Date;
  sinceDays: number;
  pages?: typeof SCHEDULE_PAGES;
  maxEvents?: number;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<ResultCard[]> {
  const since = new Date(input.now.getTime() - input.sinceDays * 86_400_000);
  const events = await fetchScheduledEvents({
    context: input.context,
    now: input.now,
    since,
    pages: input.pages ?? RESULT_PAGES,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
  });
  // Most recent first: the newest card is the one whose result is missing, and the window may hold
  // more events than the cap. Taking the head of an ascending list would read the oldest instead.
  const past = events
    .filter((event) => Date.parse(event.startsAtUtc) < input.now.getTime())
    .reverse()
    .slice(0, input.maxEvents ?? 4);
  const cards: ResultCard[] = [];
  for (const event of past) {
    try {
      const wikitext = await eventWikitext({
        event,
        context: input.context,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
        ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
      });
      cards.push({ ...event, results: projectEventResults(wikitext) });
    } catch {
      // An article that will not load leaves the bouts announced, which is honest: we do not
      // know the result yet. Writing one from the schedule would be inventing it.
      cards.push({ ...event, results: [] });
    }
  }
  return cards;
}

/**
 * Who is currently on a promotion's roster, from the page that lists exactly that.
 *
 * Active-versus-former used to be decided by whether a fighter appeared in a completed pass of
 * Cito's all-time UFC list. That pass took two months of daily paging to finish and now never runs
 * at all, so `former` has been zero against sixty-five `unknown` since founding.
 *
 * Names come from `{{sortname|First|Last}}`, which is how the page writes them. Reading plain
 * wikilinks instead found 358 targets — mostly events and country codes — and matched only 55 of
 * the 80 tracked fighters, which would have marked twenty-five current fighters former, including
 * several champions. Verified before use: 78 of 80 match, and the two that do not are Amanda
 * Nunes, retired, and Ariane Carnelossi.
 *
 * Only the UFC has such a page. "List of Oktagon MMA fighters" does not exist, so Oktagon status
 * stays unknown rather than being guessed from a page that is not about it.
 */
export const CURRENT_ROSTER_PAGES: Readonly<Partial<Record<ScheduledEvent["org"], string>>> = {
  ufc: "List of current UFC fighters"
};

export function projectCurrentRosterNames(wikitext: string): Set<string> {
  const names = new Set<string>();
  for (const match of wikitext.matchAll(/\{\{\s*sortname\s*\|([^|}]+)\|([^|}]+)(?:\|([^}]*))?\}\}/gu)) {
    const [, first, last, third] = match;
    names.add(`${first!.trim()} ${last!.trim()}`);
    // A third parameter is the article title when the display name differs; "nolink" is a flag.
    const alternate = third?.replace(/^\s*\|/u, "").trim();
    if (alternate && !alternate.startsWith("nolink")) names.add(alternate);
  }
  return names;
}

export async function fetchCurrentRosterNames(input: {
  org: ScheduledEvent["org"];
  context: SourceFetchContext;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<Set<string> | null> {
  const title = CURRENT_ROSTER_PAGES[input.org];
  if (!title) return null;
  try {
    const wikitext = await wikitextOf({
      title,
      context: input.context,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
    });
    const names = projectCurrentRosterNames(wikitext);
    // An empty answer means the page changed shape, not that the roster emptied. Reporting null
    // keeps the reconciler from marking every tracked fighter former on a parser regression.
    return names.size > 0 ? names : null;
  } catch {
    return null;
  }
}
